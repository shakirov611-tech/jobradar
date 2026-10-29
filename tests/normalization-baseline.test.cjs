// Regression tests for validation v0.3; remaining characterization tests document unchanged limitations.
// Run: node --test tests/normalization-baseline.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../src/normalization/greenhouse-airbnb.n8n.js'), 'utf8');
const run = (...inputs) => JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+code+'})()', {
  $input: {first:()=>({json:inputs[0]})}, Date
})));
const job = (extra={})=>({id:123,title:'Senior Product Manager',absolute_url:'https://example.test/job/123',...extra});
test('stable scoped ID and observed timestamp',()=>{
 const x=run({jobs:[job()]})[0].json;
 assert.equal(x.vacancy_id,'greenhouse_airbnb_123');
 assert.ok(Number.isFinite(Date.parse(x.last_seen_at)));
 assert.equal(x.active_status,'active_in_feed');
});
test('first_seen is absent: current code does not create it',()=>assert.equal('first_seen_at' in run({jobs:[job()]})[0].json,false));
test('missing jobs is an explicit feed error',()=>assert.throws(()=>run({error:'unexpected envelope'}), /JR_INVALID_FEED/));
test('non-array jobs throws',()=>assert.throws(()=>run({jobs:{}})));
test('missing ID is rejected',()=>assert.throws(()=>run({jobs:[job({id:undefined})]}), /JR_INVALID_JOB_ID/));
test('duplicate IDs in feed remain duplicate output',()=>assert.equal(run({jobs:[job(),job()]}).length,2));
test('title regex misses Head of Growth and Director of Product',()=>assert.equal(run({jobs:[job({title:'Head of Growth'}),job({title:'Director of Product'})]}).length,0));
test('title regex admits unrelated construction Project Manager',()=>assert.equal(run({jobs:[job({title:'Construction Project Manager'})]}).length,1));
test('remote geography is not filtered',()=>assert.equal(run({jobs:[job({location:{name:'United States'},metadata:[{name:'Workplace Type',value:'Remote'}]})]}).length,1));
test('description truncates to 30000 code units without decoding',()=>{
 const x=run({jobs:[job({content:'&lt;p&gt;'+'x'.repeat(30000)})]})[0].json.description;
 assert.equal(x.length,30000);assert.ok(x.startsWith('&lt;p&gt;'));
});
test('only first input item is processed',()=>assert.equal(run({jobs:[job()]},{jobs:[job({id:456})]}).length,1));
test('source timestamp mapping and original URL are preserved',()=>{
 const x=run({jobs:[job({first_published:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'})]})[0].json;
 assert.equal(x.published_at,'2026-01-01T00:00:00Z');assert.equal(x.updated_at,'2026-01-02T00:00:00Z');assert.equal(x.canonical_url,x.original_url);
});

test('valid empty feed remains a successful empty result',()=>assert.deepEqual(run({jobs:[]}),[]));
test('invalid envelopes fail clearly',()=>{
 for(const input of [null,undefined,[],{}, {jobs:null},{jobs:'bad'},{jobs:123}]) {
  assert.throws(()=>run(input),/JR_INVALID_FEED/);
 }
});
test('non-object job entries fail before filtering',()=>{
 for(const entry of [null,undefined,1,'text',[]]) assert.throws(()=>run({jobs:[entry]}),/JR_INVALID_JOB/);
});
test('invalid numeric/string IDs fail',()=>{
 for(const id of [null,undefined,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'',' ','0','01','-1','1.5','1e3',true,{},[]]) {
  assert.throws(()=>run({jobs:[job({id})]}),/JR_INVALID_JOB_ID/);
 }
});
test('numeric and canonical decimal string IDs preserve the existing key',()=>{
 for(const id of [123,'123']) assert.equal(run({jobs:[job({id})]})[0].json.vacancy_id,'greenhouse_airbnb_123');
});
test('whole feed validation includes filtered-out jobs',()=>{
 assert.throws(()=>run({jobs:[job(),job({id:null,title:'Engineer'})]}),/JR_INVALID_JOB_ID: jobs\[1\]/);
});
test('feed errors contain index and code, not raw payload',()=>{
 assert.throws(()=>run({jobs:[job({id:'private-value'})]}), error=>{
  assert.ok(error.message.includes('JR_INVALID_JOB_ID'));
  assert.ok(!error.message.includes('private-value'));return true;
 });
});
test('valid feed matches exported baseline except timestamps',()=>{
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/greenhouse-to-sheets.sanitized.json'),'utf8'));
 const oldCode=baseline.nodes.find(n=>n.type==='n8n-nodes-base.code').parameters.jsCode;
 const input={jobs:[job({content:'&lt;p&gt;Description',first_published:'2026-01-01',metadata:[{name:'Workplace Type',value:'Remote'}]}),job({id:456,title:'Engineer'})]};
 const oldOut=JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+oldCode+'})()',{$input:{first:()=>({json:input})},Date})));
 const newOut=run(input);
 for(const rows of [oldOut,newOut]) for(const row of rows) delete row.json.last_seen_at;
 assert.deepEqual(newOut,oldOut);
});
