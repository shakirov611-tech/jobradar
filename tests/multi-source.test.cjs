const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');
const {classifyRole,classifyGeography}=require('../src/matching/role-and-geography.cjs');
const {validateSources,sourceId,normalizeFeed,collectSources,fetchFeed}=require('../src/sources/catalog.cjs');
const {validateEnvelope,buildMultiWorkflow,runMulti,settings}=require('../scripts/multi-collector.cjs');
const {renderCatalog}=require('../src/reports/catalog-preview.cjs');const {status}=require('../scripts/run-collector.cjs');
const profile=require('../config/search-profile.json');const at='2026-10-29T12:00:00.000Z';
const gh={provider:'greenhouse',board:'airbnb',company:'Airbnb',enabled:true};const lever={provider:'lever',board:'test',company:'Lever Test',region:'global',enabled:true};
const job={id:123,title:'Product Manager',absolute_url:'https://example.test/123',content:'Description',location:{name:'Remote - United States'},metadata:null};
const lj={id:'01234567-89ab-cdef-0123-456789abcdef',text:'Product Owner',categories:{location:'Remote - Europe'},hostedUrl:'https://example.test/lever',description:'D',workplaceType:'remote'};
const env={N8N_API_KEY:'SECRET_KEY',N8N_GOOGLE_CREDENTIAL_ID:'CRED',JR_TEST_SPREADSHEET_ID:'TEST',JR_PRODUCTION_SPREADSHEET_ID:'PRODUCTION',JR_TEST_SHEET_NAME:'JR_TEST_Vacancies'};
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jr-multi-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('source configuration has multiple active companies and two providers, no arbitrary URL input',()=>{
 const ss=settings({}).sources;assert.ok(ss.length>=5);assert.equal(new Set(ss.map(x=>x.provider)).size,2);assert.equal(new Set(ss.map(sourceId)).size,ss.length);
 assert.throws(()=>validateSources({version:1,sources:[gh,gh]}),/DUPLICATE/);assert.throws(()=>validateSources({version:1,sources:[{...gh,board:'../evil'}]}));assert.throws(()=>validateSources({version:1,sources:[{...gh,enabled:false}]}));
});
test('normalization keeps the Airbnb key and distinguishes boards/providers and null metadata',()=>{
 const a=normalizeFeed(gh,{jobs:[job]},at,profile).rows[0];assert.equal(a.vacancy_id,'greenhouse_airbnb_123');assert.equal(a.workplace_type,'Unknown');assert.equal(a.last_seen_at,at);
 assert.equal(normalizeFeed({...gh,board:'other'},{jobs:[job]},at,profile).rows[0].vacancy_id,'greenhouse_other_123');
 const l=normalizeFeed(lever,[lj],at,profile).rows[0];assert.equal(l.source,'Lever');assert.equal(l.vacancy_id,'lever_test_'+lj.id);assert.equal(Object.hasOwn(l,'notes'),false);assert.equal(Object.hasOwn(l,'first_seen_at'),false);
 assert.notEqual(sourceId(lever),sourceId({...lever,region:'eu'}));
});
test('all feed entries validate before filtering; duplicate IDs and malformed feeds fail source',()=>{
 for(const feed of [{jobs:null},{jobs:[job,{title:'Chef'}]},{jobs:[job,job]},{jobs:[{...job,metadata:{}}]}])assert.throws(()=>normalizeFeed(gh,feed,at,profile));
 assert.throws(()=>normalizeFeed(lever,[{...lj,id:'bad'}],at,profile));assert.equal(normalizeFeed(gh,{jobs:[]},at,profile).total,0);
});
test('role benchmark admits missed leadership titles and excludes construction project and adjacent functions',()=>{
 for(const title of ['Head of Growth','Director of Product','VP, Product','Group Product Manager','Growth Product Manager','Technical Program Manager','Product Owner','Руководитель продукта'])assert.equal(classifyRole(title).matched,true,title);
 for(const title of ['Construction Project Manager','Civil Project Manager','Head of Product Design','Product Marketing Manager','Software Engineer'])assert.equal(classifyRole(title).matched,false,title);
 assert.equal(classifyRole('Project Manager').reason,'delivery_domain_needs_review');assert.equal(classifyRole('Product Manager, Construction Software').matched,true);
});
test('remote is not country eligibility; regional and unknown scope remain review',()=>{
 assert.equal(classifyGeography('Remote - USA','remote',profile).status,'restricted');
 assert.equal(classifyGeography('Remote','remote',profile).status,'review');assert.equal(classifyGeography('EMEA','remote',profile).status,'review');
 const bg=classifyGeography('Bulgaria','remote',profile);assert.equal(bg.status,'plausible');assert.equal(bg.workAuthorization,'unknown');assert.equal(bg.teamLanguage,'unknown');
 assert.equal(classifyGeography('Europe','on-site',profile).status,'restricted');
});
test('Lever reader paginates GET only, rejects truncated pagination rather than declaring success',async()=>{
 const urls=[];let page=0;const result=await fetchFeed(lever,{fetchImpl:async(url,options)=>{urls.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return {ok:true,json:async()=>++page===1?Array.from({length:100},(_,i)=>({id:i})):[]};}});assert.equal(result.length,100);assert.ok(urls[1].includes('skip=100'));
 let calls=0;await assert.rejects(fetchFeed(lever,{fetchImpl:async()=>({ok:true,json:async()=>{calls++;return Array(100).fill({});}})}),/PAGE_LIMIT/);assert.equal(calls,10);
});
test('source failure is isolated; report separates role matches from raw total and geography',async()=>{
 const sources=validateSources({version:1,sources:[gh,lever]});const c=await collectSources(sources,profile,{observedAt:at,loadFeed:async s=>{if(s.provider==='lever')throw Error('secret payload');return {jobs:[job,{...job,id:456,title:'Chef'}]};}});
 assert.equal(c.sources[0].total,2);assert.equal(c.sources[0].matched,1);assert.equal(c.sources[0].geography.restricted,1);assert.equal(c.sources[1].status,'failed');assert.equal(c.sources[1].error,'JR_SOURCE_FAILED');assert.equal(c.catalog.length,2);assert.equal(c.rows.length,1);
});
test('embedded envelope rejects cross-source/manual fields and prefix collisions before writing',()=>{
 const a=normalizeFeed(gh,{jobs:[job]},at,profile).rows[0];const p={runId:'x',total:1,rows:[a],sources:[{sourceId:'greenhouse_airbnb',status:'passed',total:1,matched:1}]};assert.equal(validateEnvelope(p,'x').rows.length,1);
 assert.throws(()=>validateEnvelope({...p,rows:[{...a,notes:'overwrite'}]},'x'),/UNOWNED/);assert.throws(()=>validateEnvelope({...p,rows:[{...a,vacancy_id:'greenhouse_other_123'}]},'x'),/SOURCE_ROW/);
 assert.throws(()=>validateEnvelope(p,'wrong'));assert.throws(()=>validateEnvelope({...p,sources:[{...p.sources[0],matched:0}]},'x'),/SOURCE_ROW/);
 const deep={...p,rows:[{...a,vacancy_id:'greenhouse_airbnb_extra_123'}],sources:[{sourceId:'greenhouse_airbnb_extra',status:'passed',total:1,matched:1}]};assert.equal(validateEnvelope(deep,'x').rows.length,1);
});
test('multi-workflow executes exact envelope code and attributes source counts after preparation',()=>{
 const runId='a'.repeat(24),w=buildMultiWorkflow(env,runId);const row=normalizeFeed(gh,{jobs:[job]},at,profile).rows[0];const feed={runId,total:1,rows:[row],sources:[{sourceId:'greenhouse_airbnb',status:'passed',total:1,matched:1}]};
 const normalize=w.nodes.find(n=>n.name==='Code in JavaScript');assert.ok(normalize.parameters.jsCode.includes(validateEnvelope.toString()));
 const out=vm.runInNewContext('(function(){'+normalize.parameters.jsCode+'})()',{$input:{first:()=>({json:{body:feed}})}});assert.equal(out[0].json.rows[0].vacancy_id,row.vacancy_id);
 const code=w.nodes.find(n=>n.name==='Collection result').parameters.jsCode;
 const result=vm.runInNewContext('(function(){'+code+'})()',{$:name=>name==='Code in JavaScript'?{first:()=>({json:out[0].json})}:{all:()=>[{json:{...row,first_seen_at:at}}]}});
 assert.equal(result[0].json.sources[0].inserted,1);assert.equal(result[0].json.updated,0);
 assert.equal(w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'),false);
});
function fakeApi({mismatch=false}={}) {
 let creates=0,payload;
 const fetchImpl=async(url,options)=>{
  const response=json=>({ok:true,status:200,json:async()=>json});
  if(url.endsWith('/api/v1/workflows')&&options.method==='POST'){creates++;return response({id:'own'});}
  if(url.includes('/webhook/')){payload=JSON.parse(options.body);const sources=payload.sources.map(s=>({...s,inserted:s.matched,updated:0}));if(mismatch)sources[0].matched++;
   return response({ok:true,runId:payload.runId,total:payload.total,matched:payload.rows.length,inserted:payload.rows.length,updated:0,sources});}
  return response({data:[]});
 };
 return {fetchImpl,get creates(){return creates;},get payload(){return payload;}};
}
const upstream=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(Object.hasOwn(options.headers,'X-N8N-API-KEY'),false);return {ok:true,json:async()=>url.includes('lever.co')?[lj]:{jobs:[job]}};};
test('multi runner writes configured sources under existing lock and persists full catalog, no test writes to production',async t=>{
 const dir=temp(t),api=fakeApi();const r=await runMulti(env,{dir,fetchImpl:api.fetchImpl,sourceFetchImpl:upstream});assert.equal(r.status,'passed');assert.equal(r.sourceResults.length,settings({}).sources.length);assert.equal(status(dir).lock,null);assert.ok(fs.existsSync(path.join(dir,r.catalogFile)));assert.ok(fs.existsSync(path.join(dir,'preview.html')));assert.equal(r.counts.matched,r.sourceResults.length);
 const testApi=fakeApi();const tr=await runMulti(env,{dir,fetchImpl:testApi.fetchImpl,test:true,sourceFetchImpl:async()=>{throw Error('test must not call upstream');}});assert.equal(tr.status,'passed');assert.equal(tr.counts.inserted,3);assert.ok(testApi.payload.rows.every(x=>x.company==='JobRadar TEST'&&x.original_url.startsWith('https://example.test/')));
 assert.equal(status(dir).lastSuccessfulProduction.runId,r.runId);
});
test('partial source outage confirms successful writes, releases lock and preserves previous full success',async t=>{
 const dir=temp(t);const good=await runMulti(env,{dir,fetchImpl:fakeApi().fetchImpl,sourceFetchImpl:upstream});
 const partial=await runMulti(env,{dir,fetchImpl:fakeApi().fetchImpl,sourceFetchImpl:async(url,options)=>url.includes('/pandadoc/')?{ok:false,status:404}:upstream(url,options)});
 assert.equal(partial.status,'partial');assert.equal(partial.lockRetained,false);assert.equal(status(dir).lock,null);assert.equal(status(dir).lastSuccessfulProduction.runId,good.runId);assert.equal(partial.sourceResults.find(x=>x.sourceId==='greenhouse_pandadoc').status,'failed');
});
test('all source failures do not create workflow or write; invalid receipt retains lock',async t=>{
 const dir=temp(t),api=fakeApi();const fail=await runMulti(env,{dir,fetchImpl:api.fetchImpl,sourceFetchImpl:async()=>({ok:false,status:404})});assert.equal(fail.status,'failed');assert.equal(fail.stage,'sources');assert.equal(api.creates,0);assert.equal(status(dir).lock,null);
 const bad=fakeApi({mismatch:true});const unknown=await runMulti(env,{dir,fetchImpl:bad.fetchImpl,sourceFetchImpl:upstream});assert.equal(unknown.status,'failed');assert.equal(unknown.lockRetained,true);assert.equal(Object.hasOwn(unknown,'counts'),false);
});
test('local catalog renderer escapes upstream HTML and rejects unsafe links',()=>{
 const n=normalizeFeed(gh,{jobs:[{...job,title:'Product Manager <script>alert(1)</script>',absolute_url:'javascript:alert(1)'}]},at,profile);
 const html=renderCatalog({observedAt:at,total:1,rows:n.rows,catalog:n.catalog,sources:[]});assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('href="javascript:'),false);assert.equal(html.includes('<script>alert(1)</script>'),false);
});
test('explicit incomplete Greenhouse totals fail rather than masquerading as a complete board',()=>{
 assert.throws(()=>normalizeFeed(gh,{jobs:[job],meta:{total:2}},at,profile),/INCOMPLETE/);assert.equal(normalizeFeed(gh,{jobs:[job],meta:{total:1}},at,profile).total,1);
});
test('read retry is bounded and respects long Retry-After; invalid JSON is not retried',async()=>{
 let calls=0;const delays=[];await fetchFeed(gh,{sleep:async ms=>delays.push(ms),fetchImpl:async()=>++calls===1?{ok:false,status:503}:{ok:true,json:async()=>({jobs:[]})}});assert.equal(calls,2);assert.equal(delays.length,1);
 calls=0;await assert.rejects(fetchFeed(gh,{sleep:async()=>{},fetchImpl:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '60'}};}}),/429/);assert.equal(calls,1);
 calls=0;await assert.rejects(fetchFeed(gh,{fetchImpl:async()=>{calls++;return {ok:true,json:async()=>{throw Error('bad json');}};}}),/INVALID_JSON/);assert.equal(calls,1);
});
