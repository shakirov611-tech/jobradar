const {createHash} = require('node:crypto');
const VERSION = 'language-v1';
const LEVELS = ['A1','A2','B1','B2','C1','C2','native'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function languageCode(value) {
  if (typeof value !== 'string' || !/^[a-z]{2,3}$/.test(value) || value === 'und') return false;
  try { return !!new Intl.DisplayNames(['en'],{type:'language',fallback:'none'}).of(value); } catch { return false; }
}
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const enumString = values => ({type:'string',enum:values});
const nullableString = {type:['string','null']};
const evidence = object({field:enumString(['title','description','posting_hint']),quote:{type:'string'}});
const certainty = enumString(['low','medium','high']);
const language = {type:'string'};
const requirement = object({language,level:{type:['string','null'],enum:[...LEVELS,null]},mandatory:{type:'boolean'},scope:enumString(['role','customer']),confidence:certainty,evidence});
const team = object({language,basis:enumString(['explicit','inferred']),confidence:certainty,evidence});
const SCHEMA = object({posting_language:nullableString,posting_evidence:{anyOf:[evidence,{type:'null'}]},required_languages:{type:'array',items:requirement},team_languages:{type:'array',items:team}});
function assertSchema(value, schema=SCHEMA) {
  if (schema.anyOf) { if (!schema.anyOf.some(s=>{try{assertSchema(value,s);return true;}catch{return false;}})) throw Error('JR_LANGUAGE_SCHEMA'); return; }
  const type=value===null?'null':Array.isArray(value)?'array':typeof value;
  if (!(Array.isArray(schema.type)?schema.type:[schema.type]).includes(type) || schema.enum&&!schema.enum.includes(value)) throw Error('JR_LANGUAGE_SCHEMA');
  if (type==='object') {
    if (Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)) || schema.required.some(k=>!Object.hasOwn(value,k))) throw Error('JR_LANGUAGE_SCHEMA');
    for (const [key,s] of Object.entries(schema.properties)) assertSchema(value[key],s);
  }
  if(type==='array') { if(value.length>16)throw Error('JR_LANGUAGE_SCHEMA');for(const item of value)assertSchema(item,schema.items); }
  if(type==='string'&&value.length>500)throw Error('JR_LANGUAGE_SCHEMA');
}
function validateAnalysis(value, input) {
  assertSchema(value);
  if(value.posting_language!==null&&!languageCode(value.posting_language))throw Error('JR_LANGUAGE_CODE');
  if((value.posting_language===null)!==(value.posting_evidence===null))throw Error('JR_LANGUAGE_EVIDENCE');
  const checkEvidence=e=>{if(!e.quote.trim()||!String(input[e.field]||'').includes(e.quote))throw Error('JR_LANGUAGE_EVIDENCE');};
  if(value.posting_evidence)checkEvidence(value.posting_evidence);
  for(const list of [value.required_languages,value.team_languages]) {
    const seen=new Set();
    for(const x of list) {
      if(!languageCode(x.language))throw Error('JR_LANGUAGE_CODE');
      if(x.basis==='inferred'&&x.confidence==='high')throw Error('JR_LANGUAGE_CONFIDENCE');
      const id=x.language+':'+(x.scope||'team');if(seen.has(id))throw Error('JR_LANGUAGE_DUPLICATE');seen.add(id);
      checkEvidence(x.evidence);
      // Source language metadata only describes the publication, never the team/requirements.
      if(x.evidence.field==='posting_hint')throw Error('JR_LANGUAGE_EVIDENCE_SCOPE');
    }
  }
  return value;
}
function emptyAnalysis() { return {posting_language:null,posting_evidence:null,required_languages:[],team_languages:[]}; }
function validatePreferences(p) {
  if(!p||Object.keys(p).some(k=>!['preferred_team_languages','candidate_languages','unknown_team_language_policy','preference_strength'].includes(k))||!['review','keep'].includes(p.unknown_team_language_policy)||!['low','medium','high'].includes(p.preference_strength))throw Error('JR_LANGUAGE_PREFERENCES');
  for(const key of ['preferred_team_languages','candidate_languages']) {
    const rows=p[key];if(!Array.isArray(rows)||rows.length>32)throw Error('JR_LANGUAGE_PREFERENCES');
    const seen=new Set();
    for(const x of rows) {
      if(!x||!languageCode(x.language)||seen.has(x.language)||Object.keys(x).some(k=>!['language',key==='candidate_languages'?'level':'weight'].includes(k)))throw Error('JR_LANGUAGE_PREFERENCES');
      seen.add(x.language);
      if(key==='candidate_languages'?!LEVELS.includes(x.level):!Number.isFinite(x.weight)||x.weight<0||x.weight>1)throw Error('JR_LANGUAGE_PREFERENCES');
    }
  }
  return p;
}
module.exports={VERSION,LEVELS,SCHEMA,hash,languageCode,assertSchema,validateAnalysis,emptyAnalysis,validatePreferences};
