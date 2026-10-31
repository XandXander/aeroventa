// Pure, testable safety invariants. No side effects or network calls.
export const PILOT_PATH = '/blog/detail/ntff-polisan/';
export const MAX_EXCERPT_LENGTH = 1600;

export function assertPilotDraft(record) {
  if (!record || typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error('Missing immutable Directus item ID');
  }
  if (record.path !== PILOT_PATH) throw new Error('Only the named pilot case may be edited');
  if (record.status !== 'draft') throw new Error('Only existing draft records may be edited');
  if (record.owner_approved_at !== null) throw new Error('Approved content is locked in pilot');
  if (typeof record.excerpt !== 'string') throw new Error('Invalid excerpt field');
  return true;
}

export function normalizeExcerpt(input) {
  if (typeof input !== 'string') throw new Error('Excerpt must be text');
  const text = input.trim();
  if (!text || text.length > MAX_EXCERPT_LENGTH) throw new Error('Excerpt must be 1–1600 characters');
  return text;
}

export function snapshot(record) {
  assertPilotDraft(record);
  return Object.freeze({
    id: record.id, path: record.path, status: record.status,
    owner_approved_at: record.owner_approved_at, excerpt: record.excerpt,
  });
}

export function assertUnchanged(previous, current) {
  assertPilotDraft(current);
  if (!previous || ['id','path','status','owner_approved_at','excerpt'].some(key => previous[key] !== current[key])) {
    throw new Error('Draft changed since it was loaded; refresh instead of overwriting someone else');
  }
  return true;
}

export function buildDraftPatch(previous, current, input) {
  assertUnchanged(previous, current);
  const excerpt = normalizeExcerpt(input);
  if (excerpt === current.excerpt) throw new Error('No change to save');
  return Object.freeze({ excerpt }); // Never modify status, approvals, SEO, paths or media.
}
