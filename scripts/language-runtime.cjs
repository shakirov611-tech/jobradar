const fs=require('node:fs');const path=require('node:path');
const {createAnalyzer,validateConfig}=require('../src/language/analyzer.cjs');
const {validateAnalysis}=require('../src/language/contract.cjs');
function languageRuntime(env,{dir=path.resolve(__dirname,'../.collector-state'),test=false}={}) {
  const config=JSON.parse(fs.readFileSync(env.JR_LANGUAGE_CONFIG||path.resolve(__dirname,'../config/language-analysis.json'),'utf8'));
  if(test)config.provider='rules';validateConfig(config);
  const engine=createAnalyzer({config,cacheDir:path.join(dir,'language-cache'),key:env.JR_LANGUAGE_API_KEY});
  let overrides=[];
  if(!test&&env.JR_LANGUAGE_OVERRIDES) {
    const doc=JSON.parse(fs.readFileSync(env.JR_LANGUAGE_OVERRIDES,'utf8'));
    if(doc.version!==1||!Array.isArray(doc.overrides)||doc.overrides.some(x=>!x||typeof x.vacancy_id!=='string'||!/^[a-f0-9]{64}$/.test(x.input_hash)||!x.note?.trim()||!Number.isFinite(Date.parse(x.reviewed_at)))||new Set(doc.overrides.map(x=>x.vacancy_id)).size!==doc.overrides.length)throw Error('JR_LANGUAGE_OVERRIDES');
    overrides=doc.overrides;
  }
  return {engine,sheets:env.JR_LANGUAGE_SHEETS==='1',overrideFor(vacancyId,input,analysis) {
    const found=overrides.find(x=>x.vacancy_id===vacancyId);if(!found)return null;
    if(found.input_hash!==analysis.input_hash)return {status:'stale'};
    try{validateAnalysis(found.analysis,input);return {status:'applied',reviewed_at:found.reviewed_at,note:found.note,analysis:{...analysis,...found.analysis,language_analysis_status:'needs_review',model:'manual',error_code:null}};}catch{return {status:'invalid'};}
  }};
}
module.exports={languageRuntime};
