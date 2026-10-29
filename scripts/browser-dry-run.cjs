const fs=require('node:fs');const path=require('node:path');const {randomBytes}=require('node:crypto');
const {validateTarget,createDryContext,fillSyntheticForm}=require('../src/applications/browser-dry-run.cjs');
async function main() {
 const target=validateTarget(process.argv[2]||'https://job-boards.greenhouse.io/airbnb/jobs/8262207');
 let chromium;try{({chromium}=require('../browser/node_modules/playwright'));}catch{throw new Error('Run npm.cmd run browser:setup once');}
 const runId=randomBytes(12).toString('hex'),dir=path.resolve(__dirname,'../.browser-artifacts');fs.mkdirSync(dir,{recursive:true});
 const report={runId,startedAt:new Date().toISOString(),status:'required_action',reason:'page_not_ready',submissionPerformed:false};
 let browser,context,guard;report.stage='launch';
 try {
  browser=await chromium.launch({headless:true});guard=await createDryContext(browser);context=guard.context;report.stage='navigate';
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  // Known employer wrapper observed in the live DOM. No generic button guessing.
  const reject=page.getByRole('button',{name:/^(Reject non-essential|Отклонить несущественное)$/i});
  if(await reject.count()===1&&await reject.isVisible())await reject.click();
  const application=page.getByRole('tab',{name:'Application',exact:true});
  if(await application.count()===1)await application.click();
  if(await page.locator('#grnhse_iframe').count())await page.frameLocator('#grnhse_iframe').getByRole('textbox',{name:'First Name',exact:true}).waitFor();
  else await page.getByRole('textbox',{name:'First Name',exact:true}).waitFor();
  report.stage='fill';delete report.reason;Object.assign(report,await fillSyntheticForm(page));
  if(report.status==='required_action'&&!report.reason)report.reason='form_requires_review';
  report.page={origin:new URL(page.url()).origin,path:new URL(page.url()).pathname};
  report.blockedRequests=guard.blocked;
 }catch{report.status='required_action';report.reason='browser_or_form_not_ready';}
 finally{report.blockedRequests=guard?.blocked||[];if(context)await context.close();if(browser)await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(dir,runId+'.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));console.log('Report: '+path.join(dir,runId+'.json'));
 if(report.status!=='dry_run_completed')process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message.startsWith('JR_')||error.message.startsWith('Run ')?error.message:'Browser dry run could not start');process.exitCode=1;});
