const {classifyRole,classifyGeography}=require('../matching/role-and-geography.cjs');
function sourceId(s){return s.provider+'_'+(s.provider==='lever'&&s.region==='eu'?'eu_':'')+s.board;}
function validateSources(config) {
 if(config?.version!==1||!Array.isArray(config.sources))throw new Error('JR_INVALID_SOURCE_CONFIG');
 const active=[],seen=new Set();
 for(const s of config.sources) {
  if(!s||!['greenhouse','lever'].includes(s.provider)||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(s.board)||typeof s.company!=='string'||!s.company.trim()||typeof s.enabled!=='boolean'||(s.provider==='lever'&&!['global','eu'].includes(s.region)))throw new Error('JR_INVALID_SOURCE_CONFIG');
  const id=sourceId(s);if(seen.has(id))throw new Error('JR_DUPLICATE_SOURCE');seen.add(id);if(s.enabled)active.push({...s,id});
 }
 if(!active.length||active.length>8)throw new Error('JR_SOURCE_COUNT_MUST_BE_1_TO_8');return active;
}
function feedUrl(s,skip=0){return s.provider==='greenhouse'?`https://boards-api.greenhouse.io/v1/boards/${s.board}/jobs?content=true`:`https://api${s.region==='eu'?'.eu':''}.lever.co/v0/postings/${s.board}?mode=json&skip=${skip}&limit=100`;}
async function getJson(url,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),deadline=Date.now()+30000}={}) {
 for(let attempt=0;attempt<2;attempt++) {
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('JR_SOURCE_DEADLINE');
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(Math.min(15000,remaining))});}catch{if(attempt===0){await sleep(500);continue;}throw new Error('JR_SOURCE_TRANSPORT');}
  if(response.ok){try{return await response.json();}catch{throw new Error('JR_SOURCE_INVALID_JSON');}}
  if(attempt===0&&[429,500,502,503,504].includes(response.status)){const raw=response.headers?.get?.('retry-after');const delay=raw?(Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-Date.now()):500;if(!Number.isFinite(delay)||delay>2000)throw new Error('JR_SOURCE_HTTP_'+response.status);await sleep(Math.max(500,delay));continue;}
  throw new Error('JR_SOURCE_HTTP_'+response.status);
 }
}
async function fetchFeed(s,options={}) {
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
 if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))throw new Error('JR_INVALID_OBSERVATION_TIME');
 const jobs=s.provider==='greenhouse'?feed?.jobs:feed;
 if(!Array.isArray(jobs))throw new Error('JR_INVALID_FEED');
 if(s.provider==='greenhouse'&&feed.meta?.total!==undefined&&(!Number.isSafeInteger(feed.meta.total)||feed.meta.total!==jobs.length))throw new Error('JR_INCOMPLETE_FEED');
 const seen=new Set(),rows=[],catalog=[];
 for(const job of jobs) {
  if(!job||typeof job!=='object'||Array.isArray(job))throw new Error('JR_INVALID_JOB');
  const id=job.id;
  const valid=s.provider==='greenhouse'?((typeof id==='number'&&Number.isSafeInteger(id)&&id>0)||(typeof id==='string'&&/^[1-9]\d*$/.test(id))):(typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id));
  if(!valid)throw new Error('JR_INVALID_JOB_ID');
  const key=sourceId(s)+'_'+String(id).toLowerCase();if(seen.has(key))throw new Error('JR_DUPLICATE_FEED_ID');seen.add(key);
  const title=s.provider==='greenhouse'?job.title:job.text;
  if(typeof title!=='string')throw new Error('JR_INVALID_JOB_TITLE');
  const gh=s.provider==='greenhouse';
  if((gh&&job.content!=null&&typeof job.content!=='string')||(!gh&&job.description!=null&&typeof job.description!=='string'))throw new Error('JR_INVALID_JOB_CONTENT');
  if(gh&&job.metadata!=null&&!Array.isArray(job.metadata))throw new Error('JR_INVALID_METADATA');
  const workplace=gh?(job.metadata||[]).find(x=>x?.name==='Workplace Type')?.value:job.workplaceType;
  const loc=gh?job.location?.name:job.categories?.allLocations?.join('; ')||job.categories?.location;
  const location=typeof loc==='string'?loc:'';
  const work=typeof workplace==='string'?workplace:'Unknown';
  const desc=gh?job.content:[job.description||'',...(Array.isArray(job.lists)?job.lists.map(x=>(x.text||'')+'\n'+(x.content||'')):[]),job.additional||''].join('\n');
  const role=classifyRole(title),geography=classifyGeography(location,work,profile,desc);
  const originalUrl=gh?job.absolute_url:job.hostedUrl;
  catalog.push({vacancy_id:key,sourceId:sourceId(s),company:s.company,title,location,original_url:typeof originalUrl==='string'?originalUrl:'',role,geography});
  if(!role.matched)continue;
  const date=Number.isSafeInteger(job.createdAt)&&job.createdAt>0&&job.createdAt<=8640000000000000?new Date(job.createdAt).toISOString():'';
  rows.push({vacancy_id:key,company:s.company,title,source:gh?'Greenhouse':'Lever',original_url:typeof originalUrl==='string'?originalUrl:'',canonical_url:typeof originalUrl==='string'?originalUrl:'',location,workplace_type:work,language:typeof job.language==='string'?job.language:'Unknown',published_at:gh?(typeof job.first_published==='string'?job.first_published:''):date,updated_at:gh?(typeof job.updated_at==='string'?job.updated_at:''):'',active_status:'active_in_feed',description:typeof desc==='string'?desc.slice(0,30000):'',last_seen_at:observedAt});
 }
 return {rows,catalog,total:jobs.length};
}
async function collectSources(sources,profile,{fetchImpl=fetch,sleep,observedAt=new Date().toISOString(),loadFeed}={}) {
 const results=[];
 // Two read-only requests concurrently, bounded source/page counts.
 for(let start=0;start<sources.length;start+=2) {
  const batch=await Promise.all(sources.slice(start,start+2).map(async s=>{
   try{const feed=loadFeed?await loadFeed(s):await fetchFeed(s,{fetchImpl,sleep});const n=normalizeFeed(s,feed,observedAt,profile);return {sourceId:sourceId(s),provider:s.provider,company:s.company,status:'passed',total:n.total,matched:n.rows.length,views:Object.fromEntries(['main','unclear','excluded'].map(k=>[k,n.catalog.filter(x=>x.role.matched&&x.geography.visibility===k).length])),roleReview:n.catalog.filter(x=>x.role.matched&&x.role.reason.endsWith('needs_review')).length,geography:Object.fromEntries(['plausible','review','restricted'].map(k=>[k,n.catalog.filter(x=>x.role.matched&&x.geography.status===k).length])),rows:n.rows,catalog:n.catalog};}
   catch(e){return {sourceId:sourceId(s),provider:s.provider,company:s.company,status:'failed',error:/^JR_[A-Z0-9_]+$/.test(e.message)?e.message:'JR_SOURCE_FAILED',total:0,matched:0,rows:[],catalog:[]};}
  }));results.push(...batch);
 }
 return {observedAt,sources:results.map(({rows,catalog,...rest})=>rest),total:results.reduce((n,r)=>n+r.total,0),rows:results.flatMap(r=>r.rows),catalog:results.flatMap(r=>r.catalog)};
}
module.exports={sourceId,validateSources,feedUrl,fetchFeed,normalizeFeed,collectSources};
