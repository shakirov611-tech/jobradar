const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {run,status}=require('../scripts/run-collector.cjs');
const {buildScheduledWorkflow}=require('../scripts/scheduled-workflow.cjs');
const env={N8N_API_KEY:'SECRET_KEY',N8N_GOOGLE_CREDENTIAL_ID:'CREDENTIAL',JR_TEST_SPREADSHEET_ID:'TEST_SHEET',JR_PRODUCTION_SPREADSHEET_ID:'PRODUCTION_SHEET',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies'};
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jr-collect-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function mock({outcome='success',cleanupConflict=false,gate}={}) {
 const calls=[];let body,webhookCalls=0,deletes=0;
 const fetchImpl=async(url,o)=>{
  calls.push({url,method:o.method,headers:o.headers});
  const response=(json,status=200)=>({status,ok:status<400,json:async()=>json});
  if(o.method==='GET')return response({data:[]});
  if(url.endsWith('/api/v1/workflows')&&o.method==='POST'){body=JSON.parse(o.body);return response({id:'own-workflow'});}
  if(url.includes('/webhook/')) {
   webhookCalls++;
   if(gate)await gate;
   if(outcome==='network')throw new Error('SECRET_KEY sensitive payload');
   if(outcome==='500')return response({message:'SECRET_KEY sensitive payload'},500);
   if(outcome==='generic404')return response({message:'missing'},404);
   if(outcome==='register'&&webhookCalls===1)return response({code:404,message:'The requested webhook "'+url.split('/').at(-1)+'" is not registered'},404);
   return response({ok:true,runId:outcome==='wrong-id'?'other':body.name.split(' ').at(-1),...(body.name.includes('TEST ')?{total:1,matched:1,inserted:1,updated:0}:{total:3,matched:2,inserted:1,updated:1})});
  }
  if(o.method==='DELETE'){deletes++;if(cleanupConflict&&deletes===1)return response({},409);}
  return response({});
 };
 return {fetchImpl,calls,get body(){return body;},get webhookCalls(){return webhookCalls;},get deletes(){return deletes;}};
}
test('successful collection persists counts and last success, releases lock and cleans own workflow',async t=>{
 const dir=temp(t),m=mock({cleanupConflict:true});const result=await run(env,{dir,fetchImpl:m.fetchImpl,sleep:async()=>{}});
 assert.equal(result.status,'passed');assert.equal(result.cleanup,'completed');assert.equal(m.deletes,2);
 assert.deepEqual(result.counts,{total:3,matched:2,inserted:1,updated:1});assert.equal(status(dir).lock,null);assert.equal(status(dir).lastSuccessfulProduction.runId,result.runId);
 assert.ok(m.calls.filter(c=>c.method==='DELETE').every(c=>c.url.endsWith('/own-workflow')));
 assert.ok(m.calls.filter(c=>c.url.includes('/webhook/')).every(c=>!Object.hasOwn(c.headers,'X-N8N-API-KEY')));
});
for(const outcome of ['network','500','generic404','wrong-id'])test(outcome+' retains lock and workflow; next invocation never calls API',async t=>{
 const dir=temp(t),m=mock({outcome});const options={dir,fetchImpl:m.fetchImpl,sleep:async()=>{}};
 const result=await run(env,options);assert.equal(result.status,'failed');assert.equal(result.lockRetained,true);assert.equal(result.cleanup,'retained-for-inspection');assert.equal(m.webhookCalls,1);assert.equal(m.deletes,0);
 assert.equal(status(dir).lastSuccessfulProduction,null);
 const n=m.calls.length;assert.equal((await run(env,options)).status,'blocked');assert.equal(m.calls.length,n);
 assert.equal(JSON.stringify(result).includes('SECRET_KEY'),false);
});
test('explicit unregistered own webhook retries then completes',async t=>{
 const dir=temp(t),m=mock({outcome:'register'});const r=await run(env,{dir,fetchImpl:m.fetchImpl,sleep:async()=>{}});assert.equal(r.status,'passed');assert.equal(m.webhookCalls,2);
});
test('two simultaneous invocations permit only one HTTP collection',async t=>{
 const dir=temp(t);let release,entered;
 const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const m=mock({gate});const fetchImpl=async(...args)=>{if(args[0].includes('/webhook/'))entered();return m.fetchImpl(...args);};
 const first=run(env,{dir,fetchImpl});await started;
 try{assert.equal((await run(env,{dir,fetchImpl})).status,'blocked');}finally{release();}
 assert.equal((await first).status,'passed');assert.equal(m.webhookCalls,1);
});
test('unavailable n8n before dispatch releases lock for the next scheduled attempt',async t=>{
 const dir=temp(t);const r=await run(env,{dir,fetchImpl:async()=>{throw new Error('offline');}});assert.equal(r.stage,'preflight');assert.equal(r.lockRetained,false);assert.equal(status(dir).lock,null);
});
test('test mode does not change last production success and uses no production Sheet or live feed',async t=>{
 const dir=temp(t),m=mock();await run(env,{dir,fetchImpl:m.fetchImpl,test:true});assert.equal(status(dir).lastSuccessfulProduction,null);
 assert.equal(JSON.stringify(m.body).includes('PRODUCTION_SHEET'),false);assert.equal(m.body.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'),false);
 assert.ok(m.body.nodes.find(n=>n.name==='Guard test sheet'));
});
function execute(code,globals){return vm.runInNewContext('(function(){'+code+'})()',globals);}
test('scheduled normalizer handles empty and filtered feeds explicitly; malformed feed still fails',()=>{
 const w=buildScheduledWorkflow(env,'a'.repeat(24));const code=w.nodes.find(n=>n.name==='Code in JavaScript').parameters.jsCode;
 for(const jobs of [[],[{id:1,title:'Chef'}]]){const out=execute(code,{$input:{first:()=>({json:{jobs}})}});assert.equal(out[0].json.empty,true);assert.equal(out[0].json.total,jobs.length);}
 assert.throws(()=>execute(code,{$input:{first:()=>({json:{jobs:null}})}}),/JR_INVALID_FEED/);
 const out=execute(code,{$input:{first:()=>({json:{jobs:[{id:1,title:'Product Manager'}]}})}});assert.equal(out[0].json.empty,false);assert.equal(out[0].json.rows[0].vacancy_id,'greenhouse_airbnb_1');
});
test('prepare stage reads rows from envelope and preserves insert-only first_seen semantics',()=>{
 const w=buildScheduledWorkflow(env,'a'.repeat(24)),code=w.nodes.find(n=>n.name==='Prepare vacancy upsert').parameters.jsCode;
 const rows=[{vacancy_id:'x',last_seen_at:'2026-10-29T12:00:00.000Z'}];
 const out=execute(code,{$:()=>({first:()=>({json:{rows}})}),$input:{all:()=>[{json:{}}]}});assert.equal(out[0].json.first_seen_at,rows[0].last_seen_at);
});
test('summary supports empty feed without accessing unexecuted preparation branch',()=>{
 const w=buildScheduledWorkflow(env,'a'.repeat(24)),code=w.nodes.find(n=>n.name==='Collection result').parameters.jsCode;
 const out=execute(code,{$:name=>{assert.equal(name,'Code in JavaScript');return {first:()=>({json:{empty:true,rows:[],total:0}})};}});assert.equal(out[0].json.ok,true);assert.equal(out[0].json.matched,0);
});
test('test fixture normalizes through the same source and test guard rejects non-test rows',()=>{
 const w=buildScheduledWorkflow(env,'a'.repeat(24),{test:true});
 const input=execute(w.nodes.find(n=>n.name==='HTTP Request').parameters.jsCode,{});
 const out=execute(w.nodes.find(n=>n.name==='Code in JavaScript').parameters.jsCode,{$input:{first:()=>input[0]}});
 assert.equal(out[0].json.rows[0].company,'JobRadar TEST');assert.ok(out[0].json.rows[0].original_url.startsWith('https://example.test/'));
 const guard=w.nodes.find(n=>n.name==='Guard test sheet').parameters.jsCode;
 assert.throws(()=>execute(guard,{$input:{all:()=>[{json:{vacancy_id:'real',company:'Real company'}}]}}),/Non-test/);
});
test('cleanup failure after confirmed collection retains lock and last successful collection evidence',async t=>{
 const dir=temp(t),m=mock();const fetchImpl=async(url,o)=>{if(url.endsWith('/deactivate'))return {ok:false,status:500,json:async()=>({})};return m.fetchImpl(url,o);};
 const r=await run(env,{dir,fetchImpl});assert.equal(r.status,'failed');assert.equal(r.cleanup,'failed');assert.equal(r.lockRetained,true);assert.equal(status(dir).lastSuccessfulProduction.runId,r.runId);
});
test('failed subsequent collection preserves previous last success',async t=>{
 const dir=temp(t),m=mock();const first=await run(env,{dir,fetchImpl:m.fetchImpl});
 const failure=mock({outcome:'500'});await run(env,{dir,fetchImpl:failure.fetchImpl});
 assert.equal(status(dir).lastSuccessfulProduction.runId,first.runId);assert.equal(status(dir).latest.status,'failed');
});
test('exhausted registration retries release lock because no execution started',async t=>{
 const dir=temp(t),m=mock();let attempts=0;
 const fetchImpl=async(url,o)=>{if(url.includes('/webhook/')){attempts++;return {ok:false,status:404,json:async()=>({code:404,message:'The requested webhook '+url.split('/').at(-1)+' is not registered'})};}return m.fetchImpl(url,o);};
 const r=await run(env,{dir,fetchImpl,sleep:async()=>{}});assert.equal(attempts,21);assert.equal(r.status,'failed');assert.equal(r.lockRetained,false);assert.equal(r.cleanup,'completed');assert.equal(status(dir).lock,null);
});
