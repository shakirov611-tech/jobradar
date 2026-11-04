const {LEVELS,validatePreferences}=require('./contract.cjs');
function preferences(profile) {
  if(profile.language_preferences)return validatePreferences(profile.language_preferences);
  return {preferred_team_languages:(profile.matching?.preferredTeamLanguages||[]).map(language=>({language,weight:1})),candidate_languages:[],unknown_team_language_policy:'keep',preference_strength:'medium'};
}
function languageFit(analysis,profile) {
  const p=preferences(profile),issues=[];
  for(const req of analysis.required_languages) {
    if(!req.mandatory)continue;
    const known=p.candidate_languages.find(x=>x.language===req.language);
    const reliable=req.confidence==='high'&&!['failed','pending'].includes(analysis.language_analysis_status);
    // CEFR is ordinal; native as a requirement cannot be established by C2.
    const status=!reliable||!known||!req.level?'unknown':LEVELS.indexOf(known.level)<LEVELS.indexOf(req.level)?'mismatch':'meets';
    issues.push({language:req.language,required_level:req.level,candidate_level:known?.level||null,status,scope:req.scope,evidence:req.evidence});
  }
  const requirements=issues.some(x=>x.status==='mismatch')?'mismatch':issues.some(x=>x.status==='unknown')?'unknown':issues.length?'meets':'unknown';
  const explicit=analysis.team_languages.filter(x=>x.basis==='explicit'),inferred=analysis.team_languages.filter(x=>x.basis==='inferred');
  const preferred=analysis.team_languages.map(x=>({...x,weight:p.preferred_team_languages.find(v=>v.language===x.language)?.weight||0})).filter(x=>x.weight>0);
  const team=!p.preferred_team_languages.some(x=>x.weight>0)?'neutral':preferred.some(x=>x.basis==='explicit')?'preferred':preferred.length?'inferred_preferred':explicit.length?'other':'unknown';
  const strength={low:0.25,medium:0.5,high:1}[p.preference_strength];
  const rankBoost=Math.max(0,...preferred.map(x=>x.weight*(x.basis==='explicit'?1:0.25)))*strength;
  return {policy:'language-fit-v1',requirements,requirement_details:issues,team_preference:team,rank_boost:rankBoost,needs_review:requirements==='mismatch'||issues.some(x=>x.status==='unknown')||['failed','pending'].includes(analysis.language_analysis_status)||analysis.error_code==='JR_LANGUAGE_TRUNCATED'||inferred.length>0||team==='other'||team==='unknown'&&p.unknown_team_language_policy==='review'};
}
function sourcePriorities(collection) {
  return collection.sources.map(source=>{
    const rows=collection.catalog.filter(x=>x.sourceId===source.sourceId&&x.role.matched);
    const explicit=rows.filter(x=>x.language_analysis?.team_languages.some(l=>l.basis==='explicit')).length;
    return {source_id:source.sourceId,status:source.status,role_count:rows.length,explicit_team_count:explicit,unknown_team_count:rows.filter(x=>!x.language_analysis?.team_languages.length).length,preference_yield:rows.length?rows.reduce((n,x)=>n+(x.matching.language_fit?.rank_boost||0),0)/rows.length:0,processing_cost:null};
  }).sort((a,b)=>b.preference_yield-a.preference_yield||a.source_id.localeCompare(b.source_id));
}
module.exports={preferences,languageFit,sourcePriorities};
