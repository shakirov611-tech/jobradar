const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
 { ignores: ['**/node_modules/**', '.collector-state/**', '.browser-artifacts/**', '.test-artifacts/**', 'config/private/**'] },
 { files: ['**/*.cjs','src/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: {...globals.node} }, rules: {...js.configs.recommended.rules, 'no-unused-vars': ['error',{args:'none',caughtErrors:'none'}], 'no-empty':['error',{allowEmptyCatch:true}] } },
 { files: ['src/normalization/*.n8n.js'], languageOptions:{globals:{$input:'readonly',$:'readonly'}} },
 { files: ['src/applications/browser-dry-run.cjs'], languageOptions:{globals:{document:'readonly',HTMLFormElement:'readonly'}} },
 { files: ['src/reports/matching-review.cjs'], languageOptions:{globals:{document:'readonly',localStorage:'readonly'}} },
 { files: ['browser/tests/*.cjs'], languageOptions:{globals:{window:'readonly',document:'readonly'}} }
];
