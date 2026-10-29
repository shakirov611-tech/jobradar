const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig,buildWorkflow}=require('../scripts/integration-workflow.cjs');
const env={N8N_BASE_URL:'http://localhost:5678',N8N_API_KEY:'test',N8N_GOOGLE_CREDENTIAL_ID:'test',JR_PRODUCTION_SPREADSHEET_ID:'production',JR_TEST_SPREADSHEET_ID:'test-copy',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies'};
test('rejects remote URLs, credentials in URL and production sheet',()=>{
 for(const url of ['https://localhost:5678','http://example.com','http://user:pass@localhost:5678','http://localhost:5678/path','http://localhost:5678/?x=1'])assert.throws(()=>validateConfig({...env,N8N_BASE_URL:url}));
 assert.throws(()=>validateConfig({...env,JR_TEST_SPREADSHEET_ID:'production'}));
 assert.throws(()=>validateConfig({...env,JR_TEST_SHEET_NAME:'Vacancies'}));
 assert.throws(()=>validateConfig({...env,N8N_API_KEY:''}));
});
test('generated workflow uses synthetic data and only configured test resources',()=>{
 const w=buildWorkflow(validateConfig(env),'abcdef123456abcdef123456');
 assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest').length,0);
 const sheets=w.nodes.filter(n=>n.type==='n8n-nodes-base.googleSheets');
 assert.equal(sheets.length,5);
 for(const n of sheets){assert.equal(n.parameters.documentId.value,'test-copy');assert.equal(n.parameters.sheetName.value,'JR_TEST_Vacancies');assert.equal(n.credentials.googleSheetsOAuth2Api.id,'test');assert.ok(['read','appendOrUpdate'].includes(n.parameters.operation));}
 for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.code'))assert.doesNotThrow(()=>new Function('$input',n.parameters.jsCode));
});
