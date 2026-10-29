// Read-only requirements discovery. This module never submits applications.
const TYPES=new Set(['input_text','textarea','input_file','multi_value_single_select','multi_value_multi_select']);
function inspectForm(job) {
  if(!job || typeof job!=='object' || !Array.isArray(job.questions))throw new Error('JR_INVALID_APPLICATION_SCHEMA');
  const sections=['questions','location_questions','compliance','demographic_questions'];
  const groups=[],unknown=[];
  for(const section of sections) {
    if(section!=='questions' && job[section]===undefined)continue;
    if(!Array.isArray(job[section])){unknown.push(section);continue;}
    for(const q of job[section]) {
      if(!q || typeof q.required!=='boolean' || !Array.isArray(q.fields)||!q.fields.length) {unknown.push(section+':unrecognized_question');continue;}
      const fields=q.fields.map(f=>({name:typeof f?.name==='string'?f.name:null,type:f?.type||null,supported:TYPES.has(f?.type),options:Array.isArray(f?.values)?f.values.map(v=>({value:v.value,label:v.label})):[]}));
      if(fields.some(f=>!f.name||!f.supported))unknown.push(section+':unsupported_field');
      groups.push({section,label:typeof q.label==='string'?q.label:'',required:q.required,alternatives:fields});
    }
  }
  // These structures have their own semantics; never infer consent or sensitive answers.
  for(const key of ['data_compliance','demographic_questions'])if(job[key]!==undefined && (!Array.isArray(job[key])||job[key].length))unknown.push(key+':manual_review');
  return {channel:'greenhouse',apiSubmission:{status:'unsupported',reason:'employer_api_key_required'},hostedForm:{status:'required_action',reason:'browser_adapter_not_verified'},requirements:groups,unknowns:[...new Set(unknown)],note:'Field types describe discoverable inputs, not verified browser automation support'};
}
async function readForm(board,id,fetchImpl=fetch) {
  if(typeof board!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(board)||!/^\d+$/.test(String(id))||String(id).startsWith('0'))throw new Error('JR_INVALID_JOB_REFERENCE');
  const url=`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=true`;
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('JR_FORM_HTTP_'+response.status);
  const job=await response.json();
  if(String(job.id)!==String(id))throw new Error('JR_JOB_ID_MISMATCH');
  return inspectForm(job);
}
module.exports={inspectForm,readForm};
