const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const {buildPackage}=require('../src/resumes/package.cjs');
const {renderPackage}=require('../src/resumes/render.cjs');
function read(file){if(fs.statSync(file).size>5_000_000)throw Error('JR_RESUME_INPUT_TOO_LARGE');return JSON.parse(fs.readFileSync(file,'utf8'));}
function prepare(profileFile,snapshotFile,vacancyId,{root=path.resolve(__dirname,'..')}={}) {
 const profile=read(profileFile),snapshot=read(snapshotFile);
 const rows=Array.isArray(snapshot.items)?snapshot.items:Array.isArray(snapshot.catalog)?snapshot.catalog:[snapshot];
 const matches=rows.filter(r=>r.vacancy_id===vacancyId);
 if(matches.length!==1)throw Error('JR_RESUME_VACANCY_NOT_UNIQUE');
 return writePackage(buildPackage(profile,matches[0]),root);
}
function writePackage(pkg,root=path.resolve(__dirname,'..')) {
 const dir=path.join(root,'exports-private','resumes',pkg.packageId);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const html=path.join(dir,'review.html');
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg,null,2)+'\n',{mode:0o600});
 fs.writeFileSync(html,renderPackage(pkg),{mode:0o600});
 return {html,packageId:pkg.packageId};
}
function main(args=process.argv.slice(2)) {
 const open=args.includes('--open');args=args.filter(x=>x!=='--open');
 if(args.length!==3)throw Error('Usage: npm run resume:prepare -- PROFILE.json SNAPSHOT.json VACANCY_ID [--open]');
 const result=prepare(...args);console.log('Resume review: '+result.html);
 if(open){const url=pathToFileURL(result.html).href;const child=process.platform==='win32'?spawn('rundll32',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});child.on('error',()=>console.error('Open the review.html path above manually.'));child.unref();}
}
if(require.main===module)try{main();}catch(e){console.error(/^JR_|^Usage:/.test(e.message)?e.message:'Resume preparation failed. Check local JSON files; personal data has not been logged.');process.exitCode=1;}
module.exports={prepare,main,writePackage,read};
