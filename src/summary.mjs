// odd-one-out — the four states a run can leave behind, in one shape.
//
// The same field, spelled the same way, in all four of these tools. A person
// reading the terminal can tell "three deviations" from "no migrations found".
// A build gets one number, and without this the two arrive identical.
//
//   actionable      somebody has to decide something. The only one that is
//                   allowed to make a build red.
//   explained       looked at, and a reason was recorded for setting it aside.
//   notApplicable   out of scope by construction — not skipped by accident.
//   unreachable     the run could not look. The state that must never be
//                   mistaken for a clean result.
//
// FIVE DETECTORS, AND THEY DO NOT ALL HAVE FOUR STATES. `sql` has all four
// because it already counted the reasons it sets things aside — a function
// fixed in a later migration is explained, a trigger function that never
// needs EXECUTE is not applicable. `java`, `js`, `pom` and `deps` have no such
// category: everything they look at is either reported or not a candidate at
// all, and nothing in between is counted.
//
// Those states are therefore 0, and they are 0 BECAUSE THE DETECTOR HAS NO
// SUCH CATEGORY, not because nothing fell into it. Writing a plausible number
// there would be the one thing this field exists to prevent — a count that
// looks measured and is invented. Where a detector grows the category, it
// passes the number; until then the zero is honest and this comment is why.

/**
 * @param parts every number named by the detector that owns it. Anything not
 *              passed is zero, and a zero here means "this detector does not
 *              count that", not "it counted and found none".
 */
export function summaryOf({
  actionable = 0,
  explained = 0,
  notApplicable = 0,
  parseErrors = 0,
  unreadable = 0,
  nothingRead = false,
} = {}) {
  // NOTHING READ AT ALL IS UNREACHABLE, and it is the case this field was
  // asked for. Every detector here has an early branch that says, in a careful
  // sentence, that there was nothing of its kind to read — and then exits 0,
  // telling a build the project is fine. Counted as one: the root is the thing
  // that could not be read.
  const couldNotBeRead = parseErrors + unreadable + (nothingRead ? 1 : 0);

  return {
    actionable,
    explained,
    notApplicable,
    unreachable: couldNotBeRead,
    // SPELLED OUT EVEN WHERE IT IS THE WHOLE OF IT. In said-vs-done the two
    // halves differ — a question the tool cannot answer is not a failure to
    // look — and the same key has to mean the same thing in every one of
    // these tools. Here everything unreachable really is a failure to read, so
    // the question half is zero, and a reader can see that rather than assume.
    unreachableIs: { aQuestionForAPerson: 0, couldNotBeRead },
  };
}

/**
 * The exit code a finished run deserves. Word for word the rule in
 * looks-clean and said-vs-done.
 *
 * DIFFERENTIAL BY DEFAULT, which this tool already was: `resultExit(newCount
 * ? 1 : 0)`. A project with two hundred known deviations is red every day
 * under a state gate, and a build that is red every day teaches people to
 * switch the tool off. `--fail-on-state` is there for the other contract.
 *
 * `2` MEANS THE ANSWER IS UNDERMINED: something could not be read AND nothing
 * was actionable. A run that did report something looked at something, and its
 * answer stands; the part it could not read is still counted in the field,
 * where a build that cares can test it on purpose.
 */
export function exitCodeFor(summary, { newActionable, failOnState = false }) {
  if (summary.unreachableIs.couldNotBeRead > 0 && summary.actionable === 0) return 2;
  if (failOnState) return summary.actionable > 0 ? 1 : 0;
  return newActionable > 0 ? 1 : 0;
}
