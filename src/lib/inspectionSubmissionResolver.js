import { base44 } from '@/api/base44Client';

/**
 * Resolves the authoritative InspectionSubmission for a given job + inspection type.
 *
 * Selection rules (in priority order):
 *   1. Prefer submitted/reviewed/approved records over drafts.
 *   2. Prefer records explicitly marked is_authoritative === true.
 *   3. Prefer the most recently updated record.
 *   4. Prefer records containing answers or photos.
 *
 * Returns:
 *   { authoritative: <record|null>, duplicates: <record[]>, all: <record[]> }
 *
 * Does NOT delete or modify any records. Callers may mark duplicates as
 * superseded separately if needed.
 */
export async function resolveAuthoritativeInspectionSubmission({ job_id, appointment_id, inspection_type }) {
  if (!job_id || !inspection_type) {
    return { authoritative: null, duplicates: [], all: [] };
  }

  let submissions = [];
  try {
    submissions = await base44.entities.InspectionSubmission.filter(
      { job_id, inspection_type },
      '-updated_date'
    );
  } catch {
    return { authoritative: null, duplicates: [], all: [] };
  }

  if (!submissions || submissions.length === 0) {
    return { authoritative: null, duplicates: [], all: [] };
  }

  // Step 1: Prefer submitted/reviewed/approved records
  const submittedPool = submissions.filter(s =>
    ['submitted', 'reviewed', 'approved', 'complete'].includes(s.status)
  );
  const pool = submittedPool.length > 0 ? submittedPool : submissions;

  // Step 2-4: Sort by is_authoritative, then updated_date, then content richness
  const sorted = [...pool].sort((a, b) => {
    // is_authoritative: true first (treat undefined as true for legacy records)
    const aAuth = a.is_authoritative !== false;
    const bAuth = b.is_authoritative !== false;
    if (aAuth && !bAuth) return -1;
    if (!aAuth && bAuth) return 1;

    // Most recently updated first
    const aDate = new Date(a.updated_date || a.date_submitted || a.created_date || 0).getTime();
    const bDate = new Date(b.updated_date || b.date_submitted || b.created_date || 0).getTime();
    if (bDate !== aDate) return bDate - aDate;

    // Prefer records with answers or photos
    const aContent = (a.answers ? a.answers.length : 0) + (a.photos ? a.photos.length : 0);
    const bContent = (b.answers ? b.answers.length : 0) + (b.photos ? b.photos.length : 0);
    return bContent - aContent;
  });

  const authoritative = sorted[0] || null;
  const duplicates = sorted.slice(1);

  return { authoritative, duplicates, all: submissions };
}

/**
 * Marks all non-authoritative submissions as superseded.
 * Does NOT delete any records — preserves all data for audit.
 *
 * @returns { authoritative, superseded: [{id, previous_status}], all }
 */
export async function markDuplicatesAsSuperseded({ job_id, inspection_type }) {
  const { authoritative, duplicates, all } = await resolveAuthoritativeInspectionSubmission({
    job_id,
    inspection_type,
  });

  if (!authoritative) {
    return { authoritative: null, superseded: [], all };
  }

  // Mark the authoritative record
  try {
    await base44.entities.InspectionSubmission.update(authoritative.id, {
      is_authoritative: true,
    });
  } catch (e) {
    console.error('[SubmissionResolver] Failed to mark authoritative:', e.message);
  }

  // Mark duplicates as superseded (preserve all data, don't delete)
  const superseded = [];
  for (const dup of duplicates) {
    if (dup.is_authoritative === false && dup.superseded_by_id) continue; // already superseded
    try {
      await base44.entities.InspectionSubmission.update(dup.id, {
        is_authoritative: false,
        superseded_by_id: authoritative.id,
      });
      superseded.push({ id: dup.id, previous_status: dup.status });
    } catch (e) {
      console.error('[SubmissionResolver] Failed to supersede', dup.id, e.message);
    }
  }

  return { authoritative, superseded, all };
}