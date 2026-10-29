const {validateConfig}=require('./integration-workflow.cjs');
const template=require('../workflows/greenhouse-to-sheets.first-seen-v0.4.json');
const NAME='JobRadar — Vacancy Collector v0.4 [managed]';
function buildProductionWorkflow(env) {
  const config=validateConfig(env);
  const sheet=env.JR_PRODUCTION_SHEET_NAME||'Vacancies';
  if(sheet.startsWith('JR_TEST_'))throw new Error('Production tab cannot use JR_TEST_ prefix');
  const w=structuredClone(template);
  w.name=NAME;
  for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.googleSheets')) {
    n.parameters.documentId={__rl:true,mode:'id',value:env.JR_PRODUCTION_SPREADSHEET_ID};
    n.parameters.sheetName={__rl:true,mode:'name',value:sheet};
    n.credentials={googleSheetsOAuth2Api:{id:config.credential,name:'JobRadar Google Sheets'}};
  }
  return {name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings};
}
async function deploy(env,fetchImpl=fetch) {
  const config=validateConfig(env),body=buildProductionWorkflow(env);
  async function request(route,method='GET',data) {
    const res=await fetchImpl(config.origin+'/api/v1/workflows'+route,{
      method,redirect:'error',headers:{'Content-Type':'application/json','X-N8N-API-KEY':config.key},
      body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(20000)
    });
    if(!res.ok)throw new Error(`n8n API ${method}: HTTP ${res.status}`);
    return res.json();
  }
  const matches=[];let cursor;
  do {
    const page=await request('?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
    if(!Array.isArray(page.data))throw new Error('Invalid workflow list');
    matches.push(...page.data.filter(w=>w.name===NAME));cursor=page.nextCursor;
  }while(cursor);
  if(matches.length>1)throw new Error('Multiple managed collectors found; resolve duplicates in n8n');
  let workflow;
  if(matches.length) {
    workflow=await request('/'+encodeURIComponent(matches[0].id));
    // Refuse silent reuse after local settings or the managed workflow changed.
    for(const field of ['name','nodes','connections','settings']) {
      if(JSON.stringify(workflow[field])!==JSON.stringify(body[field]))throw new Error('Managed workflow differs from template/configuration; inspect it in n8n before proceeding');
    }
  }else {
    // Never retry POST automatically: an ambiguous timeout may have created it.
    workflow=await request('','POST',body);
  }
  if(!workflow.id)throw new Error('Missing workflow ID');
  return {status:matches.length?'existing':'created',url:config.origin+'/workflow/'+encodeURIComponent(workflow.id),next:'Open URL and Execute; keep only one collector running at a time'};
}
if(require.main===module)deploy(process.env).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{
  console.error('Collector setup failed. Check local n8n, API permissions and configuration. If a request timed out, inspect the managed workflow in n8n before retrying.');process.exitCode=1;
});
module.exports={buildProductionWorkflow,deploy};
