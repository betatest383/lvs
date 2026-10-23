
require('tsx/cjs');
const { runAllTests } = require('./testSuite.ts');
const result = runAllTests();
const summary = result.summary;
console.log('===RESULT_JSON===');
console.log(JSON.stringify({
  label: 'testRun1',
  total: summary.total || result.results.length,
  passed: summary.passed,
  failed: summary.failed,
  failedIds: summary.failed_ids || [],
  canonicalCount: summary.canonical_count || result.results.filter(r => r.test_id.startsWith('AT-')).length,
  supplementalCount: summary.supplemental_count || result.results.filter(r => r.test_id.startsWith('SUP-')).length,
  missingCanonical: summary.missing_canonical || [],
  duplicateIds: summary.duplicate_ids !== undefined ? summary.duplicate_ids : result.results.map(r => r.test_id).filter((id, i, arr) => arr.indexOf(id) !== i),
  allResults: result.results.map(r => ({ id: r.test_id, pass: r.pass, actual: r.actual }))
}));
