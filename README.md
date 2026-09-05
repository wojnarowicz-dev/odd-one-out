# odd-one-out

For anyone working in a codebase whose rules nobody wrote down — your own from
two years ago, or somebody else's from last week. The habits are in the code;
they are just not in any document, and nothing tells you which of them were
deliberate.

odd-one-out reads those habits out of the repository and shows you the places
that break them: the one call site out of fifty that forgot to release the
player, the one migration that revokes permissions and never grants them back.
One principle: **N times this way, once differently.**

A thousand-line class in a project where every class is a thousand lines does
not deviate. Four `MediaPlayer` instances with `setOnError` and one without —
that deviates. The tool has no thresholds pulled from thin air; it compares code
to the rest of the same repository.

**It never changes files.** Every finding comes with a ready-made fix to paste.

*Polska wersja tego dokumentu: [README.pl.md](README.pl.md).*

## What one finding looks like

Every finding answers three questions, and the third one is the reason this tool
exists: it hands you the fix and does not apply it.

```
## [1] Button#setOnMouseEntered -> Button#setStyle   sup=45/49 conf=92% odd=4

   WHAT IS INCONSISTENT
     setStyle is not called here, although 45 of the 49 places that call
     setOnMouseEntered on the same receiver do call it. These 4 do not:
     SharedButtonEffects.java:52  recv=btn  in setupHoverEffects@38
      calls here: Button#setOnMouseEntered, Button#setOnMouseExited

   HOW IT IS DONE ELSEWHERE
     KeyMomentCategoryStyles.java:214  recv=targetButton  in applyPreviewToButton@211
      calls both: setOnMouseEntered and setStyle

   READY-MADE FIX (not applied)
     // SharedButtonEffects.java:52 — in setupHoverEffects@38, next to the call already there:
     + btn.setStyle(...);
     // check the arguments against the 45 places that do call it — the rule knows
     // the call is missing, not what to pass to it
```

**WHAT IS INCONSISTENT** names the population the verdict rests on — 45 of 49 —
so a wrong finding can be dismissed in seconds instead of investigated.
**HOW IT IS DONE ELSEWHERE** points at real lines that hold the pattern, because
"this deviates" is worth nothing without somewhere to compare it to.
**READY-MADE FIX** is a call you can paste, with the one thing the rule does not
know said out loud: it knows which call is missing and on what, not what to pass
to it. Nothing is ever written to a file — a tool that edits code needs tests
measuring whether it helped, and there are none.

## Install

```bash
git clone <repo> && cd odd-one-out
npm install
npm start                      # prints the help screen
```

Three ways to run it, all equivalent:

```bash
npx odd-one-out java ./src/main/java        # inside the clone, nothing to install
node bin/odd-one-out.mjs java ./src/main/java   # the same, without npx
npm i -g . && odd-one-out java ./src/main/java  # installs the command system-wide
```

The bare `odd-one-out` command exists only after the last one. `package.json`
declares `bin`, but a plain clone does not put anything on the PATH — the help
screen prints `npx odd-one-out ...` for exactly that reason.

**For Claude Code, install through the plugin marketplace**
(`.claude-plugin/marketplace.json` — `claude plugin marketplace add <repo>`, then
`claude plugin install odd-one-out`). **For every other agent, copy the `skills/`
directory**: `SKILL.md` is not a Claude Code-only format — Cursor, Codex and
Gemini CLI read the same directories. The engine is a plain npm package and runs
without any of them.

> **A note on names.** The measurements below come from the author's private
> repositories. Project and file names taken from them are replaced with
> neutral ones (`Screen.java`, `app.html`); line numbers, counts, positions
> and true/false verdicts are the measured ones, unchanged. Names that are
> already generic (`Loading.java`, `Menu.java`) are as they are.

## Use

```bash
odd-one-out java  <java-source-dir>     # call pairs on the same receiver
odd-one-out deps  <java-source-dir>     # shared layer vs direct use (Java + JS/TS)
odd-one-out sql   <migrations-dir>      # revoke without grant execute
odd-one-out js    <web-project-dir>     # a name the page does not know
odd-one-out pom   --pom <pom.xml> --tree <deptree.txt>
```

