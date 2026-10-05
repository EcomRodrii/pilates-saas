// Qué aviso recibe la alumna cuando el estudio cambia una clase en la que tiene
// plaza. Puro (lo prueba `node --test`).
//
// «Cambio de profesora» NO es un evento nuevo: ya existe `clase.sustituta`
// («Tu clase sigue en pie · la dará Laura. Tu reserva no cambia»), el que manda
// el motor de sustituciones, con PUSH + in-app y su interruptor propio para la
// alumna («Otra instructora da tu clase»). Lo que fallaba era el otro camino:
// cuando la dueña cambiaba la instructora desde el panel, sin tocar la hora ni
// la sala, salía `clase.modificada` —«Tu clase ha cambiado: pasa a <la misma
// hora de siempre>»—, que se lee como un cambio de horario (el mismo error que ya
// corrigió `lib/sustituciones/avisos.ts` para la sustitución) y que, encima, la
// alumna solo podía silenciar con el interruptor de «Cambio de hora o sala».
//
// Regla: si SOLO cambia quién la da, es el aviso de sustituta. Si se mueve la
// hora o la sala (con o sin cambio de instructora), es una clase modificada, y
// ese aviso ya nombra a la nueva instructora cuando también cambia.

export type AvisoCambioClase = 'sustituta' | 'modificada';

export function avisoDeCambioDeClase(c: { cambiaInstructora: boolean; cambioHora?: boolean; cambioSala?: boolean }): AvisoCambioClase {
  return c.cambiaInstructora && !c.cambioHora && !c.cambioSala ? 'sustituta' : 'modificada';
}

/**
 * La clave de duplicados del aviso de sustituta. LA MISMA que usa el motor de
 * sustituciones (`clase-cubierta:<sesión>:<nombre>`): si una sustitución confirma
 * a Laura y además alguien la pone a mano en el panel, la alumna recibe UN aviso.
 */
export function claveAvisoSustituta(sesionId: string, instructora: string): string {
  return `clase-cubierta:${sesionId}:${instructora}`;
}
