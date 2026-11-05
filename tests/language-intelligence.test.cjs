const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const vm=require('node:vm');
const config=require('../config/language-analysis.json');const profile=require('../config/search-profile.json');
const {languageInput,rulesAnalysis,createAnalyzer,createMockProvider,createOpenAIProvider}=require('../src/language/analyzer.cjs');
const {hash,validateAnalysis,validatePreferences,emptyAnalysis}=require('../src/language/contract.cjs');
const {languageFit,sourcePriorities}=require('../src/language/personalize.cjs');
const {profileFingerprint,validateProfile}=require('../src/matching/profile.cjs');
const {collectSources,normalizeFeed}=require('../src/sources/catalog.cjs');
const {buildMultiWorkflow,validateEnvelope,runMulti}=require('../scripts/multi-collector.cjs');
const {verifyLanguageRows}=require('../src/language/sheets.cjs');
const {languageRuntime}=require('../scripts/language-runtime.cjs');
const {renderCatalog}=require('../src/reports/catalog-preview.cjs');
const {buildReview}=require('../src/matching/review.cjs');
const at='2026-11-04T10:00:00.000Z';
const source={provider:'greenhouse',board:'fixture',company:'Fixture',enabled:true};
const input=text=>languageInput('Senior Product Manager',text);
const analyze=text=>rulesAnalysis(input(text),{now:at});
const aiConfig={...config,provider:'openai',model:'test-model'};
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jr-language-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
function teamData(text,language='ru',basis='explicit'){return {...emptyAnalysis(),team_languages:[{language,basis,confidence:basis==='explicit'?'high':'medium',evidence:{field:'description',quote:text}}]};}
function collected(text,options={}){return collectSources([source],profile,{observedAt:at,loadFeed:async()=>({jobs:[{id:1,title:'Senior Product Manager',content:text,location:{name:'Remote'}}]}),...options});}
test('English posting with Russian team keeps posting and team separate',()=>{
 const a=analyze('We build the platform and you will work with our team. Our team communicates in Russian.');
 assert.equal(a.posting_language,'en');assert.equal(a.team_languages[0].language,'ru');assert.equal(a.language_analysis_status,'completed');
});
test('Russian posting with English team does not copy publication to team',()=>{
 const a=analyze('Мы развиваем продукт для бизнеса. Наша команда ценит опыт работы. English is our working language.');
 assert.equal(a.posting_language,'ru');assert.equal(a.team_languages[0].language,'en');
});
test('customer proficiency, company culture, geography and negation never imply team language',()=>{
 for(const text of ['Russian proficiency is required for customers.','Our Russian customers need help.','Our company was founded in Russia.','Our team does not communicate in Russian.','Russian is our company language.','English is the working language of our company.'])assert.deepEqual(analyze(text).team_languages,[],text);
 const a=analyze('Russian proficiency is required for customers.');assert.equal(a.required_languages[0].scope,'customer');assert.equal(a.required_languages[0].mandatory,true);
});
test('unknown team is review, multiple explicit team languages are preserved',()=>{
 const a=analyze('We build software.');assert.equal(a.language_analysis_status,'needs_review');assert.equal(languageFit(a,profile).team_preference,'unknown');
 assert.deepEqual(analyze('Our team communicates in Russian and English.').team_languages.map(x=>x.language).sort(),['en','ru']);
});
test('C1 mandatory versus A2 mismatches; optional and OR alternatives never hard exclude',()=>{
 assert.equal(languageFit(analyze('English C1 is required.'),profile).requirements,'mismatch');
 for(const text of ['English C1 is preferred.','English or German is required.','English is not required.'])assert.notEqual(languageFit(analyze(text),profile).requirements,'mismatch',text);
 assert.equal(analyze('English C1 is preferred.').required_languages[0].mandatory,false);
 assert.equal(languageFit(analyze('Fluent in English is required.'),profile).requirements,'unknown');
});
test('meets, unknown candidate level and no requirements are different states',()=>{
 const a=analyze('English A2 is required.');assert.equal(languageFit(a,profile).requirements,'meets');
 const p=structuredClone(profile);p.language_preferences.candidate_languages=[];assert.equal(languageFit(a,p).requirements,'unknown');assert.equal(languageFit(analyze('No requirements stated.'),p).requirements,'unknown');
});
test('language aliases and preferences are data-driven, not a Russian allowlist',()=>{
 const c={...config,aliases:{...config.aliases,nl:['Dutch']}};const a=rulesAnalysis(input('Our team communicates in Dutch.'),{config:c});
 const p=structuredClone(profile);p.language_preferences.preferred_team_languages=[{language:'nl',weight:1}];p.matching.preferredTeamLanguages=['nl'];
 validateProfile(p);assert.equal(languageFit(a,p).team_preference,'preferred');
 assert.throws(()=>validatePreferences({...p.language_preferences,preferred_team_languages:[{language:'nl',weight:2}]}));
 assert.throws(()=>validatePreferences({...p.language_preferences,candidate_languages:[{language:'en',level:'advanced'}]}));
});
test('same vacancy, two users: shared analysis stays equal, fit and fingerprint change',async()=>{
 const first=await collected('Our team communicates in Russian.');const p=structuredClone(profile);p.language_preferences.preferred_team_languages=[{language:'de',weight:1}];
 const a=first.catalog[0].language_analysis;const before=JSON.stringify(a);assert.equal(languageFit(a,profile).team_preference,'preferred');assert.equal(languageFit(a,p).team_preference,'other');assert.equal(JSON.stringify(a),before);assert.notEqual(profileFingerprint(p),profileFingerprint(profile));
 const old={...profile};delete old.language_preferences;assert.notEqual(profileFingerprint(old),profileFingerprint(profile));
});
test('durable cache prevents duplicate AI calls across runs/users; description and version invalidate',async t=>{
 const dir=temp(t),text='Our team communicates in Russian.',i=input(text);let calls=0;
 const provider=createMockProvider(()=>{calls++;return teamData(text);});
 const a=createAnalyzer({config:aiConfig,cacheDir:dir,provider});await Promise.all([a.analyze(i),a.analyze(i)]);assert.equal(calls,1);
 const b=createAnalyzer({config:aiConfig,cacheDir:dir,provider});await b.analyze(i);assert.equal(calls,1);assert.equal(b.stats.cache_hits,1);
 await b.analyze(input(text+' New description.'));assert.equal(calls,2);
 await createAnalyzer({config:aiConfig,cacheDir:dir,provider,version:'language-v2'}).analyze(i);assert.equal(calls,3);
 await createAnalyzer({config:{...aiConfig,model:'another-model'},cacheDir:dir,provider}).analyze(i);assert.equal(calls,4);
});
test('input hash includes description beyond preview limits and posting metadata',()=>{
 assert.notEqual(hash(input('x'.repeat(130000))),hash(input('x'.repeat(130000)+'tail')));
 assert.notEqual(hash(languageInput('t','d','en')),hash(languageInput('t','d','ru')));
});
test('operational budget changes reuse cached analysis; rules changes invalidate it',async t=>{
 const dir=temp(t),text='Our team communicates in Russian.';let calls=0;const provider=createMockProvider(()=>{calls++;return teamData(text);});
 await createAnalyzer({config:aiConfig,cacheDir:dir,provider}).analyze(input(text));
 await createAnalyzer({config:{...aiConfig,max_ai_calls_per_run:30,timeout_ms:1000},cacheDir:dir,provider}).analyze(input(text));assert.equal(calls,1);
 await createAnalyzer({config:{...aiConfig,aliases:{...aiConfig.aliases,nl:['Dutch']}},cacheDir:dir,provider}).analyze(input(text));assert.equal(calls,2);
});
test('inferred team signals remain review with lower boost; zero weights are neutral',async()=>{
 const text='Team meetings include documents translated from German.';
 const engine=createAnalyzer({config:aiConfig,provider:createMockProvider(teamData(text,'de','inferred'))});const a=await engine.analyze(input(text));const p=structuredClone(profile);p.language_preferences.preferred_team_languages=[{language:'de',weight:1}];
 assert.equal(a.language_analysis_status,'needs_review');assert.equal(languageFit(a,p).team_preference,'inferred_preferred');assert.equal(languageFit(a,p).rank_boost,0.25);
 p.language_preferences.preferred_team_languages[0].weight=0;assert.equal(languageFit(a,p).team_preference,'neutral');
});
test('missing key does not block collection; live AI is disabled in collector test mode',async t=>{
 const dir=temp(t),file=path.join(dir,'ai-config.json');fs.writeFileSync(file,JSON.stringify(aiConfig));
 const withoutKey=languageRuntime({JR_LANGUAGE_CONFIG:file},{dir});const c=await collected('No language stated.',{language:withoutKey});assert.equal(c.rows.length,1);assert.equal(c.catalog[0].language_analysis.error_code,'JR_LANGUAGE_KEY_MISSING');
 const synthetic=languageRuntime({JR_LANGUAGE_CONFIG:file,JR_LANGUAGE_API_KEY:'never-send'},{dir,test:true});await synthetic.engine.analyze(input('We build tools.'));assert.equal(synthetic.engine.stats.ai_calls,0);
});
test('preference changes recompute pipeline fit with unchanged shared AI cache',async t=>{
 const dir=temp(t),text='Our team communicates in Russian.';let calls=0;const provider=createMockProvider(()=>{calls++;return teamData(text);});
 const language={engine:createAnalyzer({config:aiConfig,cacheDir:dir,provider})};const a=await collected(text,{language});
 const other=structuredClone(profile);other.language_preferences.preferred_team_languages=[{language:'de',weight:1}];
 const b=await collectSources([source],other,{language,observedAt:at,loadFeed:async()=>({jobs:[{id:1,title:'Senior Product Manager',content:text,location:{name:'Remote'}}]})});
 assert.equal(calls,1);assert.deepEqual(a.catalog[0].language_analysis,b.catalog[0].language_analysis);assert.notDeepEqual(a.catalog[0].matching.language_fit,b.catalog[0].matching.language_fit);assert.deepEqual(a.rows,b.rows);
});
test('invalid JSON, hallucinated evidence and metadata team claim fail closed but keep baseline',async()=>{
 for(const value of ['not JSON',teamData('Not in source'),{...emptyAnalysis(),team_languages:[{language:'ru',basis:'explicit',confidence:'high',evidence:{field:'posting_hint',quote:'ru'}}]}]) {
  const engine=createAnalyzer({config:aiConfig,provider:createMockProvider(value)});const a=await engine.analyze(languageInput('Title','No team information','ru'));
  assert.equal(a.language_analysis_status,'failed');assert.equal(a.team_languages.length,0);assert.equal(engine.stats.ai_calls,2);
 }
 assert.throws(()=>validateAnalysis({...emptyAnalysis(),extra:'unsafe'},input('')));
});
test('timeout, retry count, failure cooldown and per-run budget are bounded',async t=>{
 let now=at;const engine=createAnalyzer({config:{...aiConfig,timeout_ms:5},cacheDir:temp(t),now:()=>now,provider:()=>new Promise(()=>{})});
 assert.equal((await engine.analyze(input('A'))).language_analysis_status,'failed');assert.equal(engine.stats.ai_calls,2);
 await engine.analyze(input('A'));assert.equal(engine.stats.ai_calls,2);
 now='2026-11-04T11:00:00.000Z';await engine.analyze(input('A'));assert.equal(engine.stats.ai_calls,4);
 const capped=createAnalyzer({config:{...aiConfig,max_ai_calls_per_run:1},provider:createMockProvider(emptyAnalysis())});await capped.analyze(input('A'));assert.equal((await capped.analyze(input('B'))).language_analysis_status,'pending');assert.equal(capped.stats.ai_calls,1);
});
test('AI input truncation is explicit, never silently complete',async()=>{
 const e=createAnalyzer({config:{...aiConfig,max_input_chars:100},provider:createMockProvider(emptyAnalysis())});const a=await e.analyze(input('a'.repeat(120)));assert.equal(a.language_analysis_status,'needs_review');assert.equal(a.error_code,'JR_LANGUAGE_TRUNCATED');
});
test('corrupt cache recovers and a cache write failure does not lose analysis',async t=>{
 const dir=temp(t),i=input('Our team communicates in Russian.'),provider=createMockProvider(teamData(i.description));
 await createAnalyzer({config:aiConfig,cacheDir:dir,provider}).analyze(i);fs.writeFileSync(path.join(dir,fs.readdirSync(dir)[0]),'broken');
 const e=createAnalyzer({config:aiConfig,cacheDir:dir,provider});assert.equal((await e.analyze(i)).language_analysis_status,'completed');assert.equal(e.stats.ai_calls,1);
 const file=path.join(dir,'not-a-directory');fs.writeFileSync(file,'x');const bad=createAnalyzer({config:aiConfig,cacheDir:file,provider});assert.equal((await bad.analyze(i)).language_analysis_status,'completed');assert.ok(bad.stats.cache_errors);
});
test('OpenAI transport uses structured output, no profile, no redirect and rejects refusal/HTTP auth',async()=>{
 const i=input('Our team communicates in Russian.');let sent;
 const provider=createOpenAIProvider({key:'synthetic',model:'test-model',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.redirect,'error');return {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(teamData(i.description))}}]})};}});
 assert.equal((await provider(i,{})).team_languages[0].language,'ru');assert.equal(sent.response_format.json_schema.strict,true);assert.equal(sent.store,false);assert.ok(!JSON.stringify(sent).includes('candidate_languages'));
 await assert.rejects(createOpenAIProvider({key:'x',model:'test',fetchImpl:async()=>({ok:false,status:401})})(i,{}),e=>e.retryable===false);
 await assert.rejects(createOpenAIProvider({key:'x',model:'test',fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{refusal:'no'}}]})})})(i,{}),/RESPONSE/);
});
test('pipeline retains every vacancy on AI failure; language never filters discovery or base CRM',async()=>{
 const baseline=await collected('English C1 is required.');const failing=await collected('English C1 is required.',{language:{engine:createAnalyzer({config:aiConfig,provider:async()=>{throw Error('secret-key-value');}})}});
 assert.equal(failing.catalog.length,1);assert.deepEqual(failing.rows,baseline.rows);assert.equal(failing.catalog[0].language_analysis.language_analysis_status,'failed');assert.ok(!JSON.stringify(failing).includes('secret-key-value'));
 assert.equal(baseline.catalog[0].matching.language_fit.requirements,'mismatch');assert.equal(baseline.catalog[0].matching.decision,'excluded');
 const unknown=await collected('We build the platform.');assert.equal(unknown.catalog[0].matching.decision,'review');assert.equal(unknown.rows.length,1);
});
test('manual correction is user-scoped, hash-bound, never changes shared cache',async t=>{
 const dir=temp(t),text='Our team communicates in Russian.',i=input(text);const a=analyze(text);
 const file=path.join(dir,'overrides.json');fs.writeFileSync(file,JSON.stringify({version:1,overrides:[{vacancy_id:'greenhouse_fixture_1',input_hash:a.input_hash,reviewed_at:at,note:'Checked text',analysis:teamData(text,'ru','inferred')}]}));
 const runtime=languageRuntime({JR_LANGUAGE_OVERRIDES:file},{dir});const c=await collected(text,{language:runtime});assert.equal(c.catalog[0].language_review.status,'applied');assert.equal(c.catalog[0].language_analysis.team_languages[0].basis,'explicit');assert.equal(c.catalog[0].matching.language_fit.team_preference,'inferred_preferred');
 assert.equal(runtime.overrideFor('greenhouse_fixture_1',input(text+' changed'),{...a,input_hash:'0'.repeat(64)}).status,'stale');assert.equal(runtime.overrideFor('other',i,a),null);
});
test('source priorities report evidence/unknown denominators without dropping sources',async()=>{
 const c=await collected('Our team communicates in Russian.');c.sources.push({sourceId:'empty',status:'passed'});const priorities=sourcePriorities(c);assert.equal(priorities.length,2);assert.equal(priorities[0].explicit_team_count,1);assert.equal(priorities[0].processing_cost,null);assert.equal(c.sources.length,2);
});
const env={N8N_API_KEY:'synthetic',N8N_GOOGLE_CREDENTIAL_ID:'fixture',JR_TEST_SPREADSHEET_ID:'TEST',JR_PRODUCTION_SPREADSHEET_ID:'PROD',JR_TEST_SHEET_NAME:'JR_TEST_Languages'};
test('Sheets opt-in extends whitelist and auto-map, read-back verifies persisted JSON; disabled keeps original schema',async()=>{
 const c=await collected('Our team communicates in Russian.',{language:{engine:createAnalyzer(),sheets:true}});const id='a'.repeat(24),payload={runId:id,total:c.total,rows:c.rows,sources:c.sources};
 assert.throws(()=>validateEnvelope(payload,id),/UNOWNED/);assert.equal(validateEnvelope(payload,id,true).rows.length,1);assert.ok(!Object.hasOwn(c.rows[0],'notes'));
 const w=buildMultiWorkflow({...env,JR_LANGUAGE_SHEETS:'1'},id,{test:true});const write=w.nodes.find(n=>n.name==='Append or update row in sheet');assert.equal(write.parameters.columns.mappingMode,'autoMapInputData');assert.equal(write.parameters.options.handlingExtraData,'error');assert.deepEqual(write.parameters.columns.matchingColumns,['vacancy_id']);
 assert.equal(write.parameters.columns.schema.filter(x=>x.id==='language_analysis').length,1);
 const code=w.nodes.find(n=>n.name==='Code in JavaScript').parameters.jsCode;const out=vm.runInNewContext('(function(){'+code+'})()',{$input:{first:()=>({json:{body:payload}})}});assert.equal(out[0].json.rows[0].language_analysis,c.rows[0].language_analysis);
 const check=w.nodes.find(n=>n.name==='Verify language result').parameters.jsCode;
 vm.runInNewContext('(function(){'+check+'})()',{$:()=>({first:()=>({json:payload})}),$input:{all:()=>c.rows.map(json=>({json}))}});
 assert.throws(()=>verifyLanguageRows(c.rows,[{...c.rows[0],language_fit:'wrong'}]),/READBACK/);assert.throws(()=>verifyLanguageRows(c.rows,[...c.rows,...c.rows]),/READBACK/);
 assert.ok(!buildMultiWorkflow(env,id).nodes.some(n=>n.name==='Verify language result'));
});
test('collector test integrates language JSON and synthetic-only path under n8n mock',async t=>{
 const dir=temp(t);let payload,workflow;
 const fetchImpl=async(url,o)=>{const response=v=>({ok:true,status:200,json:async()=>v});if(url.endsWith('/api/v1/workflows')&&o.method==='POST'){workflow=JSON.parse(o.body);return response({id:'fixture'});}if(url.includes('/webhook/')){payload=JSON.parse(o.body);return response({ok:true,runId:payload.runId,total:payload.total,matched:payload.rows.length,inserted:payload.rows.length,updated:0,sources:payload.sources.map(s=>({...s,inserted:s.matched,updated:0}))});}return response({data:[]});};
 const r=await runMulti({...env,JR_LANGUAGE_SHEETS:'1'},{dir,test:true,fetchImpl,sourceFetchImpl:()=>{throw Error('live not allowed');}});
 assert.equal(r.status,'passed');assert.equal(r.cleanup,'completed');assert.equal(payload.rows.length,4);for(const row of payload.rows){assert.equal(JSON.parse(row.language_analysis).language_analysis_version,'language-v1');assert.ok(JSON.parse(row.language_fit).profile_fingerprint);}
 assert.ok(workflow.nodes.some(n=>n.name==='Verify language result'));
});
test('HTML presents ordinal evidence and requirements, never fabricated probabilities',async()=>{
 const c=await collected('Our team communicates in Russian. English C1 is required.');const html=renderCatalog(c);assert.ok(html.includes('подтверждено текстом вакансии'));assert.ok(html.includes('C1'));assert.ok(html.includes('ниже обязательного требования'));assert.ok(!html.includes('98%'));assert.ok(buildReview(c).items[0].language_analysis);
 const n=normalizeFeed(source,{jobs:[{id:1,title:'Senior Product Manager',content:'<script>bad()</script>',location:{name:'Remote'}}]},at,profile);assert.equal(n.catalog.length,1);
});
