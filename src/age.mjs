// odd-one-out — age of a deviation.
//
// THE SIGNAL. A deviation NEWER than the lines that conform to the pattern is
// suspicious: the oldest place is usually the original that the rest of the
// code deliberately moved away from. A new place that does not follow the
// convention around it is more often an oversight than a decision.
//
// THE CAVEAT THAT DECIDES HOW THIS MAY BE USED. `git blame` shows the LAST
// HAND, not the author of the content. One formatting change, a file move, or a
// bulk reformat falsifies the age of an entire file and makes ten-year-old code
// look like yesterday's. That is why age acts ONLY as a boost in the ranking —
// never as grounds for filtering anything out. A finding without age data keeps
// its score unchanged.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { t } from './lang.mjs';

const cache = new Map();

/** Timestamp of the last change to that line (epoch seconds), or null. */
export function blameEpoch(repoDir, absFile, line) {
  const key = absFile + ':' + line;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const txt = execFileSync('git',
      ['blame', '-L', line + ',' + line, '--porcelain', '--', absFile],
      { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
    const m = txt.match(/^author-time (\d+)$/m);
    if (m) out = +m[1];
  } catch {
    out = null;   // untracked file, no git, or line out of range
  }
  cache.set(key, out);
  return out;
}

export function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
};

const day = ts => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—');

/**
 * Attaches age data to a finding. Returns { dev, med, newer, multiplier,
 * describe } — a multiplier of 1.0 means "no signal", never "worse".
 */
export function ageSignal(finding, root, repoDir, { boost = 1.3 } = {}) {
  const abs = path.resolve(root, finding.file);
  const dev = blameEpoch(repoDir, abs, finding.line);
  const pattern = (finding.meta && finding.meta.pattern) || [];
  const dates = pattern
    .map(w => blameEpoch(repoDir, path.resolve(root, w.file), w.line))
    .filter(Boolean);
  const med = median(dates);

  if (!dev || med === null) return { dev, med, newer: null, multiplier: 1, describe: t('ageNoData') };

  const newer = dev > med;
  return {
    dev, med, newer,
    multiplier: newer ? boost : 1,
    describe: t('ageDesc', day(dev), dates.length, day(med), newer ? t('ageNewer', boost) : t('ageNotNewer')),
  };
}

export { day };
