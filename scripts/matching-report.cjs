const fs=require('node:fs');const path=require('node:path');
const {summarizeReview}=require('../src/matching/review.cjs');
function main() {
  const file=process.argv[2];if(!file)throw new Error('Usage: npm run matching:report -- PATH_TO_LABELS.json');
  if(fs.statSync(file).size>100000)throw new Error('JR_REVIEW_LABEL_FILE_TOO_LARGE');
  const labels=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!/^[a-f0-9]{64}$/.test(labels.snapshotId))throw new Error('JR_INVALID_REVIEW_SNAPSHOT_ID');
  const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../.collector-state/review-'+labels.snapshotId+'.json'),'utf8'));
  const report=summarizeReview(snapshot,labels);
  fs.writeFileSync(path.join(__dirname,'../.collector-state/review-'+labels.snapshotId+'.result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
if(require.main===module)try{main();}catch(e){console.error(/^JR_|^Usage:/.test(e.message)?e.message:'Review report failed. Check labels path and keep the original .collector-state snapshot.');process.exitCode=1;}
