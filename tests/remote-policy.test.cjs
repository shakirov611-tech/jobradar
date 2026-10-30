const {test}=require('node:test');const assert=require('node:assert/strict');
const {classifyGeography:geo,classifyWorkMode:mode}=require('../src/matching/role-and-geography.cjs');const p=require('../config/search-profile.json');
test('location without confirmed remote is hidden, not assumed office',()=>{const g=geo('Berlin','Unknown',p,'We build products.');assert.equal(g.visibility,'unclear');assert.equal(g.workMode,'unknown');});
test('encoded description can confirm remote and retains evidence',()=>{const g=geo('Europe','Unknown',p,'&lt;p&gt;This role is fully remote.&lt;/p&gt;');assert.equal(g.visibility,'main');assert.equal(g.workMode,'remote');assert.equal(g.evidence.source,'description');assert.match(g.evidence.snippet,/remote/);});
test('incidental remote references and benefits do not confirm this job format',()=>{for(const text of ['We build tools for remote teams.','We build tools for fully remote teams.','Our clients are remote-first companies.','Our customers work remotely with partners.','You will manage remote engineers.'])assert.equal(geo('Paris','Unknown',p,text).visibility,'unclear',text);});
test('onsite, negative remote and mandatory hybrid are excluded',()=>{for(const [location,workplace,text] of [['Paris','on-site',''],['Europe','Unknown','This is not a remote role.'],['Europe','Unknown','This is a hybrid role.'],['Europe','remote','You must attend the office three days weekly.']])assert.equal(geo(location,workplace,p,text).visibility,'excluded',text);});
test('conflicting structured and description conditions go to review',()=>{const g=geo('Remote','remote',p,'Remote work is not available.');assert.equal(g.visibility,'unclear');assert.equal(g.formatReason,'conflicting_work_mode_signals');});
test('generic office mentions do not cancel an explicit remote role',()=>{assert.equal(geo('Europe','Unknown',p,'This role is fully remote. We have offices in London and New York.').visibility,'main');});
test('explicit description hiring restriction excludes remote but company office list does not',()=>{assert.equal(geo('Remote','remote',p,'Candidates must be based in the United States.').visibility,'excluded');assert.equal(geo('Europe','remote',p,'Our offices are in the US and Canada.').visibility,'main');});
test('BG location alone is not remote; hybrid field overrides generic remote preference',()=>{assert.equal(geo('Bulgaria','Unknown',p).visibility,'unclear');assert.equal(mode('Remote','hybrid','').mode,'hybrid');});
test('explicit non-BG countries exclude but an allowed BG alternative in the same clause does not',()=>{assert.equal(geo('Europe','remote',p,'You must be based in Poland.').visibility,'excluded');assert.equal(geo('Europe','remote',p,'You must be based in Germany or Bulgaria.').visibility,'main');});
test('not fully remote is not promoted by the embedded positive phrase',()=>{assert.equal(geo('Europe','Unknown',p,'This role is not fully remote.').visibility,'excluded');});
test('optional office attendance does not impose hybrid on an explicit remote role',()=>{assert.equal(geo('Europe','remote',p,'You are not required to attend the office two days weekly.').visibility,'main');});
test('separate HTML paragraphs do not turn a company office into an allowed hiring alternative',()=>{assert.equal(geo('Europe','remote',p,'&lt;p&gt;You must be based in Germany&lt;/p&gt;&lt;p&gt;We have offices in Bulgaria&lt;/p&gt;').visibility,'excluded');});
test('explicit home-based location is remote evidence, not an unexplained city',()=>{assert.equal(geo('Home based - EMEA','Unknown',p).visibility,'main');assert.equal(geo('Europe','Unknown',p,'This role is home-based.').visibility,'main');});
test('optional hybrid in a remote-first benefit does not require an office',()=>{
 for(const text of [
  'Remote-first approach with the option for hybrid work from our offices in Kyiv, Warsaw, and Lisbon.',
  'This role is fully remote. Optional hybrid working is available.',
  'This role is fully remote. Hybrid work is optional.',
  'This role is fully remote. You can choose a hybrid model.'
 ])assert.equal(geo('Remote (Europe)','Unknown',p,text).visibility,'main',text);
});
test('optional hybrid never hides a separate mandatory office requirement',()=>{
 for(const text of [
  'Remote-first with the option for hybrid work. You must attend the office three days weekly.',
  'Hybrid work is optional, but you must attend the office three days weekly.',
  'You are not required to attend the office weekly, but this role is office based in Taipei.'
 ])assert.equal(geo('Europe','remote',p,text).visibility,'excluded',text);
 assert.equal(geo('Europe','hybrid',p,'Remote-first with optional hybrid work.').visibility,'excluded');
});
test('role office requirement and office location outrank generic company remote language',()=>{
 const text='Location: This role will be office based in Taipei, Taiwan. Our company is remote-first. #LI-remote';
 const g=geo('Office Based - Taipei, Taiwan','Unknown',p,text);
 assert.equal(g.workMode,'onsite');assert.equal(g.visibility,'excluded');assert.equal(g.formatReason,'role_requires_office');assert.match(g.evidence.snippet,/This role will be office based/);
 assert.equal(geo('Remote','remote',p,text).workMode,'onsite');
 assert.equal(geo('Office Based - Taipei, Taiwan','Unknown',p,'We are a remote-first company.').workMode,'onsite');
 assert.equal(geo('Europe','Unknown',p,'Our company is remote-first with very few office based roles.').workMode,'remote');
 for(const text of ['The position requires working on-site.','This role requires you to be office based.','Role is office-based.'])assert.equal(geo('Europe','Unknown',p,text+' Our company is remote-first.').workMode,'onsite',text);
});
test('contradictory role remote and structured office stay unclear',()=>{
 const g=geo('Office Based - Taipei, Taiwan','Unknown',p,'This role is fully remote.');
 assert.equal(g.workMode,'unknown');assert.equal(g.visibility,'unclear');
});
test('explicit candidate country limits outrank global company culture',()=>{
 for(const country of ['Germany','the UK','the United States']){
  const g=geo('Remote','remote',p,`We are a 100% remote company. This is a fully remote position and we're considering candidates in ${country}. Global culture. We have offices in Bulgaria.`);
  assert.equal(g.visibility,'excluded',country);assert.match(g.countryEvidence,/considering candidates/);
 }
 assert.equal(geo('Remote','remote',p,'This role is based in Singapore with frequent travel.').visibility,'excluded');
 assert.equal(geo('Europe','remote',p,'We are hiring candidates located in Germany.').visibility,'excluded');
});
test('BG must be an alternative in the hiring list, not an unrelated office or pay statement',()=>{
 for(const text of ['We are considering candidates in Germany or Bulgaria.','Candidates must be based in Germany, Poland, or Bulgaria.','We are considering candidates in the UK, Germany and Bulgaria.','We are not considering candidates in Germany.','If you are based in Poland, the salary range is 31000 PLN.','Our offices in Germany and Bulgaria serve customers worldwide.'])assert.equal(geo('Europe','remote',p,text).visibility,'main',text);
 for(const text of ['We are considering candidates in Germany, with offices in Bulgaria.','You must be based in Germany, and our company has an office in Bulgaria.','Candidates must be based in Germany. Bulgaria is an office location.'])assert.equal(geo('Europe','remote',p,text).visibility,'excluded',text);
});
test('limited work-abroad benefit alone does not confirm full remote or BG eligibility',()=>{
 for(const text of ['You can work remotely for up to 90 days annually.','Work from abroad for up to 90 days annually. Home Office Setup.']){
  const g=geo('India, Hyderabad','Unknown',p,text);assert.equal(g.visibility,'unclear');assert.equal(g.workMode,'unknown');assert.equal(g.formatReason,'temporary_remote_only');assert.equal(g.status,'review');
 }
 const g=geo('Europe','remote',p,'You can work remotely from abroad for up to 90 days annually.');
 assert.equal(g.workMode,'remote');assert.equal(g.status,'review');assert.equal(g.workAuthorization,'unknown');
});
test('explicit broader alternatives do not become a closed foreign-country list',()=>{
 for(const text of ['We are considering candidates in Germany or anywhere in Europe.','We are considering candidates in Germany or any EU country.','We are hiring candidates in Germany or from Bulgaria.','We are not only considering candidates in Germany.']){
  const g=geo('Europe','remote',p,text);assert.equal(g.visibility,'main',text);assert.equal(g.status,'review');assert.equal(g.workAuthorization,'unknown');
 }
});
