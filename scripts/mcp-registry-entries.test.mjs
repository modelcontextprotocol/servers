// Tests for `mcp-registry-entries.mjs` (#3047): the rule each committed
// `server.json` must meet, the version stamp, the README marker as the
// registry reads it, and the entries of the repository as it stands. The last
// is the guard: an entry that disagrees with its package fails here, in
// `validate:guards`, instead of at release time. Run via
// `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  NAMESPACE,
  SCHEMA_URL,
  entryProblems,
  main,
  readmeMarker,
  registryEntries,
  stampEntry,
} from "./mcp-registry-entries.mjs";
import { expectedPackages } from "./release-manifest.mjs";

const NAME = `${NAMESPACE}server-demo`;

/** A committed entry that meets every rule, for an npm server in `src/demo`. */
function soundEntry() {
  return {
    $schema: SCHEMA_URL,
    name: NAME,
    title: "Demo",
    description: "A demonstration server",
    repository: {
      url: "https://github.com/modelcontextprotocol/servers",
      source: "github",
      subfolder: "src/demo",
    },
    packages: [
      {
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-demo",
        transport: { type: "stdio" },
      },
    ],
  };
}

/** The problems with `entry` as the npm server in `src/demo`. */
function problemsWith(entry, overrides = {}) {
  return entryProblems({
    dir: "demo",
    registryType: "npm",
    packageName: "@modelcontextprotocol/server-demo",
    marker: NAME,
    entry,
    ...overrides,
  });
}

test("entry: a sound entry has no problems", () => {
  assert.deepEqual(problemsWith(soundEntry()), []);
});

test("entry: something that is not an object is refused outright", () => {
  for (const entry of [null, [], "server", 3])
    assert.deepEqual(problemsWith(entry), ["is not a JSON object"]);
});

const defects = [
  {
    name: "another schema",
    edit: (e) => (e.$schema = "https://example.com/server.schema.json"),
    expect: /`\$schema` must be/,
  },
  {
    name: "a name that is not namespace/server",
    edit: (e) => (e.name = "server-demo"),
    marker: "server-demo",
    expect: /`name` must be `<namespace>\/<server>`/,
  },
  {
    name: "a name outside the namespace the workflow can prove",
    edit: (e) => (e.name = "io.modelcontextprotocol/demo"),
    marker: "io.modelcontextprotocol/demo",
    expect: /must start with `io\.github\.modelcontextprotocol\/`/,
  },
  {
    name: "a name the package does not claim",
    edit: (e) => (e.name = `${NAMESPACE}server-other`),
    expect:
      /the package claims "io\.github\.modelcontextprotocol\/server-demo"/,
  },
  {
    name: "no title",
    edit: (e) => delete e.title,
    expect: /`title` must be 1 to 100 characters/,
  },
  {
    name: "a description over the registry's limit",
    edit: (e) => (e.description = "x".repeat(101)),
    expect: /`description` must be 1 to 100 characters \(it is 101\)/,
  },
  {
    name: "an empty description",
    edit: (e) => (e.description = ""),
    expect: /`description` must be 1 to 100 characters \(it is 0\)/,
  },
  {
    name: "no description",
    edit: (e) => delete e.description,
    expect: /`description` must be 1 to 100 characters$/,
  },
  {
    name: "a committed version",
    edit: (e) => (e.version = "1.0.0"),
    expect: /`version` must not be committed/,
  },
  {
    name: "a repository pointing at another folder",
    edit: (e) => (e.repository.subfolder = "src/other"),
    expect: /`repository` must be .*subfolder: src\/demo/,
  },
  {
    name: "no repository",
    edit: (e) => delete e.repository,
    expect: /`repository` must be/,
  },
  {
    name: "a remote",
    edit: (e) =>
      (e.remotes = [{ type: "streamable-http", url: "https://example.com" }]),
    expect: /`remotes` is not supported/,
  },
  {
    name: "no packages",
    edit: (e) => delete e.packages,
    expect: /`packages` must hold exactly one package/,
  },
  {
    name: "two packages",
    edit: (e) => e.packages.push({ ...e.packages[0] }),
    expect: /`packages` must hold exactly one package/,
  },
  {
    name: "a package that is not an object",
    edit: (e) => (e.packages = [null]),
    expect: /`packages\[0\]` is not an object/,
  },
  {
    name: "the wrong package registry",
    edit: (e) => (e.packages[0].registryType = "pypi"),
    expect: /`packages\[0\]\.registryType` must be `npm`/,
  },
  {
    name: "another package's identifier",
    edit: (e) => (e.packages[0].identifier = "left-pad"),
    expect:
      /must be the published package, `@modelcontextprotocol\/server-demo`/,
  },
  {
    name: "a committed package version",
    edit: (e) => (e.packages[0].version = "1.0.0"),
    expect: /`packages\[0\]\.version` must not be committed/,
  },
  {
    name: "a registry base URL",
    edit: (e) => (e.packages[0].registryBaseUrl = "https://npm.example.com"),
    expect: /`packages\[0\]\.registryBaseUrl` must be left out/,
  },
  {
    name: "a transport other than stdio",
    edit: (e) => (e.packages[0].transport = { type: "sse" }),
    expect: /`packages\[0\]\.transport\.type` must be `stdio`/,
  },
  {
    name: "no transport",
    edit: (e) => delete e.packages[0].transport,
    expect: /`packages\[0\]\.transport\.type` must be `stdio`/,
  },
];

