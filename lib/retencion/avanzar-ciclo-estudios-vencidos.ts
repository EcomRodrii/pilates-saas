// ─────────────────────────────────────────────────────────────────────────────
// Ejecutor del ciclo de estudios sin contrato: prueba vencida (avisos 30/83
// días, purga a los 90) y baja de un estudio de pago (aviso el mismo día, último
// a los 23, purga a los 30).
//
// Colgado del cron horario `notif-trial` (pg_cron → app/api/cron/notif-trial):
// es el mismo público —la propietaria de una prueba local— y así no se crea un
// job ni un cron de Inngest nuevos. Horario y no diario da igual: cada paso es
// idempotente (fila única por estudio+ancla+fase) y el informe de la purga no
// se recalcula más de una vez al día.
//
// La lógica de fechas y fases es pura (ciclo-estudios-vencidos.ts). La guardia
// que de verdad impide borrar un estudio que paga vive en la BD
// (`purgar_estudio_vencido`, migr 20260913220947).
//
// ⚠️ Borrado real SOLO con `PURGA_ESTUDIOS_VENCIDOS=activa` (pendiente de
// validación legal). Sin ella, la fase de purga solo deja en `resumen` qué
// borraría.
// ─────────────────────────────────────────────────────────────────────────────
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { emailDeLaPropietaria } from '@/lib/notifications/recipients';
import { enviarAvisoEstudioVencido, enviarConfirmacionBorrado } from '@/lib/emails/estudio-vencido-server';
import { borrarPrefijoR2, r2Configurado } from '@/lib/r2';
import { BUCKET_COMUNIDAD } from '@/lib/comunidad/foto';
import {
  cicloDelEstudio, debeRecalcularInforme, mismaAncla, purgaEstudiosActiva, siguientePaso,
  type EstudioCiclo, type FaseCiclo, type FaseRegistrada, type MotivoCiclo,
} from '@/lib/retencion/ciclo-estudios-vencidos';

interface FilaEstudio {
  id: string;
  nombre: string | null;
  email: string | null;
  owner_auth_user_id: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  contrato_terminado_en: string | null;
  supresion_pedida_en: string | null;
}

interface FilaCiclo {
  id: number;
  studio_id: string;
  motivo: MotivoCiclo;
  /** Ancla del ciclo (ver el comentario de la columna en la migración 20261003102645). */
  trial_ends_at: string;
  fase: FaseCiclo;
  ejecutada_en: string | null;
  cancelada_en: string | null;
  actualizado_en: string;
}

interface InformePurga {
  modo: 'activa' | 'informe';
  socios_a_anonimizar: number;
  instructoras_a_anonimizar: number;
  anonimizar_socio_disponible: boolean;
  borrar: Record<string, number>;
  conservar: Record<string, number>;
}

export interface ResumenCiclo {
  estudios: number;
  avisos: number;
  informes: number;
  purgados: number;
  cancelados: number;
  errores: number;
}

const aRegistrada = (f: FilaCiclo): FaseRegistrada => ({ fase: f.fase, ejecutadaEn: f.ejecutada_en, canceladaEn: f.cancelada_en });
const aEstudioCiclo = (s: FilaEstudio): EstudioCiclo => ({
  trialEndsAt: s.trial_ends_at, subscriptionStatus: s.subscription_status,
  subscriptionId: s.subscription_id, contratoTerminadoEn: s.contrato_terminado_en,
  supresionPedidaEn: s.supresion_pedida_en,
});