Start here:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # scan and save
odd-one-out rank .odd-one-out/java.json                          # read the ranked list
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # later: only what is NEW
```

`pom` needs `mvn -o -B dependency:tree > deptree.txt` beforehand.

### Message language

`--lang en` (default) or `--lang pl`. Every string lives in one file,
`src/lang.mjs` — a key and two translations; a detector calls `t('key', …)` and
does not know which language it is writing in. Spreading translations across
detectors ends with half the output stuck in one language, and only somebody who
does not speak it ever notices.

**Only labels and headings are translated.** Method names, type names, paths,
finding identifiers and rule names stay as they are — they are data, not prose.
Verified: the same snapshot rendered in both languages gives **identical
positions, scores and paths**; only the label text differs.

### Self-check

```bash
npm run self-check      # js and deps on the tool's own code; exit 1 on new deviations
```

**The tool passes its own test and reports nothing — which does not mean its
code is consistent: nine of its files read `process.argv` on their own and flag
parsing has five separate implementations, and odd-one-out does not see it,
because it measures bypassing an *existing* layer and here there is no layer at
all.**

That distinction is the point, not an excuse. `deps` answers "N places go
through X, K go directly". Five copies of flag parsing are a different defect:
**duplication without a layer**. `via = 0`, so the rule has nothing to compare
against — visible in the run as `wrapped ops=0`. Catching that needs a rule that
looks for repeated code rather than deviation from a convention; that is a
different tool.

## The js detector — JavaScript and TypeScript

One grammar (`tree-sitter-typescript`) for both languages: TypeScript is a
superset of JavaScript. Verified on the material — **40 `.js` and 10 `.ts` files,
zero parse errors**. Inline scripts are cut out of HTML with the line offset
preserved, so the numbers in the report point at the line in the HTML.

The `orphan` rule: a name called like a function **that the page does not know**.
A page knows its own definitions from its inline scripts, globals from the
`<script src>` files it loads, and browser/language built-ins. **This is not a
rule off a best-practice list** — the result depends on which files a given page
loads, so it cannot be stated without knowing the project.

| revision | pages | findings | true | accuracy |
|---|---|---|---|---|
| before the fix (`c45f7a6^`) | 88 | **1** | 1 | **100%** |
| current | 88 | 0 | — | negative control |

The orphan found is `closeAiReqLightbox` in `app.html:9464` —
exactly the line removed by commit `c45f7a6`.

The first run produced 5 findings, 4 of them false. The cause was in the script
extraction: the word `<script>` written **inside an HTML comment** was taken as
an opening tag and paired with a closing tag a hundred lines later, so CSS and
prose reached the parser as JavaScript. Comments are now blanked out before
`<script>` is searched for, with spaces instead of their body so the line
numbering does not drift.

## Muting

Without it, by the third run a person is scrolling past the same findings and
stops running the tool. Two routes, both active at once.

**A comment in the code** — the decision stands where it was made and travels
with the code through moves and merges:

```java
closeAiReqLightbox();   // odd-one-out: ok — deliberate, the function returns next release
```

It is looked for on the finding's own line and on the line above, so both forms
read naturally. The reason after the dash reaches the report, so it is possible
to review what was muted and why.

**An `.odd-one-out.json` file** — for bulk decisions, keyed by `unitId` (the
whole site) or `id` (a single rule); see
[Exclusions and mutes](#exclusions-and-mutes).

A mute **does not remove the site from the population** — it only disappears from
the report, so it does not weaken the rule that caught it.

## The diff between runs — the default

The question is not "what is wrong" but **"what is wrong since last time"**.
That is why the diff is the default behaviour rather than a separate command:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # 1st time: full list
# ...work on the code...
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # 2nd time: only what is new
odd-one-out java ./src/main/java --json .odd-one-out/java.json --all   # the full list
```

When the file named by `--json` already exists it is read as the previous run,
and the report shows **only new and changed** findings. The header carries the
full balance:

```
diff vs previous run: NEW=0  GONE=0  CHANGED=0  unchanged=12
```

`--all` restores the full list. The separate `odd-one-out diff <a> <b>` command
remains, for comparing any two saved runs.

## Exit code

