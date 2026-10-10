/**
 * Characterizes the everything server's use of client roots (#4854): the
 * `roots/list` request it sends after `initialize` for a client that declares
 * the roots capability, its re-request on `notifications/roots/list_changed`,
 * the log message it sends with each result, and the `get-roots-list` tool,
 * all driven by a test client that answers the server's `roots/list`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ListRootsRequestSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import {
  connect,
  contentOf,
  ofMethod,
  textOf,
  type Session,
} from "./harness.js";

let session: Session | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await session?.close();
  session = undefined;
});

/** Connect a roots-capable client whose `roots/list` answer is `answer()`. */
async function connectWithRoots(answer: () => Root[]) {
  let requests = 0;
  const s = await connect({
    capabilities: { roots: { listChanged: true } },
    setup: (client) =>
      client.setRequestHandler(ListRootsRequestSchema, async () => {
        requests++;
        return { roots: answer() };
      }),
  });
  return { s, requests: () => requests };
}

function logData(s: Session): unknown[] {
  return ofMethod(s.notifications, "notifications/message").map(
    (n) => n.params,
  );
}

async function getRootsList(s: Session): Promise<string> {
  const result = await s.client.callTool({
    name: "get-roots-list",
    arguments: {},
  });
  return textOf(contentOf(result)[0]);
}

const ROOTS: Root[] = [
  { uri: "file:///workspace/one", name: "One" },
  { uri: "file:///workspace/two" },
];

describe("roots sync after initialize", () => {
  it("requests the client's roots once, shortly after initialize, and logs the count", async () => {
    const { s, requests } = await connectWithRoots(() => ROOTS);
    session = s;
    expect(requests()).toBe(0);
    await vi.waitFor(() => expect(requests()).toBe(1));
    await vi.waitFor(() =>
      expect(logData(s)).toEqual([
        {
          level: "info",
          logger: "everything-server",
          data: "Roots updated: 2 root(s) received from client",
        },
      ]),
    );
  });

  it("re-requests the roots when the client says they changed", async () => {
    let roots = ROOTS;
    const { s, requests } = await connectWithRoots(() => roots);
    session = s;
    await vi.waitFor(() => expect(requests()).toBe(1));

    roots = [{ uri: "file:///elsewhere", name: "Elsewhere" }];
    await s.client.sendRootsListChanged();
    await vi.waitFor(() => expect(requests()).toBe(2));
    await vi.waitFor(() =>
      expect(logData(s).at(-1)).toMatchObject({
        data: "Roots updated: 1 root(s) received from client",
      }),
    );
    expect(await getRootsList(s)).toContain(
      "1. Elsewhere\n   URI: file:///elsewhere",
    );
  });

  it("sends no roots/list to a client without the roots capability", async () => {
    session = await connect();
    // Past the 350 ms delay, nothing has been logged: no sync happened.
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(logData(session)).toEqual([]);
  });

  it("logs to stderr, and sends nothing, when the client fails to list its roots", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { s } = await connectWithRoots(() => {
      throw new Error("no roots for you");
    });
    session = s;
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        `Failed to request roots from client ${s.sessionId}: MCP error -32603: no roots for you`,
      ),
    );
    expect(logData(s)).toEqual([]);
  });
});

describe("get-roots-list", () => {
  it("lists the roots, naming an unnamed one", async () => {
    const { s } = await connectWithRoots(() => ROOTS);
    session = s;
    expect(await getRootsList(s)).toBe(
      "Current MCP Roots (2 total):\n\n" +
        "1. One\n   URI: file:///workspace/one\n\n" +
        "2. Unnamed Root\n   URI: file:///workspace/two\n\n" +
        "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
        "The roots are provided by the MCP client and can be used by servers that need file system access.",
    );
  });

  it("fetches the roots itself when called before the initial sync, and the sync then reuses them", async () => {
    const { s, requests } = await connectWithRoots(() => ROOTS);
    session = s;
    await getRootsList(s);
    expect(requests()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(requests()).toBe(1);
  });

  it("explains an empty roots list", async () => {
    const { s } = await connectWithRoots(() => []);
    session = s;
    expect(await getRootsList(s)).toBe(
      "The client supports roots but no roots are currently configured.\n\n" +
        "This could mean:\n" +
        "1. The client hasn't provided any roots yet\n" +
        "2. The client provided an empty roots list\n" +
        "3. The roots configuration is still being loaded",
    );
  });

  it("explains a client that failed to list its roots the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { s } = await connectWithRoots(() => {
      throw new Error("unavailable");
    });
    session = s;
    expect(await getRootsList(s)).toMatch(
      /^The client supports roots but no roots are currently configured\./,
    );
  });
});
