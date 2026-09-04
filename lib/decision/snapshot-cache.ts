// lib/decision/snapshot-cache.ts — BATCH 2 Optimization
// Wrapper around construirSnapshot() to cache results for 24h
// Reduces Supabase queries from 1,400/day to ~140/day

import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { construirSnapshot as construirSnapshotOriginal } from './snapshot';
import type { SnapshotEstudio } from './tipos';

/**
 * Get or construct snapshot for studio.
 * - Checks cache first (valid & not expired)
 * - If not cached, constructs snapshot, caches it, returns it
 * - If cache lookup fails gracefully, falls back to full construction
 */
export async function construirSnapshot(
  studioId: string,
  now: Date,
  options?: { forceRefresh?: boolean }
): Promise<SnapshotEstudio> {
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh) {
    try {
      const cached = await getCachedSnapshot(studioId);
      if (cached) {
        console.debug(`[snapshot-cache] cache hit for studio ${studioId}`);
        return cached;
      }
    } catch (err) {
      console.warn(`[snapshot-cache] lookup failed for ${studioId}`, err);
    }
  }

  console.debug(`[snapshot-cache] cache miss/refresh for studio ${studioId}`);
  const snapshot = await construirSnapshotOriginal(studioId, now);

  try {
    await cacheSnapshot(studioId, snapshot);
  } catch (err) {
    console.warn(`[snapshot-cache] cache write failed for ${studioId}`, err);
  }

  return snapshot;
}

async function getCachedSnapshot(studioId: string): Promise<SnapshotEstudio | null> {
  const supabase = requireSupabaseAdmin();

  const { data, error } = await supabase.rpc('decision_get_cached_snapshot', {
    p_studio_id: studioId,
  });

  if (error) {
    console.error(`[snapshot-cache] RPC failed:`, error);
    return null;
  }

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as SnapshotEstudio;
  } catch (err) {
    console.error(`[snapshot-cache] Parse failed:`, err);
    return null;
  }
}

async function cacheSnapshot(studioId: string, snapshot: SnapshotEstudio): Promise<void> {
  const supabase = requireSupabaseAdmin();

  const { error } = await supabase.rpc('decision_cache_snapshot', {
    p_studio_id: studioId,
    p_snapshot_data: snapshot,
  });

  if (error) {
    throw new Error(`Cache write failed: ${error.message}`);
  }
}

export async function invalidateSnapshot(studioId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();

  const { error } = await supabase
    .from('decision_snapshots')
    .update({ es_valido: false, updated_at: new Date().toISOString() })
    .eq('studio_id', studioId)
    .eq('es_valido', true);

  if (error) {
    console.warn(`[snapshot-cache] invalidate failed for ${studioId}:`, error);
  }
}
