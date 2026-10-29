// Optional Playwright is injected by the browser runner; collector has no browser dependency.
function validateTarget(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw new Error('JR_UNSUPPORTED_BROWSER_TARGET');
  const greenhouse=['boards.greenhouse.io','job-boards.greenhouse.io'].includes(url.hostname)&&/^\/[A-Za-z0-9_-]+\/jobs\/[1-9]\d*\/?$/.test(url.pathname);
  // Observed employer wrapper, intentionally one class of page rather than arbitrary URLs.
  const airbnb=url.hostname==='careers.airbnb.com'&&/^\/positions\/[1-9]\d*\/?$/.test(url.pathname);
  if(!greenhouse&&!airbnb)throw new Error('JR_UNSUPPORTED_BROWSER_TARGET');
  return url.href;
}
function requestAllowed(method,value,fixtureOrigin) {
  const url=new URL(value);
  if(fixtureOrigin) {
    if(url.origin!==fixtureOrigin)return false;
    return ['GET','HEAD'].includes(method)||(method==='POST'&&url.pathname==='/fixture/upload'&&!url.search);
  }
  if(!['GET','HEAD'].includes(method)||url.protocol!=='https:'||url.port||url.username||url.password)return false;
  return ['careers.airbnb.com','job-boards.greenhouse.io','boards.greenhouse.io','boards.cdn.greenhouse.io','job-boards.cdn.greenhouse.io'].includes(url.hostname);
}
async function createDryContext(browser,{fixtureOrigin}={}) {
  if(fixtureOrigin) {
    const url=new URL(fixtureOrigin);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.origin!==fixtureOrigin)throw new Error('JR_INVALID_FIXTURE_ORIGIN');
  }
  const blocked=[];
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',async route=>{
    const request=route.request();
    if(requestAllowed(request.method(),request.url(),fixtureOrigin))return route.continue();
    // No bodies, query strings, tokens or candidate data in diagnostics.
    blocked.push({method:request.method(),host:new URL(request.url()).hostname});
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{
    document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
    HTMLFormElement.prototype.submit=function(){};
    HTMLFormElement.prototype.requestSubmit=function(){};
  });
  return {context,blocked};
}
async function fillSyntheticForm(page) {
  let scope=page;
  const frame=page.locator('#grnhse_iframe');
  if(await frame.count()) {
    const src=await frame.getAttribute('src');
    let origin;try{origin=new URL(src,page.url()).origin;}catch{}
    const fixture=new URL(page.url()).hostname==='127.0.0.1';
    if(origin!=='https://job-boards.greenhouse.io' && !(fixture&&origin===new URL(page.url()).origin))return {status:'required_action',reason:'unrecognized_iframe'};
    scope=page.frameLocator('#grnhse_iframe');
  }
  if(await scope.locator('input[type=password]').count())return {status:'required_action',reason:'login_required'};
  // An interactive challenge is not solved or bypassed by this prototype.
  const challenge=scope.locator('iframe[title*="challenge" i], [data-testid="captcha-challenge"]');
  for(const item of await challenge.all())if(await item.isVisible())return {status:'required_action',reason:'captcha'};
  const fields=[['First Name','JobRadar'],['Last Name','Synthetic Test'],['Email','candidate@example.test']];
  for(const [label] of fields) {
    const input=scope.getByRole('textbox',{name:label,exact:true});
    if(await input.count()!==1||!await input.isVisible()||!await input.isEnabled())return {status:'required_action',reason:'standard_fields_not_unique_or_ready'};
  }
  const upload=scope.getByRole('group',{name:'Resume/CV*',exact:true}).locator('input[type=file]');
  if(await upload.count()!==1)return {status:'required_action',reason:'resume_control_not_unique'};
  for(const [label,value] of fields)await scope.getByRole('textbox',{name:label,exact:true}).fill(value);
  await upload.setInputFiles({name:'jobradar-synthetic-resume.txt',mimeType:'text/plain',buffer:Buffer.from('JobRadar synthetic browser test. No real candidate. Do not process as an application.')});
  const files=await upload.evaluate(input=>Array.from(input.files||[]).map(file=>({name:file.name,size:file.size})));
  const verified=[];
  for(const [label,value] of fields)verified.push(await scope.getByRole('textbox',{name:label,exact:true}).inputValue()===value);
  return {status:verified.every(Boolean)&&files.length===1?'dry_run_completed':'required_action',fieldsVerified:verified.filter(Boolean).length,fileSelected:files.length===1,remoteUploadConfirmed:false,submissionPerformed:false,requiresReview:['remaining_questions','consent','eligibility','upload_server_confirmation']};
}
module.exports={validateTarget,requestAllowed,createDryContext,fillSyntheticForm};
