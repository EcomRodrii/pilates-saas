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
import { DIAS_AVISO_CLASE_FIJA_TERMINA } from '@/lib/clases-fijas-reglas';
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
