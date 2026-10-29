const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildProductionWorkflow,deploy}=require('../scripts/deploy-collector.cjs');
const env={N8N_API_KEY:'secret',N8N_GOOGLE_CREDENTIAL_ID:'cred',JR_TEST_SPREADSHEET_ID:'test',JR_PRODUCTION_SPREADSHEET_ID:'production',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies'};
test('production configuration reaches both Sheets nodes; API payload is create-compatible',()=>{
 const w=buildProductionWorkflow(env);
 assert.equal(w.active,undefined);assert.equal(w.nodes.filter(n=>n.type.includes('webhook')).length,0);
 const nodes=w.nodes.filter(n=>n.type==='n8n-nodes-base.googleSheets');assert.equal(nodes.length,2);
 for(const n of nodes){assert.equal(n.parameters.documentId.value,'production');assert.equal(n.parameters.sheetName.value,'Vacancies');assert.equal(n.credentials.googleSheetsOAuth2Api.id,'cred');}
 assert.throws(()=>buildProductionWorkflow({...env,N8N_BASE_URL:'https://remote.test'}));
 assert.throws(()=>buildProductionWorkflow({...env,JR_PRODUCTION_SPREADSHEET_ID:'test'}));
});
test('setup creates once, reuses on rerun, and refuses changed configuration',async()=>{
 let saved,creates=0;
 const fetch=async(url,options)=>{
  if(options.method==='POST'){creates++;saved={...JSON.parse(options.body),id:'123'};return {ok:true,json:async()=>saved};}
  return {ok:true,json:async()=>url.includes('?')?{data:saved?[saved]:[]}:saved};
 };
 assert.equal((await deploy(env,fetch)).status,'created');
 assert.equal((await deploy(env,fetch)).status,'existing');assert.equal(creates,1);
 await assert.rejects(deploy({...env,JR_PRODUCTION_SHEET_NAME:'Other'},fetch));assert.equal(creates,1);
});
test('ambiguous POST failure is not retried',async()=>{
 let posts=0;await assert.rejects(deploy(env,async(url,o)=>{if(o.method==='POST'){posts++;throw new Error('timeout');}return {ok:true,json:async()=>({data:[]})};}));assert.equal(posts,1);
});
