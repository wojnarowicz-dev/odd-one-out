// odd-one-out — what this build reads, stated once.
//
// WHY THIS FILE EXISTS. The set of things this tool understands was written out
// by hand in three places that a stranger reads before running anything: the
// package description on npm, the keywords npm searches, and the help. They
// disagreed. The description said "Java, pom.xml, SQL migrations,
// JavaScript/TypeScript"; the keywords named Java and nothing else, so a search
// for `typescript` or `supabase` could not find a tool that reads both.
//
// That is the defect this tool reports in other people's projects: N places
// say one thing, one place says another. Committing it in the two sentences
// npm shows to someone who has never heard of the project is the worst place
// to commit it, because those two sentences are the whole first impression.
//
// SO THIS IS THE FACT. test/lang-check.mjs checks the description and the
// keywords against this list, and checks this list against the detectors that
// actually exist in bin/odd-one-out.mjs. Adding a detector without adding it
// here turns the suite red.
//
// NOT EVERY KEYWORD IS A ROW. `migrations` and `static-analysis` describe where
// the tool is pointed and what kind of tool it is, not something it reads. A
// row here is a language or an ecosystem — the answer to "does it understand
// my code", which is the question a stranger is actually asking.

/**
 * One row per language or ecosystem this build reads.
 * `name` is what a person reads in the description; `keyword` is what npm
 * searches for; `detectors` are the commands that make the claim true.
 */
export const SCOPE = [
  { name: 'Java',       keyword: 'java',       detectors: ['java', 'deps'] },
  { name: 'JavaScript', keyword: 'javascript', detectors: ['js'] },
  { name: 'TypeScript', keyword: 'typescript', detectors: ['js'] },
  { name: 'SQL',        keyword: 'sql',        detectors: ['sql'] },
  { name: 'Supabase',   keyword: 'supabase',   detectors: ['sql'] },
  { name: 'Maven',      keyword: 'maven',      detectors: ['pom'] },
];

/** Every detector claimed by some row. Built, so it cannot disagree with the list. */
export const CLAIMED_DETECTORS = [...new Set(SCOPE.flatMap(r => r.detectors))].sort();
