const {createHash}=require('node:crypto');
const {getJson}=require('./http.cjs');
const {validateHHSource,searchUrl,fetchHH,validateJob:validateHHJob,workplaceType:hhWorkplaceType}=require('./hh.cjs');
const {languageInput,rulesAnalysis,createAnalyzer}=require('../language/analyzer.cjs');
const {sourcePriorities}=require('../language/personalize.cjs');
const {validateProfile,profileFingerprint}=require('../matching/profile.cjs');
const {matchVacancy}=require('../matching/personal-match.cjs');
const {descriptionText}=require('../matching/role-and-geography.cjs');
const {classifyRole,classifyGeography}=require('../matching/role-and-geography.cjs');
function sourceId(s){return s.provider+'_'+(s.provider==='lever'&&s.region==='eu'?'eu_':'')+s.board;}
function validateSources(config) {
 if(config?.version!==1||!Array.isArray(config.sources))throw new Error('JR_INVALID_SOURCE_CONFIG');
 const active=[],seen=new Set();
 for(const s of config.sources) {
  if(!s||!['greenhouse','lever','hh'].includes(s.provider)||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(s.board)||typeof s.company!=='string'||!s.company.trim()||typeof s.enabled!=='boolean'||(s.provider==='lever'&&!['global','eu'].includes(s.region)))throw new Error('JR_INVALID_SOURCE_CONFIG');
  if(s.provider==='hh')validateHHSource(s);
  const id=sourceId(s);if(seen.has(id))throw new Error('JR_DUPLICATE_SOURCE');seen.add(id);if(s.enabled)active.push({...s,id});
 }
 if(!active.length||active.length>8)throw new Error('JR_SOURCE_COUNT_MUST_BE_1_TO_8');return active;
}
function feedUrl(s,skip=0){if(s.provider==='hh')return searchUrl(s,0,skip);return s.provider==='greenhouse'?`https://boards-api.greenhouse.io/v1/boards/${s.board}/jobs?content=true`:`https://api${s.region==='eu'?'.eu':''}.lever.co/v0/postings/${s.board}?mode=json&skip=${skip}&limit=100`;}
async function fetchFeed(s,options={}) {
 if(s.provider==='hh')return fetchHH(s,options);
 options={...options,deadline:Date.now()+30000};
 if(s.provider==='greenhouse')return getJson(feedUrl(s),options);
 const jobs=[];for(let page=0;page<10;page++) {
  const rows=await getJson(feedUrl(s,page*100),options);if(!Array.isArray(rows))throw new Error('JR_INVALID_FEED');
  jobs.push(...rows);if(rows.length<100)return jobs;
 }
 // An unbounded/changing board must not be silently reported as fully collected.
 throw new Error('JR_SOURCE_PAGE_LIMIT');
}
function normalizeFeed(s,feed,observedAt,profile) {
 validateProfile(profile);
 if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))throw new Error('JR_INVALID_OBSERVATION_TIME');
 const jobs=['greenhouse','hh'].includes(s.provider)?feed?.jobs:feed;
 if(!Array.isArray(jobs))throw new Error('JR_INVALID_FEED');
 if(s.provider==='greenhouse'&&feed.meta?.total!==undefined&&(!Number.isSafeInteger(feed.meta.total)||feed.meta.total!==jobs.length))throw new Error('JR_INCOMPLETE_FEED');
 const seen=new Set(),rows=[],catalog=[];
 for(const job of jobs) {
  if(!job||typeof job!=='object'||Array.isArray(job))throw new Error('JR_INVALID_JOB');
  const hh=s.provider==='hh';
  if(hh){validateHHJob(job);if(job.archived)continue;}
  const id=job.id;
  const valid=s.provider!=='lever'?((typeof id==='number'&&Number.isSafeInteger(id)&&id>0)||(typeof id==='string'&&/^[1-9]\d*$/.test(id))):(typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id));
  if(!valid)throw new Error('JR_INVALID_JOB_ID');
  const key=sourceId(s)+'_'+String(id).toLowerCase();if(seen.has(key))throw new Error('JR_DUPLICATE_FEED_ID');seen.add(key);
  const title=hh?job.name:s.provider==='greenhouse'?job.title:job.text;
  const company=hh?(job.employer?.name?.trim()||'Не указан'):s.company;
  if(typeof title!=='string')throw new Error('JR_INVALID_JOB_TITLE');
  const gh=s.provider==='greenhouse';
  if((gh&&job.content!=null&&typeof job.content!=='string')||(!gh&&job.description!=null&&typeof job.description!=='string'))throw new Error('JR_INVALID_JOB_CONTENT');
  if(gh&&job.metadata!=null&&!Array.isArray(job.metadata))throw new Error('JR_INVALID_METADATA');
  const workplace=hh?hhWorkplaceType(job):gh?(job.metadata||[]).find(x=>x?.name==='Workplace Type')?.value:job.workplaceType;
  const loc=hh?job.area?.name:gh?job.location?.name:job.categories?.allLocations?.join('; ')||job.categories?.location;
  const location=typeof loc==='string'?loc:'';
  const work=typeof workplace==='string'?workplace:'Unknown';
  const desc=hh?job.description:gh?job.content:[job.description||'',...(Array.isArray(job.lists)?job.lists.map(x=>(x.text||'')+'\n'+(x.content||'')):[]),job.additional||''].join('\n');
  const role=classifyRole(title),geography=classifyGeography(location,work,profile,desc);
  const originalUrl=hh?job.alternate_url:gh?job.absolute_url:job.hostedUrl;
  const postingHint=!hh&&typeof job.language==='string'?job.language:'';
  const input=languageInput(title,desc,postingHint),analysis=rulesAnalysis(input,{now:observedAt});
  const matching=matchVacancy({title,location,role,geography,description:desc,languageAnalysis:analysis},profile);
  const text=descriptionText(desc);
  catalog.push({language_analysis:analysis,matching,reviewText:text.slice(0,12000),reviewTextTruncated:text.length>12000,descriptionHash:createHash('sha256').update(text).digest('hex'),vacancy_id:key,sourceId:sourceId(s),company,title,location,workplaceType:work,original_url:typeof originalUrl==='string'?originalUrl:'',role,geography});
  Object.defineProperty(catalog[catalog.length-1],'language_input',{value:input});
  if(!role.matched)continue;
  const date=Number.isSafeInteger(job.createdAt)&&job.createdAt>0&&job.createdAt<=8640000000000000?new Date(job.createdAt).toISOString():'';
  rows.push({vacancy_id:key,company,title,source:hh?'HeadHunter':gh?'Greenhouse':'Lever',original_url:typeof originalUrl==='string'?originalUrl:'',canonical_url:typeof originalUrl==='string'?originalUrl:'',location,workplace_type:work,language:hh?'Unknown':typeof job.language==='string'?job.language:'Unknown',published_at:hh?(job.published_at||''):gh?(typeof job.first_published==='string'?job.first_published:''):date,updated_at:gh?(typeof job.updated_at==='string'?job.updated_at:''):'',active_status:'active_in_feed',description:typeof desc==='string'?desc.slice(0,30000):'',last_seen_at:observedAt});
 }
 return {rows,catalog,total:catalog.length};
}
async function collectSources(sources,profile,{fetchImpl=fetch,sleep,observedAt=new Date().toISOString(),loadFeed,hh,language={engine:createAnalyzer()}}={}) {
 validateProfile(profile);
 const results=[];
 // Two read-only requests concurrently, bounded source/page counts.
 for(let start=0;start<sources.length;start+=2) {
  const batch=await Promise.all(sources.slice(start,start+2).map(async s=>{
   try{const feed=loadFeed?await loadFeed(s):await fetchFeed(s,{fetchImpl,sleep,hh});const n=normalizeFeed(s,feed,observedAt,profile);
   for(const row of n.catalog) {
    row.language_analysis=await language.engine.analyze(row.language_input);
    const review=language.overrideFor?.(row.vacancy_id,row.language_input,row.language_analysis);
    if(review)row.language_review=review;
    row.matching=matchVacancy({...row,description:row.language_input.description,languageAnalysis:review?.analysis||row.language_analysis},profile);
   }
   if(language.sheets)for(const row of n.rows) {
    const enriched=n.catalog.find(x=>x.vacancy_id===row.vacancy_id);
    row.language_analysis=JSON.stringify(enriched.language_analysis);
    row.language_fit=JSON.stringify({profile_fingerprint:profileFingerprint(profile),...enriched.matching.language_fit,manual_review:enriched.language_review?.status||null});
   }
   return {sourceId:sourceId(s),provider:s.provider,company:s.company,status:'passed',...(s.provider==='hh'&&feed.coverage?{coverage:feed.coverage}:{}),total:n.total,matched:n.rows.length,views:Object.fromEntries(['main','unclear','excluded'].map(k=>[k,n.catalog.filter(x=>x.role.matched&&x.geography.visibility===k).length])),roleReview:n.catalog.filter(x=>x.role.matched&&x.role.reason.endsWith('needs_review')).length,geography:Object.fromEntries(['plausible','review','restricted'].map(k=>[k,n.catalog.filter(x=>x.role.matched&&x.geography.status===k).length])),rows:n.rows,catalog:n.catalog};}
   catch(e){return {sourceId:sourceId(s),provider:s.provider,company:s.company,status:'failed',error:/^JR_[A-Z0-9_]+$/.test(e.message)?e.message:'JR_SOURCE_FAILED',total:0,matched:0,rows:[],catalog:[]};}
  }));results.push(...batch);
 }
 const collection={observedAt,profile,profileFingerprint:profileFingerprint(profile),sources:results.map(({rows,catalog,...rest})=>rest),total:results.reduce((n,r)=>n+r.total,0),rows:results.flatMap(r=>r.rows),catalog:results.flatMap(r=>r.catalog)};
 collection.language_source_priorities=sourcePriorities(collection);collection.language_processing={...language.engine.stats};
 return collection;
}
module.exports={sourceId,validateSources,feedUrl,fetchFeed,normalizeFeed,collectSources};
