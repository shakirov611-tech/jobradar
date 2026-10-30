const fs=require('node:fs');const path=require('node:path');
const {summarizeReview}=require('../src/matching/review.cjs');
const {renderReview}=require('../src/reports/matching-review.cjs');
function createReport(file,{stateDir=path.join(__dirname,'../.collector-state'),render=false}={}) {
  if(!file)throw new Error('Usage: npm run matching:report -- PATH_TO_LABELS.json [--open]');
  if(fs.statSync(file).size>100000)throw new Error('JR_REVIEW_LABEL_FILE_TOO_LARGE');
  const labels=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!/^[a-f0-9]{64}$/.test(labels.snapshotId))throw new Error('JR_INVALID_REVIEW_SNAPSHOT_ID');
  const stem=path.join(stateDir,'review-'+labels.snapshotId);
  const snapshot=JSON.parse(fs.readFileSync(stem+'.json','utf8'));
  const report=summarizeReview(snapshot,labels);
  fs.writeFileSync(stem+'.result.json',JSON.stringify(report,null,2)+'\n');
  if(render)fs.writeFileSync(stem+'.html',renderReview(snapshot,{labels}));
  return {report,html:render?stem+'.html':null};
}
function main() {
  const {report,html}=createReport(process.argv[2],{render:process.argv.includes('--open')});
  console.log(JSON.stringify(report,null,2));
  if(html){console.log('Saved original review with loaded labels: '+html);if(process.platform==='win32')require('node:child_process').spawn('explorer.exe',[html],{shell:false,stdio:'ignore'}).unref();}
}
if(require.main===module)try{main();}catch(e){console.error(/^JR_|^Usage:/.test(e.message)?e.message:'Review report failed. Check labels path and keep the original .collector-state snapshot.');process.exitCode=1;}
module.exports={createReport};
