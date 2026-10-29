const {buildProductionWorkflow}=require('./deploy-collector.cjs');
const {buildWorkflow}=require('./integration-workflow.cjs');
function buildScheduledWorkflow(env,runId,{test=false}={}) {
  if(!/^[a-f0-9]{24}$/.test(runId))throw new Error('Invalid run ID');
  const w=buildProductionWorkflow(env);
  w.name='JobRadar scheduled '+(test?'TEST ':'')+runId;
  const start=w.nodes.find(n=>n.type==='n8n-nodes-base.manualTrigger');
  Object.assign(start,{type:'n8n-nodes-base.webhook',typeVersion:2,webhookId:runId,parameters:{httpMethod:'POST',path:'jobradar-collect-'+runId,responseMode:'lastNode',responseData:'firstEntryJson',options:{}}});
  const http=w.nodes.find(n=>n.type==='n8n-nodes-base.httpRequest');
  http.parameters.options={...http.parameters.options,timeout:30000};
  // Only a read-only HTTP GET may retry; writes and whole collections never retry.
  http.retryOnFail=true;http.maxTries=3;http.waitBetweenTries=2000;
  const normalize=w.nodes.find(n=>n.name==='Code in JavaScript');
  const source=normalize.parameters.jsCode;
  normalize.parameters.jsCode=`const input=$input.first();\nconst normalize=function($input){\n${source}\n};\nconst rows=normalize({first:()=>input});\nreturn [{json:{total:input.json.jobs.length,rows:rows.map(x=>x.json),empty:rows.length===0}}];`;
  const write=w.nodes.find(n=>n.name==='Append or update row in sheet');
  const prep=w.nodes.find(n=>n.name==='Prepare vacancy upsert');
  prep.parameters.jsCode=prep.parameters.jsCode.replace(`$("Code in JavaScript").all().map(item => item.json)`,`$('Code in JavaScript').first().json.rows`);
  const summary={id:'summary',name:'Collection result',type:'n8n-nodes-base.code',typeVersion:2,position:[1800,0],parameters:{jsCode:`const feed=$('Code in JavaScript').first().json;\nconst prepared=feed.empty?[]:$('Prepare vacancy upsert').all().map(x=>x.json);\nconst inserted=prepared.filter(x=>Object.hasOwn(x,'first_seen_at')).length;\nreturn [{json:{ok:true,runId:${JSON.stringify(runId)},total:feed.total,matched:feed.rows.length,inserted,updated:prepared.length-inserted}}];`}};
  const branch={id:'empty-feed',name:'No matching vacancies?',type:'n8n-nodes-base.if',typeVersion:2.2,position:[700,0],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'is-empty',leftValue:'={{ $json.empty }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}};
  const read=w.nodes.find(n=>n.name==='Read existing vacancies');
  const edge=name=>[{node:name,type:'main',index:0}];
  w.connections[normalize.name]={main:[edge(branch.name)]};
  w.connections[branch.name]={main:[edge(summary.name),edge(read.name)]};
  w.connections[write.name]={main:[edge(summary.name)]};
  w.nodes.push(branch,summary);
  w.settings={...w.settings,executionTimeout:300,saveDataErrorExecution:'all',saveDataSuccessExecution:'all'};
  if(test) {
    const fixture=buildWorkflow({credential:env.N8N_GOOGLE_CREDENTIAL_ID,spreadsheet:env.JR_TEST_SPREADSHEET_ID,sheet:env.JR_TEST_SHEET_NAME},runId);
    // Exercise this exact scheduled pipeline against an isolated test sheet.
    // Fixtures come from the existing integration generator, never a live feed.
    const fixtureCode=fixture.nodes.find(n=>n.name==='Normalize first').parameters.jsCode;
    const literal=fixtureCode.match(/json:(\{"jobs":.*\})\}\)\}\);$/);
    if(!literal)throw new Error('Test fixture shape changed');
    Object.assign(http,{type:'n8n-nodes-base.code',typeVersion:2,parameters:{jsCode:'return [{json:'+literal[1]+'}];'},retryOnFail:false});
    for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.googleSheets')) {
      n.parameters.documentId.value=env.JR_TEST_SPREADSHEET_ID;
      n.parameters.sheetName.value=env.JR_TEST_SHEET_NAME;
    }
    const guard={id:'guard-test',name:'Guard test sheet',type:'n8n-nodes-base.code',typeVersion:2,position:[900,0],parameters:{jsCode:fixture.nodes.find(n=>n.name==='Guard test tab').parameters.jsCode}};
    w.nodes.push(guard);w.connections[read.name]={main:[edge(guard.name)]};w.connections[guard.name]={main:[edge(prep.name)]};
  }
  return w;
}
module.exports={buildScheduledWorkflow};
