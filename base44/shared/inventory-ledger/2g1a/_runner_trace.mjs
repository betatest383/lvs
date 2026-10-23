
require('tsx/cjs');
const { verifyTraceability } = require('./independentAudit/traceabilityRegistry.ts');
const result = verifyTraceability();
console.log('===TRACE_JSON===');
console.log(JSON.stringify(result));
