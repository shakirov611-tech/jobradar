const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {prepare,submit}=require('../src/applications/controlled-adapter.cjs');
const {inspectForm,readForm}=require('../src/applications/greenhouse-form.cjs');
const pkg=()=>({vacancyId:'fixture_job_1',answers:{first_name:'Test',last_name:'Candidate',email:'candidate@example.test'},filename:'resume.txt',resume:Buffer.from('Synthetic resume. No real candidate data.')});
async function fixture(t,handler) {
 const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();});return 'http://127.0.0.1:'+server.address().port+'/fixture/apply';
}
async function fields(req) {
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 // Standards-based multipart decoder; asserts real HTTP upload rather than a mock fetch.
 const request=new Request('http://127.0.0.1/fixture/apply',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:Buffer.concat(chunks),duplex:'half'});
 return request.formData();
}
test('controlled HTTP form receives exact synthetic resume and confirms bound package',async t=>{
 const p=pkg(),attempt=prepare(p);let posts=0;
 const endpoint=await fixture(t,async(req,res)=>{
  posts++;const data=await fields(req);assert.equal(req.method,'POST');assert.equal(data.get('email'),p.answers.email);
  assert.equal(data.get('resume').name,'resume.txt');assert.equal(await data.get('resume').text(),p.resume.toString());
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accepted:true,receiptId:'fixture-receipt-1',packageHash:data.get('package_hash'),vacancyId:data.get('vacancy_id')}));
 });
 const result=await submit(attempt,{endpoint,approvedHash:attempt.packageHash});assert.equal(result.status,'submitted');
 assert.equal((await submit(attempt,{endpoint,approvedHash:attempt.packageHash})).status,'submitted');assert.equal(posts,1);
});
test('server records receipt then drops connection: unknown blocks repeat',async t=>{
 let accepted=0;const endpoint=await fixture(t,async(req)=>{await fields(req);accepted++;req.socket.destroy();});
 const attempt=prepare(pkg());assert.equal((await submit(attempt,{endpoint,approvedHash:attempt.packageHash})).status,'submission_unknown');
 await submit(attempt,{endpoint,approvedHash:attempt.packageHash});assert.equal(accepted,1);
});
test('timeout after receipt creates no blind retry',async t=>{
 let accepted=0;const endpoint=await fixture(t,async(req)=>{await fields(req);accepted++;});
 const attempt=prepare(pkg());const result=await submit(attempt,{endpoint,approvedHash:attempt.packageHash,timeoutMs:1000});
 assert.equal(result.status,'submission_unknown');assert.equal(accepted,1);await submit(attempt,{endpoint,approvedHash:attempt.packageHash});assert.equal(accepted,1);
});
test('HTTP success without matching explicit receipt is unknown',async()=>{
 for(const receipt of [{},{accepted:true,receiptId:'r',packageHash:'other',vacancyId:'fixture_job_1'}]){
  const a=prepare(pkg());const result=await submit(a,{endpoint:'http://127.0.0.1:12345/fixture/apply',approvedHash:a.packageHash,fetchImpl:async()=>({ok:true,json:async()=>receipt})});assert.equal(result.status,'submission_unknown');
 }
});
test('approval is invalidated by changed answers or resume; no POST occurs',async()=>{
 for(const change of [p=>{p.answers.first_name='Changed';},p=>{p.resume[0]=0;}]){
  const a=prepare(pkg());change(a.package);let called=false;
  const r=await submit(a,{endpoint:'http://127.0.0.1:12345/fixture/apply',approvedHash:a.packageHash,fetchImpl:async()=>{called=true;}});assert.equal(r.status,'required_action');assert.equal(called,false);
 }
});
test('CAPTCHA, unsupported forms, missing required data and non-synthetic email request action',()=>{
 assert.equal(prepare(pkg(),{captcha:true}).reason,'captcha');assert.equal(prepare(pkg(),{unsupported:true}).reason,'unsupported_form');
 for(const p of [{...pkg(),resume:Buffer.alloc(0)},{...pkg(),answers:{email:'real@domain.com'}},{...pkg(),answers:{...pkg().answers,visa:'unknown'}}])assert.equal(prepare(p).status,'required_action');
});
test('production endpoints, redirects and non-loopback targets cannot be configured',async()=>{
 for(const endpoint of ['https://boards-api.greenhouse.io/fixture/apply','http://localhost:12345/fixture/apply','http://127.0.0.1:12345/other','http://key@127.0.0.1:12345/fixture/apply'])await assert.rejects(submit(prepare(pkg()),{endpoint}),/JR_CONTROLLED_ENDPOINT_ONLY/);
});
test('Greenhouse requirements retain alternative resume inputs and separate API support',()=>{
 const r=inspectForm({questions:[{label:'Resume',required:true,fields:[{name:'resume',type:'input_file'},{name:'resume_text',type:'textarea'}]}],data_compliance:[{requires_consent:true}]});
 assert.equal(r.requirements[0].alternatives.length,2);assert.equal(r.requirements[0].required,true);assert.equal(r.apiSubmission.status,'unsupported');assert.equal(r.hostedForm.status,'required_action');assert.ok(r.unknowns.includes('data_compliance:manual_review'));
});
test('malformed/unknown question schema is never reported fully understood',()=>{
 assert.throws(()=>inspectForm({}),/JR_INVALID_APPLICATION_SCHEMA/);
 assert.ok(inspectForm({questions:[{required:true,fields:[{name:'location',type:'input_hidden'}]}]}).unknowns.length);
 assert.ok(inspectForm({questions:[{label:'broken'}]}).unknowns.length);
});
test('requirements reader uses fixed HTTPS GET only and refuses mismatched job ID',async()=>{
 let calls=0;const fake=async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(url,'https://boards-api.greenhouse.io/v1/boards/example/jobs/123?questions=true');return {ok:true,json:async()=>({id:123,questions:[]})};};
 assert.equal((await readForm('example','123',fake)).channel,'greenhouse');assert.equal(calls,1);
 await assert.rejects(readForm('../evil','123',fake));assert.equal(calls,1);
 await assert.rejects(readForm('example','123',async()=>({ok:true,json:async()=>({id:456,questions:[]})})),/JR_JOB_ID_MISMATCH/);
});
test('concurrent submits reserve the attempt before transport and send only once',async()=>{
 let release;const gate=new Promise(r=>{release=r;});const a=prepare(pkg());let posts=0;
 const opts={endpoint:'http://127.0.0.1:12345/fixture/apply',approvedHash:a.packageHash,fetchImpl:async()=>{posts++;await gate;return {ok:true,json:async()=>({accepted:true,receiptId:'fixture',packageHash:a.packageHash,vacancyId:a.package.vacancyId})};}};
 const first=submit(a,opts);assert.equal((await submit(a,opts)).status,'submitting');release();assert.equal((await first).status,'submitted');assert.equal(posts,1);
});
