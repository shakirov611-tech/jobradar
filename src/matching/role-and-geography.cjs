function classifyRole(title) {
  const t=String(title||'').replace(/[–—_/,&()-]+/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(?:project|program) manager\b/i.test(t)&&/\b(?:construction|civil|building site)\b/i.test(t))return {matched:false,reason:'non_software_project_role'};
  if(/\bproduct (?:marketing|design(?:er)?|analyst|analytics)\b/i.test(t))return {matched:false,reason:'adjacent_product_function'};
  if(/\b(?:product (?:manager|owner|lead)|(?:head|director|vp|vice president|chief) (?:of )?product|product management|growth product|monetization manager)\b/i.test(t)||/продакт|менеджер(?:\s+по)?\s+продукт|владелец\s+продукт|руководитель\s+продукт/iu.test(t))return {matched:true,reason:'product_role'};
  if(/\b(?:head of growth|growth manager|growth lead)\b/i.test(t))return {matched:true,reason:'growth_scope_needs_review'};
  if(/\b(?:project|delivery|program) manager\b/i.test(t)||/руководитель\s+проект/iu.test(t))return {matched:true,reason:/\b(?:technical|software|digital|platform|IT|agile|engineering)\b/i.test(t)?'technical_delivery_role':'delivery_domain_needs_review'};
  return {matched:false,reason:'outside_current_role_policy'};
}
function classifyGeography(location,workplace,profile) {
  if(profile.country!=='BG')throw new Error('JR_UNSUPPORTED_GEOGRAPHY_PROFILE');
  const l=String(location||''),w=String(workplace||'');
  const remote=/remote|удал[её]н/i.test(l+' '+w);
  const workMode=/hybrid/i.test(l+' '+w)?'hybrid':remote?'remote':/on.?site|office/i.test(w)?'onsite':'unknown';
  let status='review',reason='location_or_hiring_scope_unknown';
  if(/\b(?:US|USA|United States|Canada|Canadian|UK|United Kingdom)\b/i.test(l)&&!/\b(?:Europe|EMEA|worldwide|global|Bulgaria)\b/i.test(l)){status='restricted';reason='location_outside_BG_requires_review';}
  else if(/\b(?:Bulgaria|Sofia|Plovdiv)\b/i.test(l)){status='plausible';reason='BG_location_not_work_authorization_confirmation';}
  else if(remote&&/\b(?:worldwide|anywhere|global)\b/i.test(l)){status='plausible';reason='explicit_broad_remote_scope_verify_employment';}
  else if(/\b(?:Europe|EMEA|EU|EEA)\b/i.test(l)){reason='regional_scope_does_not_confirm_BG';}
  else if(remote){reason='remote_without_country_eligibility';}
  if(profile.remotePreferred&&workMode==='onsite'){status='restricted';reason='onsite_conflicts_with_remote_preference';}
  return {status,reason,workMode,workAuthorization:'unknown',teamLanguage:'unknown'};
}
module.exports={classifyRole,classifyGeography};
