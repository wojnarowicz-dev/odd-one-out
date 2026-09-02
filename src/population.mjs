// odd-one-out — one judgement of "is there anything to compare against",
// shared by every detector.
//
// WHY. `deps` and `sql` had an explicit TOO LITTLE DATA state; `java` — the
// detector everyone reaches for first — had none at all. On a three-file
// project it printed `rules=0` and nothing else, indistinguishable from "your
// code is consistent". That is the worst possible first contact: the reader
// cannot tell whether the tool found nothing or had nothing to look at.
//
// ONE PLACE, NOT A THIRD COPY. The decision and the message live here; each
// detector only supplies its own count and its own threshold.
//
// THE THRESHOLD STAYS PER DETECTOR, and that is deliberate. It is tempting to
// unify the number as well, but these thresholds are load-bearing rather than
// cosmetic: `java` uses minsup 3, and the known answer
// `MediaPlayer#dispose -> setOnError` has support of exactly 3 — raising the
// threshold to 5 would delete it (measured). What is unified is the JUDGEMENT
// and the MESSAGE, not the value.
import { t } from './lang.mjs';

/**
 * @param count      occurrences actually found (frequent items, pairs, classes)
 * @param threshold  this detector's threshold
 * @returns null when the population is large enough, otherwise a ready message
 */
export function notEnoughData(count, threshold) {
  if (count >= threshold) return null;
  return t('tooLittleData', count, threshold) + '\n' + t('tooLittleDataHint', threshold);
}

/**
 * Zero files of the requested kind. `files=0` on a Python project used to look
 * exactly like a clean Java project — same output shape, same zero, same exit
 * code. The reader concluded "it found nothing" rather than "it does not read
 * this language".
 *
 * @param count  how many files were found
 * @param kind   what we were looking for, e.g. ".java"
 * @param root   the directory that was scanned
 * @returns null when something was found, otherwise a message listing the
 *          supported inputs
 */
export function noSourcesIn(count, kind, root) {
  if (count > 0) return null;
  return t('noSourcesFound', kind, root) + '\n' + t('noSourcesHint');
}