`0` — no new deviations. `1` — there are new ones. This applies to every
detector, not only to `diff`, so it drops straight into CI:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json || echo "new deviations"
```

On the first run (no snapshot yet) every finding is new, so the code is `1`. On
the next run with unchanged code — `0`. A usage error (bad path, missing
argument) exits `2`.

### Diff details

The output is split into **NEW**, **GONE**, **CHANGED** (same site, different
strength of evidence — e.g. `sup: 8 -> 9, conf: 0.8 -> 0.9, viol: 2 -> 1`) and
unchanged.

**The fingerprint of a finding contains no line number.** That is the one
decision here that really matters: line numbers shift on every unrelated edit,
so if they entered the fingerprint, adding an import at the top of a file would
wipe out every old finding and re-issue it as new. The fingerprint rests on
semantic identity: detector + rule + file + anchor.

Measured: shifting a whole file by three lines and fixing one of two deviations
gave `GONE=1`, `unchanged=8` — not a single false "new" from the shifted lines.

Two things worth knowing:

- **Fixing one deviation can generate new ones.** In the demo, adding
  `setOnError` removed one finding and created three — because that site now has
  `setOnError` but no `setCycleCount`, `setOnHalted` or `setOnEndOfMedia`. Not a
  defect but a property of mining: a fix changes the population everything is
  compared against.
- **Moving a class to another package** changes the path, so the finding shows up
  as `NEW` + `GONE`. A deliberate trade-off — a fingerprint without the path
  would merge different sites together.

## Pairs of pure accessors — dropped, on by default

The mining does not know what a method does, so `getName` followed by
`getBirthDate` looked exactly like `stop` followed by `dispose`. Reading one
field and not the other is not a defect; failing to release a player is.

A rule is dropped only when BOTH sides are pure reads. `hasNext -> next` and
`getInputStream -> close` stay: a read paired with something that acts is
exactly the shape worth reporting.

This was invisible on the author's own project and obvious on somebody else's,
which is the reason the regression suite runs on three foreign codebases:

| project | before | after | removed |
|---|---|---|---|
| spring-petclinic (annotation-driven, mostly reads) | 7 | 2 | 71% |
| JSON-java (small, plain) | 31 | 17 | 45% |
| netty/common (low-level) | 100 | 79 | 21% |
| the author's project (full of state changes) | 462 | 387 | 16% |

Nothing real was lost. All five known answers still pass, the top four of the
ranking are unchanged, and the one entry that left the top five was
`MediaView#getFitHeight -> getFitWidth` inside a method called `zoomBaseH()` —
reading the height and not the width, in a method whose whole job is the
height. `--accessors keep` restores the old behaviour.

**A→B and B→A are both reported, and that is correct.** It looks like
duplication and is not: "has A but not B" and "has B but not A" describe
different places. Measured across all four projects, the number of sites
reported twice for the same pair is **zero** — in netty, `error -> info` flags
line 89 and `info -> error` flags line 79.
## The "setter next to setter" sieve — on by default

Mechanical co-occurrences of configuration calls used to occupy the first twelve
positions of the ranking: `setMinHeight -> setMinWidth`,
`initModality -> initOwner`, `setCycleCount -> play`. Their order and
completeness are accidental, and a missing one of them is not a bug.

Three signals, each switchable on its own (`--filter 1`, `--filter 1,3`,
`--filter none`):

1. **both sides are plain setters** — `set[A-Z]`, but **not** `setOn[A-Z]`;
2. **the receiver was created in this very unit** (`new X()` nearby);
3. **both sides set state** — recognised by the shape of the name
   (`set`/`init`/`put`/`with`), not by exclusion.

The boundary matters: `setOnError` begins with `set` but **attaches an event
handler** rather than setting a value, so it is not a setter for any of the
signals.

| signal | findings (discovery mode, the author's project) | position of `Loading.java:397` |
|---|---|---|
| none | 1086 | 88 of 99 |
| 1 | 645 | 56 |
| 2 | 708 | 70 |
| 3 | 628 | 55 |
| **1,2,3** | **462** | **47 of 99** |

On somebody else's code (netty/common, 204 files) the sieve removes **101 →
100** — practically nothing. That code has no mass setter configuration for
signals 1 and 3 to cut.

**No signal takes away a single known answer.**
`MediaPlayer#dispose -> MediaPlayer#setOnError`, `Loading.java:397`, `:411` and
`Menu.java:5753/5754` survive all three and their combination.

In narrowed mode (`--only setOnError`): **14 → 12 findings**; the ranking shrank
to 7 entries and all four known answers moved into the top five. The two removed
were `Menu.java:2690` and `Preview.java:498` — both judged false beforehand, both
caught by signal 2 (complete configuration of a freshly created `MediaPlayer`).

> **Signal 3 was wrong in its first version**, and the numbers above are the
> corrected ones. It used to define "sets state" by negation — "neither an event
> nor a lifecycle action" — which barely fired on the author's project (almost
> everything there was `setOn*`) and on foreign code covered everything else,
> including every pair of getters. On netty it removed the whole body of the
> report and left ten empty headers. An earlier version of this table claimed
> 161 findings and position 13 of 30; those numbers measured the broken signal.

## Discovering pairs — measured, the noise floods the result

The `java` detector **discovers pairs by itself by default**: for each receiver
type it collects every method called on it and counts every pair. `--only
<names>` is a narrowing filter, not a precondition.

