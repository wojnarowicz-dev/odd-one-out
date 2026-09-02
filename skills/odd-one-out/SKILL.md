---
name: odd-one-out
description: Finds places that deviate from the convention of this project — "N times this way, once differently". Use it during code review, an audit, before a release, for questions like "does anything here stand out", "did I forget something", "check consistency", and when the user has just added code next to an existing family of similar places. Covers Java (call pairs, shared layers), pom.xml (dead dependencyManagement entries), SQL/Supabase migrations (revoke without grant execute) and JavaScript/TypeScript with HTML pages (a name called that the page does not know).
---

# odd-one-out

The tool looks for **deviations from this project's own convention**, not for
violations of universal rules. A thousand-line class in a project where every
class is a thousand lines does not deviate. Four `MediaPlayer` instances with
`setOnError` and one without — that deviates.

It never changes files. It returns a ready-made fix to paste.

## When to run it

- code review, an audit, a check before a release,
- "does anything here stand out", "did I forget something", "check consistency",
- the user has just written code next to a family of similar places,
- after adding an SQL migration that grants or revokes privileges,
- after changing `pom.xml`.

Do not run it to hunt for bugs in a single function without the rest of the
project — the tool needs a population to compare against.

## How to run it

The engine is a separate npm package. From the plugin directory, or after
`npm i -g odd-one-out`:

```bash
odd-one-out java  <java-source-dir>     # call pairs on the same receiver
odd-one-out deps  <java-source-dir>     # shared layer vs direct use
odd-one-out sql   <migrations-dir>      # revoke without grant execute
odd-one-out js    <web-project-dir>     # a name the page does not know
odd-one-out pom   --pom <pom.xml> --tree <deptree.txt>
```

If the package is not installed globally, call it through `node`:
`node <plugin-dir>/bin/odd-one-out.mjs java ./src/main/java`.

**Message language:** `--lang en` (default) or `--lang pl`. Match the language
you are speaking with the user. Positions, scores and paths are identical in
both; only the labels differ.

### `pom` needs preparation

`dependencyManagement` only pins versions for dependencies declared elsewhere —
the file alone cannot tell you whether an entry does anything. Take the tree
first, then run the detector:

```bash
mvn -o -B dependency:tree > deptree.txt
odd-one-out pom --pom pom.xml --tree deptree.txt
```

The tree must come from **the same revision of `pom.xml`** and the same profile
set. `mvn -P X` disables `activeByDefault` profiles — a tree taken with a
different profile list produces false findings. If Maven cannot be run, say so
plainly and skip `pom`; without the tree the tool would be guessing.

## The diff between runs — the default

**Always pass `--json <file>`.** When the file already exists, the detector shows
**only new and changed** findings by itself, and the header carries the balance.
`--all` gives the full list.

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json
```

Exit code: `0` = no new deviations, `1` = there are some, `2` = usage error.
This holds for every detector.

The separate `odd-one-out diff <a> <b>` command remains, for comparing any two
saved runs.

## Muting

When the user decides a finding is deliberate, **propose a comment in the code**
rather than a config file — the decision should stand where it was made:

```
// odd-one-out: ok — the error handling lives in the caller
```

It is looked for on the finding's line and on the line above; the reason after
the dash reaches the report. `.odd-one-out.json` (keyed by `unitId`) is for bulk
decisions. A mute does not remove the site from the population — it only
disappears from the report.

## The known limitation you must name

False positives of this class arise because **the handling sits one level above
the call** — a method that binds behaviour has its errors handled by the caller,
and a pair counted within the unit scope cannot see that. This is a boundary of
the method, not a defect; the same class is named by Flutter linters for cleanup
delegated to a helper method. Say so plainly instead of presenting such a finding
as noise.

## The setter sieve

On by default (`--filter none` disables it). It removes mechanical
co-occurrences of configuration calls that used to fill the top of the ranking
(`setMinHeight -> setMinWidth`, `initModality -> initOwner`). `setOnError` is
**not** treated as a setter — it attaches an event handler rather than setting a
value.

Measured: it takes away no known answer; in discovery mode the verified hits move
from position 88 to 47, and with `--only setOnError` all known answers fit in the
top five.

## Discovery versus narrowing

The `java` detector discovers pairs by itself — `--only <names>` is a filter, not
a precondition. Measured: without the filter, 327 rules and **711 findings**, and
the top of the ranking is entirely mechanical co-occurrences of JavaFX setters.
Verified hits land at positions 73–74 of 99. **Accuracy in the top ten: 0%.**

So: for **review**, always narrow with `--only` to the family the user cares
about. Show full discovery only when the question is "what conventions exist in
this code at all" — that is material to review, not a list of things to fix.

## Receiver type

On by default (`--types off` disables it): items carry the receiver type, so
`MediaControl#setOnEndOfMedia` does not mix with `MediaPlayer#setOnEndOfMedia`.
Measured: accuracy 20% → 29%.

