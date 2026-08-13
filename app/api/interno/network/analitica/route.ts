import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Analítica de Tentare Network — última pieza del brief 0→100 (tras
// marketplace/SEO/reviews/mensajería/geolocalización). Mismo principio que
// /interno/page.tsx: ningún número sin procedencia, y lo que no se puede
// calcular todavía se dice explícitamente en vez de mostrarse como 0.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [perfilesRes, solicitudesRes, resenasRes] = await Promise.all([
    db.from('red_perfiles').select('estado, creado_en, ultimo_acceso_en'),
    db.from('red_solicitudes_contacto').select('estado'),
    db.from('red_resenas').select('estado, puntuacion'),
  ]);
  if (perfilesRes.error) return NextResponse.json({ error: 'No se han podido cargar los perfiles.' }, { status: 500 });
  if (solicitudesRes.error) return NextResponse.json({ error: 'No se han podido cargar las solicitudes.' }, { status: 500 });
  if (resenasRes.error) return NextResponse.json({ error: 'No se han podido cargar las reseñas.' }, { status: 500 });

  const perfiles = perfilesRes.data ?? [];
  const solicitudes = solicitudesRes.data ?? [];
  const resenas = resenasRes.data ?? [];

  const altasPorMes = new Map<string, number>();
  for (const p of perfiles) {
    const mes = String(p.creado_en ?? '').slice(0, 7);
    if (mes) altasPorMes.set(mes, (altasPorMes.get(mes) ?? 0) + 1);
  }

  // Tasa de aceptación solo sobre solicitudes YA RESUELTAS (aceptada/rechazada)
  // — una pendiente no es ni sí ni no, incluirla en el denominador la
  // subestimaría de forma artificial.
  const resueltas = solicitudes.filter(s => s.estado === 'aceptada' || s.estado === 'rechazada');
  const aceptadas = solicitudes.filter(s => s.estado === 'aceptada');

  const publicadas = resenas.filter(r => r.estado === 'publicada');
  const promedioGeneral = publicadas.length > 0
    ? Math.round((publicadas.reduce((acc, r) => acc + r.puntuacion, 0) / publicadas.length) * 10) / 10
    : null;

  return NextResponse.json({
    perfiles: {
      total: perfiles.length,
      publicados: perfiles.filter(p => p.estado === 'published').length,
      borradores: perfiles.filter(p => p.estado === 'draft').length,
      suspendidos: perfiles.filter(p => p.estado === 'suspended').length,
      ocultos: perfiles.filter(p => p.estado === 'hidden').length,
      altasUltimos30d: perfiles.filter(p => String(p.creado_en ?? '') >= hace30).length,
      activosUltimos30d: perfiles.filter(p => p.ultimo_acceso_en && String(p.ultimo_acceso_en) >= hace30).length,
    },
    solicitudes: {
      total: solicitudes.length,
      pendientes: solicitudes.filter(s => s.estado === 'pendiente').length,
      aceptadas: aceptadas.length,
      rechazadas: solicitudes.filter(s => s.estado === 'rechazada').length,
      tasaAceptacion: resueltas.length > 0 ? Math.round((aceptadas.length / resueltas.length) * 100) : null,
    },
    resenas: {
      total: resenas.length,
      publicadas: publicadas.length,
      pendientes: resenas.filter(r => r.estado === 'pendiente').length,
      promedioGeneral,
    },
    altasPorMes: [...altasPorMes.entries()].sort().slice(-6).map(([mes, altas]) => ({ mes, altas })),
  });
}
