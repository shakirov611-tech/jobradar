// Mock n8n transport tests. These do not claim to execute n8n or Google Sheets.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');
const path=require('node:path');
async function scenario(failWebhook=false,failCleanup=false){
 const calls=[];
 const server=http.createServer(async(req,res)=>{
  calls.push(req.method+' '+req.url);let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/v1/workflows'&&req.method==='POST'){assert.ok(req.headers['x-n8n-api-key']);res.end(JSON.stringify({id:'test-only'}));}
  else if(req.url.startsWith('/webhook/')){
   if(failWebhook){res.statusCode=500;res.end('{}');}
   else res.end(JSON.stringify({ok:true,runId:req.url.split('jobradar-test-')[1],checks:['mock-only']}));
  }else if(req.method==='DELETE'&&failCleanup){res.statusCode=500;res.end('{}');}
  else res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/test-integration.cjs')],{env:{...process.env,N8N_BASE_URL:'http://127.0.0.1:'+server.address().port,N8N_API_KEY:'fake',N8N_GOOGLE_CREDENTIAL_ID:'fake',JR_PRODUCTION_SPREADSHEET_ID:'prod',JR_TEST_SPREADSHEET_ID:'fake-test',JR_TEST_SHEET_NAME:'JR_TEST_Fake'}});
   let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
  });
  return {...result,calls,report:JSON.parse(result.out)};
 }finally{await new Promise(r=>server.close(r));}
}
test('runner creates, activates, verifies, deactivates and deletes',async()=>{
 const r=await scenario();assert.equal(r.code,0);assert.equal(r.report.status,'passed');assert.equal(r.report.cleanup,'completed');assert.equal(r.calls.length,5);
});
test('webhook failure is not retried and cleanup still runs',async()=>{
 const r=await scenario(true);assert.equal(r.code,1);assert.equal(r.report.status,'failed');assert.equal(r.report.cleanup,'completed');assert.equal(r.calls.filter(x=>x.includes('/webhook/')).length,1);
});
test('cleanup failure makes the command fail and identifies leftover workflow',async()=>{
 const r=await scenario(false,true);assert.equal(r.code,1);assert.equal(r.report.cleanup,'failed');assert.equal(r.report.cleanupWorkflowId,'test-only');
});
