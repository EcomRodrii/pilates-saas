import type { Page } from '@playwright/test';

// Cuántas veces intenta SONAR algo en la página. Tenti no suena (fundador,
// 6-oct-2026: «quítale el sonido a Tenti»), y esto es lo que lo demuestra en el
// navegador: ningún test oye, así que se cuenta todo lo que en un navegador
// puede hacer ruido — crear un AudioContext, un oscilador o una fuente de
// buffer, y darle a play() a un <audio>/<video>. Con el AudioContext suspendido
// (sin gesto) se crean igual: se cuenta la INTENCIÓN de sonar, que es lo que
// decide el producto.
//
// Va con addInitScript: se registra ANTES de montar la pantalla.

export async function espiarSonidos(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sonidos: number; AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    w.__sonidos = 0;
    for (const nombre of ['AudioContext', 'webkitAudioContext'] as const) {
      const C = w[nombre];
      if (!C) continue;
      w[nombre] = class extends C { constructor(...a: ConstructorParameters<typeof AudioContext>) { super(...a); w.__sonidos++; } };
    }
    const P = window.AudioContext?.prototype ?? null;
    for (const m of ['createOscillator', 'createBufferSource'] as const) {
      const original = P?.[m] as ((this: AudioContext) => AudioNode) | undefined;
      if (!P || !original) continue;
      (P as unknown as Record<string, unknown>)[m] = function (this: AudioContext) { w.__sonidos++; return original.call(this); };
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { w.__sonidos++; return play.call(this); };
  });
  return {
    cuantos: () => page.evaluate(() => (window as unknown as { __sonidos: number }).__sonidos),
  };
}
