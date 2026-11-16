import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ORIGENES, PASOS, esEstado } from '@/lib/migracion/recorrido';

export const dynamic = 'force-dynamic';

// El recorrido «Cambiar a Tentare» de Academy: los pasos manuales que marca la propietaria (`migracion_checklist`). Los pasos de datos
// no se guardan: se calculan de los datos reales del estudio (lib/migracion/recorrido.ts). El estudio sale SIEMPRE de la sesión; mismo
// permiso que el importador («Traer mis datos»). Sin la tabla (migración sin aplicar) se contesta vacío: la pantalla sigue funcionando
// con lo que sale de los datos, y escribir contesta que falta aplicarla.
const IDS_MANUALES = new Set(PASOS.filter(p => p.modo === 'manual').map(p => p.id));
// Un paso de datos también puede marcarse «requiere revisión» o «bloqueado»: manda sobre el dato.
const IDS_VALIDOS = new Set(PASOS.map(p => p.id));
const ORIGENES_VALIDOS = new Set(ORIGENES.map(o => o.id));

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) return NextResponse.json({ error: 'Sin permiso para ver el recorrido de migración' }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db.from('migracion_checklist').select('paso, estado, origen, nota').eq('studio_id', sesion.studioId);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ filas: [], origen: null, sinTabla: true });
    return NextResponse.json({ error: 'No se ha podido cargar el recorrido.' }, { status: 500 });
  }
  const filas = (data ?? []).filter(f => IDS_VALIDOS.has(f.paso as string) && esEstado(f.estado));
  const origen = (data ?? []).find(f => f.paso === 'diagnostico')?.origen ?? null;
  return NextResponse.json({ filas: filas.map(f => ({ paso: f.paso, estado: f.estado, nota: f.nota ?? null })), origen });
}

export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) return NextResponse.json({ error: 'Sin permiso para cambiar el recorrido de migración' }, { status: 403 });
  const limitado = await enforceRateLimit(req, 'migracion-recorrido', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const b = (await req.json().catch(() => null)) as { paso?: unknown; estado?: unknown; nota?: unknown; origen?: unknown } | null;
  const paso = typeof b?.paso === 'string' ? b.paso : '';
  if (!IDS_VALIDOS.has(paso)) return NextResponse.json({ error: 'Ese paso no existe.' }, { status: 400 });
  if (!esEstado(b?.estado)) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 });
  // «Completado» a mano solo en lo que ocurre fuera de Tentare: lo de datos se completa por el dato, nunca por una marca.
  if (b.estado === 'COMPLETADO' && !IDS_MANUALES.has(paso)) {
    return NextResponse.json({ error: 'Ese paso se completa solo cuando tus datos están en Tentare.' }, { status: 400 });
  }
  const nota = typeof b.nota === 'string' ? b.nota.trim().slice(0, 300) || null : null;
  let origen: string | null = null;
  if (paso === 'diagnostico') {
    if (typeof b.origen !== 'string' || !ORIGENES_VALIDOS.has(b.origen as never)) return NextResponse.json({ error: 'Elige un software de la lista.' }, { status: 400 });
    origen = b.origen;
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { error } = await db.from('migracion_checklist').upsert(
    { studio_id: sesion.studioId, paso, estado: b.estado, nota, origen, actualizado_en: new Date().toISOString(), actualizado_por: sesion.userId },
    { onConflict: 'studio_id,paso' },
  );
  if (error) {
    console.error('[migracion/recorrido] upsert', error.code);
    return NextResponse.json({ error: error.code === '42P01' ? 'Falta aplicar la migración de Academy.' : 'No se ha podido guardar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
