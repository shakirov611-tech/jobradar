const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {validateConfig}=require('./integration-workflow.cjs');
async function main() {
  if(process.platform!=='win32')throw new Error('Windows Task Scheduler requires Windows; run this command in PowerShell, not WSL');
  const arg=process.argv[2]||'install';
  const mode={install:'Install',remove:'Remove',status:'Status'}[arg];
  if(!mode)throw new Error('Use install, remove or status');
  if(mode==='Install') {
    validateConfig(process.env);
    const {run}=require('./run-collector.cjs');
    const report=await run(process.env,{test:true});
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='passed')throw new Error('Scheduled pipeline test failed; schedule was not installed');
  }
  const root=path.resolve(__dirname,'..');
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'register-collector-task.ps1'),'-NodePath',process.execPath,'-ProjectRoot',root,'-Mode',mode],{stdio:'inherit',shell:false});
  if(result.error||result.status!==0)throw new Error('Windows task command failed');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