// `marker` is what the package claims: by default the sound name, so a case
// that edits the name says what the package claims alongside it.
for (const { name, edit, expect, marker = NAME } of defects)
  test(`entry: ${name} is a problem`, () => {
    const entry = soundEntry();
    edit(entry);
    const problems = problemsWith(entry, { marker });
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], expect);
  });

test("entry: a package with no marker is a problem, named per registry", () => {
  assert.match(
    problemsWith(soundEntry(), { marker: undefined })[0],
    /its package\.json has no `mcpName`/,
  );
  const entry = soundEntry();
  entry.packages[0].registryType = "pypi";
  assert.match(
    problemsWith(entry, { registryType: "pypi", marker: undefined })[0],
    /its README has no `mcp-name:` marker/,
  );
});

test("entry: a PyPI mismatch names the README marker", () => {
  const entry = soundEntry();
  entry.packages[0].registryType = "pypi";
  assert.match(
    problemsWith(entry, {
      registryType: "pypi",
      marker: `${NAMESPACE}server-other`,
    })[0],
    /the `mcp-name:` marker in README\.md/,
  );
});

test("entry: every problem is reported, not only the first", () => {
  const entry = soundEntry();
  entry.version = "1.0.0";
  entry.description = "";
  entry.packages[0].identifier = "left-pad";
  assert.equal(problemsWith(entry).length, 3);
});

test("marker: read from a comment, plain text, or ahead of a tag", () => {
  assert.equal(readmeMarker(`# T\n\n<!-- mcp-name: ${NAME} -->\n`), NAME);
  assert.equal(readmeMarker(`<!--mcp-name:${NAME}-->`), NAME);
  assert.equal(readmeMarker(`mcp-name: ${NAME}\n`), NAME);
  assert.equal(readmeMarker(`mcp-name: ${NAME}`), NAME);
  assert.equal(readmeMarker(`<p>mcp-name: ${NAME}</p>`), NAME);
});

test("marker: a README without one has none", () => {
  assert.equal(readmeMarker("# A server\n\nNo marker here.\n"), undefined);
});

test("stamp: the version lands after the description and in the package", () => {
  const stamped = stampEntry(soundEntry(), "1.2.3");
  assert.deepEqual(Object.keys(stamped), [
    "$schema",
    "name",
    "title",
    "description",
    "version",
    "repository",
    "packages",
  ]);
  assert.equal(stamped.version, "1.2.3");
  assert.deepEqual(stamped.packages, [
    {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-demo",
      version: "1.2.3",
      transport: { type: "stdio" },
    },
  ]);
});

test("stamp: the committed entry is left as it was", () => {
  const entry = soundEntry();
  stampEntry(entry, "1.2.3");
  assert.deepEqual(entry, soundEntry());
});

test("repository: every published server has a sound entry at its manifest's version", () => {
  const { entries, problems } = registryEntries();
  assert.deepEqual(problems, []);
  const { npm, pypi } = expectedPackages();
  const packages = { ...npm, ...pypi };
  assert.deepEqual(Object.keys(entries).sort(), Object.keys(packages).sort());
  for (const [dir, entry] of Object.entries(entries)) {
    assert.equal(entry.version, packages[dir].version, dir);
    assert.equal(entry.packages[0].version, packages[dir].version, dir);
    assert.equal(entry.packages[0].identifier, packages[dir].name, dir);
  }
});

test("repository: no two servers share a registry name", () => {
  const names = Object.values(registryEntries().entries).map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
});

