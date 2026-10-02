import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { sesionYaEmpezada, MENSAJE_CLASE_YA_EMPEZADA } from '@/lib/calendario-estado';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';

// ── «Sustitución confirmada»: un solo dueño ─────────────────────────────────
//
// Una sustituta queda confirmada por tres caminos: la propia instructora acepta
// la oferta (lib/sustituciones/responder.ts), el panel confirma a una candidata
// (`PATCH /api/sustituciones`, action 'confirmar') y el Calendario la asigna
// directamente («¿Ya sabes quién la da?», `POST /api/sustituciones` con
// `asignarA`). Antes los dos primeros llevaban cada uno su copia de la misma
// secuencia, y la tercera habría sido otra (regla de la arquitectura de cuatro
// capas: un hecho de negocio, un dueño).
//
// La secuencia: la clase no puede haber empezado → la RPC `confirmar_sustitucion`
// (aceptación atómica y reasignación, con solape revalidado) → avisar a las
// clientas («tu clase sigue en pie», según el ajuste del estudio) → aviso a la
// sustituta (SUSTITUCION_ACEPTADA) → y a la propietaria (SUSTITUCION_CUBIERTA)
// cuando no es ella quien confirma: cierra el «no puede dar su clase» que le llegó.

export type ResultadoConfirmarSustituta =
  | { ok: true; sesionId: string | null; alumnas: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } | null }
  /**
   * `motivo` es el de la RPC (`ya_resuelta`, `conflicto_horario`, `sin_cambio`,
   * `clase_cancelada`, `candidata_no_valida`…) o `clase_ya_empezada`.
   */
  | { ok: false; motivo: string; error?: string };

export async function confirmarSustituta(
  admin: SupabaseClient,
  p: {
    sustitucionId: string;
    studioId: string;
    instructorId: string;
    /** Quién confirma desde el panel; `null` = la propia sustituta aceptó la oferta. */
    aprobadaPor: string | null;
    /** `false`: quien confirma ha decidido no avisar a las clientas. Si no, manda el ajuste del estudio. */
    avisarClientas?: boolean;
    /** SUSTITUCION_CUBIERTA a la propietaria: siempre, salvo que confirme ella misma (ya lo sabe). */
    avisarPropietaria: boolean;
  },
): Promise<ResultadoConfirmarSustituta> {
  // La RPC no comprueba si la clase ya empezó (solo revalida el solape): aceptar
  // a las 20:10 una clase de las 20:00 reasignaría una clase ya dada y avisaría a
  // las alumnas de que «sigue en pie» a posteriori.
  const { data: sust } = await admin
    .from('sustituciones').select('sesion_id').eq('id', p.sustitucionId).eq('studio_id', p.studioId).maybeSingle();
  const sesionDeLaBaja = (sust?.sesion_id as string | null) ?? null;
  if (sesionDeLaBaja) {
    const { data: ses } = await admin.from('sesiones').select('inicio').eq('id', sesionDeLaBaja).maybeSingle();
    if (ses && sesionYaEmpezada(ses.inicio as string)) {
      return { ok: false, motivo: 'clase_ya_empezada', error: MENSAJE_CLASE_YA_EMPEZADA };
    }
  }

  const { data, error } = await admin.rpc('confirmar_sustitucion', {
    p_sustitucion_id: p.sustitucionId,
    p_instructor_id: p.instructorId,
    p_studio_id: p.studioId,
    p_aprobada_por: p.aprobadaPor,
  });
  if (error) throw error;
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
  if (!r.ok) return { ok: false, motivo: r.motivo ?? 'ya_resuelta' };

  let alumnas: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } | null = null;
  if (r.sesion_id) {
    if (p.avisarClientas === false) {
      alumnas = { avisadas: 0, total: 0, skipped: true, desactivado: false };
    } else {
      // Desde aquí la clase YA está cubierta. Si el aviso a las clientas falla,
      // no se convierte en error: quien confirma leería «sigue sin cubrir» de
      // una clase que ya tiene sustituta, y volvería a intentarlo.
      try {
        const { data: cand } = await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle();
        alumnas = await avisarAlumnas(admin, {
          sesionId: r.sesion_id, studioId: p.studioId, tipo: 'cubierta', sustituta: (cand?.nombre as string | null) ?? undefined,
        });
      } catch (e) {
        Sentry.captureException(e, {
          tags: { area: 'sustituciones', tipo: 'aviso-clientas-cubierta-fallido' },
          extra: { studioId: p.studioId, sustitucionId: p.sustitucionId, sesionId: r.sesion_id },
        });
      }
    }
    const { emitirSustitucionAceptada, emitirSustitucionCubierta } = await import('@/lib/notifications/emit');
    await emitirSustitucionAceptada(admin, { studioId: p.studioId, sesionId: r.sesion_id, instructorId: p.instructorId });
    if (p.avisarPropietaria) {
      await emitirSustitucionCubierta(admin, {
        studioId: p.studioId, sesionId: r.sesion_id, sustitucionId: p.sustitucionId, instructorId: p.instructorId,
      });
    }
  }
  return { ok: true, sesionId: r.sesion_id ?? sesionDeLaBaja, alumnas };
}

/** Lo que se le dice a quien confirma cuando la RPC dice que no. */
export function mensajeConfirmacionRechazada(motivo: string): string {
  switch (motivo) {
    case 'conflicto_horario': return 'No se puede: esta instructora ya tiene otra clase en ese horario. Elige a otra.';
    case 'sin_cambio': return 'Esa instructora ya es la que da esta clase.';
    case 'clase_cancelada': return 'Esta clase está cancelada: no necesita sustituta.';
    case 'candidata_no_valida': return 'Esa instructora no puede dar esta clase (no está activa en el equipo).';
    case 'clase_ya_empezada': return MENSAJE_CLASE_YA_EMPEZADA;
    default: return 'Esta sustitución ya está resuelta';
  }
}
