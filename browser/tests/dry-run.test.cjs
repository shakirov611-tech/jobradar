const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {chromium}=require('playwright');
const {createDryContext,fillSyntheticForm}=require('../../src/applications/browser-dry-run.cjs');
async function fixture(t,{captcha=false,duplicate=false}={}) {
 let uploads=0,submissions=0,uploaded='';
 const form=`<!doctype html><html><body><form action="/fixture/apply" method="POST">
 ${captcha?'<div data-testid="captcha-challenge">Human verification required</div>':''}
 <label>First Name<input aria-label="First Name" name="first_name"></label>
 ${duplicate?'<input aria-label="First Name">':''}
 <label>Last Name<input aria-label="Last Name" name="last_name"></label>
 <label>Email<input aria-label="Email" name="email"></label>
 <fieldset><legend>Resume/CV*</legend><input type="file" id="resume" name="resume"></fieldset>
 <label>Work authorization<select required><option value="">Select</option><option>Yes</option></select></label>
 <button type="submit">Submit application</button></form><output id="upload-status"></output>
 <script>document.querySelector('#resume').addEventListener('change',async event=>{const data=new FormData();data.set('resume',event.target.files[0]);try{const response=await fetch('/fixture/upload',{method:'POST',body:data});if(response.ok)document.querySelector('#upload-status').textContent='fixture-upload-confirmed';}catch{}});</script></body></html>`;
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<iframe id="grnhse_iframe" src="/form"></iframe>');return;}
  if(req.url==='/form'){res.setHeader('Content-Type','text/html');res.end(form);return;}
  if(req.method==='POST'&&req.url==='/fixture/upload'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const data=await new Request('http://127.0.0.1/fixture/upload',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:Buffer.concat(chunks),duplex:'half'}).formData();uploaded=await data.get('resume').text();uploads++;res.end('{}');return;
  }
  if(req.url==='/fixture/apply'){submissions++;res.end('{}');return;}
  res.statusCode=404;res.end();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();});
 return {origin:'http://127.0.0.1:'+server.address().port,get uploads(){return uploads;},get submissions(){return submissions;},get uploaded(){return uploaded;}};
}
async function browser(t){const b=await chromium.launch({headless:true});t.after(()=>b.close());return b;}
test('browser fills iframe form and fixture receives upload, but submission remains blocked',async t=>{
 const f=await fixture(t),b=await browser(t),{context,blocked}=await createDryContext(b,{fixtureOrigin:f.origin});
 const page=await context.newPage();await page.goto(f.origin);await page.frameLocator('#grnhse_iframe').getByRole('textbox',{name:'First Name',exact:true}).waitFor();
 const result=await fillSyntheticForm(page);assert.equal(result.status,'dry_run_completed');assert.equal(result.fileSelected,true);assert.equal(result.fieldsVerified,3);assert.equal(result.submissionPerformed,false);
 const scope=page.frameLocator('#grnhse_iframe');await scope.locator('#upload-status').filter({hasText:'fixture-upload-confirmed'}).waitFor();
 assert.equal(f.uploads,1);assert.ok(f.uploaded.startsWith('JobRadar synthetic browser test.'));
 await scope.getByRole('button',{name:'Submit application'}).click();assert.equal(f.submissions,0);
 const frame=page.frames().find(x=>x.url().endsWith('/form'));
 await frame.evaluate(async()=>{try{await fetch('/fixture/apply',{method:'POST',body:'blocked'});}catch{}});
 assert.equal(f.submissions,0);assert.ok(blocked.some(x=>x.method==='POST'));
 assert.equal(await scope.getByRole('combobox').inputValue(),'');
 await context.close();
});
for(const [name,options,reason] of [['CAPTCHA',{captcha:true},'captcha'],['ambiguous input',{duplicate:true},'standard_fields_not_unique_or_ready']])test(name+' returns required_action without upload',async t=>{
 const f=await fixture(t,options),b=await browser(t),{context}=await createDryContext(b,{fixtureOrigin:f.origin});const page=await context.newPage();await page.goto(f.origin);
 await page.frameLocator('#grnhse_iframe').getByRole('group',{name:'Resume/CV*',exact:true}).waitFor();
 const result=await fillSyntheticForm(page);assert.equal(result.status,'required_action');assert.equal(result.reason,reason);assert.equal(f.uploads,0);assert.equal(f.submissions,0);await context.close();
});
test('live policy blocks POST upload before it reaches even a local receiver',async t=>{
 const f=await fixture(t),b=await browser(t),{context,blocked}=await createDryContext(b);
 const page=await context.newPage();await page.goto('about:blank');
 await page.evaluate(async origin=>{try{await fetch(origin+'/fixture/upload',{method:'POST',body:'never delivered',mode:'no-cors'});}catch{}},f.origin);
 assert.equal(f.uploads,0);assert.ok(blocked.some(x=>x.method==='POST'));await context.close();
});
