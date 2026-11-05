const {getJson}=require('./http.cjs');
const ORIGIN='https://api.hh.ru';
const validId=id=>typeof id==='string'&&/^[1-9]\d{0,19}$/.test(id);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function validateHHSource(source) {
 const s=source.search;
 const fields=['provider','board','company','enabled','disabled_reason','search'];
 const searchFields=['queries','periodDays','perPage','maxPages','maxVacancies','areaIds','workFormat'];
 if(source.board!=='search'||Object.keys(source).some(k=>!fields.includes(k)&&k!=='id')||!s||Array.isArray(s)||typeof s!=='object'||Object.keys(s).some(k=>!searchFields.includes(k)))throw new Error('JR_INVALID_HH_CONFIG');
 if(!Array.isArray(s.queries)||!integer(s.queries.length,1,6)||s.queries.some(q=>typeof q!=='string'||!q.trim()||q!==q.trim()||q.length>120||[...q].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))||new Set(s.queries.map(q=>q.toLowerCase())).size!==s.queries.length)throw new Error('JR_INVALID_HH_QUERIES');
 if(!integer(s.periodDays,1,30)||!integer(s.perPage,1,100)||!integer(s.maxPages,1,5)||!integer(s.maxVacancies,1,100))throw new Error('JR_INVALID_HH_LIMIT');
 if(s.areaIds!==undefined&&(!Array.isArray(s.areaIds)||s.areaIds.length>10||s.areaIds.some(id=>!validId(id))||new Set(s.areaIds).size!==s.areaIds.length))throw new Error('JR_INVALID_HH_AREA');
 if(s.workFormat!==undefined&&(!Array.isArray(s.workFormat)||s.workFormat.length>4||s.workFormat.some(id=>!['REMOTE','ON_SITE','HYBRID','FIELD_WORK'].includes(id))||new Set(s.workFormat).size!==s.workFormat.length))throw new Error('JR_INVALID_HH_WORK_FORMAT');
 return s;
}
function searchUrl(source,queryIndex=0,page=0) {
 const s=validateHHSource(source);
 if(!integer(queryIndex,0,s.queries.length-1)||!integer(page,0,s.maxPages-1)||page*s.perPage>=2000)throw new Error('JR_INVALID_HH_PAGE');
 const u=new URL('/vacancies',ORIGIN);
 for(const [key,value] of Object.entries({host:'hh.ru',text:s.queries[queryIndex],search_field:'name',order_by:'publication_time',period:s.periodDays,per_page:s.perPage,page}))u.searchParams.set(key,value);
 for(const id of s.areaIds||[])u.searchParams.append('area',id);
 for(const id of s.workFormat||[])u.searchParams.append('work_format',id);
 return u.toString();
}
function requestHeaders(hh) {
 const {token,userAgent}=hh||{};
 if(typeof token!=='string'||!token||token.length>4096||!/^[A-Za-z0-9._~+/-]+=*$/.test(token)||/REPLACE|SET_LOCALLY/.test(token))throw new Error('JR_HH_ACCESS_TOKEN_REQUIRED');
 if(typeof userAgent!=='string'||!userAgent.trim()||userAgent.length>200||/[^\x20-\x7e]/.test(userAgent)||!userAgent.includes('@'))throw new Error('JR_HH_USER_AGENT_REQUIRED');
 return {Authorization:'Bearer '+token,'HH-User-Agent':userAgent};
}
function validatePage(result,page,perPage) {
 if(!result||typeof result!=='object'||!Array.isArray(result.items)||result.items.length>perPage||result.page!==page||result.per_page!==perPage||!integer(result.found,0,Number.MAX_SAFE_INTEGER)||!integer(result.pages,0,Number.MAX_SAFE_INTEGER)||result.found<result.items.length||result.items.some(x=>!x||!validId(x.id)))throw new Error('JR_HH_INVALID_SEARCH_PAGE');
}
function validateJob(job,expectedId) {
 if(!job||typeof job!=='object'||!validId(job.id)||(expectedId!==undefined&&job.id!==expectedId)||typeof job.archived!=='boolean')throw new Error('JR_HH_INVALID_DETAIL');
 if(job.archived)return job;
 if(typeof job.name!=='string'||!job.name.trim()||typeof job.description!=='string')throw new Error('JR_HH_INVALID_DETAIL');
 if(job.employer!=null&&(typeof job.employer!=='object'||typeof job.employer.name!=='string'))throw new Error('JR_HH_INVALID_EMPLOYER');
 if(job.area!=null&&(typeof job.area!=='object'||typeof job.area.name!=='string'))throw new Error('JR_HH_INVALID_AREA');
 if(job.published_at!=null&&(typeof job.published_at!=='string'||!Number.isFinite(Date.parse(job.published_at))))throw new Error('JR_HH_INVALID_DATE');
 if(job.work_format!=null&&(!Array.isArray(job.work_format)||job.work_format.some(x=>!x||typeof x.id!=='string')))throw new Error('JR_HH_INVALID_WORK_FORMAT');
 if(job.alternate_url!=null) {
  let url;try{url=new URL(job.alternate_url);}catch{throw new Error('JR_HH_INVALID_URL');}
  if(url.protocol!=='https:'||!['hh.ru','www.hh.ru'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/vacancy/'+job.id)throw new Error('JR_HH_INVALID_URL');
 }
 return job;
}
function workplaceType(job) {
 const ids=[...new Set((job.work_format||[]).map(x=>x.id))];
 if(ids.length===1)return {REMOTE:'remote',ON_SITE:'on-site',HYBRID:'hybrid'}[ids[0]]||'Unknown';
 // Multiple formats can be alternatives, not a mandatory hybrid schedule.
 if(ids.length>1)return 'Unknown';
 return job.schedule?.id==='remote'?'remote':'Unknown';
}
async function fetchHH(source,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),hh,deadline=Date.now()+120000}={}) {
 const config=validateHHSource(source),headers=requestHeaders(hh);
 let attempted=false;
 const options={fetchImpl,sleep,deadline,headers,beforeRequest:async()=>{if(attempted)await sleep(250);attempted=true;}};
 const queries=config.queries.map(text=>({text,found:0,pages_fetched:0,ids:[],seen:new Set(),changed:false,done:false}));
 // Visit each query once before fetching another page of any query.
 for(let page=0;page<config.maxPages;page++)for(let index=0;index<queries.length;index++) {
  const q=queries[index];if(q.done)continue;
  const result=await getJson(searchUrl(source,index,page),options);validatePage(result,page,config.perPage);
  if(q.pages_fetched&&q.found!==result.found)q.changed=true;
  q.found=result.found;q.pages_fetched++;
  for(const item of result.items)if(!q.seen.has(item.id)){q.seen.add(item.id);q.ids.push(item.id);}
  q.done=result.items.length===0||page+1>=result.pages||(page+1)*config.perPage>=2000;
 }
 // Fairly interleave the query results; a common first query cannot consume the whole detail budget.
 const ids=[],seen=new Set();
 for(let i=0;i<Math.max(...queries.map(q=>q.ids.length));i++)for(const q of queries)if(q.ids[i]&&!seen.has(q.ids[i])){ids.push(q.ids[i]);seen.add(q.ids[i]);}
 const jobs=[];let unavailable=0,archived=0;
 for(const id of ids.slice(0,config.maxVacancies)) {
  let job;
  try{job=await getJson(ORIGIN+'/vacancies/'+id,options);}catch(e){if(e.message==='JR_SOURCE_HTTP_404'){unavailable++;continue;}throw e;}
  validateJob(job,id);
  if(job.archived){archived++;continue;}jobs.push(job);
 }
 const queryStats=queries.map(q=>({text:q.text,found:q.found,pages_fetched:q.pages_fetched,ids_seen:q.ids.length,complete:!q.changed&&q.ids.length===q.found}));
 const truncated=ids.length>config.maxVacancies||queryStats.some(q=>!q.complete);
 return {jobs,coverage:{kind:'search_window',period_days:config.periodDays,queries:queryStats,unique_candidates:ids.length,detail_limit:config.maxVacancies,details_fetched:jobs.length+archived,unavailable,archived,truncated,complete:!truncated&&!unavailable}};
}
module.exports={validateHHSource,searchUrl,fetchHH,validateJob,workplaceType};
