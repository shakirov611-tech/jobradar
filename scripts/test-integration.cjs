const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {validateConfig,buildWorkflow}=require('./integration-workflow.cjs');
async function main() {
  const config=validateConfig(process.env),runId=randomBytes(12).toString('hex');
  const report={runId,startedAt:new Date().toISOString(),status:'failed',cleanup:'not-needed'};
  const dir=path.resolve(__dirname,'../.test-artifacts');fs.mkdirSync(dir,{recursive:true});
  let workflowId;
  async function request(url,method,body,api=true) {
    const res=await fetch(url,{method,redirect:'error',headers:{'Content-Type':'application/json',...(api?{'X-N8N-API-KEY':config.key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(api?20000:150000)});
    if(!res.ok)throw new Error(`${api?'n8n API':'Test webhook'} ${method}: HTTP ${res.status}`);
    if(res.status===204)return {};
    return res.json();
  }
  try {
    const created=await request(config.origin+'/api/v1/workflows','POST',buildWorkflow(config,runId));
    if(!created.id)throw new Error('Create returned no workflow ID');workflowId=created.id;
    await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId)+'/activate','POST');
    // No retries: an ambiguous response must not duplicate an execution.
    const result=await request(config.origin+'/webhook/jobradar-test-'+runId,'POST',{},false);
    if(result.ok!==true||result.runId!==runId)throw new Error('Missing test confirmation');
    report.status='passed';report.checks=result.checks;
  } catch(error) {report.error=error.message;} finally {
    if(workflowId) {
      try {
        await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId)+'/deactivate','POST');
        await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId),'DELETE');
        report.cleanup='completed';
      }catch(error){report.cleanup='failed';report.cleanupWorkflowId=workflowId;report.cleanupError=error.message;report.status='failed';}
    }
    report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(dir,runId+'.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='passed')process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
