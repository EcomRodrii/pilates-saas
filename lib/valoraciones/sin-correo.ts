// A quién NO hace falta mandarle el correo de «valora tu clase»: a quien ya le llega el aviso al móvil. Sin imports
// con `@/` (ver destinatarias.ts).
//
// Era el correo que más pesaba en la cuota después de los recordatorios, y a una clienta con la app y los avisos
// activados le decía dos veces lo mismo. La condición es ESTRICTA: si no se puede asegurar que el aviso le llega
// (sin dispositivo, o apagado por ella o por el estudio), el correo sale como siempre.
import { pushEfectivo } from '../notifications/push-por-tipo.ts';

export interface CuentaConAviso { socio_id: string; authUserId: string | null }
export interface PreferenciaAviso { user_id: string; push: boolean; push_eventos: unknown }

export function sociasQueYaRecibenElAviso(e: {
  destinatarias: CuentaConAviso[];
  /** `user_id` con al menos un dispositivo suscrito en ESTE estudio. */
  conDispositivo: readonly string[];
  /** Sus filas de `notification_preference` de la categoría 'reservas'. Sin fila = quiere el aviso. */
  preferencias: PreferenciaAviso[];
  /** `studios.avisos_push_apagados`. */
  apagadosPorElEstudio: readonly string[];
  evento: string;
}): string[] {
  if (e.apagadosPorElEstudio.includes(e.evento)) return [];
  const dispositivos = new Set(e.conDispositivo);
  const prefs = new Map(e.preferencias.map(p => [p.user_id, p]));
  return e.destinatarias
    .filter(d => {
      if (!d.authUserId || !dispositivos.has(d.authUserId)) return false;
      const p = prefs.get(d.authUserId);
      return !p || pushEfectivo(p.push, p.push_eventos, e.evento);
    })
    .map(d => d.socio_id);
}
