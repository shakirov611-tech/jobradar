const fs=require('node:fs'),path=require('node:path');
const {buildPackage,validateProfile}=require('../src/resumes/package.cjs');
const {writePackage,read}=require('./prepare-resume.cjs');
const {renderCatalog}=require('../src/reports/catalog-preview.cjs');
function attachResumes(collection,profile,{root=path.resolve(__dirname,'..')}={}) {
 validateProfile(profile);
 if(!collection||!Array.isArray(collection.catalog)||collection.catalog.length>2000)throw Error('JR_INVALID_RESUME_CATALOG');
 const ids=new Set();
 for(const row of collection.catalog){if(!row||typeof row.vacancy_id!=='string'||ids.has(row.vacancy_id))throw Error('JR_INVALID_RESUME_CATALOG');ids.add(row.vacancy_id);}
 // Validate every package before writes, preserving original vacancy identifiers.
 const packages=collection.catalog.filter(row=>row.role?.matched).map(row=>buildPackage(profile,row));
 const links=Object.create(null);
 for(const pkg of packages){writePackage(pkg,root);links[pkg.vacancy.vacancy_id]='../exports-private/resumes/'+pkg.packageId+'/review.html';}
 return links;
}
function createCatalog(profileFile,snapshotFile,{root=path.resolve(__dirname,'..')}={}) {
 const profile=read(profileFile),snapshot=read(snapshotFile);
 const collection=Array.isArray(snapshot.catalog)?snapshot:{catalog:snapshot.items,profile:snapshot.profile,sources:snapshot.sourceResults||[],observedAt:snapshot.observedAt,rows:(snapshot.items||[]).filter(x=>x.role?.matched),total:(snapshot.items||[]).length};
 const links=attachResumes(collection,profile,{root});
 const html=renderCatalog(collection,{resumePaths:links});
 const dir=path.join(root,'.collector-state');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'resume-catalog.html');fs.writeFileSync(file,html,{mode:0o600});return file;
}
if(require.main===module)try{
 const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: npm run resume:catalog -- PROFILE.json SNAPSHOT.json');
 console.log('Open catalog: '+createCatalog(...args));
}catch(e){console.error(/^JR_|^Usage:/.test(e.message)?e.message:'Resume catalog failed. Check local profile and snapshot JSON.');process.exitCode=1;}
module.exports={attachResumes,createCatalog};