`--aliases on` (off by default) merges calls on aliases of the same variable.
Measured: it makes results worse (29% → 21%) — it removes one false positive and
creates two new ones on query methods. Do not enable it without measuring.

## Pair scope

`--scope file|method|lambda` (default `lambda`) sets how close two calls must
stand to count as a pair.

Measured on 111 files: **narrowing the scope does NOT improve accuracy** — false
positives arise because the handling sits one level above the call, and a narrow
scope cannot see it. For review, suggest `--scope file`: the same defects with
about 40% fewer findings (9 instead of 15). Scope `method` is the worst of the
three — it loses findings, because it splits the population so that rules lose
support.

## Pattern stability

`--stability` on `rank` multiplies the score by how evenly the pattern is spread
across subsets of the population. **Off by default.**

Measured: the verified hits moved up by one position, but at the cost of pushing
another true finding down; the two false positives at the top have stability 1.00
and are immune. The number of true findings in the top three and top five did not
change. Movement in the ranking is not the same as an improvement of it.

## Age of a deviation

`--age <repo-dir>` on `rank` boosts deviations newer than the conforming lines.
**Off by default, and usually leave it there.**

Measured on the author's project: it did not move the true findings and it
promoted a false one. `git blame` shows the last hand, not the author of the
content — in a repository created by a single import commit every line carries
the same date and the signal carries no information. Enable it only where the
code grew inside git from the start, and never treat age as grounds for
rejecting a finding.

## Ranking

With several detectors at once, **do not show the user four lists** — merge
them: `odd-one-out rank .odd-one-out/java.json .odd-one-out/sql.json`.

The score is a product of conventionality, population and rarity; the scale is
ordinal, not a percentage — do not say "94% chance of a bug". Findings from the
same site are already merged into one entry, and states that are not findings do
not enter the ranking.

## How to read the output

```
## [2] setOnReady -> setOnError   sup=8/10 conf=80% odd=2
```

- `sup=8/10` — 10 sites call `setOnReady`, 8 of them also call `setOnError`.
- `conf=80%` — the strength of the convention.
- `odd=2` — how many sites deviate. **`odd=1` with a high `sup` is the strongest
  signal**; `odd` close to half of `sup` means there is no convention.
- `Type#method` — the receiver type; `?` means it could not be resolved.

Every finding has three sections: **WHAT IS INCONSISTENT**, **HOW IT IS DONE
ELSEWHERE** (with an example and a path), and **READY-MADE FIX**.

### States that must not be mistaken for a finding

- **DIVERGENCE** — the layer is the convention, a few sites bypass it. The only
  state that is a finding.
- **MIGRATION** — both routes are common. Nothing to call a deviation; this is an
  unfinished transition, not a bug to fix in one place.
- **TOO_LITTLE** — too few occurrences to speak of a convention.

The `pom` detector splits similarly: **DEAD** (absent from the tree and declared
nowhere — two independent witnesses) versus **TO_CHECK** (absent from the tree
but declared — usually a mismatched tree revision).

Never present `MIGRATION`, `TOO_LITTLE` or `TO_CHECK` as a bug. An empty result
is a correct result.

## What accuracy to expect

**Report accuracy over the first five and ten entries, not over the whole list.**
Whole-list accuracy is misleading — nobody reads the whole list. What counts is
how many true findings the person sees before they stop reading.

Measured on the author's project (`java --only setOnError`, a 7-entry ranking):
**3 true in the first 5 (60%)**, 3 in the first 10 (43%). All four known answers
fit in the top five; two false positives stand above them. The `sql`, `pom` and
`js` detectors scored 1/1 on pairs with a known answer.

Reference accuracy for this class of tool (PR-Miner, 2005) is **18.1%**. Noise is
expected and is not a failure. Note as well that these numbers come from the
author's own project, about conventions the author set — a tool tuned on one
repository looks better there than anywhere else.

Give the user numbers, not adjectives: how many findings, how many true, at which
position.

## Rules for working with the result

1. **Never apply fixes automatically.** The tool does not, and neither should you
   — until the user asks. A fix without a test that measures whether it helped is
   a risk, not a benefit.
2. **Verify the control flow before calling something a bug.** A missing call
   does not prove a defect — check whether it is done elsewhere (another method,
   try-with-resources, a different lifecycle hook).
3. **Filter duplicates.** The same site can surface under several rules.
4. **Mind the receiver.** A name-based rule can put two different types with
   similarly named methods into one rule.
