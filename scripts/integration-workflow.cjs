const fs = require('node:fs');
const path = require('node:path');
function validateConfig(env) {
  const base = new URL(env.N8N_BASE_URL || 'http://localhost:5678');
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Integration runner requires an HTTP loopback n8n origin');
  }
  for (const key of ['N8N_API_KEY','N8N_GOOGLE_CREDENTIAL_ID','JR_TEST_SPREADSHEET_ID','JR_PRODUCTION_SPREADSHEET_ID','JR_TEST_SHEET_NAME']) {
    if (!env[key] || env[key].includes('REPLACE_')) throw new Error('Configure '+key+' in .env.integration');
  }
  if (env.JR_TEST_SPREADSHEET_ID === env.JR_PRODUCTION_SPREADSHEET_ID) throw new Error('Test spreadsheet must differ from production');
  if (!/^JR_TEST_[A-Za-z0-9_-]+$/.test(env.JR_TEST_SHEET_NAME)) throw new Error('Test tab must start with JR_TEST_ and use ASCII letters, digits, _ or -');
  return {origin:base.origin, key:env.N8N_API_KEY, credential:env.N8N_GOOGLE_CREDENTIAL_ID, spreadsheet:env.JR_TEST_SPREADSHEET_ID, sheet:env.JR_TEST_SHEET_NAME};
}
function buildWorkflow(config, runId) {
  if (!/^[a-f0-9]{24}$/.test(runId)) throw new Error('Invalid run ID');
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root,'src/normalization/greenhouse-airbnb.n8n.js'),'utf8');
  const baseline = JSON.parse(fs.readFileSync(path.join(root,'workflows/greenhouse-to-sheets.validation-v0.3.json'),'utf8'));
  const template = baseline.nodes.find(n=>n.type==='n8n-nodes-base.googleSheets');
  const id = '9'+BigInt('0x'+runId).toString().slice(0,14);
  const vacancyId = 'greenhouse_airbnb_'+id;
  const fixture = {jobs:[{id, title:'Product Manager',company_name:'JobRadar TEST',absolute_url:'https://example.test/'+runId,content:'Synthetic fixture only',location:{name:'Test'}}]};
  const nodes=[], connections={};
  const add=(name,type,parameters,extra={})=>{
    if(nodes.length) connections[nodes.at(-1).name]={main:[[{node:name,type:'main',index:0}]]};
    nodes.push({id:runId+'-'+nodes.length,name,type,typeVersion:2,position:[nodes.length*240,0],parameters,...extra});
  };
  const code=(name,jsCode)=>add(name,'n8n-nodes-base.code',{jsCode});
  const sheet=(name,operation)=>{
    const parameters=structuredClone(template.parameters);
    parameters.documentId={__rl:true,mode:'id',value:config.spreadsheet};
    parameters.sheetName={__rl:true,mode:'name',value:config.sheet};
    parameters.operation=operation;
    if(operation==='read') {delete parameters.columns;parameters.options={};}
    add(name,template.type,parameters,{typeVersion:template.typeVersion,credentials:{googleSheetsOAuth2Api:{id:config.credential,name:'JobRadar integration credential'}},...(operation==='read'?{alwaysOutputData:true}:{})});
  };
  const normalize=(input)=>`const normalize = function($input) {\n${source}\n};\nreturn normalize({first:()=>({json:${JSON.stringify(input)}})});`;
  add('Start','n8n-nodes-base.webhook',{httpMethod:'POST',path:'jobradar-test-'+runId,responseMode:'lastNode',responseData:'firstEntryJson',options:{}},{webhookId:runId});
  sheet('Read test tab','read');
  code('Guard test tab',`for(const item of $input.all()) {const row=item.json;if(Object.keys(row).length && row.vacancy_id && (row.company!=='JobRadar TEST' || !String(row.original_url||'').startsWith('https://example.test/'))) throw new Error('Non-test rows found: refusing to write');} return [{json:{ok:true}}];`);
  code('Normalize first',normalize(fixture));
  code('Seed manual fields',`return $input.all().map(item=>({json:{...item.json,first_seen_at:'2026-01-01T00:00:00.000Z',notes:'KEEP-${runId}',review_status:'saved'}}));`);
  sheet('First upsert','appendOrUpdate');
  sheet('Read first result','read');
  code('Assert insert',`const rows=$input.all().map(x=>x.json).filter(x=>x.vacancy_id===${JSON.stringify(vacancyId)});if(rows.length!==1)throw new Error('Insert did not create exactly one row');return [{json:rows[0]}];`);
  fixture.jobs[0].title='Senior Product Manager';
  code('Normalize update',normalize(fixture));
  sheet('Repeated upsert','appendOrUpdate');
  sheet('Read final result','read');
  code('Assert result',`const rows=$input.all().map(x=>x.json).filter(x=>x.vacancy_id===${JSON.stringify(vacancyId)});
if(rows.length!==1)throw new Error('Duplicate or missing vacancy after rerun');
const row=rows[0], first=$('Assert insert').first().json;
if(row.title!=='Senior Product Manager')throw new Error('Machine field not updated');
if(row.notes!==${JSON.stringify('KEEP-'+runId)} || row.review_status!=='saved')throw new Error('Manual fields overwritten');
if(row.first_seen_at!==first.first_seen_at)throw new Error('first_seen_at overwritten');
if(!(Date.parse(row.last_seen_at)>Date.parse(first.last_seen_at)))throw new Error('last_seen_at did not advance');
return [{json:{ok:true,checks:['insert','dedup','update','manual-fields','existing-first-seen','last-seen'],runId:${JSON.stringify(runId)}}}];`);
  return {name:'JR TEST '+runId,nodes,connections,settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',executionTimeout:120}};
}
module.exports={validateConfig,buildWorkflow};
