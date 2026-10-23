
require('tsx/cjs');
const { runCompileChecks } = require('./compileCheck.ts');
const result = runCompileChecks();
console.log('===COMPILE_JSON===');
console.log(JSON.stringify(result));
