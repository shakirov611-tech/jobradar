const fs=require('node:fs');const path=require('node:path');
const {settings}=require('./multi-collector.cjs');const {collectSources}=require('../src/sources/catalog.cjs');const {renderCatalog}=require('../src/reports/catalog-preview.cjs');
async function main() {
 const {sources,profile}=settings(process.env);const result=await collectSources(sources,profile);
 const dir=path.resolve(__dirname,'../.collector-state');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'preview.json'),JSON.stringify(result,null,2)+'\n');const html=path.join(dir,'preview.html');fs.writeFileSync(html,renderCatalog(result));
 console.table(result.sources.map(s=>({company:s.company,provider:s.provider,status:s.status,total:s.status==='passed'?s.total:'unknown',roles:s.matched,plausible:s.geography?.plausible,review:s.geography?.review,restricted:s.geography?.restricted,error:s.error||''})));
 console.log('Read-only preview: '+html);console.log('No n8n/Sheets writes. Geography is provisional, not confirmed eligibility.');
 if(process.argv.includes('--open')&&process.platform==='win32')require('node:child_process').spawn('explorer.exe',[html],{shell:false,stdio:'ignore'}).unref();
 if(result.sources.some(s=>s.status==='failed'))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Source preview failed. Check source/profile configuration.');process.exitCode=1;});
