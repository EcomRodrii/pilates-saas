'use client';

// «La agenda del panel ha cambiado».
//
// Dos secciones de la home pintan clases —«Hoy en el estudio» (el día que se
// esté mirando) y «Próximas clases» (de ahora en adelante)— y las dos piden el
// MISMO endpoint, `/api/calendario`, en rangos distintos. Se solapan siempre:
// la clase en curso y las de esta tarde salen en las dos.
//
// Sin este aviso, llenar un hueco desde la agenda dejaba una sección diciendo
// 5/6 y la otra 6/6, una encima de la otra — la trampa de las dos fuentes que
// documenta `components/dashboard/hoy-en-el-estudio.tsx`. Mismo patrón que
// `invalidarEstadoEstudio` (`lib/estado-estudio-cliente.ts`): quien escribe
// avisa, quien pinta se vuelve a pedir lo suyo.
export const EVENTO_AGENDA = 'tentare-agenda-cambiada';

export function invalidarAgenda(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_AGENDA));
}
