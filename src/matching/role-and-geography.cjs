function classifyRole(title) {
  const t=String(title||'').replace(/[–—_/,&()-]+/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(?:project|program) manager\b/i.test(t)&&/\b(?:construction|civil|building site)\b/i.test(t))return {matched:false,reason:'non_software_project_role'};
  if(/\bproduct (?:marketing|design(?:er)?|analyst|analytics)\b/i.test(t))return {matched:false,reason:'adjacent_product_function'};
  if(/\b(?:product (?:manager|owner|lead)|(?:head|director|vp|vice president|chief) (?:of )?product|product management|growth product|monetization manager)\b/i.test(t)||/продакт|менеджер(?:\s+по)?\s+продукт|владелец\s+продукт|руководитель\s+продукт/iu.test(t))return {matched:true,reason:'product_role'};
  if(/\b(?:head of growth|growth manager|growth lead)\b/i.test(t))return {matched:true,reason:'growth_scope_needs_review'};
  if(/\b(?:project|delivery|program) manager\b/i.test(t)||/руководитель\s+проект/iu.test(t))return {matched:true,reason:/\b(?:technical|software|digital|platform|IT|agile|engineering)\b/i.test(t)?'technical_delivery_role':'delivery_domain_needs_review'};
  return {matched:false,reason:'outside_current_role_policy'};
}
function classifyGeography(location,workplace,profile,description='') {
  if(profile.country!=='BG')throw new Error('JR_UNSUPPORTED_GEOGRAPHY_PROFILE');
  const l=String(location||''),w=String(workplace||'');
  const format=classifyWorkMode(l,w,description);
  const remote=format.mode==='remote';
  const workMode=format.mode;
  let status='review',reason='location_or_hiring_scope_unknown';
  if(/\b(?:US|USA|United States|Canada|Canadian|UK|United Kingdom)\b/i.test(l)&&!/\b(?:Europe|EMEA|worldwide|global|Bulgaria)\b/i.test(l)){status='restricted';reason='location_outside_BG_requires_review';}
  else if(/\b(?:Bulgaria|Sofia|Plovdiv)\b/i.test(l)){status='plausible';reason='BG_location_not_work_authorization_confirmation';}
  else if(remote&&/\b(?:worldwide|anywhere|global)\b/i.test(l)){status='plausible';reason='explicit_broad_remote_scope_verify_employment';}
  else if(/\b(?:Europe|EMEA|EU|EEA)\b/i.test(l)){reason='regional_scope_does_not_confirm_BG';}
  else if(remote){reason='remote_without_country_eligibility';}
  if(profile.remotePreferred&&workMode==='onsite'){status='restricted';reason='onsite_conflicts_with_remote_preference';}
  const restrictedByDescription=descriptionCountryRestriction(description);
  if(restrictedByDescription){status='restricted';reason='explicit_description_country_restriction';}
  const visibility=['onsite','hybrid'].includes(workMode)||status==='restricted'?'excluded':workMode==='remote'?'main':'unclear';
  return {status,reason,workMode,visibility,formatReason:format.reason,evidence:format.evidence,countryEvidence:restrictedByDescription||'',workAuthorization:'unknown',teamLanguage:'unknown'};
}
function descriptionText(value) {
 let text=String(value||'').slice(0,120000);
 for(let i=0;i<2;i++)text=text.replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&');
 return text.replace(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?>/gi,'. ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function classifyWorkMode(location,workplace,description) {
 const fields=String(location||'')+' '+String(workplace||'');
 const text=descriptionText(description);
 const positive=/\b(?:fully remote (?:role|position)|(?:we are|we're|our company is) (?:a )?fully remote|remote[- ]first|remote[- ]only|100% remote|(?:you|we|employees) (?:can |may |will )?work (?:fully )?remotely|(?:you can |you may )work from home|(?:this|the) (?:role|position|job) (?:is|can be|will be) (?:fully )?(?:remote|home[- ]?based)|(?:remote|home[- ]?based) (?:role|position)|(?:you are |you will be )working remotely)\b|(?:полностью удал[её]н|удал[её]нн(?:ая|ый) (?:работа|формат))/i;
 const negative=/\b(?:not (?:a |an )?(?:fully |100% )?remote|no remote|remote (?:work |working )?(?:is )?not (?:available|allowed|supported)|cannot work remotely)\b|не (?:предусмотрен[ао]?|доступен|доступна) удал[её]н/i;
 const hybrid=/\b(?:hybrid (?:role|position|work(?:ing)?|model)|(?:must|required|expected)[^.]{0,70}(?:office|on[- ]site)[^.]{0,30}(?:days|weekly)|(?:[2-5]|two|three|four|five) days (?:a |per )?week (?:in|at) (?:the )?office)\b/i;
 const onsite=/\b(?:on[- ]site (?:role|position|work)|(?:role|position) (?:is|requires)[^.]{0,30}(?:office[- ]based|on[- ]site)|must (?:work|be) (?:in|at) (?:the )?office)\b/i;
 const fieldNegative=negative.test(fields),fieldRemote=/\b(?:remote|home[- ]?based|work from home|WFH)\b|удал[её]н/i.test(fields)&&!fieldNegative;
 const fieldHybrid=/\bhybrid\b/i.test(fields),fieldOnsite=/\b(?:on[- ]?site|office[- ]based)\b/i.test(fields);
 const officeText=text.replace(/\b(?:not (?:an? )?on[- ]site(?: (?:role|position|work))?|no on[- ]site (?:work|attendance)(?: required)?|not (?:required|expected)[^.;]{0,100})/gi,'');
 const roleText=text.split(/[.;!?]/).filter(clause=>!(/\b(?:customers|clients|tools for|products for)\b/i.test(clause))||/\b(?:this role|this position|you (?:can|will|may)|we are)\b/i.test(clause)).join('. ');
 const descRemote=positive.test(roleText.replace(new RegExp(negative.source,'gi'),''));
 const match=officeText.match(hybrid)||officeText.match(onsite)||text.match(negative)||roleText.match(positive);
 const evidence=match?{source:'description',snippet:match[0].slice(0,200)}:{source:'structured',snippet:fields.trim().slice(0,200)};
 if(fieldHybrid||hybrid.test(officeText))return {mode:'hybrid',reason:'hybrid_requires_office',evidence:fieldHybrid?{source:'structured',snippet:fields.trim().slice(0,200)}:evidence};
 if((fieldOnsite||fieldNegative||negative.test(text)||onsite.test(officeText))&&(fieldRemote||descRemote))return {mode:'unknown',reason:'conflicting_work_mode_signals',evidence};
 if(fieldOnsite||fieldNegative||negative.test(text)||onsite.test(officeText))return {mode:'onsite',reason:'explicit_office_or_no_remote',evidence};
 if(fieldRemote||descRemote)return {mode:'remote',reason:fieldRemote?'structured_remote':'description_remote',evidence};
 return {mode:'unknown',reason:'remote_not_confirmed',evidence:{source:'none',snippet:''}};
}
function descriptionCountryRestriction(description) {
 const country='(?:US|USA|United States|UK|United Kingdom|Canada|Poland|Germany|France|Spain|Portugal|Netherlands|Ireland|Lithuania|Serbia|India|Brazil|Mexico|Australia|Switzerland|Austria|Italy|Romania|Hungary|Czech Republic|Ukraine|Estonia|Latvia|Denmark|Sweden|Norway|Finland|Israel|Singapore)';
 const restriction=new RegExp('\\b'+country+'[- ]only\\b|\\bremote[^.;]{0,35}\\b'+country+' only\\b|\\bmust (?:be |reside |live )?(?:based|located|resident|reside|live) (?:in )?(?:the )?'+country+'\\b','i');
 for(const clause of descriptionText(description).replace(/\bU\.S\./gi,'USA').replace(/\bU\.K\./gi,'UK').split(/[.;!?]/)) {
  if(restriction.test(clause)&&!(/\b(?:Bulgaria|BG)\b/i.test(clause)))return clause.trim().slice(0,200);
 }
 return '';
}
module.exports={classifyRole,classifyGeography,classifyWorkMode,descriptionText};
