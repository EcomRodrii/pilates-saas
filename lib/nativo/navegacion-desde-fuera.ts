// ¿Acaba de navegar la app por un aviso pulsado o un enlace que la abrió?
// Puro (navegacion-desde-fuera.test.ts).
//
// Existe por el arranque EN FRÍO: iOS abre la app en `/app`, Capacitor entrega el
// aviso retenido y `PuenteNativo` hace `router.push` al recibo, la reserva…; a
// la vez, `/app` termina de cargar sus estudios y hace `router.replace` al Inicio
// del estudio. Si el `replace` llega después, se pisa el destino del aviso y la
// alumna acaba en Inicio sin saber por qué. Con esta marca, `/app` no navega si
// un aviso o un enlace acaba de hacerlo.
//
// Caduca sola (`VENTANA_MS`): «Cambiar de estudio» vuelve a `/app` más tarde y
// ahí sí tiene que navegar.

export const VENTANA_MS = 15_000;

let ultima = 0;

export function marcarNavegacionDesdeFuera(ahoraMs: number = Date.now()): void {
  ultima = ahoraMs;
}

export function navegoDesdeFueraHaceNada(ahoraMs: number = Date.now()): boolean {
  return ultima > 0 && ahoraMs - ultima < VENTANA_MS;
}
