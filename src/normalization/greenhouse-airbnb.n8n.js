
// Validate the complete feed before producing items for Google Sheets.
// A malformed response is an error, not a successful empty collection.
const firstItem = $input.first();
const input = firstItem?.json;
if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.jobs)) {
  throw new Error('JR_INVALID_FEED: expected an object with a jobs array');
}
const jobs = input.jobs;

for (const [index, job] of jobs.entries()) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    throw new Error(`JR_INVALID_JOB: jobs[${index}] must be an object`);
  }
  const id = job.id;
  const validId =
    (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
    (typeof id === 'string' && /^[1-9]\d*$/.test(id));
  if (!validId) {
    throw new Error(`JR_INVALID_JOB_ID: jobs[${index}] requires a positive integer ID`);
  }
}

// Пока оставляем только целевые должности
const rolePattern =
  /\b(product manager|product owner|product lead|growth product|growth manager|monetization manager|project manager|delivery manager|program manager|head of product)\b/i;

const filtered = jobs.filter(job =>
  rolePattern.test(job.title || '')
);

return filtered.map(job => {
  const workplace = (job.metadata || [])
    .find(field => field.name === 'Workplace Type');

  return {
    json: {
      vacancy_id: `greenhouse_airbnb_${job.id}`,
      company: job.company_name || 'Airbnb',
      title: job.title || '',
      source: 'Greenhouse',
      original_url: job.absolute_url || '',
      canonical_url: job.absolute_url || '',
      location: job.location?.name || '',
      workplace_type: workplace?.value || 'Unknown',
      language: job.language || 'Unknown',
      published_at: job.first_published || '',
      updated_at: job.updated_at || '',
      active_status: 'active_in_feed',
      description: (job.content || '').slice(0, 30000),
      last_seen_at: new Date().toISOString()
    }
  };
});
