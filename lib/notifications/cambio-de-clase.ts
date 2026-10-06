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
 * La clave de duplicados del aviso de sustituta: UN cambio = UNA clave.
 *
 * Lleva la instructora que ENTRA y un sello del cambio. Antes era solo
 * `clase-cubierta:<sesión>:<nombre>`, compartida por el motor de sustituciones y
 * el panel, y la tabla de avisos no olvida una clave: tras «la dará Laura» →
 * «la dará Ana», volver a poner a Laura chocaba con la primera y no llegaba nada;
 * las alumnas seguían creyendo que la daba Ana.
 * - Motor: `selloDelMotor(sustitucionId)`. Cada sustitución es un cambio; repetir
 *   la confirmación de la MISMA no avisa dos veces.
 * - Panel: `selloDelPanel(ahora)`. Cada guardado es un cambio; un doble envío en
 *   el mismo segundo no avisa dos veces.
 * Motor y panel no comparten clave: no pueden silenciarse el uno al otro.
 */
export function claveAvisoSustituta(p: { sesionId: string; instructora: string; sello: string }): string {
  return `clase-cubierta:${p.sesionId}:${p.instructora}:${p.sello}`;
}

export function selloDelMotor(sustitucionId: string): string {
  return `sust-${sustitucionId}`;
}

/** Al segundo, en UTC: lo que tarda una persona en volver a cambiar la clase es mucho más. */
export function selloDelPanel(ahora: Date): string {
  return `panel-${ahora.toISOString().slice(0, 19)}`;
}
