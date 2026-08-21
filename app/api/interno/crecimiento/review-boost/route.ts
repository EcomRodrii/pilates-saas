import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { resumirReviewBoost } from '@/lib/interno/review-boost';

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'growth.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [elegibles, mostrados, feedbacks, recompensas] = await Promise.all([
    db.from('studios').select('id', { count: 'exact', head: true }).not('review_boost_elegible_en', 'is', null),
    db.from('studios').select('id', { count: 'exact', head: true }).not('review_boost_mostrado_en', 'is', null),
    db.from('review_boost_feedback').select('rating'),
    db.from('review_boost_recompensas').select('concedida_en, canjeada_en'),
  ]);

  return NextResponse.json(resumirReviewBoost({
    elegibles: elegibles.count ?? 0,
    mostrados: mostrados.count ?? 0,
    feedbacks: (feedbacks.data ?? []).map(f => ({ rating: f.rating as number })),
    recompensas: (recompensas.data ?? []).map(r => ({
      concedidaEn: String(r.concedida_en), canjeadaEn: (r.canjeada_en as string | null) ?? null,
    })),
  }));
}
