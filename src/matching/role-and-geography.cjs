const GEOGRAPHY_POLICY='remote-bg-v2';
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
  return {policy:GEOGRAPHY_POLICY,status,reason,workMode,visibility,formatReason:format.reason,evidence:format.evidence,countryEvidence:restrictedByDescription||'',workAuthorization:'unknown',teamLanguage:'unknown'};
}
function descriptionText(value) {
 let text=String(value||'').slice(0,120000);
 for(let i=0;i<2;i++)text=text.replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&');
 return text.replace(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?>/gi,'. ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function classifyWorkMode(location,workplace,description) {
 const fields=String(location||'')+' '+String(workplace||'');
 const text=descriptionText(description);
 const clauses=text.split(/[.;!?]|\b(?:but|however)\b/i).map(x=>x.trim()).filter(Boolean);
 const positive=/\b(?:fully remote (?:role|position)|(?:we are|we're|our company is) (?:a )?fully remote|remote[- ]first|remote[- ]only|100% remote|(?:you|we|employees) (?:can |may |will )?work (?:fully )?remotely|(?:you can |you may )work from home|(?:this|the) (?:role|position|job) (?:is|can be|will be) (?:fully )?(?:remote|home[- ]?based)|(?:remote|home[- ]?based) (?:role|position)|(?:you are |you will be )working remotely)\b|(?:полностью удал[её]н|удал[её]нн(?:ая|ый) (?:работа|формат))/i;
 const negative=/\b(?:not (?:a |an )?(?:fully |100% )?remote|no remote|remote (?:work |working )?(?:is )?not (?:available|allowed|supported)|cannot work remotely)\b|не (?:предусмотрен[ао]?|доступен|доступна) удал[её]н/i;
 const hybrid=/\b(?:hybrid (?:role|position|work(?:ing)?|model)|(?:must|required|expected)[^.]{0,70}(?:office|on[- ]site)[^.]{0,30}(?:days|weekly)|(?:[2-5]|two|three|four|five) days (?:a |per )?week (?:in|at) (?:the )?office)\b/i;
 const onsite=/\b(?:(?:this|the) (?:role|position|job) (?:is|will be|requires)\s+(?:an?\s+)?(?:office[- ]based|on[- ]site)|(?:you|candidates|employees) must (?:work|be) (?:in|at) (?:the )?office|this is an? on[- ]site (?:role|position|job))\b/i;
 const fieldNegative=negative.test(fields),fieldRemote=/\b(?:remote|home[- ]?based|work from home|WFH)\b|удал[её]н/i.test(fields)&&!fieldNegative;
 const fieldHybrid=/\bhybrid\b/i.test(fields),fieldOnsite=/\b(?:on[- ]?site|office[- ]based)\b/i.test(fields);
 // Remove only optional/negated office phrases. A later mandatory clause still wins.
 const officeText=clause=>clause
  .replace(/\b(?:not (?:an? )?on[- ]site(?: (?:role|position|work))?|no on[- ]site (?:work|attendance)(?: required)?|not (?:required|expected)[^.;]{0,100})/gi,'')
  .replace(/\b(?:with )?(?:the )?option (?:for|of|to do) hybrid (?:work(?:ing)?|model)|\boptional hybrid (?:work(?:ing)?|model)|\bhybrid (?:work(?:ing)?|model) (?:is|remains) optional|\b(?:you )?(?:can|may) choose (?:a )?hybrid (?:work(?:ing)?|model)/gi,'');
 const hybridClause=clauses.find(c=>hybrid.test(officeText(c)));
 const officeClause=clauses.find(c=>onsite.test(officeText(c)));
 const negativeClause=clauses.find(c=>negative.test(c));
 const bounded=/\bwork(?:ing)? (?:remotely|from (?:abroad|anywhere))\b.{0,70}\b(?:\d+|ninety) days\b/i;
 const roleClauses=clauses.filter(c=>!bounded.test(c)&&(!/\b(?:customers|clients|tools for|products for)\b/i.test(c)||/\b(?:this role|this position|you (?:can|will|may)|we are)\b/i.test(c)));
 const remoteClause=roleClauses.find(c=>positive.test(c.replace(new RegExp(negative.source,'gi'),'')));
 const explicitRemote=roleClauses.find(c=>/\b(?:(?:this|the) (?:role|position|job) (?:is|will be|can be) (?:fully )?(?:remote|home[- ]?based)|this is a fully remote (?:role|position))\b/i.test(c));
 const evidence=(source,snippet)=>({source,snippet:snippet.trim().slice(0,240)});
 const structured=evidence('structured',fields);
 if(fieldHybrid||hybridClause)return {mode:'hybrid',reason:'hybrid_requires_office',evidence:fieldHybrid?structured:evidence('description',hybridClause)};
 // An explicit requirement for this role outranks generic company remote benefits.
 if(officeClause)return {mode:'onsite',reason:'role_requires_office',evidence:evidence('description',officeClause)};
 if((fieldOnsite&&explicitRemote)||((fieldNegative||negativeClause)&&(fieldRemote||remoteClause)))return {mode:'unknown',reason:'conflicting_work_mode_signals',evidence:negativeClause?evidence('description',negativeClause):structured};
 if(fieldOnsite||fieldNegative||negativeClause)return {mode:'onsite',reason:'explicit_office_or_no_remote',evidence:negativeClause?evidence('description',negativeClause):structured};
 if(fieldRemote||remoteClause)return {mode:'remote',reason:fieldRemote?'structured_remote':'description_remote',evidence:fieldRemote?structured:evidence('description',remoteClause)};
 const temporary=clauses.find(c=>bounded.test(c));
 if(temporary)return {mode:'unknown',reason:'temporary_remote_only',evidence:evidence('description',temporary)};
 return {mode:'unknown',reason:'remote_not_confirmed',evidence:{source:'none',snippet:''}};
}
function descriptionCountryRestriction(description) {
 const country='(?:USA|US|United States|UK|United Kingdom|Canada|Poland|Germany|France|Spain|Portugal|Netherlands|Ireland|Lithuania|Serbia|India|Brazil|Mexico|Australia|Switzerland|Austria|Italy|Romania|Hungary|Czech Republic|Ukraine|Estonia|Latvia|Denmark|Sweden|Norway|Finland|Israel|Singapore|Taiwan|Bulgaria|BG)';
 const list=country+'\\b(?:\\s*(?:,\\s*(?:(?:or|and)\\s+)?|/|\\bor\\b|\\band\\b)\\s*(?:in |from )?(?:the )?'+country+'\\b)*';
 const prefix='(?:must (?:be )?(?:based|located|resident|reside|live) (?:in )?|(?:considering|hiring|accepting) (?:candidates|applicants)(?: who are)? (?:based |located |living )?(?:in|from) |(?:this|the) (?:role|position|job) (?:is|will be) (?:based|located) in )';
 const restriction=new RegExp('\\b'+prefix+'(?:the )?('+list+')|\\b('+list+')[- ]only\\b','gi');
 for(const clause of descriptionText(description).replace(/\bU\.S\./gi,'USA').replace(/\bU\.K\./gi,'UK').split(/[.;!?]/)) {
  for(const match of clause.matchAll(restriction)) {
   const before=clause.slice(0,match.index);
   if(/\b(?:not|never)\s+(?:only\s+)?$/i.test(before))continue;
   const after=clause.slice(match.index+match[0].length);
   if(/^\s*(?:,\s*(?:or\s+)?|or\s+|and\s+)(?:anywhere|(?:any|other) (?:EU|EEA|European) countr|(?:across|within|in) (?:Europe|EMEA|EU|EEA)|Europe|EMEA|EU|EEA|worldwide|globally)/i.test(after))continue;
   // Only countries in the hiring list are alternatives; office/pay boilerplate is not.
   if(!/\b(?:Bulgaria|BG)\b/i.test(match[1]||match[2]))return clause.trim().slice(Math.max(0,match.index-35),match.index+205);
  }
 }
 return '';
}
module.exports={classifyRole,classifyGeography,classifyWorkMode,descriptionText,GEOGRAPHY_POLICY};
