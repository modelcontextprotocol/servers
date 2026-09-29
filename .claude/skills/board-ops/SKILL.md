---
name: board-ops
description: "gh recipes for the Servers V2 project board (#43): add an issue's card, move its Status, set or change its Priority, delete a card, and recover from a deleted single-select option. Use when moving a card between columns; when setting Status or Priority; when an option ID is rejected; before editing a board field's options; or when cards lost their Status or Priority."
disable-model-invocation: false
---

# Board operations

The rules about _what_ a card's Status and Priority should be live in
[`AGENTS.md`](../../../AGENTS.md) under **Issue-driven work style**. This skill is
the _mechanics_: the exact `gh` calls, the IDs, and the ways the board can be
damaged.

Related: `/issue-create` (the create flow, which boards a new issue through the
add-card recipe below).

**This file is the only place the board's IDs are written down.** Every other
skill and document names a column or a field and points here. Two copies of an
ID are worse than one, because the stale copy is indistinguishable from the live
one.

## The board

| Board | Owner | Fields this workflow uses |
| --- | --- | --- |
| [Servers V2 (#43)](https://github.com/orgs/modelcontextprotocol/projects/43) | `modelcontextprotocol` | Status, Priority |

There is one board. It is an **org** project, so every `gh project` command
takes `--owner modelcontextprotocol`. The board is **private**: treat a dump of
its items as private data (see the snapshot section below).

**Only issues go on the board, never PRs, never draft cards.** A PR is tracked
through the card of the issue it closes.

## IDs

The project node id and the field ids are stable:

| Thing | ID |
| --- | --- |
| Project node ID | `PVT_kwDOCt2Azc4BcZgq` |
| Status field ID | `PVTSSF_lADOCt2Azc4BcZgqzhXCpm0` |
| Priority field ID | `PVTSSF_lADOCt2Azc4BcZgqzhjiM9M` |

The **option** ids are **not** stable. They are regenerated whenever a
single-select field's option list is edited (see the hazard below), so **this
skill does not list them. Resolve an option id by its name, at run time,
every time**:

```sh
# The board's fields, once per session. Refuses to go on from a failed call.
FIELDS=$(gh project field-list 43 --owner modelcontextprotocol --format json) || FIELDS=
# opt <Field> <Option name> → the option's current id, or nothing.
opt() {
  jq -r --arg f "$1" --arg o "$2" \
    '.fields[] | select(.name == $f) | .options[] | select(.name == $o) | .id' \
    <<<"$FIELDS"
}

STATUS_OPT=$(opt Status "Todo")
PRIORITY_OPT=$(opt Priority "Medium")
[ -n "$STATUS_OPT" ] && [ -n "$PRIORITY_OPT" ] \
  || echo "option not found — check the name against the list below" >&2
```

The option **names** are what the workflow depends on:

| Field | Options, in board order |
| --- | --- |
| Status | `Incoming`, `Todo`, `In Progress`, `In Review`, `Done` |
| Priority | `Urgent`, `High`, `Medium`, `Low` |

What each Status means:

| Status | Means |
| --- | --- |
| Incoming | Arrived unboarded, awaiting review — **no milestone** |
| Todo | Approved (a milestone was assigned) |
| In Progress | Active work |
| In Review | A PR is open |
| Done | **Shipped** — a merged PR, or a parent whose last sub-issue closed |

If a name above no longer resolves, list what the field actually holds rather
than guessing:

```sh
# Swap "Status" for "Priority" to see the other field's options.
gh project field-list 43 --owner modelcontextprotocol --format json \
  | jq '.fields[] | select(.name=="Status") | .options'
```

A renamed option is a change to this table, made in the same change that
renames it.

## Finding a card without trusting `--limit`

⚠️ **`gh project item-list --limit N` truncates silently.** Past `N` it returns
the first `N` items with no error and no warning, so a `select` over the result
matches nothing and a card that exists reads as missing. A limit is a guess
about the board's size; don't make the recipes depend on it being right.

- **An issue's card is looked up from the issue**, which is independent of board
  size — see [Move an existing card](#move-an-existing-card).
- **A whole-board dump** (the snapshot and the recovery dump below) genuinely
  needs the full listing. Those recipes use a limit with headroom **and**
  compare the result's `.items | length` against the `.totalCount` that
  `item-list --format json` also returns, so a truncated listing fails loudly
  instead of passing as complete. The check also catches a failed `gh` call,
  whose empty output has neither key. Where a later step reads the dump from a
  file, an incomplete dump is deleted, so that step fails on the missing file
  rather than running on partial data.

## Recipes

Every recipe below assumes `FIELDS` and `opt` from [IDs](#ids) are defined in
the same shell.

### Add a card and set its fields

```sh
# Prints the item id (PVTI_…); capture it.
ITEM_ID=$(gh project item-add 43 --owner modelcontextprotocol --url <issue-url> \
  --format json --jq '.id') || ITEM_ID=
STATUS_OPT=$(opt Status "Todo")       # an issue you filed through the create flow is approved by definition
PRIORITY_OPT=$(opt Priority "Medium")

if [ -n "$ITEM_ID" ] && [ -n "$STATUS_OPT" ] && [ -n "$PRIORITY_OPT" ]; then
  # Chained: a failed Status edit stops before Priority, and the failure shows.
  gh project item-edit --project-id PVT_kwDOCt2Azc4BcZgq --id "$ITEM_ID" \
    --field-id PVTSSF_lADOCt2Azc4BcZgqzhXCpm0 --single-select-option-id "$STATUS_OPT" \
  && gh project item-edit --project-id PVT_kwDOCt2Azc4BcZgq --id "$ITEM_ID" \
    --field-id PVTSSF_lADOCt2Azc4BcZgqzhjiM9M --single-select-option-id "$PRIORITY_OPT" \
  || echo "item-edit FAILED — card $ITEM_ID may be half set; read it back" >&2
else
  echo "missing item or option id — nothing edited" >&2
fi
```

Each `item-edit` sets **one** field, so setting both takes two calls; there is
no combined form. `item-add` on an issue that already has a card returns the
existing card's id rather than adding a second one.

For an issue swept in at triage, the only difference is Status → **Incoming**
and that you do **not** set a milestone.

### Move an existing card

Look the item id up **from the issue** rather than re-adding it. An issue's
`projectItems` lists the cards it has on every board, so the lookup does not
depend on how many items the board holds (see [Finding a card without trusting
`--limit`](#finding-a-card-without-trusting---limit)). Select the card by the
board's **node id**, not its number: project numbers are per-owner, and an issue
can also sit on a user-owned project that happens to be numbered 43. Querying
through the repository also means the issue number cannot match another repo's
issue.

The mutation runs only on a non-empty id: `item-edit --id ""` fails with an
opaque node-resolution error rather than saying the card was not found. The
`|| ITEM_ID=` matters too: on a GraphQL error (a number that is a PR, not an
issue; a rate limit) `gh api` still prints the raw error JSON to stdout, which
would otherwise land in `ITEM_ID` as a non-empty "id". `first:100` is the
connection's maximum page; it counts the boards one issue is on, not the cards
on a board, so it has no board-size exposure.

```sh
N=<ISSUE_NUMBER>
ITEM_ID=$(gh api graphql -F n="$N" -f query='query($n:Int!){
  repository(owner:"modelcontextprotocol",name:"servers"){issue(number:$n){
    projectItems(first:100){nodes{id project{id}}}}}}' \
  --jq '.data.repository.issue.projectItems.nodes[]
        | select(.project.id=="PVT_kwDOCt2Azc4BcZgq") | .id') || ITEM_ID=
[ -n "$ITEM_ID" ] || echo "#$N has no card on #43 (or the lookup failed)" >&2
```

Then edit it. For example, Status → In Review, when its PR opens:

```sh
STATUS_OPT=$(opt Status "In Review")
if [ -n "$ITEM_ID" ] && [ -n "$STATUS_OPT" ]; then
  gh project item-edit --project-id PVT_kwDOCt2Azc4BcZgq --id "$ITEM_ID" \
    --field-id PVTSSF_lADOCt2Azc4BcZgqzhXCpm0 --single-select-option-id "$STATUS_OPT"
else
  echo "no ITEM_ID or option id — nothing edited" >&2
fi
```

Setting Priority is the same call with `opt Priority "<level>"` and the Priority
field id `PVTSSF_lADOCt2Azc4BcZgqzhjiM9M`.

### Read a card back

To confirm what a card holds, read it from the issue:

```sh
N=<ISSUE_NUMBER>
gh api graphql -F n="$N" -f query='query($n:Int!){
  repository(owner:"modelcontextprotocol",name:"servers"){issue(number:$n){
    projectItems(first:100){nodes{project{id number}
      fieldValues(first:20){nodes{... on ProjectV2ItemFieldSingleSelectValue{
        name field{... on ProjectV2SingleSelectField{name}}}}}}}}}}' \
  --jq '.data.repository.issue.projectItems.nodes[]
        | select(.project.id=="PVT_kwDOCt2Azc4BcZgq")
        | [.fieldValues.nodes[] | select(.field) | {(.field.name): .name}] | add'
```

### Delete a card

**`Done` means the work shipped.** An issue closed as duplicate / won't fix /
not planned / obsolete / superseded shipped nothing, so its card is **deleted**,
not parked in Done:

```sh
# ITEM_ID from the issue-side LOOKUP block in "Move an existing card" above —
# the lookup only, not the item-edit that follows it.
if [ -n "$ITEM_ID" ]; then
  gh project item-delete 43 --owner modelcontextprotocol --id "$ITEM_ID"
else
  echo "no ITEM_ID — nothing deleted" >&2
fi
```

Deleting the card removes it from the board only. **The issue itself is
untouched**: it keeps its labels and comments, and stays searchable and linkable
forever. Nothing is lost; the board simply stops claiming the work was
delivered. Done is read as the record of what a milestone actually delivered, so
a duplicate sitting there makes that record wrong in a way nobody can detect
later.

The close **reason** is the machine-readable form of the same distinction.
`gh issue close --reason` accepts only `completed` and `not planned`, so
**`duplicate` must be set through the API**:

```sh
gh api repos/modelcontextprotocol/servers/issues/<N> -X PATCH \
  -f state=closed -f state_reason=duplicate
```

(or "Mark as duplicate" in the web UI, which additionally records a
duplicate-of link).

## ⚠️ The option-deletion hazard

This section and its two subsections are copied verbatim from the MCP
Inspector's `board-ops`. Only the board number, the IDs, one cross-repo issue
reference and one link to a skill this repo does not have were changed, plus
two fixes to the recovery recipe from this repo's review: step 1 restores only
cards that held the deleted option, and step 3 stops on a failed edit. The
closing paragraph also no longer quotes the Inspector's option ids. The
incidents they describe happened on the Inspector's board; the mechanism is
GitHub's and applies to #43 unchanged. The option-id tables they mention are
the Inspector's; here, option ids are resolved by name (see [IDs](#ids)), so
there is no table to update, but any option id pasted into an issue, PR or
script is invalidated all the same.

**Never add, rename, or remove an option on a single-select board field (Status
or Priority) with the `updateProjectV2Field` GraphQL mutation unless you pass
every existing option's `id`.** That mutation does a **full replace** of the
option list: resending options by name/color/description without their `id`s
makes GitHub **delete all existing options and mint new ones**, which **orphans
that field's value on every card on the board** *and* invalidates every option
id in the tables above. This has happened once, on Status (~197 items
reconstructed by inference).

Safe alternatives, in order of preference:

1. **Add or rename an option in the GitHub web UI** (Project → the field's
   settings). This preserves the ids of untouched options.
   ⚠️ **Deleting is different, in the UI as much as in the API**: removing an
   option blanks that field's value on every card that held it, with no undo and
   no warning that says so.
2. If you must script it, first `gh api graphql` the current options **with their
   `id`s**, then call `updateProjectV2Field` echoing back every existing option
   **including its `id`**, appending only the new one.
   `ProjectV2SingleSelectFieldOptionInput.id` is an optional `String`, so a mixed
   list works. Verify afterward that no card lost its value — snapshot
   `gh project item-list … --format json --limit 2000` before and after, check
   each is complete the way the snapshot below does, and diff; don't just
   spot-check. Send those dumps to `$BOARD_TMP` too, for the reason above.

Both the `Incoming` Status option and the Urgent/High/Medium/Low Priority
options were added this way (modelcontextprotocol/inspector#1891), with the
before/after diff confirming all 264 cards kept their Status.

`gh project item-add` and `gh project item-edit` are always safe — they set a
card's value and never touch the field schema.

### Always snapshot before touching a field's options

One command, and it is the difference between a five-minute restore and
reconstructing statuses by inference:

⚠️ **Write it outside the repo.** The board is private, so a snapshot is a full
dump of item IDs and every card's Status and Priority. Left in the working tree
it is one `git add -A` away from being published in a PR (Copilot).

```sh
BOARD_TMP=$(mktemp -d)
gh project item-list 43 --owner modelcontextprotocol --format json --limit 2000 \
  > "$BOARD_TMP/board-snapshot.json"
# A truncated snapshot cannot restore the cards it dropped — refuse to proceed on one.
jq -e '(.items | length) == .totalCount' "$BOARD_TMP/board-snapshot.json" >/dev/null \
  && echo "snapshot: $BOARD_TMP/board-snapshot.json" \
  || { echo "SNAPSHOT INCOMPLETE — raise --limit and retake it before editing options" >&2
       rm -f "$BOARD_TMP/board-snapshot.json"; false; }
```

Note the printed path; you need it to recover.

### Recovering from a deleted option

This has happened twice — once via the API (~197 items, reconstructed by
inference) and once via the UI (the `Done` column, 247 items, restored from a
snapshot in minutes). With a snapshot the recovery is mechanical.

The recipe below is written for a deleted **Status** option. For a deleted
**Priority** option it is the same three steps with two substitutions: read
`.priority` instead of `.status` (`gh project item-list --format json` exposes
each single-select field under its lowercased name, so both keys are present),
and pass the Priority field id `PVTSSF_lADOCt2Azc4BcZgqzhjiM9M`.

```sh
# 0. Same temp dir the snapshot went to — keep every dump out of the worktree.
BOARD_TMP=${BOARD_TMP:-$(mktemp -d)}

# 1. Which cards lost their value? lost-ids.json holds ONLY the cards that are
#    blank now AND held the deleted option in the snapshot, and it is written
#    only when both dumps are complete. A card that was already blank, or that
#    someone cleared by hand, is listed and left alone. Step 3 refuses to run
#    without the file, so neither a truncated dump nor a missing snapshot can
#    turn into a silent no-op or an unconfirmed re-apply.
DELETED="<name of the deleted option>"   # e.g. Done
rm -f "$BOARD_TMP/lost-ids.json"
gh project item-list 43 --owner modelcontextprotocol --format json --limit 2000 \
  > "$BOARD_TMP/board-broken.json"
if ! jq -e '(.items | length) == .totalCount' "$BOARD_TMP/board-broken.json" >/dev/null; then
  echo "board-broken.json INCOMPLETE — raise --limit and re-run step 1" >&2
  rm -f "$BOARD_TMP/board-broken.json"
elif ! jq -e '(.items | length) == .totalCount' "$BOARD_TMP/board-snapshot.json" >/dev/null; then
  echo "no usable snapshot — cannot confirm what these cards held; not re-applying" >&2
else
  jq -n --slurpfile B "$BOARD_TMP/board-broken.json" \
        --slurpfile S "$BOARD_TMP/board-snapshot.json" --arg d "$DELETED" '
    ($S[0].items | map({key: .id, value: .status}) | from_entries) as $was
    | [$B[0].items[] | select(.status == null) | .id] as $blank
    | {lost:  [$blank[] | select($was[.] == $d)],
       other: [$blank[] | select($was[.] != $d) | {id: ., was: ($was[.] // "(none)")}]}' \
    > "$BOARD_TMP/blank.json" || rm -f "$BOARD_TMP/blank.json"
  if [ -s "$BOARD_TMP/blank.json" ]; then
    jq -r --arg d "$DELETED" '"to restore to \($d): \(.lost | length)",
      "blank but NOT restored: \(.other | length)", (.other[] | "  \(.id) was \(.was)")' \
      "$BOARD_TMP/blank.json"
    jq '.lost' "$BOARD_TMP/blank.json" > "$BOARD_TMP/lost-ids.json" \
      || rm -f "$BOARD_TMP/lost-ids.json"
  fi
fi

# 2. Recreate the option, echoing every surviving option's id (see above).
#    NOTE: the recreated option gets a NEW id — the deleted one never comes back.

# 3. Re-apply it to the orphaned cards.
if [ -s "$BOARD_TMP/lost-ids.json" ]; then
  for id in $(jq -r '.[]' "$BOARD_TMP/lost-ids.json"); do
    gh project item-edit --project-id PVT_kwDOCt2Azc4BcZgq --id "$id" \
      --field-id PVTSSF_lADOCt2Azc4BcZgqzhXCpm0 --single-select-option-id <NEW_OPTION_ID> \
      || { echo "item-edit failed on $id — stopping; re-run step 1 to see what is left" >&2; break; }
    sleep 0.4
  done
else
  echo "no lost-ids.json — step 1 did not complete; nothing re-applied" >&2
fi
```

Step 1's join is the safety check: only a card that held the deleted option in
the snapshot is re-applied, so you don't overwrite a card that was already blank
or that someone legitimately cleared in the meantime. Read its "NOT restored"
list before running step 3.

Because the recreated option carries a **new id**, every reference to the old
id must be updated in the same change — `grep` the old id across the repo. This
skill resolves option ids by name and so holds none, but a script, issue or PR
that pasted one does.

## ⚠️ Two different "Priority" fields

An issue page shows two fields named Priority, and they are unrelated. **Ours is
the one under _Projects → Servers V2_.**

| Where it appears | What it is | Ours? |
| --- | --- | --- |
| **Projects → Servers V2 → Priority** | The **project board** field on #43 (`PVTSSF_lADOCt2Azc4BcZgqzhjiM9M`) | ✅ Yes |
| **Fields → Priority** (above _Projects_) | A GitHub **issue field**, `IFSS_kgDOAdAWeg`, defined at the **org** level and shared by every repo in it | ❌ No |

Nothing syncs them, in either direction, and they will happily disagree.
**Never delete the org-level field**: it belongs to the whole org. Don't set it
either; a value there is a _reporter's_ opinion, not the board's Priority.