/**
 * A repository root holding one npm server and one PyPI server, each with a
 * sound entry, for the tests to break.
 *
 * @returns {string} the root; the caller removes it
 */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "mcp-registry-"));
  const npmDir = path.join(root, "src", "demo");
  mkdirSync(npmDir, { recursive: true });
  writeFileSync(
    path.join(npmDir, "package.json"),
    JSON.stringify({
      name: "@modelcontextprotocol/server-demo",
      version: "1.2.3",
      mcpName: NAME,
    }),
  );
  writeFileSync(path.join(npmDir, "server.json"), JSON.stringify(soundEntry()));
  const pyDir = path.join(root, "src", "pydemo");
  mkdirSync(pyDir, { recursive: true });
  writeFileSync(
    path.join(pyDir, "pyproject.toml"),
    '[project]\nname = "mcp-server-pydemo"\nversion = "2026.1.2"\n',
  );
  writeFileSync(
    path.join(pyDir, "README.md"),
    `# Demo\n\n<!-- mcp-name: ${NAMESPACE}server-pydemo -->\n`,
  );
  const pyEntry = soundEntry();
  pyEntry.name = `${NAMESPACE}server-pydemo`;
  pyEntry.repository.subfolder = "src/pydemo";
  pyEntry.packages[0] = {
    registryType: "pypi",
    identifier: "mcp-server-pydemo",
    transport: { type: "stdio" },
  };
  writeFileSync(path.join(pyDir, "server.json"), JSON.stringify(pyEntry));
  return root;
}

/** Run `main` with the console captured, so expected errors stay off it. */
function runMain(options) {
  const lines = { out: [], err: [] };
  const { log, error } = console;
  console.log = (line) => lines.out.push(line);
  console.error = (line) => lines.err.push(line);
  try {
    return { code: main(options), ...lines };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("fixture: both registries' entries are stamped from their manifests", () => {
  const root = fixture();
  try {
    const { entries, problems } = registryEntries(root);
    assert.deepEqual(problems, []);
    assert.equal(entries.demo.version, "1.2.3");
    assert.equal(entries.pydemo.version, "2026.1.2");
    assert.equal(entries.pydemo.packages[0].version, "2026.1.2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture: a server with no entry is a problem", () => {
  const root = fixture();
  try {
    rmSync(path.join(root, "src", "demo", "server.json"));
    const { entries, problems } = registryEntries(root);
    assert.deepEqual(Object.keys(entries), ["pydemo"]);
    assert.match(problems[0], /^src\/demo\/server\.json is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture: an entry that is not JSON is a problem", () => {
  const root = fixture();
  try {
    writeFileSync(path.join(root, "src", "demo", "server.json"), "{ nope");
    const { problems } = registryEntries(root);
    assert.match(problems[0], /^src\/demo\/server\.json does not parse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture: a package.json whose mcpName is gone is a problem", () => {
  const root = fixture();
  try {
    writeFileSync(
      path.join(root, "src", "demo", "package.json"),
      JSON.stringify({
        name: "@modelcontextprotocol/server-demo",
        version: "1.2.3",
        mcpName: 7,
      }),
    );
    const { problems } = registryEntries(root);
    assert.match(problems[0], /package\.json has no `mcpName`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture: a Python server whose README is gone, or lost its marker, is a problem", () => {
  const root = fixture();
  try {
    const readme = path.join(root, "src", "pydemo", "README.md");
    writeFileSync(readme, "# Demo\n");
    assert.match(
      registryEntries(root).problems[0],
      /README has no `mcp-name:` marker/,
    );
    rmSync(readme);
    assert.match(
      registryEntries(root).problems[0],
      /README has no `mcp-name:` marker/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main: prints the entries and writes the step output", () => {
  const root = fixture();
  try {
    const output = path.join(root, "github-output");
    writeFileSync(output, "");
    const { code, out } = runMain({ root, env: { GITHUB_OUTPUT: output } });
    assert.equal(code, 0);
    const printed = JSON.parse(out.join("\n"));
    assert.deepEqual(Object.keys(printed), ["demo", "pydemo"]);
    const written = readFileSync(output, "utf8");
    assert.match(written, /^mcp_registry=\{.*\}\n$/);
    assert.deepEqual(
      JSON.parse(written.slice("mcp_registry=".length)),
      printed,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main: outside GitHub Actions it only prints", () => {
  const root = fixture();
  try {
    const { code, out } = runMain({ root, env: {} });
    assert.equal(code, 0);
    assert.equal(out.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("main: a problem fails the run and writes no output", () => {
  const root = fixture();
  try {
    const output = path.join(root, "github-output");
    writeFileSync(output, "");
    const file = path.join(root, "src", "demo", "server.json");
    const entry = soundEntry();
    entry.version = "9.9.9";
    writeFileSync(file, JSON.stringify(entry));
    const { code, out, err } = runMain({
      root,
      env: { GITHUB_OUTPUT: output },
    });
    assert.equal(code, 1);
    assert.deepEqual(out, []);
    assert.match(err.join("\n"), /src\/demo\/server\.json: `version` must not/);
    assert.equal(readFileSync(output, "utf8"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
