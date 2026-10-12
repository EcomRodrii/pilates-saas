// «Tu Tentare» (P2.5) entra APAGADO: `TU_TENTARE` con el formato de
// `ASISTENTE_IA` (lib/asistente/interruptor.ts):
//
//   on                    → encendido para todos
//   estudios:<id1>,<id2>  → solo en esos (el fundador lo prueba antes)
//   cualquier otra cosa   → apagado: Configuración se ve exactamente como hoy
//
// Se lee SOLO en el servidor (/api/configuracion/tu-tentare): ni la variable ni
// los ids de estudio viajan al navegador. ⚠️ Cambiarla en Vercel no llega a
// producción sin un despliegue de código. Puro, sin `@/`.

import { estudiosDelInterruptor } from '../asistente/interruptor.ts';

export function tuTentareEncendidoPara(valor: string | undefined, studioId: string): boolean {
  if ((valor ?? '').trim() === 'on') return true;
  const estudios = estudiosDelInterruptor(valor);
  return !!estudios && !!studioId && estudios.includes(studioId);
}

/** ¿Lo ve esta sesión? Solo la propietaria (Tu panel es solo suyo) y con el interruptor encendido. */
export function tuTentareVisible(rol: string, valor: string | undefined, studioId: string): boolean {
  return rol === 'PROPIETARIO' && tuTentareEncendidoPara(valor, studioId);
}