async function registrar(
  admin: SupabaseClient, s: FilaEstudio, ciclo: { motivo: MotivoCiclo; ancla: Date }, fase: FaseCiclo,
  programadaPara: Date, ejecutadaEn: Date | null, resumen: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('ciclo_estudios_vencidos').upsert({
    studio_id: s.id,
    motivo: ciclo.motivo,
    trial_ends_at: ciclo.ancla.toISOString(),
    fase,
    programada_para: programadaPara.toISOString(),
    ejecutada_en: ejecutadaEn?.toISOString() ?? null,
    // Si el ciclo se canceló y el estudio volvió a vencer con la MISMA ancla,
    // la fila se reactiva: una cancelada no puede contar como aviso enviado.
    cancelada_en: null,
    resumen,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,trial_ends_at,fase' });
  if (error) throw new Error(`registrando la fase ${fase}: ${error.message}`);
}

async function purgaEnBd(admin: SupabaseClient, studioId: string, ejecutar: boolean): Promise<InformePurga> {
  const { data, error } = await admin.rpc('purgar_estudio_vencido', { p_studio_id: studioId, p_ejecutar: ejecutar });
  if (error) throw new Error(`purgar_estudio_vencido (${ejecutar ? 'activa' : 'informe'}): ${error.message}`);
  return data as InformePurga; // jsonb de una RPC ya llega parseado
}

/**
 * Ficheros fuera de la BD: documentos de socia (bucket privado), avatares
 * (ruta = id de la socia, mismo criterio que app/api/socios/eliminar) y las
 * fotos del tablón (bucket público `comunidad-media`, carpeta del estudio). Antes
 * que la RPC: si esto falla, se aborta y la BD sigue intacta para reintentar; al
 * revés, las filas con la ruta ya no existirían y los objetos quedarían huérfanos.
 */
async function borrarFicherosDelEstudio(
  admin: SupabaseClient, studioId: string,
): Promise<{ documentos: number; avatares: number; fotosComunidad: number }> {
  const [docs, socias] = await Promise.all([
    fetchAllRows<{ id: string; storage_path: string }>(studioId, 'documentos_socio',
      (from, to) => admin.from('documentos_socio').select('id, storage_path').eq('studio_id', studioId).order('id').range(from, to)),
    fetchAllRows<{ id: string }>(studioId, 'socios',
      (from, to) => admin.from('socios').select('id').eq('studio_id', studioId).order('id').range(from, to)),
  ]);
  if (docs.error) throw new Error(`leyendo documentos: ${docs.error.message}`);
  if (socias.error) throw new Error(`leyendo socias: ${socias.error.message}`);

  const porTandas = async (bucket: string, rutas: string[]) => {
    for (let i = 0; i < rutas.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(rutas.slice(i, i + 100));
      if (error) throw new Error(`borrando ${bucket}: ${error.message}`);
    }
  };
  await porTandas('documentos-socio', docs.data.map(d => d.storage_path));
  await porTandas('avatars', socias.data.map(s => s.id));

  // Las fotos del tablón no tienen fila propia que diga su ruta: se listan de la
  // carpeta del estudio, por páginas (`list` corta en `limit`). Una entrada sin
  // `id` es una subcarpeta, no un fichero.
  const fotos: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET_COMUNIDAD).list(studioId, { limit: 1000, offset });
    if (error) throw new Error(`listando ${BUCKET_COMUNIDAD}: ${error.message}`);
    const lote = data ?? [];
    fotos.push(...lote.filter(o => o.id).map(o => `${studioId}/${o.name}`));
    if (lote.length < 1000) break;
  }
  await porTandas(BUCKET_COMUNIDAD, fotos);
  return { documentos: docs.data.length, avatares: socias.data.length, fotosComunidad: fotos.length };
}

