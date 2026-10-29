const fs=require('node:fs');const path=require('node:path');
const {validateSources,collectSources,sourceId}=require('../src/sources/catalog.cjs');
const {buildScheduledWorkflow}=require('./scheduled-workflow.cjs');
function settings(env) {
 const root=path.resolve(__dirname,'..');
 const config=JSON.parse(fs.readFileSync(env.JR_SOURCES_FILE||path.join(root,'config/sources.json'),'utf8'));
 const profile=JSON.parse(fs.readFileSync(env.JR_SEARCH_PROFILE_FILE||path.join(root,'config/search-profile.json'),'utf8'));
 if(profile.version!==1||profile.country!=='BG'||typeof profile.remotePreferred!=='boolean'||profile.rolePolicy!=='product-growth-delivery-v1'||profile.unknownPolicy!=='review'||profile.languagePolicy!=='do_not_infer_team_language_from_job_text')throw new Error('JR_INVALID_SEARCH_PROFILE');
 return {sources:validateSources(config),profile};
}
// Self-contained: embed the same validation in the n8n Code node.
function validateEnvelope(p,expectedRunId) {
 if(!p||p.runId!==expectedRunId||!Array.isArray(p.rows)||!Array.isArray(p.sources)||!Number.isSafeInteger(p.total)||p.total<0)throw new Error('JR_INVALID_COLLECTION_ENVELOPE');
 const allowed=new Set(['vacancy_id','company','title','source','original_url','canonical_url','location','workplace_type','language','published_at','updated_at','active_status','description','last_seen_at']);
 const sourceIds=new Set();
 for(const s of p.sources){if(!s||typeof s.sourceId!=='string'||sourceIds.has(s.sourceId)||!['passed','failed'].includes(s.status)||!['total','matched'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.total<s.matched)throw new Error('JR_INVALID_SOURCE_SUMMARY');sourceIds.add(s.sourceId);}
 const ids=new Set();
 for(const row of p.rows) {
  if(!row||typeof row.vacancy_id!=='string'||ids.has(row.vacancy_id)||typeof row.last_seen_at!=='string'||!Number.isFinite(Date.parse(row.last_seen_at)))throw new Error('JR_INVALID_COLLECTION_ROW');
  if(Object.keys(row).some(k=>!allowed.has(k)))throw new Error('JR_UNOWNED_ROW_FIELD');
  ids.add(row.vacancy_id);
  if(!p.sources.some(s=>s.status==='passed'&&row.vacancy_id.slice(0,row.vacancy_id.lastIndexOf('_'))===s.sourceId))throw new Error('JR_SOURCE_ROW_MISMATCH');
 }
 for(const s of p.sources)if(p.rows.filter(r=>r.vacancy_id.slice(0,r.vacancy_id.lastIndexOf('_'))===s.sourceId).length!==s.matched||(s.status==='failed'&&(s.total!==0||s.matched!==0)))throw new Error('JR_SOURCE_ROW_MISMATCH');
 if(p.total<p.rows.length||p.sources.reduce((n,s)=>n+s.total,0)!==p.total||p.sources.reduce((n,s)=>n+s.matched,0)!==p.rows.length)throw new Error('JR_COLLECTION_COUNT_MISMATCH');
 return {total:p.total,rows:p.rows,empty:p.rows.length===0,sources:p.sources};
}
function buildMultiWorkflow(env,runId,{test=false}={}) {
 const w=buildScheduledWorkflow(env,runId,{test});
 w.name='JobRadar multi-source '+(test?'TEST ':'')+runId;
 const http=w.nodes.find(n=>n.name==='HTTP Request');
 Object.assign(http,{type:'n8n-nodes-base.code',typeVersion:2,parameters:{jsCode:'return $input.all();'},retryOnFail:false});
 w.nodes.find(n=>n.name==='Code in JavaScript').parameters.jsCode=`const p=$input.first().json.body;\nreturn [{json:(${validateEnvelope.toString()})(p,${JSON.stringify(runId)})}];`;
 const summary=w.nodes.find(n=>n.name==='Collection result');
 summary.parameters.jsCode=`const feed=$('Code in JavaScript').first().json;\nconst rows=feed.empty?[]:$('Prepare vacancy upsert').all().map(x=>x.json);\nconst sources=feed.sources.map(s=>{const own=rows.filter(r=>r.vacancy_id.slice(0,r.vacancy_id.lastIndexOf('_'))===s.sourceId);const inserted=own.filter(r=>Object.hasOwn(r,'first_seen_at')).length;return {...s,inserted,updated:own.length-inserted};});\nconst inserted=sources.reduce((n,s)=>n+s.inserted,0);\nreturn [{json:{ok:true,runId:${JSON.stringify(runId)},total:feed.total,matched:rows.length,inserted,updated:rows.length-inserted,sources}}];`;
 return w;
}
function fixtures(runId) {
 const id='9'+BigInt('0x'+runId).toString().slice(0,14);
 const uuid=runId.slice(0,8)+'-'+runId.slice(8,12)+'-'+runId.slice(12,16)+'-'+runId.slice(16,20)+'-'+runId.slice(12,24);
 return {sources:[{provider:'greenhouse',board:'airbnb',company:'JobRadar TEST',enabled:true},{provider:'lever',board:'jrfixture',region:'global',company:'JobRadar TEST',enabled:true}],loadFeed:async s=>s.provider==='greenhouse'?{jobs:[{id,title:'Product Manager',absolute_url:'https://example.test/'+runId,content:'Synthetic only',location:{name:'Remote - United States'}},{id:String(BigInt(id)+1n),title:'Director of Product',absolute_url:'https://example.test/'+runId,content:'Synthetic only',location:{name:'Remote - Europe'}},{id:String(BigInt(id)+2n),title:'Construction Project Manager',location:{name:'US'}}]}:[{id:uuid,text:'Product Owner',hostedUrl:'https://example.test/'+runId,description:'Synthetic only',workplaceType:'remote',categories:{location:'Bulgaria'}}]};
}
async function runMulti(env,options={}) {
 const {run}=require('./run-collector.cjs');
 const test=!!options.test;
 const configured=settings(env);let collection;
 const prepareCollection=async(runId,report)=>{
  const fixture=test?fixtures(runId):null;
  const sources=fixture?validateSources({version:1,sources:fixture.sources}):configured.sources;
  collection=await collectSources(sources,configured.profile,{fetchImpl:options.sourceFetchImpl,loadFeed:fixture?.loadFeed,sleep:options.sleep});
  report.sourceResults=collection.sources;report.policy={workMode:'remote-evidence-v1',role:configured.profile.rolePolicy,geographyCountry:configured.profile.country,geographyExcludesFromCRM:false};
  const dir=options.dir||require('./run-collector.cjs').STATE;
  const catalogFile=runId+'.catalog.json';fs.writeFileSync(path.join(dir,catalogFile),JSON.stringify({observedAt:collection.observedAt,sources:collection.sources,catalog:collection.catalog},null,2)+'\n');report.catalogFile=catalogFile;
  const html=require('../src/reports/catalog-preview.cjs').renderCatalog(collection);fs.writeFileSync(path.join(dir,runId+'.catalog.html'),html);fs.writeFileSync(path.join(dir,'preview.html'),html);report.previewFile='preview.html';
  if(!collection.sources.some(s=>s.status==='passed'))throw new Error('JR_ALL_SOURCES_FAILED');
  if(Buffer.byteLength(JSON.stringify(collection.rows),'utf8')>8*1024*1024)throw new Error('JR_COLLECTION_PAYLOAD_LIMIT');
  return {body:buildMultiWorkflow(env,runId,{test}),payload:{runId,total:collection.total,rows:collection.rows,sources:collection.sources}};
 };
 const acceptResult=(result,report)=>{
  if(result.total!==collection.total||result.matched!==collection.rows.length||!Array.isArray(result.sources)||result.sources.length!==collection.sources.length)throw new Error('JR_INVALID_SOURCE_COMPLETION');
  for(const expected of collection.sources) {
   const actual=result.sources.filter(s=>s.sourceId===expected.sourceId);
   if(actual.length!==1||actual[0].status!==expected.status||actual[0].total!==expected.total||actual[0].matched!==expected.matched||!Number.isSafeInteger(actual[0].inserted)||!Number.isSafeInteger(actual[0].updated)||actual[0].inserted<0||actual[0].updated<0||actual[0].inserted+actual[0].updated!==expected.matched)throw new Error('JR_INVALID_SOURCE_COMPLETION');
  }
  if(result.sources.reduce((n,s)=>n+s.inserted,0)!==result.inserted||result.sources.reduce((n,s)=>n+s.updated,0)!==result.updated)throw new Error('JR_INVALID_SOURCE_COMPLETION');
  if(test&&(result.inserted!==3||result.updated!==0))throw new Error('JR_SYNTHETIC_MULTI_INSERT_FAILED');
  report.sourceResults=result.sources;
  if(collection.sources.some(s=>s.status==='failed'))report.status='partial';
 };
 return run(env,{...options,test,prepareCollection,acceptResult});
}
module.exports={settings,validateEnvelope,buildMultiWorkflow,fixtures,runMulti};
