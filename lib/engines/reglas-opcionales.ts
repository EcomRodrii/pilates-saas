// Reglas de Automatizaciones que solo existen donde su interruptor de servidor
// está encendido (P3.10, 13-oct-2026). Con el interruptor apagado:
//   · el motor no las ejecuta aunque la regla esté activa (la cerradura real),
//   · la pantalla no ofrece crearlas (la sonda `/api/automatizaciones/disponibles`),
//   · el dispatcher no abre un run de Inngest por ellas.
//
// Hoy solo hay una, felicitar el cumpleaños: escribe a la alumna con fines
// comerciales (LSSI art. 21), así que exige el consentimiento de novedades
// vigente y lleva enlace de baja, como el re-enganche de AUSENCIA_DIAS.

import type { TriggerRule } from '@/lib/types';
import { felicitarCumpleEncendido } from '../interruptor-por-estudio.ts';

export const TRIGGERS_OPCIONALES: ReadonlySet<TriggerRule> = new Set<TriggerRule>(['CUMPLEANOS']);

/** Las reglas opcionales que este estudio puede usar hoy. Solo en servidor: lee variables de entorno. */
export function reglasOpcionalesEncendidas(studioId: string): ReadonlySet<TriggerRule> {
  const encendidas = new Set<TriggerRule>();
  if (felicitarCumpleEncendido(studioId)) encendidas.add('CUMPLEANOS');
  return encendidas;
}

/**
 * ¿Hace algo esta regla en este estudio? Una regla normal, siempre; una
 * opcional, solo con su interruptor. El dispatcher lo usa para no gastar un run
 * en un estudio cuyas únicas reglas activas están apagadas por interruptor.
 */
export function reglaEjecutable(trigger: TriggerRule, encendidas: ReadonlySet<TriggerRule>): boolean {
  return !TRIGGERS_OPCIONALES.has(trigger) || encendidas.has(trigger);
}
