import type { Page } from '@playwright/test';

// Cuántas veces SUENA Tenti, para poder decir «suena al abrir el buscador» y
// «no suena al parpadear». Ningún test oye: se cuentan los osciladores que pide
// lib/tenti/sonidos.ts (cada efecto lleva al menos uno). Con el AudioContext
// suspendido (sin gesto) se crean igual, así que se cuenta la intención de
// sonar, que es lo que decide el producto; si el navegador deja oírlo es cosa
// suya.
//
// Va con addInitScript: se registra ANTES de montar la pantalla.

export async function espiarSonidos(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __osciladores: number };
    w.__osciladores = 0;
    const C = window.AudioContext;
    if (!C) return;
    const crear = C.prototype.createOscillator;
    C.prototype.createOscillator = function (this: AudioContext) {
      w.__osciladores++;
      return crear.call(this);
    };
  });
  return {
    cuantos: () => page.evaluate(() => (window as unknown as { __osciladores: number }).__osciladores),
  };
}
