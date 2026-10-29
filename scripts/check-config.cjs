const fs = require('node:fs');
const path = require('node:path');
const {settings} = require('./multi-collector.cjs');
function check(root = path.resolve(__dirname, '..')) {
 let count = 0;
 function scan(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
   if (e.name === 'private' || e.name === 'node_modules') continue;
   const file = path.join(dir,e.name);
   if (e.isDirectory()) scan(file);
   else if (e.name.endsWith('.json')) {
    try { JSON.parse(fs.readFileSync(file,'utf8')); } catch { throw new Error('Invalid JSON: '+path.relative(root,file)); }
    count++;
   }
  }
 }
 for (const name of ['config','workflows','tests/fixtures']) scan(path.join(root,name));
 // Explicit paths prevent local environment overrides from changing CI inputs.
 settings({JR_SOURCES_FILE:path.join(root,'config/sources.json'),JR_SEARCH_PROFILE_FILE:path.join(root,'config/search-profile.json')});
 for (const file of fs.readdirSync(path.join(root,'workflows')).filter(x=>x.endsWith('.json'))) {
  const w=JSON.parse(fs.readFileSync(path.join(root,'workflows',file),'utf8'));
  if (!Array.isArray(w.nodes)||!w.connections||typeof w.connections!=='object') throw new Error('Invalid workflow: '+file);
  const names=new Set(w.nodes.map(n=>n.name));
  if(names.size!==w.nodes.length)throw new Error('Duplicate node names: '+file);
  for(const [from,types] of Object.entries(w.connections)) {
   if(!names.has(from))throw new Error('Unknown source node: '+file);
   for(const branches of Object.values(types)) for(const branch of branches) for(const edge of branch) if(!names.has(edge.node))throw new Error('Unknown target node: '+file);
  }
 }
 return count;
}
if(require.main===module) {try {console.log('Configuration checks passed ('+check()+' JSON files).');} catch(e) {console.error(e.message);process.exitCode=1;}}
module.exports={check};
