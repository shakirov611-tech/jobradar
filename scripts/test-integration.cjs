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
    if(!res.ok) {
      let detail={};try {detail=await res.json();}catch {}
      const error=new Error(`${api?'n8n API':'Test webhook'} ${method}: HTTP ${res.status}`);
      error.status=res.status;
      error.responseCode=detail.code;
      // Retain only a bounded message, never raw bodies or response headers.
      let message=typeof detail.message==='string'?detail.message:'';
      for(const value of [config.key,config.credential,config.spreadsheet,process.env.JR_PRODUCTION_SPREADSHEET_ID]) {
        if(value)message=message.split(value).join('[redacted]');
      }
      error.detail=message.slice(0,400);
      if(error.detail)error.message+=' — '+error.detail;
      throw error;
    }
    if(res.status===204)return {};
    return res.json();
  }
  try {
    const created=await request(config.origin+'/api/v1/workflows','POST',buildWorkflow(config,runId));
    if(!created.id)throw new Error('Create returned no workflow ID');workflowId=created.id;
    await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId)+'/activate','POST');
    // Publication may register webhooks asynchronously. Retry ONLY an explicit
    // n8n 'not registered' response: it confirms no workflow was started.
    // Never retry generic 404s, 5xx, timeout or a lost connection.
    const webhook=config.origin+'/webhook/jobradar-test-'+runId;
    let result;
    for(let attempt=0;attempt<21;attempt++) {
      try {result=await request(webhook,'POST',{},false);break;}
      catch(error) {
        const notRegistered=error.status===404 && Number(error.responseCode)===404 &&
          /requested webhook/i.test(error.detail||'') && /not registered/i.test(error.detail||'') &&
          (error.detail||'').includes('jobradar-test-'+runId);
        if(!notRegistered || attempt===20)throw error;
        report.registrationRetries=attempt+1;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }
    if(result.ok!==true||result.runId!==runId)throw new Error('Missing test confirmation');
    report.status='passed';report.checks=result.checks;
  } catch(error) {report.error=error.message;} finally {
    if(workflowId) {
      try {
        await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId)+'/deactivate','POST');
        // Unpublication may still be completing after /deactivate returns.
        // Retry 409 only for this run's own workflow; DELETE 404 means gone.
        for(let attempt=0;attempt<21;attempt++) {
          try {await request(config.origin+'/api/v1/workflows/'+encodeURIComponent(workflowId),'DELETE');break;}
          catch(error) {
            if(error.status===404)break;
            // The enclosing catch records cleanup failure; this throw never escapes finally.
            // eslint-disable-next-line no-unsafe-finally
            if(error.status!==409 || attempt===20)throw error;
            report.cleanupRetries=attempt+1;
            await new Promise(resolve=>setTimeout(resolve,500));
          }
        }
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
