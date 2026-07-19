// Motor de escalado de sustituciones (la pieza "puedes desaparecer de verdad").
//
// Se dispara con SUSTITUCION_CONTACTADA cada vez que se avisa a una candidata.
// Una instancia de escalado persigue a UNA candidata concreta y hace, de forma
// durable (step.sleep sobrevive reinicios):
//
//   1. espera        → recordatorio (email + WhatsApp/SMS a la candidata)
//   2. espera        → decide según el modo del estudio:
//        · autónomo/vacaciones: avanza a la siguiente del ranking (y emite un
//          nuevo evento → nueva instancia). Si se agota → 'agotada' + alerta dueña.
//        · asistido: alerta a la dueña ("X no responde") y se queda esperando.
//
// La CORRECCIÓN clave: en cada despertar re-lee la sustitución (escalacionVigente).
// Si alguien aceptó, la dueña confirmó/canceló, o ya avanzamos a otra → el escalado
// deja de ser vigente y se apaga solo. La aceptación atómica (confirmar_sustitucion)
// es la red de seguridad final contra el doble-booking.
import { inngest, EVENTS } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  contactarCandidata,
  contactarDesde,
  recordatorioPorMensaje,
  alertarPropietaria,
  escalacionVigente,
} from '@/lib/sustituciones/contacto';
import { calcularVentanas } from '@/lib/sustituciones/ventanas';

// Modos que dejan al motor avanzar solo por el ranking.
const MODOS_AUTONOMOS = ['autonomo', 'vacaciones'];

export const escalarSustitucion = inngest.createFunction(
  {
    id: 'sustitucion-escalar',
    triggers: [{ event: EVENTS.SUSTITUCION_CONTACTADA }],
    concurrency: { limit: 5 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { sustitucionId, studioId, instructorId } = event.data as {
      sustitucionId: string; studioId: string; instructorId: string; idx?: number;
    };

    // ── Plan: vigencia + modo + ventanas (memoizado; las sleeps quedan estables) ──
    const plan = await step.run('plan', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const v = await escalacionVigente(admin, sustitucionId, instructorId);
      if (!v.vigente) return { correr: false as const, motivo: 'no_vigente' as const };
      const { data: estudio } = await admin
        .from('studios').select('modo_autonomia').eq('id', studioId).maybeSingle();
      const modo = (estudio?.modo_autonomia as string) ?? 'asistido';
      const msHastaClase = v.sesionInicio ? new Date(v.sesionInicio).getTime() - Date.now() : -1;
      const ventanas = calcularVentanas(msHastaClase);
      return {
        correr: ventanas.correr,
        motivo: ventanas.motivo ?? null,
        recordatorioMs: ventanas.recordatorioMs,
        avanceMs: ventanas.avanceMs,
        modo,
      };
    });

    if (!plan.correr) return { fin: 'no_arranca', motivo: plan.motivo };

    // ── 1. Espera → recordatorio ────────────────────────────────────────────
    await step.sleep('espera-recordatorio', plan.recordatorioMs);

    const recordatorio = await step.run('recordatorio', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const v = await escalacionVigente(admin, sustitucionId, instructorId);
      if (!v.vigente) return { hecho: false, motivo: 'no_vigente' };
      // Reenvía email (tono recordatorio) + sube de canal a WhatsApp/SMS.
      const email = await contactarCandidata(admin, {
        sustitucionId, studioId, instructorId, idx: v.candidataIdx, sesion: v.sesion, esRecordatorio: true,
      });
      const msg = await recordatorioPorMensaje(admin, { studioId, instructorId, sustitucionId, sesion: v.sesion });
      return { hecho: true, emailEnviado: email.emailEnviado, mensajeEnviado: msg.enviado };
    });
    if (!recordatorio.hecho) return { fin: 'apagado_en_recordatorio' };

    // ── 2. Espera → decidir (avanzar / alertar) ─────────────────────────────
    await step.sleep('espera-avance', plan.avanceMs);

    const decision = await step.run('decidir', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const v = await escalacionVigente(admin, sustitucionId, instructorId);
      if (!v.vigente) return { accion: 'apagado' as const };

      const autonomo = MODOS_AUTONOMOS.includes(plan.modo);
      if (!autonomo) {
        // Asistido: el humano decide. Le avisamos y seguimos en 'contactando'.
        const { data: cand } = await admin.from('instructores').select('nombre').eq('id', instructorId).maybeSingle();
        await alertarPropietaria(admin, { studioId, sesion: v.sesion, tipo: 'sin_respuesta', candidataNombre: cand?.nombre });
        return { accion: 'alertada_asistido' as const };
      }

      // Autónomo: avanza por el ranking hasta encontrar a alguien contactable.
      const avance = await contactarDesde(admin, {
        sustitucionId, studioId, sesion: v.sesion, ranking: v.ranking, desde: v.candidataIdx + 1,
      });
      if (avance.contactada) {
        return { accion: 'contactada' as const, instructorId: avance.instructorId, idx: avance.idx };
      }

      // Ranking agotado: marca 'agotada' (compare-and-set) y alerta a la dueña.
      await admin.from('sustituciones')
        .update({ estado: 'agotada' })
        .eq('id', sustitucionId).eq('studio_id', studioId).eq('estado', 'contactando');
      await alertarPropietaria(admin, { studioId, sesion: v.sesion, tipo: 'agotada' });
      return { accion: 'agotada' as const };
    });

    // Avanzó a otra candidata → nueva instancia de escalado para ella.
    if (decision.accion === 'contactada') {
      await step.sendEvent('siguiente-candidata', {
        name: EVENTS.SUSTITUCION_CONTACTADA,
        data: { sustitucionId, studioId, instructorId: decision.instructorId, idx: decision.idx },
      });
    }

    return { fin: 'ok', decision: decision.accion };
  },
);
