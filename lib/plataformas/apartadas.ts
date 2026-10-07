// Plazas APARTADAS para una plataforma que vende a mano (ClassPass, decisión del
// fundador del 7-oct-2026): mientras ella no las venda, desde Tentare no las coge
// nadie; X horas antes de la clase se liberan. La regla vive en la base de datos
// (`plazas_apartadas`, migr 20261007164222); aquí, lo que la pantalla necesita.
import { diaEnEstudio } from '../calendario-hora-estudio.ts';
import { fechaCortaEstudio, horaEstudio } from '../utils.ts';

/**
 * Las plataformas cuyas plazas se apartan. Gemela de `plataformas_que_apartan()`
 * en SQL: lo cruza un test. Wellhub y USC van por API y ven nuestra ocupación
 * al momento, así que no hace falta.
 */
export const PLATAFORMAS_QUE_APARTAN = ['CLASSPASS'] as const;

/** «hasta las 18:00» si es hoy (en el estudio); si no, «hasta el 25 de julio a las 18:00». */
export function hastaCuandoApartadas(hastaISO: string, ahora: Date = new Date()): string {
  const hora = horaEstudio(hastaISO);
  return diaEnEstudio(hastaISO) === diaEnEstudio(ahora)
    ? `hasta las ${hora}`
    : `hasta el ${fechaCortaEstudio(hastaISO)} a las ${hora}`;
}
