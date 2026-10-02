// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — clases fijas del estudio que terminan pronto (Fase 2).
//
// Mismo patrón que bonos-inactivas-cron.ts (bucket A, pg_cron en vez de
// Inngest): un `for` por estudio dentro de la misma invocación. Regla de
// negocio, no de reloj (mismo criterio que confirmacion-riesgo/Fase 2a/2b/2c
// de plazas-fijas): el aviso puede llegar hasta 24h tarde si el barrido no
// corre, pero eso nunca cambia si la clase fija sigue viva o no — eso lo
// decide `DIAS_AVISO_CLASE_FIJA_TERMINA` cada vez que se lee, no este cron.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { emitirClaseFijaTerminaPronto } from '@/lib/notifications/emit';
import { agruparTerminanPronto, DIAS_AVISO_CLASE_FIJA_TERMINA, type PlazaSueltaQueTermina } from '@/lib/clases-fijas-reglas';
import { nombreDeOferta } from '@/lib/db/clases-fijas';
import type { SupabaseClient } from '@supabase/supabase-js';

function exigir(error: { message: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.message}`);
}

async function estudiosIds(admin: SupabaseClient): Promise<string[]> {
  return (await idsEstudios(admin)).map((s) => s.id);
}

export async function barrerClasesFijasTerminanPronto(): Promise<{ estudios: number; publicados: number } | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  const studios = await estudiosIds(admin);
  let publicados = 0;
  for (const studioId of studios) publicados += (await unEstudio(admin, studioId)).publicados;
  return { estudios: studios.length, publicados };
}

async function unEstudio(admin: SupabaseClient, studioId: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + DIAS_AVISO_CLASE_FIJA_TERMINA * 24 * 3600_000).toISOString().slice(0, 10);
  const deOfertas = await avisarOfertasConNombre(admin, studioId, hoy, limite);
  const sueltas = await avisarPlazasSueltas(admin, studioId, hoy, limite);
  return { publicados: deOfertas.publicados + sueltas.publicados };
}

async function avisarOfertasConNombre(admin: SupabaseClient, studioId: string, hoy: string, limite: string) {
  const plazasR = await fetchAllRows<{ id: string; clase_fija_id: string; socio_id: string; vigencia_hasta: string }>(
    studioId, 'plazas_fijas',
    (from, to) => admin.from('plazas_fijas').select('id, clase_fija_id, socio_id, vigencia_hasta')
      .eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA'])
      .not('clase_fija_id', 'is', null).not('socio_id', 'is', null)
      .gte('vigencia_hasta', hoy).lte('vigencia_hasta', limite).range(from, to),
  );
  exigir(plazasR.error, 'leyendo plazas_fijas');
  const plazas = plazasR.data;
  if (!plazas.length) return { publicados: 0 };
  // Una alumna puede tener varias franjas de la MISMA oferta: se agrupa por
  // (oferta, socia, fecha de vencimiento) para mandar un solo push, no uno
  // por franja. Si tuviera dos fechas de vencimiento distintas para la misma
  // oferta (ampliación parcial), cada una manda la suya — cada aviso sigue
  // siendo verdad para esa franja concreta.
  const grupos = new Map<string, { claseFijaId: string; socioId: string; vigenciaHasta: string }>();
  for (const p of plazas) {
    const clave = `${p.clase_fija_id}:${p.socio_id}:${p.vigencia_hasta}`;
    if (!grupos.has(clave)) grupos.set(clave, { claseFijaId: p.clase_fija_id, socioId: p.socio_id, vigenciaHasta: p.vigencia_hasta });
  }
  const nombres = new Map<string, string | null>();
  let publicados = 0;
  for (const g of grupos.values()) {
    if (!nombres.has(g.claseFijaId)) nombres.set(g.claseFijaId, await nombreDeOferta(admin, studioId, g.claseFijaId));
    const nombre = nombres.get(g.claseFijaId);
    if (!nombre) continue; // la oferta se ha borrado entretanto: nada que avisar.
    await emitirClaseFijaTerminaPronto(admin, {
      studioId, socioId: g.socioId, claseFijaId: g.claseFijaId, nombre, hasta: g.vigenciaHasta,
    });
    publicados++;
  }
  return { publicados };
}

/**
 * Las plazas SIN clase fija con nombre (dadas desde una clase suelta o a mano) que terminan pronto: un aviso por alumna y
 * fecha de fin, con lo que de verdad puede hacer (al terminar se vuelve a pedir; no hay «ampliar»). Mismo evento, misma
 * ventana (`DIAS_AVISO_CLASE_FIJA_TERMINA`) y mismo criterio de regla de negocio, no de reloj: si el barrido no corre un
 * día, el aviso llega tarde, pero qué plaza vence lo decide su fecha cada vez que se lee.
 */
async function avisarPlazasSueltas(admin: SupabaseClient, studioId: string, hoy: string, limite: string) {
  const plazasR = await fetchAllRows<{ id: string; socio_id: string; vigencia_hasta: string; dia_semana: number; hora_inicio: string; tipo_clase_id: string | null }>(
    studioId, 'plazas_fijas',
    (from, to) => admin.from('plazas_fijas').select('id, socio_id, vigencia_hasta, dia_semana, hora_inicio, tipo_clase_id')
      .eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA'])
      .is('clase_fija_id', null).not('socio_id', 'is', null)
      .gte('vigencia_hasta', hoy).lte('vigencia_hasta', limite).range(from, to),
  );
  exigir(plazasR.error, 'leyendo plazas_fijas sueltas');
  if (!plazasR.data.length) return { publicados: 0 };

  const idsTipo = [...new Set(plazasR.data.map((p) => p.tipo_clase_id).filter((x): x is string => !!x))];
  const nombreTipo = new Map<string, string>();
  if (idsTipo.length) {
    const { data, error } = await admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId).in('id', idsTipo);
    exigir(error, 'leyendo tipos_clase');
    for (const t of data ?? []) nombreTipo.set(t.id as string, t.nombre as string);
  }
  const plazas: PlazaSueltaQueTermina[] = plazasR.data.map((p) => ({
    id: p.id, socioId: p.socio_id, vigenciaHasta: p.vigencia_hasta, diaSemana: p.dia_semana, horaInicio: p.hora_inicio,
    tipo: p.tipo_clase_id ? nombreTipo.get(p.tipo_clase_id) ?? null : null,
  }));

  let publicados = 0;
  for (const a of agruparTerminanPronto(plazas)) {
    await emitirClaseFijaTerminaPronto(admin, { studioId, socioId: a.socioId, nombre: a.nombre, hasta: a.vigenciaHasta, plazaIds: a.plazaIds });
    publicados++;
  }
  return { publicados };
}
