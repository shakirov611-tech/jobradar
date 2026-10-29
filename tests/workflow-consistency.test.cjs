const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('importable workflow runs the exact source under test',()=>{
 const w=JSON.parse(fs.readFileSync(path.join(root,'workflows/greenhouse-to-sheets.validation-v0.3.json')));
 assert.equal(w.nodes.find(n=>n.type==='n8n-nodes-base.code').parameters.jsCode,fs.readFileSync(path.join(root,'src/normalization/greenhouse-airbnb.n8n.js'),'utf8'));
 assert.equal(w.active,false);assert.equal(w.settings.availableInMCP,false);
});
