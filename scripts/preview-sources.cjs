const fs=require('node:fs');const path=require('node:path');
const {settings}=require('./multi-collector.cjs');const {collectSources}=require('../src/sources/catalog.cjs');const {renderCatalog}=require('../src/reports/catalog-preview.cjs');
const {buildReview}=require('../src/matching/review.cjs');
const {renderReview}=require('../src/reports/matching-review.cjs');
async function main() {
 const {sources,profile}=settings(process.env);const result=await collectSources(sources,profile);
 const dir=path.resolve(__dirname,'../.collector-state');fs.mkdirSync(dir,{recursive:true});
 const review=buildReview(result);const reviewName='review-'+review.snapshotId;
 fs.writeFileSync(path.join(dir,reviewName+'.json'),JSON.stringify(review,null,2)+'\n');
 fs.writeFileSync(path.join(dir,reviewName+'.html'),renderReview(review));
 fs.writeFileSync(path.join(dir,'preview.json'),JSON.stringify(result,null,2)+'\n');const html=path.join(dir,'preview.html');fs.writeFileSync(html,renderCatalog(result,{reviewPath:reviewName+'.html'}));
 console.table(result.sources.map(s=>({company:s.company,provider:s.provider,status:s.status,total:s.status==='passed'?s.total:'unknown',roles:s.matched,main:s.views?.main,unclear:s.views?.unclear,excluded:s.views?.excluded,error:s.error||''})));
 console.log('Review sample: '+review.items.length+' vacancies; '+path.join(dir,reviewName+'.html'));
 console.log('Read-only preview: '+html);console.log('No n8n/Sheets writes. Geography is provisional, not confirmed eligibility.');
 if(process.argv.includes('--open')&&process.platform==='win32')require('node:child_process').spawn('explorer.exe',[process.argv.includes('--review')?path.join(dir,reviewName+'.html'):html],{shell:false,stdio:'ignore'}).unref();
 if(result.sources.some(s=>s.status==='failed'))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Source preview failed. Check source/profile configuration.');process.exitCode=1;});
