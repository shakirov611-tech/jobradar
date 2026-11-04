const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const defaults=require('../../config/language-analysis.json');
const {descriptionText}=require('../matching/role-and-geography.cjs');
const {VERSION,SCHEMA,hash,languageCode,validateAnalysis}=require('./contract.cjs');
const {analyzeRules}=require('./rules.cjs');
const {PROMPT_VERSION,PROMPT}=require('./prompt.cjs');
function languageInput(title,description,postingHint='') {
  return {title:String(title),description:descriptionText(description),posting_hint:languageCode(postingHint)?postingHint:'',raw_content_hash:hash(String(description||''))};
}
function validateConfig(c) {
  const keys=Object.keys(defaults);
  if(!c||Object.keys(c).some(k=>!keys.includes(k))||c.version!==1||!['rules','openai'].includes(c.provider)||typeof c.model!=='string'||c.model.length>120||c.provider==='openai'&&!c.model.trim())throw Error('JR_LANGUAGE_CONFIG');
  for(const [key,min,max] of [['timeout_ms',1,60000],['max_attempts',1,3],['max_ai_calls_per_run',0,100],['max_input_chars',100,60000],['failure_cooldown_ms',1000,3600000]])if(!Number.isSafeInteger(c[key])||c[key]<min||c[key]>max)throw Error('JR_LANGUAGE_CONFIG');
  for(const key of ['aliases','posting_markers']) {
    if(!c[key]||Array.isArray(c[key])||typeof c[key]!=='object')throw Error('JR_LANGUAGE_CONFIG');
    for(const [code,words] of Object.entries(c[key]))if(!languageCode(code)||!Array.isArray(words)||!words.length||words.length>50||words.some(w=>typeof w!=='string'||!w.trim()||w.length>80))throw Error('JR_LANGUAGE_CONFIG');
  }
  return c;
}
function result(input,data,{model='rules',now=new Date().toISOString(),status,error=null,version=VERSION}={}) {
  validateAnalysis(data,input);
  const signals=[...data.team_languages,...data.required_languages];
  const confidence=signals.length?['low','medium','high'].find(c=>signals.some(x=>x.confidence===c)):null;
  return {...data,language_confidence:confidence,language_analysis_status:status||(!data.team_languages.length||data.team_languages.some(x=>x.basis==='inferred')||data.required_languages.some(x=>x.confidence!=='high')?'needs_review':'completed'),language_analysis_version:version,language_analyzed_at:now,input_hash:hash(input),model,prompt_version:model==='rules'?null:PROMPT_VERSION,error_code:error};
}
function rulesAnalysis(input,{config=defaults,now}={}) {return result(input,analyzeRules(input,config),{now});}
function createOpenAIProvider({key,model,fetchImpl=fetch}) {
  return async (input,{signal})=>{
    if(!key)throw Error('JR_LANGUAGE_KEY_MISSING');
    const response=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_completion_tokens:3000,messages:[{role:'system',content:PROMPT},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'vacancy_language',strict:true,schema:SCHEMA}}})});
    if(!response.ok) {const e=Error('JR_LANGUAGE_HTTP');e.retryable=[429,500,502,503,504].includes(response.status);throw e;}
    const raw=await response.text();if(raw.length>100000)throw Error('JR_LANGUAGE_RESPONSE_SIZE');
    const completion=JSON.parse(raw),choice=completion.choices?.[0];
    if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof choice.message?.content!=='string')throw Error('JR_LANGUAGE_RESPONSE');
    return JSON.parse(choice.message.content);
  };
}
function createMockProvider(respond) {return async input=>typeof respond==='function'?respond(input):structuredClone(respond);}
function createAnalyzer({config=defaults,cacheDir,key,provider,now=()=>new Date().toISOString(),version=VERSION}={}) {
  validateConfig(config);
  const classify=provider||createOpenAIProvider({key,model:config.model});
  const policyHash=hash({version,provider:config.provider,model:config.model,aliases:config.aliases,posting_markers:config.posting_markers,max_input_chars:config.max_input_chars,prompt:PROMPT_VERSION,promptHash:hash(PROMPT),schema:SCHEMA});
  const memo=new Map(),inflight=new Map();
  const stats={ai_calls:0,cache_hits:0,failures:0,cache_errors:0,budget_deferred:0};
  function read(cacheKey,input) {
    try {
      const entry=memo.get(cacheKey)||(cacheDir&&JSON.parse(fs.readFileSync(path.join(cacheDir,cacheKey+'.json'),'utf8')));
      if(!entry||entry.policy_hash!==policyHash||entry.result.input_hash!==hash(input))return null;
      const a=entry.result;const data=Object.fromEntries(Object.keys(SCHEMA.properties).map(k=>[k,a[k]]));validateAnalysis(data,input);
      if(!['completed','needs_review','failed'].includes(a.language_analysis_status)||!Number.isFinite(Date.parse(a.language_analyzed_at)))return null;
      if(a.language_analysis_status==='failed'&&Date.parse(now())-Date.parse(a.language_analyzed_at)>=config.failure_cooldown_ms)return null;
      return structuredClone(a);
    } catch(e) {if(e.code!=='ENOENT')stats.cache_errors++;return null;}
  }
  function save(cacheKey,value) {
    const entry={policy_hash:policyHash,result:value};memo.set(cacheKey,entry);
    if(!cacheDir)return;
    let temp;
    try {fs.mkdirSync(cacheDir,{recursive:true});temp=path.join(cacheDir,cacheKey+'.'+randomBytes(6).toString('hex')+'.tmp');fs.writeFileSync(temp,JSON.stringify(entry),{mode:0o600});fs.renameSync(temp,path.join(cacheDir,cacheKey+'.json'));}
    catch {stats.cache_errors++;if(temp)try{fs.unlinkSync(temp);}catch{}}
  }
  async function run(input,cacheKey) {
    const baseline=rulesAnalysis(input,{config,now:now()});
    if(config.provider==='rules'){save(cacheKey,baseline);return baseline;}
    if(stats.ai_calls>=config.max_ai_calls_per_run){stats.budget_deferred++;return {...baseline,language_analysis_status:'pending',error_code:'JR_LANGUAGE_BUDGET'};}
    const sent={title:input.title.slice(0,1000),description:input.description.slice(0,config.max_input_chars),posting_hint:input.posting_hint};
    const truncated=sent.description.length<input.description.length||sent.title.length<input.title.length;
    let lastError='JR_LANGUAGE_PROVIDER';
    for(let attempt=0;attempt<config.max_attempts&&stats.ai_calls<config.max_ai_calls_per_run;attempt++) {
      const controller=new AbortController();let timer;
      try {
        stats.ai_calls++;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('JR_LANGUAGE_TIMEOUT'));},config.timeout_ms);});
        const data=await Promise.race([classify(sent,{signal:controller.signal}),timeout]);
        const parsed=typeof data==='string'?JSON.parse(data):data;validateAnalysis(parsed,sent);
        const value=result(input,parsed,{model:config.model,now:now(),version,status:truncated?'needs_review':undefined,error:truncated?'JR_LANGUAGE_TRUNCATED':null});
        save(cacheKey,value);return value;
      } catch(e) {
        lastError=/^JR_LANGUAGE_[A-Z_]+$/.test(e.message)?e.message:'JR_LANGUAGE_PROVIDER';
        if(e.retryable===false||lastError==='JR_LANGUAGE_KEY_MISSING')break;
      } finally {clearTimeout(timer);}
    }
    stats.failures++;
    const failure={...baseline,language_analysis_status:'failed',error_code:lastError};save(cacheKey,failure);return failure;
  }
  return {stats,async analyze(input) {
    const cacheKey=hash({input,policyHash});const cached=read(cacheKey,input);if(cached){stats.cache_hits++;return cached;}
    if(inflight.has(cacheKey)){stats.cache_hits++;return structuredClone(await inflight.get(cacheKey));}
    const promise=run(input,cacheKey);inflight.set(cacheKey,promise);
    try{return structuredClone(await promise);}finally{inflight.delete(cacheKey);}
  }};
}
module.exports={languageInput,validateConfig,rulesAnalysis,createAnalyzer,createOpenAIProvider,createMockProvider};