| threshold | rules | findings | ranking entries | time |
|---|---|---|---|---|
| `--minsup 5` | 327 | **711** | 99 | 2.1 s |
| `--minsup 3` (default) | 615 | 1086 | — | 2.1 s |

**Cost is not the problem** — 2.1 seconds over 11,581 units. The worry about
tens of thousands of pairs did not materialise.

**Noise is the problem.** The first twelve ranking entries are entirely
mechanical co-occurrences of JavaFX setters. Verified hits `Loading.java:397` and
`:411` land at positions 73 and 74 of 99, and accuracy in the top ten is **0%**.

Thresholds were **not tuned** to this measurement. The conclusion is different:
pair discovery is good for **finding rule families** you did not know about (327
type-qualified pairs are material to review), not for reading findings. For
review, narrow with `--only`.

### The known pair disappears at threshold 5

`MediaPlayer#dispose -> MediaPlayer#setOnError` is **not** among the pairs
discovered at `--minsup 5` — its support is 3. It appears only at the default
`--minsup 3`, where it points at `Menu.java:5754` and `Loading.java:974`. Both
true findings in `Menu.java` disappear at threshold 5 as well.

In other words: a threshold of five occurrences, though it sounds more careful,
**costs one of the four known true findings**. The default stays 3.

## Receiver type and aliases

Two attempts to raise the accuracy of the `java` detector, both measured on the
same set (111 files, the `setOn*` rule, `lambda` scope):

| variant | findings | true | accuracy |
|---|---|---|---|
| baseline | 15 | 3 | 20% |
| **+ receiver type** | 14 | **4** | **29%** |
| + type + aliases | 14 | 3 | 21% |

**Receiver type — stays on** (`--types off` disables it). Without it
`mediaControl.setOnEndOfMedia()` (a project class, no-argument method) and
`mediaPlayer.setOnEndOfMedia(Runnable)` count as the same item. It removed
exactly those two false positives and promoted the true finding `Menu.java:5753`
from position 10 to 3.

Type resolution has two sources: declarations in the file, and an
**expression → type** map collected across the whole project (`MediaPlayer player
= mediaView.getMediaPlayer();` teaches what that expression is). The second
source is essential — without it, receivers that are method calls stay
unresolved and drop out of the population **together with the real deviations**.

**Aliases — measured, they make results worse, off by default** (`--aliases on`
enables). The idea is sound: `final MediaPlayer toDispose = player;` is the same
object. The fix removes exactly the false positive it was written for
(`Loading.java:974`), but attributing calls to the declaring unit also merges
unrelated calls and creates new rules on query methods
(`setOnError -> getStatus`). Balance: −1 false positive, +2 new ones.

## Pair scope

How close two calls must stand to count as a pair.
`--scope file|method|lambda` (default `lambda`).

| scope | unit | findings | true | accuracy |
|---|---|---|---|---|
| `file` | file + receiver | **9** | 2 | **22%** |
| `method` | method/constructor + receiver | 14 | 1 | 7% |
| `lambda` | innermost function + receiver | 15 | 2 (in 3 findings) | 20% |

Measured on 111 files with the `setOn*` rule. "True" means defects traced in the
code: the player never released in `Loading` (two sites) and `dispose()` without
clearing handlers in `Menu`.

**Narrowing the scope does not improve accuracy — widening it does.** False
positives of this class arise because the handling sits one level above the
call; a narrow scope cannot see it and reports an omission. Scope `file` finds
the same defects with **40% fewer findings**. Scope `method` is the worst of the
three: it loses `Menu.java:5754` entirely, because the rule
`dispose->setOnError` loses support under that split.

The default stayed `lambda` — 22% vs 20% on one project and one rule family is
too thin to change behaviour on. For review, `--scope file` is worth a run.

> This table predates the receiver-type work; it is a starting point, not the
> current state. The comparison between the three scopes still holds, because all
> three were measured on the same version.

## Pattern stability — a fourth score component, off by default

`odd-one-out rank … --stability`

A pattern present in **every** subset of the population is more trustworthy than
one that only emerges from the whole — the latter often means a rule glued
together from several independent habits in different parts of the project.

The population is split into four subsets **by file** (so a class is not spread
across subsets), and the rule is counted in each separately and cumulatively on
prefixes. `stab` is the mean of the two ratios.

**This is a check, not a change of population.** The rules are mined from the
whole set; the subsets only measure how evenly the pattern is spread. Splitting
the population the detector *works on* makes results worse — measured with scope
`method` (7%).

