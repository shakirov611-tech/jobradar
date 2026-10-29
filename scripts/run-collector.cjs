const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {validateConfig}=require('./integration-workflow.cjs');
const {buildScheduledWorkflow}=require('./scheduled-workflow.cjs');
const STATE=path.resolve(__dirname,'../.collector-state');
async function run(env,{dir=STATE,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),test=false,prepareCollection,acceptResult}={}) {
  const config=validateConfig(env),runId=randomBytes(12).toString('hex');
  let body=buildScheduledWorkflow(env,runId,{test}),payload={};
  fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'running.lock');
  let fd;
  try {fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')return {status:'blocked',reason:'Previous collection is running or needs inspection',lock};throw e;}
  const report={runId,mode:test?'test':'production',startedAt:new Date().toISOString(),status:'failed',stage:'preflight',cleanup:'not-needed'};
  let workflowId,dispatched=false,confirmed=false,retain=false;
  const writeLock=()=>fs.writeFileSync(lock,JSON.stringify({runId,workflowId,startedAt:report.startedAt},null,2)+'\n');
  try {fs.writeFileSync(fd,JSON.stringify({runId,startedAt:report.startedAt}));}finally{fs.closeSync(fd);}
  async function request(route,method='GET',data,webhook=false) {
    const response=await fetchImpl(config.origin+route,{method,redirect:'error',headers:{'Content-Type':'application/json',...(!webhook?{'X-N8N-API-KEY':config.key}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(webhook?330000:20000)});
    if(!response.ok) {
      let detail={};try{detail=await response.json();}catch{}
      const error=new Error('HTTP '+response.status);error.status=response.status;
      // Use the response message only to identify an unregistered own webhook.
      error.unregistered=response.status===404 && Number(detail.code)===404 && typeof detail.message==='string' && /requested webhook/i.test(detail.message) && /not registered/i.test(detail.message) && detail.message.includes('jobradar-collect-'+runId);
      throw error;
    }
    if(response.status===204)return {};
    return response.json();
  }
  try {
    await request('/api/v1/workflows?limit=1');
    if(prepareCollection){report.stage='sources';({body,payload}=await prepareCollection(runId,report));}
    report.stage='create';
    const created=await request('/api/v1/workflows','POST',body);
    if(!created.id)throw new Error('Missing workflow ID');
    workflowId=created.id;report.workflowId=workflowId;writeLock();
    report.stage='activate';await request('/api/v1/workflows/'+encodeURIComponent(workflowId)+'/activate','POST');
    report.stage='collect';
    let result;
    for(let i=0;i<21;i++) {
      dispatched=true;
      try {result=await request('/webhook/jobradar-collect-'+runId,'POST',payload,true);break;}
      catch(e) {
        if(!e.unregistered)throw e;
        dispatched=false;
        if(i===20)throw e;
        report.registrationRetries=i+1;await sleep(500);
      }
    }
    if(result?.ok!==true || result.runId!==runId || !['total','matched','inserted','updated'].every(k=>Number.isSafeInteger(result[k])&&result[k]>=0) || result.inserted+result.updated!==result.matched || result.total<result.matched)throw new Error('Invalid completion summary');
    if(test && !acceptResult && (result.total!==1 || result.matched!==1 || result.inserted!==1 || result.updated!==0))throw new Error('Synthetic insert not confirmed');
    report.status='passed';report.counts={total:result.total,matched:result.matched,inserted:result.inserted,updated:result.updated};
    if(acceptResult)acceptResult(result,report);
    confirmed=true;
  }catch(e) {
    report.status='failed';if(!confirmed)delete report.counts;
    // No raw exception: a transport error can include URLs, tokens or payloads.
    report.error=e.status?'HTTP '+e.status:/^JR_[A-Z0-9_]+$/.test(e.message)?e.message:'Request or completion check failed';
    retain=dispatched&&!confirmed;
  }finally {
    if(workflowId) {
      try {
        await request('/api/v1/workflows/'+encodeURIComponent(workflowId)+'/deactivate','POST');
        if(retain)report.cleanup='retained-for-inspection';
        else {
          for(let i=0;i<21;i++) {
            try{await request('/api/v1/workflows/'+encodeURIComponent(workflowId),'DELETE');break;}
            // The enclosing catch records cleanup failure; this throw never escapes finally.
            // eslint-disable-next-line no-unsafe-finally
            catch(e){if(e.status===404)break;if(e.status!==409||i===20)throw e;await sleep(500);}
          }
          report.cleanup='completed';
        }
      }catch{report.cleanup='failed';report.status='failed';retain=true;}
      if(retain)report.inspectUrl=config.origin+'/workflow/'+encodeURIComponent(workflowId);
    }
    report.finishedAt=new Date().toISOString();report.lockRetained=retain;
    // Persist evidence before releasing the lock. If disk writes fail it remains.
    fs.writeFileSync(path.join(dir,runId+'.json'),JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(report,null,2)+'\n');
    if(confirmed&&!test&&!report.sourceResults?.some(s=>s.status==='failed'))fs.writeFileSync(path.join(dir,'last-success.json'),JSON.stringify(report,null,2)+'\n');
    if(!retain)fs.unlinkSync(lock);
  }
  return report;
}
function status(dir=STATE) {
  const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  return {latest:read('latest.json'),lastSuccessfulProduction:read('last-success.json'),lock:read('running.lock')};
}
if(require.main===module) {
  if(process.argv.includes('--status'))console.log(JSON.stringify(status(),null,2));
  else ((process.argv.includes('--legacy')||process.env.JR_COLLECTOR_MODE==='legacy')?run:require('./multi-collector.cjs').runMulti)(process.env,{test:process.argv.includes('--test')}).then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='passed')process.exitCode=1;}).catch(()=>{console.error('Collector could not start. Check .env.integration, config JSON files and local file permissions.');process.exitCode=1;});
}
module.exports={run,status,STATE};
