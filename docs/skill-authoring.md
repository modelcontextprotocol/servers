# Writing a skill and its eval cases

The **rules** for skill maintenance — the four numbered requirements, the
invocation-mode policy, the listing budget — are in
[`AGENTS.md`](../AGENTS.md#maintaining-the-skills). This page is the _how_: what
makes a description fire, what makes an eval case measure the right thing, and
the loop for tuning both. It exists because `verify:skills` can prove a skill is
well-formed but cannot prove it is ever _reachable_, and the tool that measures
reachability — `npm run skills:eval` — reports a hit rate rather than a verdict.

> **Provenance.** This page, and the harness it describes, are ported from the
> [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (#4863).
> The measurements quoted below were taken there, against the Inspector's own
> skills (`testing`, `test-servers`, `local-dev` and so on). They are kept
> because they are the evidence the rules rest on — not claims about this
> repo's skills, which get measured the same way as they land.

## How the eval actually measures

`scripts/skill-eval.mjs` runs every committed case in a **fresh headless
session** (`claude -p`), `RUNS` times, and scores the fraction of runs in which
the `Skill` tool fired with the expected name.

There are **two kinds of case**, measured against different turn budgets and
reported in separate columns:

| | asserts | budget | column |
| --- | --- | --- | --- |
| `"expect": "<skill>"` / `null` | the skill is (or is not) the model's **first move** | 1 turn | first-move |
| `"chain": ["a", …, "<skill>"]` | loading `a` **leads to** loading this skill | `CHAIN_MAX_TURNS` (14) | hand-off, `CHAIN_THRESHOLD` 0.5 |

Almost every case is the first kind, and the four properties below are about
that kind. The hand-off case has its own section further down.

Four properties of that harness drive everything below:

- **`--max-turns 1`.** The skill must fire in the model's **first assistant
  turn**. Ordering _within_ that turn does not matter — `collectSkillInvocations`
  scans every `tool_use` block in the event, so a turn that calls `Read` and
  `Skill` together still scores a hit. What loses the sample is needing a tool
  *result* first: read a file, look at what came back, then decide — that
  decision lands in turn two, which never runs. So a prompt that invites the
  model to go look at something before answering is a miss even when its
  eventual answer would have been perfect. This is the single most important
  fact about writing cases.
- **The session is fresh, but not empty.** `AGENTS.md` is loaded in full
  on every turn, so anything the rules file already answers gets
  answered without a skill.
- **Negative cases are scored against every model-invoked skill in this repo**,
  not just the one whose file they live in. A negative passes only if _none_ of
  ours fired.
- **Positive cases may only expect their own skill.** `verify:skills` rejects a
  foreign name, because a case that passes when a _different_ skill fires
  reports a measurement of something it does not describe.

## Writing a description

Lead with the **actions**, then enumerate concrete **situations**:

```
description: <verb phrase saying what this does>. Use when <situation>;
when <situation>; when <situation>; or when <situation>.
```

This shape is what the measurements keep rewarding. Reshaping `pre-push-gate`
into it took it from 3/5 to 5/5, and `testing`'s three cases from 25/50/25% to
100% each. A noun-phrase list of contents ("Where things live, what is in core/,
and what each directory is for") consistently underperforms it.

Three further rules, each learned the expensive way:

- **Put the key use case first.** Each listing entry is capped at 1,536
  characters and the whole listing at 4,000; entries are dropped least-invoked
  first when it overflows.
- **Adding a skill costs the skills already there.** Going from three
  model-invoked skills to nine measurably lowered the trigger rate of the
  existing ones — the ceiling is attention, not characters. So **re-run the full
  suite after any flip or description edit**, never just the changed skill's
  cases.
- **`paths` is not a free win.** It halved `testing`'s conversational trigger
  rate, and a prompt-only eval can never exercise a path trigger, so shipping it
  means shipping an untestable claim.

## Writing an eval case

### The first-move rule

A case measures the description only if invoking a skill is the model's natural
**first** move. Ask **"how do I …"**, not **"how does this work"** — the second
invites a `Read` or a `Grep`, which spends the only turn the harness allows.

Measured in the Inspector, one probe each:

| Prompt                                                                                   | First tool call |
| ---------------------------------------------------------------------------------------- | --------------- |
| "How do TUI components get mounted and keypresses driven in this repo's tests?"          | `Bash`          |
| "How do I write a test for a TUI component in this repo?"                                | `Skill` ✅      |
| "Which part of this repo owns the browser's HTTP transport and the backend it talks to?" | `Bash`          |
| "Does browser-only transport code belong in core or in the web client?"                  | `Skill` ✅      |
| "Which parts of the gate only ever run locally and never in CI?"                         | `Read`          |
| "The gate failed at the lint stage. How do I work out what is wrong?"                    | `Skill` ✅      |

⚠️ Those rows come from an **unrestricted** probe, run before the snippet below
was aligned with the harness. The eval itself forbids `Bash` (and `Write`,
`Edit`, `NotebookEdit`), so a scored case cannot actually reach for one — what
the rows show is the *pull*: given a free choice, these prompts send the model
to read the repo rather than to load a skill, and under the harness's flags that
same pull simply produces no `Skill` call at all. Read them as a diagnosis of
why a prompt scores badly, never as a claim about which tools the eval offers.

Shapes that reliably fire:

- **"How do I …"** — a procedure, not an explanation.
- **"Does X belong in A or B?"** — a decision the repo has a convention for.
- **"\<Stage\> failed. How do I diagnose it?"** — a symptom with a documented cause.
- **"Which command runs …?"** — when the answer is a repo-specific script.
- **A bare imperative** — "Triage the new issues.", "Move the card for issue 2189
  to In Review."

Shapes that reliably do not:

- **"How does X work here?"** / **"Where is X implemented?"** — an invitation to
  read the source, which is the _better_ answer and scores as a miss.
- **Anything naming a concrete file, symbol, or helper.** Naming the mechanism
  hands the model a grep target and removes the reason to load a procedure.

### Do not write a case `AGENTS.md` already answers

`AGENTS.md` is resident on every turn, so a prompt it answers is answered
without the skill and the case reads as a permanent miss. Three that had to be
retired in the Inspector:

| Retired case                                                                    | Why it could never pass                                                                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "Which package owns the OAuth secret storage backends?"                         | The directory tree in `AGENTS.md` says `auth/ — OAuth end to end + the per-server SecretStore backends`. Scored 0% across two full runs. |
| "In `…/Foo.test.tsx` I need to assert on a Mantine transition mid-flight. How?" | `AGENTS.md` names `renderWithMantineTransitions` and states the rule outright. Also named a concrete file — two faults at once.          |
| "What should I run before I push?"                                              | `AGENTS.md` states `npm run local:gate` is the mandatory pre-push command. Scored 40%.                                                   |

**Partial overlap reads as flakiness, not as a miss.** A case the rules file
answers _outright_ sits at 0% and is easy to spot. A case it answers _half_ of
oscillates — and looks like eval noise rather than a defect in the case. Two of
`local-dev`'s cases behaved exactly this way before being retired:

| Case                                                                                           | Scores across runs        | The overlap                                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| "I added a dependency and the TUI bundle broke at import time. **Where should it have gone?**" | 33 / 67 / 100 / 100 / 60% | Dependency placement is stated in full in `AGENTS.md`; only the diagnosis is the skill's |
| "I just pulled and a client's dependencies look out of sync. **What do I need to run?**"       | 80 / 80 / 60%             | `AGENTS.md` says a single root `npm install` is all you need                             |

⚠️ **A high score does not clear a case of overlap, and this is the eval's real
blind spot.** The two rules above — outright overlap pins a case near 0%, partial
overlap makes it oscillate — describe what the *scores* look like once you already
suspect a case. They are not a detector. Across code review of this PR, three
committed cases were identified as `AGENTS.md`-answerable by *reading* them, and
all three were scoring **80–100%** at the time:

| Case | Score when flagged |
| --- | --- |
| `project-structure`: "Does a new Node-only backend piece for the web client belong in core…?" | 80 → 100% |
| `project-structure`: "Does a helper that only the CLI and TUI use belong in core…?" | 80% |
| `issue-create`: "What do I need to do beyond `gh issue create`…?" | 100 / 100 / 100% |

The first two were re-aimed; the third was kept, because a case that holds at
100% across three independent suites is measuring *something* the rules file does
not supply on its own. But the lesson stands either way: **the eval cannot tell
you a passing case is well-aimed.** It can only tell you a case is failing. Read
every new case against `AGENTS.md` by hand before committing it, and do not let a
green suite substitute for that.

Both stabilised at 100% once re-aimed at what only the skill holds — "what do I
**check**" instead of "where should it have **gone**", and the worktree install
trap instead of the install command. If a case keeps moving between runs while
its neighbours hold steady, suspect the case before you suspect the noise.

The test to apply before committing a case: **could a reader answer this from
the rules file alone?** If yes, it measures `AGENTS.md`, not the skill. Aim the
case at what only the skill body holds — a live ID, a command sequence, a
recovery recipe, a diagnosis.

### When a neighbouring skill fires, the case is wrong

A positive case may only expect its own skill, so a prompt that a _different_
skill legitimately owns can never pass — and rewriting the description to win it
would be the wrong fix, because it would broaden a skill onto another's ground.
"How do I get an issue I already filed onto the project board with the right
fields?" fired `board-ops` 3/3 as an `issue-create` case. `board-ops` is the
right answer: adding a card and setting its fields is a board operation. The
case was replaced, not the description.

Before blaming a description for a miss, check **which** skill fired. If it is a
neighbour and the neighbour is right, the case is aimed at the wrong skill.

### Negative cases

Every **model-invoked** skill's eval file needs at least one `"expect": null`
case; a skill that fires on everything is a context regression nobody notices by
hand. (A name-only skill has no eval file to put one in — see the checklist.) Keep them plainly
unrelated to the repo (arithmetic, trivia, a one-line refactor). All 18 in the
Inspector have held at 100% through every reshaping so far — if one starts firing, a
description has grown too broad.

### Chained cases: measuring a hand-off

A skill body may point at another skill — `testing` opens by telling the model
that picking a fixture is `/test-servers` and that it has to load it, and
because `test-servers` is model-invocable that pointer is live rather than a
dead end. **Nothing in a first-move case can observe whether that pointer is
ever taken.** `test-servers` scores 5/5 on its own cases and every one of them
asks for it by name; a skill only ever reached _through_ another would score a
clean 100% while the hand-off silently never fired (modelcontextprotocol/inspector#2204).

⚠️ **A green hand-off number is not evidence the hand-off is USEFUL.** The case
can observe one thing — that skill B was loaded. Whether B then answers the
question the prompt actually asked is outside what any `chain` case measures, in
either direction: B can be loaded and say nothing relevant, or say something
actively wrong for the caller that arrived through A. `testing` ->
`test-servers` scored 100% while `test-servers` documented only the two-process
manual path, so every model that followed the pointer from an *integration-test*
prompt was handed the wrong half of the procedure (modelcontextprotocol/inspector#2264). So when a chain case
goes green, **read B's body as the caller who arrives through A** and check that
what it says fits that caller. The number cannot do that for you.

A chained case names the ordered skills one run should load:

```json
{
  "prompt": "Write an integration test that exercises tool listing end to end.",
  "chain": ["testing", "test-servers"]
}
```

**Write a chained case when the prompt names nothing about the target skill and
the path to it runs through another skill.** Write an ordinary first-move case
for everything else — a prompt someone would actually type to reach this skill
directly is a first-move case even when a hand-off could also get there, and it
is the cheaper measurement by an order of magnitude.

Six rules the shape enforces, each for a reason worth knowing:

- **The chain ends with the skill whose file it lives in.** The case exists to
  measure whether _this_ skill is reachable, so the file that must go red when
  the hand-off stops working is the one belonging to the skill that stops being
  reached. Anchoring on the first link would file the `testing → test-servers`
  measurement under `testing`, where a `test-servers` description edit would
  never be seen.
- **A chained case satisfies neither floor.** It is not one of the five
  positives and it is not the negative. It measures a different thing, so
  letting it stand in would let a skill ship with no measurement of the way
  users actually reach it.
- **The match is an ordered _subsequence_, not a prefix and not a contiguous
  run.** The model may load something before the chain starts and something
  unrelated in between; neither changes the claim that A led to B. What does not
  score is the reverse order.
- **Every link after the first must land in a later assistant turn.** Position
  in the stream is not causation: the model can emit several `tool_use` blocks
  in one message, and it has not seen the first skill's body when it does — so
  two `Skill` calls in the same turn are parallel guesses, not a hand-off, and
  a flat index would score them as one (Copilot). This is the difference
  between "B was loaded after A" and "A led to B", and it is the second way a
  chained case can false-pass — the first being a prompt that carries the
  target's own trigger, below. Only the chain's *first* link is unconstrained.
- **Repeats and unknown links are rejected.** A repeated link cannot be
  observed, and a link naming a skill the model cannot invoke can never fire —
  it would score a permanent 0% that reads as a description problem.
- **The two numbers never share a column.** A hand-off rate is a second-hop load
  over many turns; a first-move rate is the model's opening move. Summing them
  would produce a figure describing neither, and a handful of hand-off cases
  would quietly move a headline everyone reads as trigger reliability.

⚠️ **The prompt must not carry the TARGET skill's own trigger.** This is the
subtle way a chained case false-passes. `test-servers` claims the situation "a
change needs a real server to exercise it", so a prompt saying "…against a real
server" matches it directly: the model can pick `testing` first and then pick
`test-servers` from the *original prompt*, in that order, and the case scores a
hit that would survive deleting the pointer from `testing` entirely (Copilot).
Both committed cases said "against a real/live server" and were rewritten to
"end to end" for exactly this reason — and the measured rate **fell from 100%
and 67% to 33% and 33%**, which is the size of the effect this trap hides.
**Write the prompt so only the loaded first skill can introduce the second**,
and sanity-check it by asking whether the case would still pass if the pointer
were removed.

⚠️ **A chained case only measures a pointer that exists.** `pr-flow` says
nothing about test fixtures, so a `["pr-flow", "test-servers"]` case measured 0%
— correctly, and with no lever to fix it short of broadening a description onto
another skill's ground. Before writing one, confirm the first link's body
actually points at the target; otherwise the case is a permanent zero that reads
as a description problem.

⚠️ **A hand-off case is a measurement under the harness's tool policy, not a
prediction about an unrestricted session.** `--max-turns 1` was doing much of
the read-only containment on its own; a 14-turn budget removes that, so the deny
list covers the agentic and network tools too (`Task` in particular, whose
subagent the flag does not reach). Denying `Bash` also changes the path a run
can take toward the second skill, since investigating a repo by hand often
starts there. `Read`/`Glob`/`Grep` remain, which is enough to reach a hand-off.

**A hand-off is far less reliable than a first move, and the threshold says so.**
`CHAIN_THRESHOLD` defaults to **0.5**, not 0.8 — the weakest claim worth
asserting is that the pointer is taken more often than not — and it is compared
**strictly**. "More often than not" is `> 0.5`, and an inclusive compare would
pass 2/4 whenever `RUNS` is even, reporting a result the criterion does not
license (Copilot). A strict bound of `1.0` is therefore unreachable and the
harness rejects it up front rather than failing every case.

0.5 is a floor on **useful reliability for a second-hop load**, not a claim that
0.8 is out of reach — the one pointer measured after reshaping cleared it
outright, at 100% in the worked example below. Note that a *chain* bar of 0.8 would be a **strict** one
(`> 0.8`, the comparison this threshold uses; the first-move 0.8 is the
inclusive `>=`), so at `RUNS=5` only a clean 5/5 would pass it — 4/5 would not. What 0.5 buys is that the column keeps carrying signal across the
*range* of pointer strengths a repo actually has: a hand-off is a noisier
measurement than a first move, so a bar set where a strong pointer sits marks
every merely-adequate one red and stops distinguishing them from a broken one.
Read a hand-off number as a **pointer**-strength measurement — the strength of
what the *first* skill's body says about the second, not of either description,
since a well-written chained prompt is one the target's description cannot
trigger on its own. Not a verdict, either; and read it at `RUNS=5`, since at
`RUNS=3` one sample is worth 33 points.

**A red hand-off case is a finding about the pointer, not a build break — and
the fix is to reshape the pointer, never to lower the bar.** The committed
`testing` -> `test-servers` cases are the worked example.

Against the **weak** pointer — a one-sentence ⚠️ near the top of `testing`
*classifying* which work belongs to `test-servers` — they measured **33% / 33%**
on one `RUNS=3` run and **100% / 33%** on another. Those two runs are the
unchanged-pointer pair the warning below is about: same prompts, same body, 67
points apart on the first case.

Rewriting that classification into an imperative first step ("load the
`test-servers` skill now — that is step one"), and repeating it at the two later
points where the model actually decides it is writing a fixture-backed test, took
them to **100% / 100% at `RUNS=5`** with the prompts unchanged (modelcontextprotocol/inspector#2247). Nothing
else moved: the two descriptions were not touched, and the same suite scored
**63/63** first-move cases at 100%. (An intermediate build of that change
measured 100% / 80% on the full suite and 100% / 100% on a focused
`-- test-servers` run — a reminder that even `RUNS=5` still carries 20 points of
noise, well short of the 67 above.)

The transferable part is that **a pointer is followed when it reads as an action
with a trigger, placed where the decision is actually made.** modelcontextprotocol/inspector#2202 found the
same lever on a *description*'s shape; this is it applied to a body.

⚠️ **Read that as ONE lever, not two.** The modelcontextprotocol/inspector#2247 edit changed the wording *and*
the placement in the same revision, and only the combination was measured, so
the run establishes the pair — it does not license attributing the rise to
imperative phrasing alone, nor to repetition alone. The split into two levers is
the plausible reading of the mechanism, not a measured result: the top of a body
is read before the model knows it needs the second skill, so a pointer that
lives only there has plausibly been scrolled past by the time it matters. Taking
them apart would need two more runs — reword without moving, and move without
rewording — and nobody has paid for those. Until someone does, ship both.

⚠️ **Do not read a rise between two `RUNS=3` runs as an improvement.** One
sample is 33 points there, and the two weak-pointer runs above (33% / 33% and
100% / 33%) straddle a 67-point swing on the same prompt with no change to the
pointer. Note in particular that the
turn-boundary rule added later can only ever *lower* a chained score — it
rejects matches a flatter reading accepted — so a higher number after it is
noise by construction, not an effect. `RUNS=5` is the smallest honest setting
for a hand-off, and the cost is real: each sample is up to 14 turns.

⚠️ **Expect a hand-off to cost far more than a first move.** Each sample is up
to 14 turns rather than one, so a chained case is the most expensive line in the
suite by a wide margin — the two above take longer between them than all seven
first-move cases.

## The tuning loop

**Probe first, then measure.** A full suite run is ~63 cases × `RUNS` sessions
of metered model calls; a single probe is one. Iterate with probes until a
prompt fires at all, and only then spend a full run on its rate:

```sh
# One sample, printing which tool actually fired first. The flags are the
# harness's own (see `runPrompt` in `scripts/skill-eval.mjs`), so a probe and a
# scored case see the same tool policy — a probe that may call a tool the eval
# forbids predicts nothing. `printf` rather than zsh's `print -r`, so the
# snippet also runs under bash.
printf '%s' "<prompt>" \
  | claude -p --output-format stream-json --verbose --max-turns 1 \
      --tools Read,Glob,Grep,Skill --allowedTools Read,Glob,Grep,Skill \
      --disallowedTools Bash,Write,Edit,NotebookEdit,Task,Agent,SlashCommand,WebFetch,WebSearch,KillShell \
      --strict-mcp-config \
  | jq -r 'select(.message.content?) | .message.content[]?
           | select(.type == "tool_use") | .name' | head -3
```

⚠️ **`--tools` is the restriction; `--allowedTools` only pre-approves.**
Dropping the first leaves the bound resting on the deny list alone, so a tool a
user's or a plugin's settings already permit stays reachable for all 14 turns
(Copilot). Keep both.

⚠️ **These flags are a copy of the harness's, so they go stale.** Whenever
`runPrompt` in `scripts/skill-eval.mjs` changes its tool policy, change this
snippet in the same edit — a probe that may call a tool the eval forbids
predicts nothing, which is the whole reason the two are meant to match
(Copilot). To probe a **hand-off** instead, raise `--max-turns` to
`CHAIN_MAX_TURNS` and drop the `head -3`:

```sh
printf '%s' "<prompt>" \
  | claude -p --output-format stream-json --verbose --max-turns 14 \
      --tools Read,Glob,Grep,Skill --allowedTools Read,Glob,Grep,Skill \
      --disallowedTools Bash,Write,Edit,NotebookEdit,Task,Agent,SlashCommand,WebFetch,WebSearch,KillShell \
      --strict-mcp-config \
  | jq -r 'select(.message.content?) | .message.content[]?
           | select(.type == "tool_use" and .name == "Skill") | .input.skill'
```

**Probe a marginal case more than once.** A prompt that fires on a single probe
can still measure 60% over five runs — one sample cannot distinguish "reliable"
from "coin flip". Three probes is enough to tell a solid replacement from a
lucky one, and it is still far cheaper than a full suite run.

Then the suite:

```sh
npm run skills:eval                              # every model-invoked skill, RUNS=3
RUNS=5 CONCURRENCY=6 npm run skills:eval
npm run skills:eval -- pr-flow                   # one skill's cases
npm run skills:eval -- pr-flow issue-create      # a set of skills
CHAIN_THRESHOLD=0.4 CHAIN_MAX_TURNS=20 npm run skills:eval -- issue-create
```

The summary is two lines, never one:

```
7/7 claude first-move cases at or above 80%.
2/2 claude hand-off cases above 50%.
```

Narrowing the run never narrows what a **negative** case is scored against — a
focused run still fails a negative that fires any model-invoked skill in the
repo, because "no skill of ours fired" is the property being asserted. An
unknown name is a hard error rather than an empty run, since a typo would
otherwise report a green 0/0 that reads exactly like a clean pass.

⚠️ **A focused run cannot see displacement.** Adding or reshaping a description
changes the trigger rate of skills you did not touch, and only the full suite
observes that. Use the filter to iterate; take the full suite before you push.

**Read the noise before reading the result.** At `RUNS=3` one sample is worth 33
points, and an untouched skill was observed swinging 100 points across two runs
of the same suite. `RUNS=5` is the smallest setting where a single flake does
not cross the 0.8 threshold on its own. A one-case move is not evidence; a skill
whose cases move _together_ is.

This is why the eval is **not** in `validate`, `local:gate`, or CI: it spends
metered calls, it is non-deterministic by construction, and it goes red on a
rate limit. A case below threshold is a signal to investigate, not a build
break.

## Measuring GitHub Copilot

Some maintainers work on this repo with the [GitHub Copilot
CLI](https://www.npmjs.com/package/@github/copilot), so the same committed cases
also run through it (modelcontextprotocol/inspector#2397):

```sh
npm install -g @github/copilot   # then sign in once: `copilot`, then `/login`
AGENT=copilot npm run skills:eval
AGENT=copilot RUNS=5 npm run skills:eval -- pr-flow
```

**No coercion is needed: Copilot reads `.claude/skills/` as it is.** Its project
skill sources are `.github/skills/`, `.agents/skills/` **and** `.claude/skills/`,
and `copilot skill list` on 1.0.85 showed all ten of the Inspector's. So there is no symlink,
no `.github/skills/` copy and no pointer file, and there must not be one — two
copies of a procedure is how the stale one gets read.

What was verified in the Inspector about how Copilot treats the files, on 1.0.85:

- **It honors `disable-model-invocation: true`, but only as far as its tool
  goes.** Its `skill` tool refused `release` with `Skill not found`, and the
  model then opened `.claude/skills/release/SKILL.md` with `view` and read it
  anyway. A name-only skill is kept out of the automatic listing, not made
  unreadable — which is equally true of Claude, which can `Read` the file. It
  still offers `/release` in its interactive slash-command menu.
- **It honors `user-invocable: false` in that menu.** Driven through a real
  pty, typing `/pro` lists `pr-flow` and `pre-push-gate` but not
  `project-structure`, while `/testin` lists `testing`. The model can still load
  it through its `skill` tool, which is what `user-invocable: false` is for.
  (Headless `-p "/name"` is no test of this: prompt mode does not expand slash
  commands, so the model simply loads the named skill as a tool call.)
- **`AGENTS.md` is loaded as custom instructions**, so the rule in
  [Do not write a case `AGENTS.md` already answers](#do-not-write-a-case-agentsmd-already-answers)
  applies to Copilot runs unchanged.

How the Copilot run differs from the Claude run, since a rate only means
something next to the harness that produced it:

| | Claude | Copilot |
| --- | --- | --- |
| Turn budget | `--max-turns` | none exists; `runPrompt` stops the process once the stream shows that many model calls |
| Availability (the real bound) | `--tools Read,Glob,Grep,Skill` | `--available-tools view,glob,grep,skill` |
| Pre-approval only | `--allowedTools` | `--allow-tool` |
| Unconditional deny | `--disallowedTools` by tool name | `--deny-tool shell`, `write`, `url` — permission **kinds**, not names |
| MCP servers | `--strict-mcp-config` | `--disable-builtin-mcps`; it does not read `.mcp.json` |
| Model | whatever `claude` defaults to | whatever Copilot's model picker defaults to (Claude Sonnet 5 when measured) |

**Each invocation measures one agent, and every heading and summary line names
it.** The two rates come from different models behind different harnesses, so
they are compared side by side and never summed, for the same reason first-move
and hand-off cases are not.

To probe one prompt the way the Copilot run does:

```sh
printf '%s' "<prompt>" \
  | copilot --output-format json \
      --available-tools view,glob,grep,skill --allow-tool view,glob,grep,skill \
      --deny-tool shell --deny-tool write --deny-tool url \
      --disable-builtin-mcps --disallow-temp-dir --no-ask-user --no-auto-update \
  | jq -r 'select(.type == "assistant.message") | .data.toolRequests[]
           | if .name == "skill" then "skill:" + .arguments.skill else .name end' \
  | head -3
```

⚠️ Like the Claude probe above, **these flags are a copy of `agentArgs` in
`scripts/skill-eval.mjs`** — change both in the same edit. Unlike the Claude
probe, nothing here stops the run after the first move, so `head -3` only
trims the output; the session carries on until it answers.

**First measurement** (2026-09-16, Copilot CLI 1.0.85, Claude Sonnet 5): the
full suite at `RUNS=3` put **63/63 first-move cases at 100%**, every negative
clean. The hand-offs were then re-measured at `RUNS=5`, since `RUNS=3` is too
coarse to read a chain:

| Hand-off case | Copilot, `RUNS=5` | Claude, `RUNS=5` (modelcontextprotocol/inspector#2247) |
| --- | --- | --- |
| `testing → test-servers`, "Write an integration test that exercises tool listing end to end." | 100% | 100% |
| `testing → test-servers`, "Add end-to-end coverage for the tool-list pagination path." | **40%** | 100% |

So the pagination prompt was a **Copilot-specific shortfall**, not noise: it
held below the 50% bar at both sample sizes, while the same case cleared 100%
under Claude.

**Where it stopped** (modelcontextprotocol/inspector#2399), from five recorded Copilot runs of that prompt,
two of which made the hand-off: one loaded `testing` then `test-servers` as its
first two moves; one opened with `grep` and reached `testing → test-servers`
only after about ten searches, inside the turn budget. Of the three misses, two
loaded `testing` and then went straight to `grep`, never following its pointer,
and one searched the code throughout without loading any skill. The pointer was
conditional on "does this test use a `test-servers/` fixture?", and a prompt
about pagination does not say so, so the model went to the code to find out and
did not come back once it found `pagination-http.json`. The fix is in
`testing`'s body only (the description, and so the listing, is unchanged): the
pointer now names end-to-end or integration coverage of an MCP operation as the
signal to load `test-servers` **before** searching the code.

| Hand-off case | Copilot, `RUNS=5`, after | Claude, `RUNS=5`, after |
| --- | --- | --- |
| `testing → test-servers`, "Write an integration test that exercises tool listing end to end." | 100%, 100% | 100% |
| `testing → test-servers`, "Add end-to-end coverage for the tool-list pagination path." | **60%, 60%** | 100% |

Two independent Copilot runs are shown because 3/5 sits one run above the bar.
It clears it without lowering the Claude rate, but it is the weakest hand-off
measured under either agent, and the first case to re-check when a Copilot
release changes the default model.

## Checklist for a new or edited skill

1. Frontmatter opens on line 1 (no BOM, no blank line), YAML is valid, and any
   description containing `:` or `#` is **quoted**. An unquoted colon loads the
   body with an _empty_ description, so `/name` still works while the skill can
   never auto-fire again; an unquoted `#` is worse-behaved, truncating the
   description from that point on so it stays *non-empty* — which is why it went
   unnoticed until `board-ops` lost both its board numbers. `verify:skills` now
   rejects that truncation, so the gate catches it; quote the value rather than
   relying on the check to tell you.
2. `disable-model-invocation` is declared explicitly; default it to `false`.
3. Description is action-first, with `Use when …; when …; when …`.
4. **If the skill is model-invoked**, `evals/evals.json` carries **at least
   five positives and at least one negative** — every positive shaped by the
   first-move rule, none answerable from `AGENTS.md`. A name-only skill
   (`disable-model-invocation: true`, as `release` is) has no eval file at all:
   nothing can measure a trigger that only a human types, so an eval there would
   be unrunnable rather than merely redundant. `verify:skills` enforces the
   floor — fewer than five positives fails the gate. The reason is **breadth,
   not variance**: each prompt is scored on its own `passes / RUNS`, so extra
   prompts do not steady any rate (`RUNS` is the knob for that). Five prompts
   cover five ways someone might arrive at the skill, which is what catches a
   description that fires on one narrow phrasing and nothing else.
5. **If this skill is meant to be reachable from another skill's body**, that
   hand-off has a `chain` case — a pointer between skills is otherwise measured
   by nothing at all, and a skill reached only that way scores a clean 100% on
   direct cases while the hand-off never fires. It does not count toward the
   floor in 4. **Then read the target's body as the caller arriving through that
   pointer** — the case proves the load, never that what loads is the half that
   caller needs (modelcontextprotocol/inspector#2264).
6. `npm run verify:skills` passes and the listing is under budget.
7. `RUNS=5 npm run skills:eval` — the **whole** suite — is ≥80% on every
   first-move case, including the skills you did not touch, and the hand-off
   column is read on its own rather than against that number.
