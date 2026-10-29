const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {check}=require('../scripts/check-config.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jr-config-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const p of ['config','workflows','tests/fixtures'])fs.cpSync(path.resolve(__dirname,'..',p),path.join(root,p),{recursive:true});return root;}
test('configuration gate rejects malformed JSON',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'config/broken.json'),'{');assert.throws(()=>check(root),/Invalid JSON/);});
test('configuration gate rejects unsupported profile and duplicate sources',t=>{const root=fixture(t);const file=path.join(root,'config/search-profile.json');const original=fs.readFileSync(file,'utf8');const p=JSON.parse(original);p.country='XX';fs.writeFileSync(file,JSON.stringify(p));assert.throws(()=>check(root),/JR_INVALID_SEARCH_PROFILE/);fs.writeFileSync(file,original);const source=path.join(root,'config/sources.json');const c=JSON.parse(fs.readFileSync(source));c.sources.push(c.sources[0]);fs.writeFileSync(source,JSON.stringify(c));assert.throws(()=>check(root),/JR_DUPLICATE_SOURCE/);});
test('configuration gate rejects dangling workflow connections',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'workflows/broken.json'),JSON.stringify({nodes:[{name:'Start'}],connections:{Start:{main:[[{node:'Missing'}]]}}}));assert.throws(()=>check(root),/Unknown target node/);});
