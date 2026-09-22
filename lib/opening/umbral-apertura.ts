import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENTOS } from '../notifications/catalog.ts';
import { hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';
import { cargarEstadoApertura } from './servidor.ts';
import { debeMostrarApertura } from './visibilidad.ts';

// Un push al día mientras el estudio abre. Opening OS avisa por su cuenta
// (brief de la mañana y alertas, en el cron horario de notif-trial) porque
// también lo necesita el estudio sin plan de decisiones. Si hoy ya ha hablado,
// el mensaje del día del Decision OS se calla: la propietaria que abre tiene la
// cabeza en la apertura, y dos push el mismo día por dos motores es ruido.

/** Pura: ¿se calla hoy el Umbral por la apertura? */
export function aperturaCallaAlUmbral(p: { enVentanaApertura: boolean; avisosAperturaHoy: number }): boolean {
  return p.enVentanaApertura && p.avisosAperturaHoy > 0;
}

/** Lee si el estudio está abriendo y si hoy (día del estudio) ya salió un aviso de apertura. */
export async function aperturaAvisadaHoy(admin: SupabaseClient, studioId: string, now: Date): Promise<boolean> {
  const estado = await cargarEstadoApertura(admin, studioId);
  const enVentanaApertura = !!estado && debeMostrarApertura(estado, now);
  if (!enVentanaApertura) return false;
  const { count, error } = await admin.from('notification').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).in('event_type', [EVENTOS.OPENING_BRIEF, EVENTOS.OPENING_ALERTA])
    .gte('created_at', inicioDelDiaEstudio(hoyEnEstudio(now)));
  if (error) throw error;
  return aperturaCallaAlUmbral({ enVentanaApertura, avisosAperturaHoy: count ?? 0 });
}
