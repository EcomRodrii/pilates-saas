import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import {
  cambiosEntreDias, estudioDesdeBd, evolucionPorDia, gratisParaPantalla, hoyPedido, recuentoPorEstado, resumenGratis,
  type FilaDiaria, type FilaSituacionBd, type RespuestaBajas,
} from '@/lib/interno/bajas';
import { DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO, modoBajas } from '@/lib/retencion/situacion-estudio';
import { hoyEnEstudio, masDias } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// /interno → Bajas (en seco). SOLO LECTURA: no cambia el estado de ningún
// estudio, no manda nada y no escribe nada.
//
//   · la situación de hoy, calculada ahora por la base de datos
//     (`situacion_estudios`); con `?hoy=AAAA-MM-DD`, la de ese día con lo que hay
//     hoy («si nadie hace nada»);
//   · el informe diario (`estudio_situacion_diaria`), para ver la evolución y
//     los estudios que cambian de estado de un día a otro;
//   · el plan gratis medido en seco ese día (su columna `gratis`): lo medido, lo
//     que tiene el gate y si el grupo de la dueña cambia con la regla propuesta.
//
// Misma puerta que el resto de /interno: equipo de Tentare activo, sesión `aal2`
// y el permiso `studios.read`. Cruza estudios con service-role, legítimo solo
// tras esa comprobación. Enseña nombres de estudio y cifras, nunca datos de una
// persona, y no los manda a ningún log.
// ─────────────────────────────────────────────────────────────────────────────

/** Días del informe diario que se enseñan. */
const DIAS_DE_HISTORIAL = 30;
const PAGINA = 1000;

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hoyReal = hoyEnEstudio();
  const hoy = hoyPedido(req.nextUrl.searchParams.get('hoy'), hoyReal);
  const noLeidos: string[] = [];

  // El informe, paginado: PostgREST corta en 1000 filas sin avisar.
  const leerHistorial = async (): Promise<FilaDiaria[] | null> => {
    const filas: FilaDiaria[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await db.from('estudio_situacion_diaria')
        .select('studio_id, dia, estado')
        .gte('dia', masDias(hoyReal, -(DIAS_DE_HISTORIAL - 1))).lte('dia', hoyReal)
        .order('dia').order('studio_id')
        .range(desde, desde + PAGINA - 1);
      if (error) return null;
      filas.push(...((data ?? []) as FilaDiaria[]));
      if (!data || data.length < PAGINA) return filas;
    }
  };

  const [vivo, estudios, historial, gratisDelDia] = await Promise.all([
    db.rpc('situacion_estudios', { p_hoy: hoy }),
    db.from('studios').select('id, nombre, slug'),
    leerHistorial(),
    // Solo las filas medidas: como mucho una por estudio.
    db.from('estudio_situacion_diaria').select('studio_id, gratis').eq('dia', hoy).not('gratis', 'is', null),
  ]);
  if (estudios.error) noLeidos.push('estudios');
  if (vivo.error) noLeidos.push('situación de hoy');
  if (historial === null) noLeidos.push('informe diario');
  if (gratisDelDia.error) noLeidos.push('plan gratis medido en seco');

  const nombres = new Map(((estudios.data ?? []) as { id: string; nombre: string | null; slug: string | null }[])
    .map(e => [e.id, e.nombre || e.slug || e.id]));
  const gratisDe = new Map(((gratisDelDia.data ?? []) as { studio_id: string; gratis: unknown }[])
    .map(g => [g.studio_id, gratisParaPantalla(g.gratis, nombres)]));
  const filasVivo = vivo.error ? [] : ((vivo.data ?? []) as FilaSituacionBd[]);
  const estudiosVivo = filasVivo
    .map(f => estudioDesdeBd(f, nombres.get(f.studio_id) ?? f.studio_id, hoy, gratisDe.get(f.studio_id) ?? null))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const respuesta: RespuestaBajas = {
    modo: modoBajas(process.env),
    hoy,
    umbrales: { inactivo: DIAS_HASTA_INACTIVO, suspendido: DIAS_HASTA_SUSPENDIDO },
    vivo: { recuento: recuentoPorEstado(estudiosVivo), estudios: estudiosVivo },
    historial: {
      dias: evolucionPorDia(historial ?? []),
      cambios: cambiosEntreDias(historial ?? [], nombres),
    },
    gratis: resumenGratis(estudiosVivo),
    noLeidos,
  };
  return NextResponse.json(respuesta);
}
