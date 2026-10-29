const {test}=require('node:test');const assert=require('node:assert/strict');
const {requestAllowed,validateTarget}=require('../src/applications/browser-dry-run.cjs');
test('live browser policy permits known HTTPS reads but denies writes and arbitrary hosts',()=>{
 assert.equal(requestAllowed('GET','https://job-boards.greenhouse.io/airbnb/jobs/1'),true);
 for(const [method,url] of [['POST','https://job-boards.greenhouse.io/upload'],['GET','http://job-boards.greenhouse.io'],['GET','https://evil.greenhouse.io'],['DELETE','https://careers.airbnb.com']])assert.equal(requestAllowed(method,url),false);
});
test('fixture policy permits only same-origin upload POST, never application or exfiltration',()=>{
 const origin='http://127.0.0.1:1234';assert.equal(requestAllowed('GET',origin+'/fixture/apply',origin),false);assert.equal(requestAllowed('POST',origin+'/fixture/upload',origin),true);
 for(const url of [origin+'/fixture/apply',origin+'/fixture/upload?submit=1','http://127.0.0.1:9999/fixture/upload','https://job-boards.greenhouse.io/fixture/upload'])assert.equal(requestAllowed('POST',url,origin),false);
});
test('live entry targets reject arbitrary URLs, credentials and session query strings',()=>{
 assert.ok(validateTarget('https://job-boards.greenhouse.io/airbnb/jobs/8262207'));
 assert.ok(validateTarget('https://careers.airbnb.com/positions/8262207/'));
 for(const url of ['https://example.com','https://u:p@job-boards.greenhouse.io/a/jobs/1','https://job-boards.greenhouse.io/embed/job_app?validityToken=secret','http://job-boards.greenhouse.io/a/jobs/1'])assert.throws(()=>validateTarget(url));
});
