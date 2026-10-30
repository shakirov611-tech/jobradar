const {createHash} = require('node:crypto');
const {profileFingerprint} = require('./profile.cjs');
function hash(value) {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function bucket(row) {return !row.role.matched ? 'other_roles' : row.geography.visibility;}
function buildReview(collection, limit=24) {
  if (!Number.isInteger(limit) || limit<1 || limit>30) throw new Error('JR_INVALID_REVIEW_LIMIT');
  const fingerprint=profileFingerprint(collection.profile);
  const seen=new Set();
  for(const row of collection.catalog) {
    if(!row.vacancy_id||seen.has(row.vacancy_id)||!row.matching)throw new Error('JR_INVALID_REVIEW_CATALOG');
    seen.add(row.vacancy_id);
  }
  const pools=['main','unclear','excluded','other_roles'].map(group=>{
    const bySource=new Map();
    for(const row of collection.catalog.filter(r=>bucket(r)===group).sort((a,b)=>hash(a.vacancy_id).localeCompare(hash(b.vacancy_id)))) {
      if(!bySource.has(row.sourceId))bySource.set(row.sourceId,[]);
      bySource.get(row.sourceId).push(row);
    }
    const queues=[...bySource].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows);
    const ordered=[];
    while(queues.some(q=>q.length))for(const q of queues)if(q.length)ordered.push(q.shift());
    return ordered;
  });
  const rows=[];
  while(rows.length<limit&&pools.some(q=>q.length))for(const pool of pools)if(pool.length&&rows.length<limit)rows.push(pool.shift());
  const items=rows.map(row=>({...row,bucket:bucket(row),contentHash:hash(row)}));
  const geographyPolicies=[...new Set(collection.catalog.map(row=>row.geography.policy||'remote-bg-v1'))].sort();
  const snapshot={schemaVersion:1,policy:collection.profile.matching?.policy||'unconfigured',geographyPolicies,profile:collection.profile,profileFingerprint:fingerprint,observedAt:collection.observedAt,requested:limit,selection:'balanced-groups-and-sources-v1',sourceResults:collection.sources,items};
  return {...snapshot,snapshotId:hash(snapshot)};
}
function validateLabels(snapshot, labels) {
  const {snapshotId,...body}=snapshot;
  if(hash(body)!==snapshotId||profileFingerprint(snapshot.profile)!==snapshot.profileFingerprint)throw new Error('JR_REVIEW_SNAPSHOT_CHANGED');
  validateAnswers(snapshot,labels);
}
// Self-contained so the offline page uses the same validation as the CLI.
function validateAnswers(snapshot, labels) {
  if(!labels||![1,2].includes(labels.schemaVersion)||labels.snapshotId!==snapshot.snapshotId||labels.profileFingerprint!==snapshot.profileFingerprint||labels.policy!==snapshot.policy||!Array.isArray(labels.answers)||labels.answers.length>snapshot.items.length)throw new Error('JR_REVIEW_LABELS_MISMATCH');
  const seen=new Set();
  for(const answer of labels.answers) {
    if(!answer||typeof answer!=='object')throw new Error('JR_INVALID_REVIEW_ANSWER');
    const row=snapshot.items.find(x=>x.vacancy_id===answer.vacancy_id);
    const validLabel=['suitable','unsuitable','uncertain'].includes(answer.label)||(labels.schemaVersion===2&&answer.label===null);
    if(!row||seen.has(answer.vacancy_id)||row.contentHash!==answer.contentHash||!validLabel||typeof answer.reason!=='string'||answer.reason.length>500)throw new Error('JR_INVALID_REVIEW_ANSWER');
    seen.add(answer.vacancy_id);
    if(answer.assessment!==undefined) {
      const a=answer.assessment,allowed={roleInterest:['suitable','unsuitable','uncertain'],conditions:['suitable','unsuitable','uncertain'],description:['readable','unreadable']};
      if(labels.schemaVersion!==2||!a||typeof a!=='object'||Array.isArray(a)||Object.entries(a).some(([key,value])=>!Object.hasOwn(allowed,key)||!allowed[key].includes(value)))throw new Error('JR_INVALID_REVIEW_ASSESSMENT');
    }
  }
}
function summarizeReview(snapshot, labels) {
  validateLabels(snapshot,labels);
  const matrix=Object.fromEntries(['priority','review','excluded'].map(x=>[x,{suitable:0,unsuitable:0,uncertain:0,unlabeled:0}]));
  const assessments={roleInterest:{suitable:0,unsuitable:0,uncertain:0,unrated:0},conditions:{suitable:0,unsuitable:0,uncertain:0,unrated:0},description:{readable:0,unreadable:0,unrated:0}};
  for(const row of snapshot.items) {
    const answer=labels.answers.find(x=>x.vacancy_id===row.vacancy_id);
    matrix[row.matching.decision][answer?.label||'unlabeled']++;
    for(const [key,counts] of Object.entries(assessments))counts[answer?.assessment?.[key]||'unrated']++;
  }
  const labeled=labels.answers.filter(a=>a.label!==null).length;
  return {snapshotId:snapshot.snapshotId,observedAt:snapshot.observedAt,total:snapshot.items.length,labeled,unlabeled:snapshot.items.length-labeled,complete:labeled===snapshot.items.length,matrix,assessments,priorityRejected:matrix.priority.unsuitable,excludedButUseful:matrix.excluded.suitable,note:'Balanced diagnostic sample, not market-wide accuracy. Raw labels are preserved. Disagreements need eligibility/evidence review before counting model errors. Uncertain, unlabeled and unrated dimensions are not negatives.'};
}
module.exports={buildReview,validateLabels,validateAnswers,summarizeReview};
