import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// La cabecera de Inicio FLOTA sobre la portada del estudio, en crema. Su
// legibilidad no la decide ningún token: la decide la foto que sube cada
// estudio, y eso no lo controlamos.
//
// ⚠️ `student-contraste.spec.ts` NO puede cubrir esto y por eso existe este
// fichero. Aquel resuelve el fondo leyendo estilos y se salta el texto sobre
// foto a propósito (medirlo así da números falsos); pero la cabecera no es hija
// del héroe —es `position: fixed`, hermana de `main`—, así que su caminante se
// va hasta el crema de la página y grita 1,00:1 contra sí mismo. Ni el rojo era
// medible ni el verde habría significado nada.
//
// Aquí se mide como se debe: se OCULTA el texto, se fotografían los píxeles que
// quedan debajo y se compara con la tinta. Sin el velo de `StudioHeader`, el
// nombre del estudio sobre una portada clara daba **2,91:1**.

const CLARA = '#F2EFE9';  // sala a contraluz: el peor caso real, casi blanco.
const OSCURA = '#141410';

function lum(r: number, g: number, b: number) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const LTINTA = lum(250, 249, 245); // #FAF9F5, la crema de la cabecera flotante.

test.describe('Student PWA · cabecera sobre la portada', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [tono, color] of [['clara', CLARA], ['oscura', OSCURA]] as const) {
    for (const [indice, etiqueta, minimo] of [[0, 'el nombre del estudio', 4.5], [1, 'el lema', 4.5]] as const) {
      test(`${etiqueta} se lee sobre una portada ${tono}`, async ({ page }) => {
        await sembrarSociaCompleta(page);
        // La portada se sustituye por un color plano de luminancia conocida: lo
        // que se prueba es el VELO, no la foto de ejemplo del andamiaje.
        await page.route('**/*.{png,jpg,jpeg,webp,avif}', (r) => r.fulfill({
          status: 200, contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/></svg>`,
        }));
        await page.setViewportSize({ width: 393, height: 852 });
        await page.goto(`/portal/${SLUG}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(2000);

        const caja = await page.evaluate((i) => {
          const el = document.querySelectorAll('header a span span')[i];
          if (!el) return null;
          // Se oculta lo que PINTA la cabecera, no la cabecera: así se
          // fotografía exactamente lo que hay debajo del texto.
          document.querySelectorAll('header a, header svg').forEach((n) => { (n as HTMLElement).style.visibility = 'hidden'; });
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        }, indice);
        // El lema solo existe si el estudio lo ha escrito (`E2E_LEMA`): sin él
        // no hay nada que medir, y eso no es un fallo.
        test.skip(caja === null, 'este estudio no tiene ese texto en la cabecera');
        if (!caja || caja.width < 2) return;

        const buf = await page.screenshot({ clip: caja });
        const datos: number[] = await page.evaluate(async ([b, w, h]) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + b;
          await img.decode();
          const lienzo = document.createElement('canvas');
          lienzo.width = w as number; lienzo.height = h as number;
          const ctx = lienzo.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          return Array.from(ctx.getImageData(0, 0, w as number, h as number).data);
        }, [buf.toString('base64'), caja.width, caja.height] as const);

        let peor = 99;
        for (let i = 0; i < datos.length; i += 4) {
          const l = lum(datos[i], datos[i + 1], datos[i + 2]);
          const [a, b] = [LTINTA, l].sort((x, y) => y - x);
          peor = Math.min(peor, (a + 0.05) / (b + 0.05));
        }
        expect(+peor.toFixed(2), `peor contraste medido sobre portada ${tono}`).toBeGreaterThanOrEqual(minimo);
      });
    }
  }
});
