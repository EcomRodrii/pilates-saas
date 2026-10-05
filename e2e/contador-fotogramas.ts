import type { Page } from '@playwright/test';

// Cuántos fotogramas pide la página y cuántos pinta Tenti, para poder decir «el
// canvas duerme entre parpadeos» y «al cerrar no queda nada vivo».
//
// Se cuentan dos cosas, y por separado:
//   · los callbacks de requestAnimationFrame que corren (de quien sea): en una
//     pantalla quieta del panel no hay ninguno más, así que un temporizador de
//     Tenti olvidado al desmontar se vería aquí en cuanto despertara;
//   · los fotogramas que Tenti PINTA: el motor borra su lienzo una vez por
//     fotograma (`clearRect` sobre un canvas[data-tenti]).
//
// Va con addInitScript: se registra ANTES de montar la pantalla.

interface Cuentas { raf: number; pintados: number }

export async function contarFotogramas(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fotogramas: Cuentas };
    w.__fotogramas = { raf: 0, pintados: 0 };
    const pedir = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => pedir((t) => { w.__fotogramas.raf++; cb(t); });
    const borrar = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...a: [number, number, number, number]) {
      if ((this.canvas as HTMLCanvasElement | undefined)?.hasAttribute?.('data-tenti')) w.__fotogramas.pintados++;
      return borrar.apply(this, a);
    };
  });
  const leer = () => page.evaluate(() => ({ ...(window as unknown as { __fotogramas: Cuentas }).__fotogramas }));
  return {
    /** Lo que se pide y se pinta durante `ms` a partir de ahora. */
    async durante(ms: number): Promise<Cuentas> {
      const a = await leer();
      await page.waitForTimeout(ms);
      const b = await leer();
      return { raf: b.raf - a.raf, pintados: b.pintados - a.pintados };
    },
  };
}