| entry | without `--stability` | with `--stability` | `stab` |
|---|---|---|---|
| `Screen.java:1496` (noise) | 1 | **1** | 1.00 |
| `Screen.java:9861` (noise) | 2 | **2** | 1.00 |
| `Menu.java:5753` (true) | 3 | **5** | 0.71 |
| `Loading.java:397` (verified) | 4 | **3** | 0.83 |
| `Loading.java:411` (verified) | 5 | **4** | 0.83 |

**The verified hits did move — up by one position.** But the move is not an
improvement: the promotion came from pushing **another true finding** down
(`Menu.java:5753`), while the two false positives at the top are immune —
their rules are perfectly stable (1.00). The number of true findings in the top
three and top five did not change at all.

That is why it stays off by default: movement in the ranking is not the same as
an improvement of the ranking.

## HTTP calls without a timeout — measured, the premise does not hold

A Python detector was planned with a rule that looks obvious: `requests.get`
without `timeout=` can hang forever, so if ten calls in a project pass a timeout
and one does not, that one is suspicious.

The premise was measured before the rule was written, on four real projects:

| project | HTTP calls | with a timeout |
|---|---|---|
| redash | 43 | **1** |
| prefect | 38 | **1** |
| certbot | 5 | 1 |
| sherlock | 4 | 4 |

In redash and prefect the convention is the **absence** of a timeout. A rule of
the form "ten do it, one does not" has nothing to attach to there — and read
literally it would report the single call that DOES pass a timeout as the odd
one out. In sherlock all four calls pass one and there is no deviation to find.

