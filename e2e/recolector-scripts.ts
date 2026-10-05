import type { Page } from '@playwright/test';

// Lo que el navegador DESCARGA, para poder decir «el motor de Tenti no viaja con
// esta pantalla». Compartido por las specs que lo afirman (la de Listo, que
// lleva el control positivo, y la del relevo del Orb), para que las dos miren
// con el mismo recolector: dos copias de un andamiaje divergen, y la que afirma
// algo acaba afirmándolo sobre otra cosa.
//
// Con page.on('response') y no con performance.getEntriesByType, cuyo buffer de
// 250 entradas se llena con los fetch del panel y empieza a perder.

/** Una cadena que solo está en lib/tenti/motor.ts. Sobrevive a la minificación
 *  (es un literal), así que vale igual con `next dev` que con el build de CI. */
export const HUELLA_DEL_MOTOR = 'Tenti necesita un canvas 2D';

/** Se registra ANTES de montar la pantalla (es un evento, no una ruta): tiene que ver la primera carga. */
export function recolectarScripts(page: Page) {
  const cuerpos: string[] = [];
  const pendientes: Promise<unknown>[] = [];
  page.on('response', r => {
    const tipo = r.headers()['content-type'] ?? '';
    if (!/javascript/.test(tipo) && !/\.js(\?|$)/.test(r.url())) return;
    // Una respuesta sin cuerpo (redirección, abortada) no es un fallo del test.
    pendientes.push(r.text().then(t => cuerpos.push(t), () => {}));
  });
  return {
    async contiene(s: string) {
      await Promise.all(pendientes);
      return cuerpos.some(c => c.includes(s));
    },
    async cuantos() { await Promise.all(pendientes); return cuerpos.length; },
  };
}
