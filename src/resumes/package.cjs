const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = () => { throw new Error('JR_INVALID_FACT_PROFILE'); };
const statuses = ['confirmed','imported','needs_context','conflicting','superseded','not_selected'];
function validateProfile(p) {
 if (!p || p.schema !== 'jobradar-candidate-facts-draft' || p.schema_version !== 1 || typeof p.subject !== 'string' || !p.subject.trim() || !Array.isArray(p.facts) || p.facts.length > 1000 || !Array.isArray(p.sources)) fail();
 const sources = new Set(p.sources.map(s=>s.id)), ids = new Set();
 for (const f of p.facts) {
  if (!f || typeof f.id !== 'string' || !f.id || ids.has(f.id) || typeof f.subject !== 'string' || typeof f.field !== 'string' || !statuses.includes(f.status) || typeof f.approved_for_generation !== 'boolean' || f.value === undefined || !Array.isArray(f.source_refs)) fail();
  ids.add(f.id);
  if (f.source_refs.some(s=>!s || !sources.has(s.source_id) || typeof s.excerpt !== 'string')) fail();
  if (!f.source_refs.length && !f.confirmation) fail();
  if (f.approved_for_generation && (f.status !== 'confirmed' || !f.confirmation)) fail();
 }
 return p;
}
function textValue(v) {
 if (v === null) return '';
 if (typeof v !== 'object') return String(v);
 if (Array.isArray(v)) return v.map(textValue).join(', ');
 if (v.reported_value) return `${v.name}: ${v.reported_value}`;
 if (v.start && v.end) return `${v.start} — ${v.end}`;
 return Object.entries(v).filter(([,x])=>x!==null).map(([k,x])=>`${k}: ${textValue(x)}`).join('; ');
}
function buildPackage(profile, vacancy) {
 validateProfile(profile);
 if (!vacancy || typeof vacancy.vacancy_id !== 'string' || !vacancy.vacancy_id || typeof vacancy.title !== 'string' || !vacancy.title.trim()) throw new Error('JR_INVALID_RESUME_VACANCY');
 const job = {vacancy_id:vacancy.vacancy_id,title:vacancy.title,company:String(vacancy.company||''),description:String(vacancy.reviewText||vacancy.description||'').slice(0,12000)};
 const tokens = new Set((job.title+' '+job.description).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]);
 const policy=profile.resume_presentation_policy||{};
 const facts=profile.facts.map(f=>{
  const text=textValue(f.value);
  const hidden=policy.cofounder_status?.show_in_generated_resumes===false && /co[ -]?founder|соосновател|кофаундер/i.test(text);
  const blocked=hidden||['conflicting','superseded','not_selected'].includes(f.status);
  const approved=!blocked&&f.approved_for_generation&&f.status==='confirmed';
  const score=[...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[])].filter(t=>tokens.has(t)).length;
  return {id:f.id,subject:f.subject,field:f.field,text,status:f.status,blocked,approved,score,sourceRefs:f.source_refs.map(s=>({...s})),confirmation:f.confirmation||null};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const titles={};
 for(const [subject,p] of Object.entries(policy)) {
  if(p.display_title) titles[subject]=p.display_title;
  else if(p.title_selection==='vacancy_dependent'&&Array.isArray(p.allowed_titles)) {
   const delivery=/project|delivery|проект|деливери/i.test(job.title);
   titles[subject]=p.allowed_titles.find(t=>delivery?/project|delivery/i.test(t):/product/i.test(t))||p.allowed_titles[0];
  }
 }
 const body={schemaVersion:1,policy:'source-facts-resume-v1',candidate:profile.subject,profileHash:hash(profile),vacancyHash:hash(job),vacancy:job,titles,facts};
 return {...body,packageId:hash(body)};
}
// Same checks in browser and Node; selections cannot create or rewrite a fact.
function validateSelection(pkg, selection) {
 if(!selection||selection.packageId!==pkg.packageId||!Array.isArray(selection.factIds)||!selection.factIds.length||new Set(selection.factIds).size!==selection.factIds.length||!Array.isArray(selection.approvedFactIds)) throw new Error('JR_INVALID_RESUME_SELECTION');
 const selected=selection.factIds.map(id=>pkg.facts.find(f=>f.id===id));
 if(selected.some(f=>!f||f.blocked||(!f.approved&&!selection.approvedFactIds.includes(f.id)))) throw new Error('JR_UNAPPROVED_RESUME_FACT');
 return selected;
}
module.exports={hash,validateProfile,textValue,buildPackage,validateSelection};