export async function avanzarCicloEstudiosVencidos(ahora: Date = new Date()): Promise<ResumenCiclo | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  const activa = purgaEstudiosActiva(process.env);

  const [estudios, ciclo] = await Promise.all([
    // Los dos motivos: la prueba local agotada y la baja (fecha que pone la BD).
    fetchAllRows<FilaEstudio>('(global)', 'studios', (from, to) => admin.from('studios')
      .select('id, nombre, email, owner_auth_user_id, trial_ends_at, subscription_status, subscription_id, contrato_terminado_en, supresion_pedida_en')
      .or('and(subscription_status.eq.trial_expirado,subscription_id.is.null,trial_ends_at.not.is.null),contrato_terminado_en.not.is.null')
      .order('id')
      .range(from, to)),
    fetchAllRows<FilaCiclo>('(global)', 'ciclo_estudios_vencidos', (from, to) => admin.from('ciclo_estudios_vencidos')
      .select('id, studio_id, motivo, trial_ends_at, fase, ejecutada_en, cancelada_en, actualizado_en')
      .is('cancelada_en', null)
      .order('id')
      .range(from, to)),
  ]);
  if (estudios.error) throw new Error(`leyendo estudios vencidos: ${estudios.error.message}`);
  if (ciclo.error) throw new Error(`leyendo ciclo_estudios_vencidos: ${ciclo.error.message}`);

  const resumen: ResumenCiclo = { estudios: estudios.data.length, avisos: 0, informes: 0, purgados: 0, cancelados: 0, errores: 0 };
  const cicloPorId = new Map(estudios.data.map(s => [s.id, cicloDelEstudio(aEstudioCiclo(s))]));
  const filasDe = (studioId: string, motivo: MotivoCiclo, ancla: string | Date) =>
    ciclo.data.filter(f => f.studio_id === studioId && f.motivo === motivo && mismaAncla(f.trial_ends_at, ancla));

  // 1) Ciclos que ya no son el actual del estudio: pagó, reactivó el plan, o
  //    cambió de motivo o de ancla.
  const aCancelar = ciclo.data.filter(f => {
    const actual = cicloPorId.get(f.studio_id);
    if (actual && actual.motivo === f.motivo && mismaAncla(actual.ancla, f.trial_ends_at)) return false;
    const fuera: EstudioCiclo = { trialEndsAt: null, subscriptionStatus: null, subscriptionId: null, contratoTerminadoEn: null };
    return siguientePaso(fuera, filasDe(f.studio_id, f.motivo, f.trial_ends_at).map(aRegistrada), ahora).tipo === 'cancelar';
  });
  if (aCancelar.length > 0) {
    const { error } = await admin.from('ciclo_estudios_vencidos')
      .update({ cancelada_en: ahora.toISOString(), actualizado_en: ahora.toISOString() })
      .in('id', aCancelar.map(f => f.id));
    if (error) throw new Error(`cancelando ciclos: ${error.message}`);
    resumen.cancelados = aCancelar.length;
  }

  // 2) Un paso por estudio sin contrato, si le toca.
  for (const s of estudios.data) {
    const actual = cicloPorId.get(s.id);
    if (!actual) continue;
    const registradas = filasDe(s.id, actual.motivo, actual.ancla);
    const paso = siguientePaso(aEstudioCiclo(s), registradas.map(aRegistrada), ahora);
    if (paso.tipo !== 'ejecutar') continue;

    try {
      if (paso.fase !== 'purga') {
        // Sin aviso entregado a Resend el ciclo NO avanza: la fila queda sin
        // `ejecutada_en` y se reintenta en la pasada siguiente.
        const to = s.owner_auth_user_id ? await emailDeLaPropietaria(admin, s.owner_auth_user_id, s.email) : null;
        const envio = to
          ? await enviarAvisoEstudioVencido({ to, fase: paso.fase, motivo: paso.motivo, estudioNombre: s.nombre ?? 'tu estudio', fechaPurga: paso.fechaPurga })
          : { ok: false, error: 'la propietaria no tiene email' };
        await registrar(admin, s, actual, paso.fase, paso.programadaPara, envio.ok ? ahora : null, envio.ok
          ? { email: 'enviado', fecha_purga: paso.fechaPurga.toISOString() }
          : { error: 'skipped' in envio && envio.skipped ? 'Resend sin configurar' : envio.error, intentado_en: ahora.toISOString() });
        if (envio.ok) resumen.avisos++; else resumen.errores++;
        continue;
      }

      const previa = registradas.find(r => r.fase === 'purga');
      if (!activa && previa && !debeRecalcularInforme(previa.actualizado_en, ahora)) continue;

      const informe = await purgaEnBd(admin, s.id, false);
      if (!activa) {
        await registrar(admin, s, actual, 'purga', paso.programadaPara, null, { modo: 'informe', calculado_en: ahora.toISOString(), recuentos: informe });
        resumen.informes++;
        continue;
      }
      if (informe.socios_a_anonimizar > 0 && !informe.anonimizar_socio_disponible) {
        // Antes de tocar Storage o R2: sin anonimizar_socio la RPC se negaría
        // igualmente, pero ya habría ficheros borrados.
        await registrar(admin, s, actual, 'purga', paso.programadaPara, null, { modo: 'activa', error: 'falta anonimizar_socio', recuentos: informe });
        resumen.errores++;
        continue;
      }
      const ficheros = await borrarFicherosDelEstudio(admin, s.id);
      // Copias en R2 antes que sus filas: al revés quedarían objetos sin
      // metadata desde la que volver a encontrarlos.
      const r2 = r2Configurado();
      if (r2) await borrarPrefijoR2(`backups/${s.id}/`);
      const hecho = await purgaEnBd(admin, s.id, true);
      // La confirmación por correo (contrato de encargo): best-effort y a la
      // vista en `resumen`; el borrado ya está hecho y no se deshace si falla.
      const to = s.owner_auth_user_id ? await emailDeLaPropietaria(admin, s.owner_auth_user_id, s.email).catch(() => null) : null;
      const confirmacion = to
        ? await enviarConfirmacionBorrado({ to, estudioNombre: s.nombre ?? 'tu estudio', fecha: ahora })
        : { ok: false, error: 'la propietaria no tiene email' };
      await registrar(admin, s, actual, 'purga', paso.programadaPara, ahora, {
        modo: 'activa', recuentos: hecho, ficheros, r2, a_peticion: !!s.supresion_pedida_en,
        confirmacion: confirmacion.ok ? 'enviada' : (confirmacion.error ?? 'sin enviar'),
      });
      resumen.purgados++;
    } catch (e) {
      resumen.errores++;
      Sentry.captureException(e instanceof Error ? e : new Error('ciclo estudios vencidos'), {
        level: 'error', tags: { area: 'retencion', fase: paso.fase }, extra: { studioId: s.id },
      });
    }
  }
  return resumen;
}
