const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {prepareVacancyUpsert:prepare}=require('../src/storage/prepare-vacancy-upsert.cjs');
const now='2026-10-29T12:00:00.000Z';
const row=(extra={})=>({vacancy_id:'greenhouse_airbnb_123',last_seen_at:now,title:'New title',...extra});
test('new vacancy receives observation time; input remains unchanged',()=>{
 const input=row();assert.equal(prepare([input],[{}])[0].first_seen_at,now);assert.equal(input.first_seen_at,undefined);
});
test('existing first_seen never appears in update payload, even if supplied upstream',()=>{
 const out=prepare([row({first_seen_at:now})],[row({first_seen_at:'2025-01-01',notes:'Keep'})])[0];
 assert.equal(Object.hasOwn(out,'first_seen_at'),false);assert.equal(out.title,'New title');assert.equal(Object.hasOwn(out,'notes'),false);
});
test('legacy blank/missing first_seen is not backfilled with guessed time',()=>{
 for(const first_seen_at of ['',null,undefined])assert.equal(Object.hasOwn(prepare([row()],[row({first_seen_at})])[0],'first_seen_at'),false);
});
test('mixed insert/update prepares only new records with first_seen',()=>{
 const out=prepare([row(),row({vacancy_id:'greenhouse_airbnb_456'})],[row()]);
 assert.equal(Object.hasOwn(out[0],'first_seen_at'),false);assert.equal(out[1].first_seen_at,now);
});
test('duplicate stored/incoming IDs abort preparation rather than choosing a row',()=>{
 assert.throws(()=>prepare([row()],[row(),row()]),/JR_DUPLICATE_STORED_ID/);
 assert.throws(()=>prepare([row(),row()],[]),/JR_DUPLICATE_INCOMING_ID/);
});
test('invalid observation time and invalid collection input fail explicitly',()=>{
 assert.throws(()=>prepare([row({last_seen_at:'bad'})],[]),/JR_INVALID_OBSERVATION_TIME/);
 assert.throws(()=>prepare(null,[]),/JR_INVALID_STORAGE_INPUT/);
});
test('v0.4 embedded storage code matches source and reads Sheets only once',()=>{
 const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/greenhouse-to-sheets.first-seen-v0.4.json')));
 const node=w.nodes.find(n=>n.name==='Prepare vacancy upsert');assert.ok(node.parameters.jsCode.includes(prepare.toString()));
 const out=vm.runInNewContext('(function(){'+node.parameters.jsCode+'})()',{$:()=>({all:()=>[{json:row()}]}),$input:{all:()=>[{json:{}}]}});
 assert.equal(out[0].json.first_seen_at,now);
 const read=w.nodes.find(n=>n.name==='Read existing vacancies');assert.equal(read.executeOnce,true);assert.equal(read.alwaysOutputData,true);assert.equal(w.active,false);
});
