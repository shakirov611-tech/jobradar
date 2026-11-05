const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');
const {fetchHH,searchUrl,workplaceType}=require('../src/sources/hh.cjs');
const {collectSources,normalizeFeed,validateSources,sourceId,fetchFeed}=require('../src/sources/catalog.cjs');
const {settings,runMulti,buildMultiWorkflow,validateEnvelope}=require('../scripts/multi-collector.cjs');
const {prepareVacancyUpsert}=require('../src/storage/prepare-vacancy-upsert.cjs');
const {createAnalyzer}=require('../src/language/analyzer.cjs');
const {classifyRole}=require('../src/matching/role-and-geography.cjs');
const {renderCatalog}=require('../src/reports/catalog-preview.cjs');
const fixture=require('./fixtures/hh-vacancy.json');const profile=require('../config/search-profile.json');
const source={provider:'hh',board:'search',company:'hh.ru',enabled:true,search:{queries:['Product Manager'],periodDays:14,perPage:2,maxPages:2,maxVacancies:10}};
const gh={provider:'greenhouse',board:'fixture',company:'GH fixture',enabled:true};
const hh={token:'SYNTHETIC-HH-TOKEN',userAgent:'JobRadar/0.8.0 (test@example.test)'};
const at='2026-11-05T12:00:00.000Z';
const job=(id=fixture.id,extra={})=>({...structuredClone(fixture),id,alternate_url:'https://hh.ru/vacancy/'+id,...extra});
const ok=data=>({ok:true,status:200,json:async()=>data});
const page=(ids,{number=0,found=ids.length,pages=Math.ceil(found/2)}={})=>({items:ids.map(id=>({id,url:'https://untrusted.example/never-follow',snippet:{requirement:'Search snippets are not full descriptions'}})),page:number,per_page:2,found,pages});
const options=fetchImpl=>({fetchImpl,hh,sleep:async()=>{}});
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jr-hh-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('HH activation is explicit and local; one stable source across queries and employer changes',()=>{
 assert.equal(settings({}).sources.some(s=>s.provider==='hh'),false);
 const enabled=settings({JR_HH_ENABLED:'1',JR_HH_ACCESS_TOKEN:hh.token});assert.equal(enabled.sources.filter(s=>s.provider==='hh').length,1);assert.equal(enabled.hh.token,hh.token);
 assert.equal(JSON.stringify(enabled.sources).includes(hh.token),false);
 assert.throws(()=>settings({JR_HH_ENABLED:'yes'}),/INVALID_HH_ENABLED/);
 assert.throws(()=>validateSources({version:1,sources:[source,{...source,search:{...source.search,queries:['other']}}]}),/DUPLICATE_SOURCE/);
 const a=normalizeFeed(source,{jobs:[job()]},at,profile).rows[0];
 const b=normalizeFeed({...source,search:{...source.search,queries:['другая роль']}},{jobs:[job(fixture.id,{employer:{name:'Renamed'}})]},at,profile).rows[0];
 assert.equal(a.vacancy_id,'hh_search_910001');assert.equal(b.vacancy_id,a.vacancy_id);assert.equal(sourceId(source),'hh_search');
});
test('HH configuration rejects unknown URL/auth/filter keys and unbounded requests',()=>{
 for(const extra of [{board:'employer'},{url:'https://example.test'},{token:'secret'},{search:{...source.search,perPage:101}},{search:{...source.search,maxPages:6}},{search:{...source.search,maxVacancies:0}},{search:{...source.search,queries:['a','a']}},{search:{...source.search,areaIds:['../1']}},{search:{...source.search,language:'ru'}},{search:{...source.search,workFormat:['anything']}}])assert.throws(()=>validateSources({version:1,sources:[{...source,...extra}]}),/JR_INVALID_HH/);
 const u=new URL(searchUrl({...source,search:{...source.search,queries:['Product & Growth'],areaIds:['1','2'],workFormat:['REMOTE']}},0,1));
 assert.equal(u.origin,'https://api.hh.ru');assert.equal(u.pathname,'/vacancies');assert.equal(u.searchParams.get('text'),'Product & Growth');assert.equal(u.searchParams.get('search_field'),'name');assert.deepEqual(u.searchParams.getAll('area'),['1','2']);assert.equal(u.searchParams.get('work_format'),'REMOTE');
 assert.equal(new URL(searchUrl(source)).searchParams.has('area'),false);assert.equal(new URL(searchUrl(source)).searchParams.has('work_format'),false);
});
test('HH needs explicit token and contact header before any network request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not fetch');};
 for(const auth of [undefined,{userAgent:hh.userAgent},{token:'bad\r\nheader',userAgent:hh.userAgent},{token:hh.token}])await assert.rejects(fetchHH(source,{...options(fetchImpl),hh:auth}),/JR_HH_(ACCESS_TOKEN|USER_AGENT)_REQUIRED/);
 assert.equal(calls,0);
});
test('HH paginates and deduplicates queries; only full detail at fixed origin reaches normalization',async()=>{
 const configured={...source,search:{...source.search,queries:['Product Manager','продакт']}};const requests=[];const delays=[];
 const result=await fetchFeed(configured,{hh,sleep:async ms=>delays.push(ms),fetchImpl:async(raw,o)=>{
  const url=new URL(raw);requests.push(raw);assert.equal(url.origin,'https://api.hh.ru');assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,'Bearer '+hh.token);assert.equal(o.headers['HH-User-Agent'],hh.userAgent);assert.equal(o.headers['X-N8N-API-KEY'],undefined);assert.ok(o.signal instanceof AbortSignal);
  if(url.pathname!=='/vacancies')return ok(job(url.pathname.split('/').pop()));
  if(url.searchParams.get('text')==='продакт')return ok(page(['910001','910003']));
  return ok(url.searchParams.get('page')==='0'?page(['910001','910002'],{found:3,pages:2}):page(['910003'],{number:1,found:3,pages:2}));
 }});
 assert.equal(requests.length,6);assert.equal(delays.length,5);assert.ok(delays.every(ms=>ms===250));assert.equal(result.jobs.length,3);assert.equal(result.coverage.unique_candidates,3);assert.equal(result.coverage.complete,true);assert.ok(result.jobs.every(j=>j.description===fixture.description));
 const n=normalizeFeed(configured,result,at,profile);assert.equal(n.rows.length,3);assert.equal(n.rows[0].company,fixture.employer.name);assert.equal(n.rows[0].source,'HeadHunter');assert.equal(n.rows[0].published_at,fixture.published_at);assert.equal(n.rows[0].updated_at,'');assert.equal(n.rows[0].language,'Unknown');assert.equal(n.catalog[0].language_analysis.team_languages[0].language,'ru');assert.equal(n.catalog[0].geography.status,'review');
});
test('detail budget interleaves queries and reports bounded coverage, without dropping other sources',async()=>{
 const s={...source,search:{...source.search,queries:['first','second'],maxPages:1,maxVacancies:2}};const details=[];
 const c=await collectSources([s,gh],profile,{...options(async raw=>{const u=new URL(raw);if(u.hostname!=='api.hh.ru')return ok({jobs:[{id:1,title:'Product Manager'}]});if(u.pathname!=='/vacancies'){const id=u.pathname.split('/').pop();details.push(id);return ok(job(id));}return ok(page(u.searchParams.get('text')==='first'?['101','102']:['201','202'],{found:6,pages:3}));}),observedAt:at});
 assert.deepEqual(details,['101','201']);assert.equal(c.sources[0].status,'passed');assert.equal(c.sources[0].coverage.truncated,true);assert.equal(c.sources[0].coverage.complete,false);assert.equal(c.sources[1].status,'passed');assert.equal(c.rows.length,3);
 const html=renderCatalog(c);assert.ok(html.includes('неполная выборка'));assert.ok(html.includes('Поиск за 14 дн.'));assert.ok(!JSON.stringify(c).includes(hh.token));
});
test('empty search is success; 404/archived detail is skipped without fabricating closure',async()=>{
 let calls=0;const empty=await fetchHH(source,options(async()=>{calls++;return ok(page([]));}));assert.equal(calls,1);assert.equal(empty.coverage.complete,true);assert.deepEqual(empty.jobs,[]);
 const result=await fetchHH(source,options(async raw=>{const u=new URL(raw);if(u.pathname==='/vacancies')return ok(page(['101','102']));return u.pathname.endsWith('/101')?{ok:false,status:404}:ok({id:'102',archived:true});}));
 assert.equal(result.coverage.unavailable,1);assert.equal(result.coverage.archived,1);assert.equal(result.coverage.complete,false);assert.deepEqual(normalizeFeed(source,result,at,profile).rows,[]);
});
test('changing/repeating search pages and inconsistent totals remain explicitly incomplete',async()=>{
 for(const second of [page(['101','102'],{number:1,found:4,pages:2}),page(['103'],{number:1,found:3,pages:2})]) {
  const r=await fetchHH(source,options(async raw=>{const u=new URL(raw);if(u.pathname!=='/vacancies')return ok(job(u.pathname.split('/').pop()));return ok(u.searchParams.get('page')==='0'?page(['101','102'],{found:4,pages:2}):second);}));
  assert.equal(r.coverage.complete,false);assert.equal(r.coverage.truncated,true);
 }
});
test('malformed search/detail fails source, including mismatched ID and missing full text',async()=>{
 for(const result of [{items:null},{...page(['101']),page:1},{...page(['101']),per_page:100},{...page(['101']),found:0},page(['../evil'])])await assert.rejects(fetchHH(source,options(async()=>ok(result))),/JR_HH_INVALID_SEARCH_PAGE/);
 for(const detail of [job('102'),job('101',{description:null}),job('101',{archived:'false'}),job('101',{published_at:'bad'}),job('101',{alternate_url:'https://evil.test/vacancy/101'}),job('101',{work_format:{id:'REMOTE'}})])await assert.rejects(fetchHH(source,options(async raw=>ok(new URL(raw).pathname==='/vacancies'?page(['101']):detail))),/JR_HH_INVALID/);
});
test('HH retries only bounded safe GET failures and never leaks server bodies or credentials',async()=>{
 for(const status of [400,401,403]) {
  let calls=0;const result=await collectSources([source,gh],profile,{...options(async raw=>{if(!raw.startsWith('https://api.hh.ru/'))return ok({jobs:[]});calls++;return {ok:false,status,json:async()=>({error:hh.token,captcha_url:'private'})};})});
  assert.equal(calls,1);assert.equal(result.sources[0].error,'JR_SOURCE_HTTP_'+status);assert.equal(result.sources[1].status,'passed');assert.ok(!JSON.stringify(result).includes(hh.token));assert.ok(!JSON.stringify(result).includes('captcha_url'));
 }
 let calls=0;const r=await fetchHH(source,options(async()=>++calls===1?{ok:false,status:503}:ok(page([]))));assert.equal(calls,2);assert.equal(r.coverage.complete,true);
 calls=0;await assert.rejects(fetchHH(source,options(async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '60'}};})),/429/);assert.equal(calls,1);
 calls=0;await assert.rejects(fetchHH(source,options(async()=>{calls++;throw Error(hh.token);})),/JR_SOURCE_TRANSPORT/);assert.equal(calls,2);
 calls=0;await assert.rejects(fetchHH(source,{...options(async()=>{calls++;}),deadline:Date.now()-1}),/DEADLINE/);assert.equal(calls,0);
 calls=0;await assert.rejects(fetchHH(source,options(async()=>{calls++;return {ok:true,json:async()=>{throw Error(hh.token);}};})),/INVALID_JSON/);assert.equal(calls,1);
});
test('HH work format is structured, mixed/unknown modes need review; locale is not team language',()=>{
 for(const [ids,expected] of [[['REMOTE'],'remote'],[['ON_SITE'],'on-site'],[['HYBRID'],'hybrid'],[['REMOTE','ON_SITE'],'Unknown'],[['NEW_MODE'],'Unknown']])assert.equal(workplaceType(job('101',{work_format:ids.map(id=>({id}))})),expected);
 assert.equal(workplaceType(job('101',{work_format:null,schedule:{id:'remote'}})),'remote');
 const c=normalizeFeed(source,{jobs:[job('101',{description:'Работа с продуктом.',work_format:[],language:'ru'})]},at,profile).catalog[0];
 assert.equal(c.geography.visibility,'unclear');assert.deepEqual(c.language_analysis.team_languages,[]);
 for(const title of ['Менеджер продукта','Директор по продукту','Руководитель продукта','Продакт-менеджер'])assert.equal(classifyRole(title).matched,true,title);
 for(const title of ['Продакт-дизайнер','Продуктовый аналитик','Менеджер по продуктовому маркетингу'])assert.equal(classifyRole(title).matched,false,title);
});
test('HH uses existing language cache, personal matching and CRM whitelist without overwriting manual fields',async()=>{
 const engine=createAnalyzer(),language={engine,sheets:true};
 const first=await collectSources([source],profile,{loadFeed:async()=>({jobs:[job()]}),observedAt:at,language});
 const second=await collectSources([source],profile,{loadFeed:async()=>({jobs:[job()]}),observedAt:'2026-11-06T12:00:00.000Z',language});
 assert.equal(engine.stats.cache_hits,1);assert.equal(first.catalog[0].matching.language_fit.team_preference,'preferred');
 const incoming=second.rows[0];assert.equal(incoming.language,'Unknown');assert.equal(JSON.parse(incoming.language_analysis).team_languages[0].language,'ru');
 const stored={...first.rows[0],first_seen_at:at,notes:'Keep me',review_status:'reviewed'};
 const update=prepareVacancyUpsert([incoming],[stored])[0];assert.equal(update.first_seen_at,undefined);assert.equal(update.notes,undefined);assert.equal(update.review_status,undefined);assert.equal(update.last_seen_at,'2026-11-06T12:00:00.000Z');
 const runId='a'.repeat(24),payload={runId,total:second.total,rows:second.rows,sources:second.sources};assert.equal(validateEnvelope(payload,runId,true).rows.length,1);
 const workflow=buildMultiWorkflow({N8N_API_KEY:'synthetic',N8N_GOOGLE_CREDENTIAL_ID:'test',JR_TEST_SPREADSHEET_ID:'TEST',JR_PRODUCTION_SPREADSHEET_ID:'PROD',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies',JR_LANGUAGE_SHEETS:'1'},runId,{test:true});
 const code=workflow.nodes.find(n=>n.name==='Code in JavaScript').parameters.jsCode;
 const out=vm.runInNewContext('(function(){'+code+'})()',{$input:{first:()=>({json:{body:payload}})}});assert.equal(out[0].json.rows[0].vacancy_id,incoming.vacancy_id);
});
test('main runner carries HH auth only to HH and coverage through n8n completion, next run updates same ID',async t=>{
 const dir=temp(t),configFile=path.join(dir,'sources.json');fs.writeFileSync(configFile,JSON.stringify({version:1,sources:[source,gh]}));
 const env={N8N_API_KEY:'synthetic-n8n',N8N_GOOGLE_CREDENTIAL_ID:'test',JR_TEST_SPREADSHEET_ID:'TEST',JR_PRODUCTION_SPREADSHEET_ID:'PROD',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies',JR_SOURCES_FILE:configFile,JR_HH_ACCESS_TOKEN:hh.token,JR_HH_USER_AGENT:hh.userAgent};
 let prior=false,payload;const stored=new Map();
 const fetchImpl=async(url,o)=>{
  assert.equal(o.headers.Authorization,undefined);assert.ok(!String(o.body).includes(hh.token));
  if(url.endsWith('/api/v1/workflows')&&o.method==='POST')return ok({id:'own'});
  if(url.includes('/webhook/')) {
   payload=JSON.parse(o.body);validateEnvelope(payload,payload.runId);
   const writes=prepareVacancyUpsert(payload.rows,[...stored.values()]);for(const row of writes)stored.set(row.vacancy_id,{...stored.get(row.vacancy_id),...row});
   const sources=payload.sources.map(s=>({...s,inserted:prior?0:s.matched,updated:prior?s.matched:0}));
   return ok({ok:true,runId:payload.runId,total:payload.total,matched:payload.rows.length,inserted:prior?0:payload.rows.length,updated:prior?payload.rows.length:0,sources});
  }
  return ok({data:[]});
 };
 const sourceFetchImpl=async(url,o)=>{
  assert.equal(o.headers['X-N8N-API-KEY'],undefined);
  if(!url.startsWith('https://api.hh.ru/')){assert.equal(o.headers.Authorization,undefined);return ok({jobs:[]});}
  assert.equal(o.headers.Authorization,'Bearer '+hh.token);return ok(new URL(url).pathname==='/vacancies'?page([fixture.id]):job());
 };
 const first=await runMulti(env,{dir,fetchImpl,sourceFetchImpl,sleep:async()=>{}});assert.equal(first.status,'passed');assert.equal(first.counts.inserted,1);assert.equal(first.sourceResults[0].coverage.complete,true);
 const original=stored.get('hh_search_910001');original.notes='preserve';original.review_status='reviewed';prior=true;
 const second=await runMulti(env,{dir,fetchImpl,sourceFetchImpl,sleep:async()=>{}});assert.equal(second.status,'passed');assert.equal(second.counts.updated,1);assert.equal(stored.size,1);assert.equal(stored.get(original.vacancy_id).notes,'preserve');assert.equal(stored.get(original.vacancy_id).first_seen_at,original.first_seen_at);
 assert.ok(!JSON.stringify(payload).includes(hh.token));assert.equal(second.lockRetained,false);
});
test('repeated synthetic collector runs execute the original test-sheet guard with HH rows present',async t=>{
 const dir=temp(t),stored=[];let workflow;
 const env={N8N_API_KEY:'synthetic',N8N_GOOGLE_CREDENTIAL_ID:'test',JR_TEST_SPREADSHEET_ID:'TEST',JR_PRODUCTION_SPREADSHEET_ID:'PROD',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies'};
 const fetchImpl=async(url,o)=>{
  if(url.endsWith('/api/v1/workflows')&&o.method==='POST'){workflow=JSON.parse(o.body);return ok({id:'own'});}
  if(url.includes('/webhook/')) {
   const p=JSON.parse(o.body),guard=workflow.nodes.find(n=>n.name==='Guard test sheet').parameters.jsCode;
   vm.runInNewContext('(function(){'+guard+'})()',{$input:{all:()=>stored.map(json=>({json}))}});
   stored.push(...p.rows);assert.ok(p.rows.every(r=>r.company==='JobRadar TEST'&&r.original_url.startsWith('https://example.test/')));
   return ok({ok:true,runId:p.runId,total:p.total,matched:4,inserted:4,updated:0,sources:p.sources.map(s=>({...s,inserted:s.matched,updated:0}))});
  }
  return ok({data:[]});
 };
 for(let i=0;i<2;i++){const r=await runMulti(env,{dir,test:true,fetchImpl,sourceFetchImpl:()=>{throw Error('No live requests');}});assert.equal(r.status,'passed');assert.equal(r.counts.inserted,4);}
 assert.equal(stored.length,8);assert.equal(stored.filter(r=>r.source==='HeadHunter').length,2);
});
