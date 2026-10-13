// Interruptor de una funcionalidad por estudio, leído de una variable de entorno.
// Mismo formato que `ASISTENTE_IA` (lib/asistente/interruptor.ts):
//
//   on                      → encendida para todos
//   estudios:<id1>,<id2>    → solo en esos (el fundador la prueba antes que nadie)
//   cualquier otra cosa     → apagada (lo de serie)
//
// ⚠️ Cambiar la variable en Vercel no llega a producción sin un despliegue de
// código (ver «Un merge de solo documentación NO despliega» en tentare-os).
// Puro, sin `@/`.

import { estudiosDelInterruptor } from './asistente/interruptor.ts';

export function encendidaPara(valor: string | undefined, studioId: string): boolean {
  if ((valor ?? '').trim() === 'on') return true;
  const estudios = estudiosDelInterruptor(valor);
  return !!estudios && !!studioId && estudios.includes(studioId);
}

/** Aviso de festivos en la bandeja (P1.6). */
export const avisoFestivosEncendido = (studioId: string) => encendidaPara(process.env.FESTIVOS_AVISO, studioId);

/** «Repetir este mes» en el Calendario (P1.7). */
export const repetirMesEncendido = (studioId: string) => encendidaPara(process.env.CALENDARIO_REPETIR_MES, studioId);

/** El mapa de «€ por plaza ofertada» en Informes (pieza E). */
export const euroPorPlazaEncendido = (studioId: string) => encendidaPara(process.env.INFORMES_EURO_PLAZA, studioId);
