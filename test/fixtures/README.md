# Fixtures — a synthetic project with one planted deviation per detector

Everything here is written for the tests. It is not anyone's real code, it does
not compile into anything, and it is deliberately tiny — just large enough to
cross each detector's threshold for "this is a convention".

These files back `test/golden.mjs`. That suite runs after a bare clone, which
is the whole reason it does not use real repositories: the known-answer suite
(`test/known-answers.mjs`) measures five real defects and needs two private
checkouts, and it says SKIP with a reason when they are missing.

| fixture | convention | planted deviation | crosses |
|---|---|---|---|
| `java/` | `player.stop()` is followed by `player.dispose()` | `openFourth` stops and walks away | `minsup=3`: 3 units hold the pair, 1 breaks it (conf 75%) |
| `js/` | every name called on the page is defined on it | `resetPanelState()` is called and defined nowhere | 3 other names resolve, this one does not |
| `sql/` | `revoke ... on function` is paired with `grant execute` in the same migration | `20260104000000_release_slot.sql` revokes and never grants | `minconv=3`: 3 migrations hold the pair |
| `pom/` | entries in `<dependencyManagement>` are in the tree or declared in `<dependencies>` | `io.thorntail:javafx` is in neither | DEAD needs both witnesses: absent from `deptree.txt` AND undeclared |
| `deps/` | the file system is reached through `fixture.io.Fs` | `Direct1` and `Direct2` call `java.nio.file.Files` straight | `minvia=5`, `maxodd=3`: 5 classes via the layer, 2 around it |

Two details that are easy to get wrong when editing these:

* The `deps` layer method must be named `readAllLinesSafe`, not `readLines`.
  A wrapper is recognised by its name CONTAINING the wrapped operation's name,
  and `readlines` does not contain `readalllines`. The same rule is why the
  detector cannot see `parsecheck.mjs` in this repo — see the comment in
  `src/deps.mjs`.
* The `js` rule is `sierota` — a name CALLED but defined nowhere. It is not
  "defined but never called". A function nobody calls is invisible to it.

`golden.config.json` is here so the golden runs ignore ambient configuration.
The repository root carries its own `.odd-one-out.json` excluding `test/fixtures`
— without it `npm run self-check` reports the bait planted here as a real
divergence — and config is looked up in the current working directory, so
without the pinned `--config` that exclusion emptied every golden run.

If you change a fixture, `node test/golden.mjs` will fail and name the fields
that moved. Re-record with `--update` only after reading that diff.