So the rule was not built. As a universal check ("every HTTP call must have a
timeout") it would be a perfectly good lint rule, and there are linters that do
it — but it is not a statement about the convention of THIS project, which is
the only kind of statement this tool makes.

## Postponed — and what each one is missing

Everything that is not built lives here, in one place, each with the specific
thing that would unblock it. None of these is a promise; two of them are ideas
and one is a gap in the measuring.

### The Python detector — built, measured, not shipped

The Java model was ported to Python: same units, same rule mining, same
thresholds. The receiver is the hard part — Python declares no types, so "the
same object" is recognised by the variable name inside one function, tagged from
its constructor (`sock = socket.socket(...)` tags `sock` as socket), from the
import list for module receivers, or from a `with ... as` clause. What that
loses is written down: an object arriving as a parameter, read from a field, or
unpacked from a subscript falls through to `?`, where Java would have had a
declaration to read.

**The detector works.** On seven real projects, at default thresholds, with
nothing tuned:

| project | .py files | units | rules that passed | violations |
|---|---|---|---|---|
| django | 2930 | 68 971 | 552 | 931 |
| prefect | 1819 | 54 341 | 336 | 596 |
| scrapy | 487 | 8 628 | 72 | 128 |
| celery | 423 | 13 526 | 71 | 139 |
| paramiko | 70 | 2 869 | 71 | 126 |
| urllib3 | 81 | 3 447 | 39 | 57 |
| certbot | 33 | 920 | 6 | 10 |

The rules read sensibly — `Signal#connect -> Signal#disconnect` in celery,
`ExecutionEngine#open_spider_async -> close_spider_async` in scrapy,
`HTTPConnection#request -> HTTPConnection#getresponse` in urllib3 at 19 of 22.
So the model has material in Python, and that was never the question.

**IT IS NOT SHIPPED, BECAUSE THERE IS NO KNOWN ANSWER.** Every detector here
earns its place by pointing at a defect somebody actually fixed, checked at the
revision before the fix (see `test/known-answers.mjs`). Python has none. Two
attempts to find one by hand failed for reasons worth recording: in docker-py the
one `requests.get` without a timeout was the ONLY HTTP call in the repository —
no population, so no convention to deviate from; in streamlink and urllib3 the
resource whose closing was added was never a receiver in the fixed function, so
the pair model had nothing to pair.

Then the search was inverted: instead of hunting a fix and asking whether the
tool sees it, run the tool on a 2022 revision and ask whether anything it
reported was later corrected.

| repository | violations in 2022 | later fixed | still violating | gone with the code | commits since |
|---|---|---|---|---|---|
| urllib3 | 37 | **0** | 20 | 15 | 656 |
| paramiko | 137 | **0** | 107 | 30 | 368 |
| docker-py | 86 | **0** | 86 | 0 | 245 |
| **total** | **260** | **0** | **213** | 45 | |

**213 of 260 violations survived three years and 1269 commits untouched.** That
is the honest measure of what this class of tool reports: mostly not defects.
PR-Miner's own 18.1% says the same thing in one number.

One footnote on method, because it nearly went the other way. The first run of
the check reported two urllib3 violations as fixed. They were not: the check
matched sites by (file, function name, receiver), and that file contains FOUR
functions named `socket_handler`, only one of which calls the missing method —
and it already called it in 2022. The commit that touched the area,
`d560e21d "Consume connections better in socket-level tests"`, is test
infrastructure, not a defect fix. A measuring instrument that agrees with the
hypothesis is the first thing to distrust.

### A seam detector — an idea, not a measurement

The same principle applied to testability. Not "inject your dependencies" —
that is a universal rule, and this tool does not make those. Rather: **fifteen
classes are handed their dependency from outside, this one builds its own.**

What it would look for, each one a seam missing where the rest of the project
has one:

- a constructor called directly inside a method, where elsewhere the object
  arrives from outside
- a static call where the rest of the code holds a field
- the clock or the file system reached from inside business logic
- a singleton read from within a function instead of being passed in

**What is missing is a known answer.** Every detector that ships here points at
a defect somebody actually fixed, checked at the revision before the fix. This
one has none, so it is a hypothesis and not a detector.

Python is the measurement of what that costs. The detector was written, it
passed thresholds on seven projects, and across three repositories with full
history it reported 260 violations of which **not one was ever corrected by
anybody**. Without a known answer there is no way to tell a detector that works
from one that merely produces output — and the output looks the same either way.

### Mutation testing beyond src/snapshot.mjs

`npm run full` runs Stryker. **Exactly one file has been measured:**
`src/snapshot.mjs` — 316 mutants, **216 survived**. That is a mutation score of
31.65% with all four suites judging, 23.42% with the golden tests alone. Every
other file under `src/` is unmeasured, so nothing at all is known about them.

**A suspicion, not a finding:** most of the survivors look like they sit in
printed text rather than in logic — `t('settings')` mutated to `t("")` passes,
because the golden tests compare the JSON snapshot and not the screen. That is
a reading of the survivor list, not a measurement. Nobody has classified them,
and until somebody does it stays a guess.

The reason it stops at one file is cost: that file took **118 minutes**. All of
`src/` would be most of a day, which is why mutation testing lives behind
`npm run full` and not in `npm test`.
## Age of a deviation — measured, did not help, off by default

`odd-one-out rank … --age <repo-dir>`

The signal: a deviation newer than the conforming lines is suspicious — the
oldest place is usually the original the rest deliberately moved away from. It
acts **only as a score boost** (×1.3); nothing is removed or lowered on its
basis.

| | without age | with age |
|---|---|---|
| `Loading.java:397` (verified) | 3 | **3** |
| `Loading.java:411` (verified) | 4 | **4** |
| `Screen.java:9861` (noise) | 2 | **1** |

**It did not move the true findings, and it promoted a false one.** The cause is
the `git blame` caveat in its extreme form: the repository has 235 commits, but
**all 1116 lines of `Loading.java` carry the date of the single commit that
imported the project**. Age then measures when the code entered git, not when it
was written.

`--age` therefore stays off. It has a chance of working in a repository with
continuous history; here it does not, and pretending otherwise would be worse
than leaving it off.

## Exclusions and mutes

Two **different** things, deliberately kept apart:

- **`exclude`** — what not to read. It affects the population, so it also changes
  the pattern: excluding tests can raise or lower conventionality.
- **`mute`** — what not to show. The site is read and **counts towards the
  population**; it only disappears from the report and the ranking.

Confusing the two corrupts results silently: a mute done as an exclusion removes
the site from the population and weakens the rule that caught it.

`.odd-one-out.json` in the scanned directory, or `--config <path>`:

```json
{
  "exclude": ["**/legacy/**", "**/*Generated.java"],
  "mute": [
    { "id": "f7946d7a0259", "reason": "setCycleCount is configuration, not error handling" }
  ]
}
```

The default exclusion list (`build`, `target`, `out`, `dist`, `node_modules`,
`.git`, `.idea`, `generated`, `coverage`, `*Test.java`, `*Tests.java`,
`*IT.java`) works with no configuration; `"excludeDefaults": false` replaces it
instead of adding to it. Identifiers for `mute` come from the snapshot file
(`--json`). Every finding has two: `id` (one rule) and `unitId` (the whole site).
**Mute by `unitId`** — one site often violates several rules at once, and muting
by `id` then needs several entries for one decision.

## Ranking — what to read first

Four detectors produce four lists on four scales. `rank` reduces them to one
number:

```bash
odd-one-out rank .odd-one-out/java.json .odd-one-out/sql.json --top 20
```

`score = 100 × conventionality × population × rarity` — **a product, not a
sum**: a finding should rank high only when all three components are high. A
strong convention over three examples means nothing, and neither does a large
population with half the sites deviating. A sum would let one high component
mask a zero one; a product does not.

The scale is ordinal. `94` does not mean "94% chance of a bug", it means "read
this before the finding scored 32".

The states `MIGRATION`, `TOO_LITTLE` and `TO_CHECK` do not enter the ranking at
all. Findings from the same site are merged into one entry — that is one
decision for a human — with the remaining violated rules listed beside it as
justification.

## How to read the output

```
## [2] setOnReady -> setOnError   sup=8/10 conf=80% odd=2
```

10 sites call `setOnReady`, 8 of them also call `setOnError`, 2 deviate.
**`odd=1` with a high `sup` is the strongest signal**; `odd` close to half of
`sup` means there is no convention.

Every finding has three sections: what is inconsistent, how it is done elsewhere
(with an example and a path), and a ready-made fix.

`Type#method` carries the receiver type; `?` means the type could not be
resolved.

### States that must not be mistaken for a finding

- **DIVERGENCE** — the layer is the convention, a few sites bypass it. The only
  state that is a finding.
- **MIGRATION** — both routes are common. There is nothing to call a deviation;
  this is an unfinished transition, not a bug to fix in one place.
- **TOO_LITTLE** — too few occurrences to speak of a convention.

The `pom` detector splits similarly: **DEAD** (absent from the tree and declared
nowhere — two independent witnesses) versus **TO_CHECK** (absent from the tree
but declared — usually a tree taken from the wrong revision).

An empty result is a correct result.

## Numbers, not adjectives

**Accuracy is measured over the first five and ten entries, not over the whole
list.** Whole-list accuracy is misleading because nobody reads the whole list;
what counts is how many true findings you see before you stop reading.

`odd-one-out java <src> --only setOnError` on the author's project, default
settings — the ranking has **7 entries** (12 findings merged by site):

| measure | result |
|---|---|
| true in the first **5** | **3 of 5 — 60%** |
| true in the first **10** | **3 of 7 — 43%** (the list ends at seven) |

| position | site | verdict |
|---|---|---|
| 1 | `Screen.java:1496` | false |
| 2 | `Screen.java:9861` | false |
| **3** | **`Menu.java:5753` + `:5754`** | **true** |
| **4** | **`Loading.java:397`** | **true (verified)** |
| **5** | **`Loading.java:411`** | **true (verified)** |
| 6 | `Screen.java:2121` | false |
| 7 | `Loading.java:974` | false |

**Two numbers, not one.** Accuracy alone flatters a tool; what costs you time is
the other half. Both are given here, over the same list:

| | first 5 | first 7 (the whole merged list) |
|---|---|---|
| true findings | 3 — **60%** | 3 — **43%** |
| **false alarms** | 2 — **40%** | 4 — **57%** |

In discovery mode, without `--only`, the same project gives 4 true of 14 —
**29% accuracy, 71% false alarms**.

For scale: commercial static analysers publish false positive rates from about
**1%** (SonarQube on the OWASP Benchmark; Veracode claims under 1.1% in
enterprise use) up to **36.3%** for Checkmarx in the 2024 Tolly Report. Those are
vendor and benchmark figures on synthetic security suites, so they do not compare
like for like with the numbers above — but they set the scale, and this tool is
on the wrong end of it. That is what "PR-Miner: 18.1%" means in practice, and
it is the honest price of looking for conventions instead of known bug patterns.


**All four known answers fall in the top five.** Above them stand exactly two
false positives — and that is not a coincidence but the known limitation
described below.

The other detectors, each on a pair with a known answer:

| detector | findings | true |
|---|---|---|
| `sql` | 1 | 1 — `release_rate_slot` |
| `pom` | 1 | 1 — `io.thorntail:javafx` |
| `js` | 1 | 1 — `closeAiReqLightbox` |
| `deps` | 0 (of 51 before filtering) | no grounds to report |

Reference accuracy for this class of tool — **PR-Miner (2005): 18.1%**.

A caveat about those 100%s: `sql`, `pom` and `js` are narrow single-rule
detectors on small, uniform sets. `java` mines 11,581 units, and there accuracy
sits near PR-Miner's. Noise is expected and is not a failure.

**These numbers were measured on the author's own project, about conventions the
author established.** That is the weakest part of the evidence and it is stated
here on purpose: a tool tuned on one repository will look better there than
anywhere else. The netty runs in this document exist for exactly that reason —
three of six first-contact defects were invisible on the author's code.

### Known limitation: handling one level above the call

Positions 1 and 2 (`Screen.java:1496` and `:9861`) are false for the
same reason: **the error handling sits one level above the call**.
`bindPlayButtonToPlayerStatus` binds a button's status and the error is handled
by whoever called it. A pair counted within the unit scope cannot see that and
reports an omission.

This is not an implementation defect but a boundary of the method. The same
class of false positive is named by Flutter linters for cleanup delegated to a
helper method: the rule sees that `dispose()` does not stand next to the
controller's creation, even though it stands in the method that `dispose()`
calls.

Widening to `--scope file` removes some of these, at the cost of weakening the
notion of a pair. Muting with `// odd-one-out: ok — handling lives in the caller`
settles one site permanently.

## The niche: where rule-based scanners are helpless

Error handling and the design of classes and methods are areas where **there is
no single correct way of doing it** — every project settles them differently.
That is exactly why rule-based scanners contribute little there: a tool vendor
cannot write a rule for something that looks different in every repository.

Within **one** project there is one way, and a deviation from it is visible. That
is the area where this algorithm has the most to say — and the reason it compares
code to the rest of the same repository rather than to thresholds from nowhere.

The other side of the problem: tools that generate review comments are ignored en
masse when they cannot justify a finding. The justification attached to every
finding (how many times the pattern occurs, where, and why this site stands out)
and the explicit split into `DIVERGENCE` / `MIGRATION` / `TOO_LITTLE` exist for
precisely that reason.

> This section deliberately carries no figures. Two that used to stand here — "a
> study of two thousand Java review comments" and "GitHub: 34% of AI review
> comments ignored" — could not be confirmed at the source and were removed. The
> only numbers in this document are the ones measured below, on a concrete
> repository, plus PR-Miner's 18.1% from the literature.

## Why it is built this way

**Why tree-sitter rather than regular expressions (Java).** The rule works on
pairs of calls on *the same receiver* inside *the same function*. A regex does
not know where a lambda ends or what the receiver is. tree-sitter parses this
project cleanly: 111 files, 3 with a local error — all on record patterns with a
qualified type name (`o instanceof R.Ok(String s)`), a gap in
`tree-sitter-java` 0.23.5. The error is local; the parser recovers at the next
statement.

**Why NOT tree-sitter for SQL.** `GRANT`/`REVOKE` is regular DDL. The only real
trap is dollar quoting — plpgsql bodies between `$$ … $$` full of semicolons, on
which a naive split falls apart. Twenty lines of tokenizer solve that exactly; a
separate grammar would be more risk than gain.

**Why `pom` requires Maven.** `dependencyManagement` only pins versions for
dependencies declared elsewhere. An entry nobody declares cannot be detected from
the file alone — the declaration may be transitive or live in a profile. Without
`dependency:tree` the tool would be guessing, so it requires the tree instead of
guessing.

**Why these thresholds.** `minsup 3` — below three occurrences there is no
population to compare against. `minconf 0.6` — below that, "convention" means
about as much as a coin toss. `maxodd 3` — when more sites deviate it is not a
deviation but an unfinished migration, and the tool names that separately. All
are flags; none is baked into the code.

**Why the tool does not apply fixes.** A tool that edits code needs tests that
measure whether the edit helped. Without them, showing the fix is useful from
day one and risks nothing.

**Why three disjoint states instead of one list.** `DIVERGENCE` is the only state
that is a finding. `MIGRATION` and `TOO_LITTLE` are reported separately because
presenting them as bugs is the fastest way to lose a user's trust.

## Limitations

- Java rules rest on **names**, not types resolved by a compiler — two different
  types with similarly named methods can end up in one rule.
- The same site can surface under several rules; duplicates have to be filtered.
- A missing call does not prove a bug — check whether it is done elsewhere.
- `pom` needs a tree from **the same revision** of `pom.xml` and the same profile
  set. `mvn -P X` disables `activeByDefault` profiles.
- **Sources outside UTF-8** are silently parsed into garbage (a Latin-2 file
  yields replacement characters and a nonsense AST, without a warning).
- **Memory**: `deps` keeps the source of every file in memory — 547 MB at 100k
  lines; the extrapolated ceiling is a few hundred thousand lines.
- **Two parallel runs writing one snapshot file**: the later writer wins,
  silently. There is no lock and the write is not atomic.
- Browser scripts communicating through `window` are outside the reach of `deps`,
  which is built on the import graph (in the author's web project none of the 85 `.js`
  files uses `import` or `require`).
- Not tested on an account whose name contains non-ASCII characters.
