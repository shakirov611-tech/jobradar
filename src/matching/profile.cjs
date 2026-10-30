const {createHash} = require('node:crypto');
const ROLES = ['product', 'growth', 'product_owner', 'delivery'];
const SENIORITY = ['junior', 'middle', 'senior', 'lead', 'head', 'executive'];
const LANGUAGES = ['ru', 'en', 'bg'];
function validateProfile(profile) {
  if (!profile || profile.version !== 1 || profile.country !== 'BG' || typeof profile.remotePreferred !== 'boolean' || profile.rolePolicy !== 'product-growth-delivery-v1' || profile.unknownPolicy !== 'review' || profile.languagePolicy !== 'do_not_infer_team_language_from_job_text') throw new Error('JR_INVALID_SEARCH_PROFILE');
  if (profile.matching === undefined) return profile; // Existing local configurations remain usable.
  const m = profile.matching;
  const keys = ['policy', 'primaryRoles', 'secondaryRoles', 'preferredSeniority', 'preferredTeamLanguages', 'remoteOnly'];
  if (!m || Object.keys(m).some(k => !keys.includes(k)) || m.policy !== 'personal-match-v1' || m.remoteOnly !== true) throw new Error('JR_INVALID_MATCH_PROFILE');
  for (const [key, allowed] of [['primaryRoles', ROLES], ['secondaryRoles', ROLES], ['preferredSeniority', SENIORITY], ['preferredTeamLanguages', LANGUAGES]]) {
    if (!Array.isArray(m[key]) || m[key].some(x => !allowed.includes(x)) || new Set(m[key]).size !== m[key].length) throw new Error('JR_INVALID_MATCH_PROFILE');
  }
  if (!m.primaryRoles.length || m.secondaryRoles.some(x => m.primaryRoles.includes(x))) throw new Error('JR_INVALID_MATCH_PROFILE');
  return profile;
}
function profileFingerprint(profile) {
  validateProfile(profile);
  const m = profile.matching;
  const value = {version: profile.version, country: profile.country, remotePreferred: profile.remotePreferred, rolePolicy: profile.rolePolicy, unknownPolicy: profile.unknownPolicy, languagePolicy: profile.languagePolicy, matching: m ? {policy:m.policy,primaryRoles:m.primaryRoles,secondaryRoles:m.secondaryRoles,preferredSeniority:m.preferredSeniority,preferredTeamLanguages:m.preferredTeamLanguages,remoteOnly:m.remoteOnly} : null};
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
module.exports = {validateProfile, profileFingerprint};
