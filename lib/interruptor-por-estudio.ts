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

/** «Plazas libres» en el Calendario (P3.9, pieza F). */
export const plazasLibresEncendido = (studioId: string) => encendidaPara(process.env.CALENDARIO_PLAZAS_LIBRES, studioId);

/**
 * El mapa de «€ por plaza ofertada» en Informes (pieza E). ⚠️ NO SE ENCIENDE
 * con esta definición (decisión del 13-oct-2026, con producto y arquitectura):
 * repartir lo COBRADO del periodo deja a 0 € las clases de un bono pagado antes
 * y carga entero en sus pocas clases el que se compra al final, y «lo que deja
 * una clase» ya tiene dueño (`lib/decision/margen-clase.ts`, el «Ingreso» de la
 * tabla Clases). Antes, una E2 de € por USO sobre ese dueño. Por eso devuelve
 * `false` fijo: cambiar `INFORMES_EURO_PLAZA` en Vercel no basta para
 * encenderlo; hay que cambiar el código (y su revisión).
 */
export const euroPorPlazaEncendido = (_studioId: string): boolean => false;

/** «Plazas que dejaron vacías» en Informes (P3.15, pieza A). Solo lectura. */
export const plazasVaciasEncendido = (studioId: string) => encendidaPara(process.env.INFORMES_PLAZAS_VACIAS, studioId);

/** «Felicitar el cumpleaños» en Automatizaciones (P3.10). */
export const felicitarCumpleEncendido = (studioId: string) => encendidaPara(process.env.AUTOMATIZACION_CUMPLEANOS, studioId);

/** Leer el horario desde una captura o un texto (P2.1). Lo mira `/api/horario/leer`; la pantalla, el catálogo del navegador (misma variable). */
export const horarioDesdeImagenEncendido = (studioId: string) => encendidaPara(process.env.HORARIO_DESDE_IMAGEN, studioId);
