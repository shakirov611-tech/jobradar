// Storage-aware preparation. Normalization alone cannot identify an insert.
function prepareVacancyUpsert(incoming, existing) {
  if (!Array.isArray(incoming) || !Array.isArray(existing)) throw new Error('JR_INVALID_STORAGE_INPUT');
  const existingById = new Map();
  for (const row of existing) {
    if (!row || !row.vacancy_id) continue; // Empty Sheets read placeholder / blank row.
    const id = String(row.vacancy_id);
    if (existingById.has(id)) throw new Error('JR_DUPLICATE_STORED_ID: resolve duplicate vacancy_id before writing');
    existingById.set(id, row);
  }
  const seen = new Set();
  return incoming.map(row => {
    if (!row || typeof row.vacancy_id !== 'string' || !row.vacancy_id) throw new Error('JR_INVALID_VACANCY_ID');
    if (seen.has(row.vacancy_id)) throw new Error('JR_DUPLICATE_INCOMING_ID');
    seen.add(row.vacancy_id);
    if (typeof row.last_seen_at !== 'string' || !Number.isFinite(Date.parse(row.last_seen_at))) throw new Error('JR_INVALID_OBSERVATION_TIME');
    const result = {...row};
    // Never let upstream data overwrite first_seen on an existing record.
    delete result.first_seen_at;
    if (!existingById.has(row.vacancy_id)) result.first_seen_at = row.last_seen_at;
    // Existing blank first_seen stays unknown; do not invent a historical date.
    return result;
  });
}
module.exports = {prepareVacancyUpsert};
