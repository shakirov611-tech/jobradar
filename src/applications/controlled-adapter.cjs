// Technical spike ONLY: a controlled loopback HTTP form, no employer endpoints.
// In-memory attempt state is intentionally not used for production submissions.
const {createHash}=require('node:crypto');
function fingerprint(pkg) {
  return createHash('sha256').update(JSON.stringify({vacancyId:pkg.vacancyId,answers:pkg.answers,filename:pkg.filename,resumeHash:createHash('sha256').update(pkg.resume).digest('hex')})).digest('hex');
}
function prepare(pkg,{captcha=false,unsupported=false}={}) {
  if(captcha||unsupported)return {status:'required_action',reason:captcha?'captcha':'unsupported_form'};
  if(!pkg || !Buffer.isBuffer(pkg.resume)||!pkg.resume.length||pkg.resume.length>1024*1024 || pkg.filename!=='resume.txt' || typeof pkg.vacancyId!=='string' || !pkg.vacancyId || !pkg.answers || ['first_name','last_name','email'].some(k=>typeof pkg.answers[k]!=='string'||!pkg.answers[k].trim()) || !pkg.answers.email.endsWith('@example.test'))return {status:'required_action',reason:'missing_or_invalid_synthetic_data'};
  if(Object.keys(pkg.answers).some(k=>!['first_name','last_name','email'].includes(k)))return {status:'required_action',reason:'unsupported_question'};
  const copy={vacancyId:pkg.vacancyId,answers:{...pkg.answers},filename:pkg.filename,resume:Buffer.from(pkg.resume)};
  return {status:'prepared',package:copy,packageHash:fingerprint(copy)};
}
async function submit(attempt,{endpoint,approvedHash,fetchImpl=fetch,timeoutMs=1000}={}) {
  // Numeric loopback avoids DNS ambiguity. Only our explicit fixture route is allowed.
  const url=new URL(endpoint);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/fixture/apply'||url.search||url.hash)throw new Error('JR_CONTROLLED_ENDPOINT_ONLY');
  if(attempt.status!=='prepared')return {status:attempt.status,reason:'attempt_not_sendable'};
  if(approvedHash!==attempt.packageHash || fingerprint(attempt.package)!==attempt.packageHash)return {status:'required_action',reason:'package_approval_required'};
  const data=new FormData();
  data.set('vacancy_id',attempt.package.vacancyId);data.set('package_hash',attempt.packageHash);
  for(const [key,value] of Object.entries(attempt.package.answers))data.set(key,value);
  data.set('resume',new Blob([attempt.package.resume],{type:'text/plain'}),attempt.package.filename);
  // Reserve synchronously before awaiting transport; a second call cannot race this one.
  attempt.status='submitting';
  try {
    const response=await fetchImpl(url,{method:'POST',body:data,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    // Even HTTP errors can follow a side effect. Only the fixture's explicit receipt
    // with matching package + vacancy is sufficient confirmation.
    const receipt=await response.json();
    if(response.ok && receipt?.accepted===true && receipt.packageHash===attempt.packageHash && receipt.vacancyId===attempt.package.vacancyId && typeof receipt.receiptId==='string'&&receipt.receiptId.length) {
      attempt.status='submitted';return {status:'submitted',receiptId:receipt.receiptId,packageHash:attempt.packageHash};
    }
  }catch{}
  attempt.status='submission_unknown';return {status:'submission_unknown',reason:'inspect_before_any_new_attempt'};
}
module.exports={prepare,submit};
