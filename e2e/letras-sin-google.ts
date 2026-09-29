import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Andamiaje para comprobar que una letra se ve SIN pedírsela a Google.
//
// Pedirla a fonts.googleapis.com le daba a Google la IP de cada visitante de la
// web del estudio por haber elegido una letra: sin marco (#2359), en /reservar
// incrustado, en el selector del constructor y en el iframe de pago. Las
// familias que sirve Tentare salen de la app (`next/font`) o de su hoja
// (lib/widget/fuentes-nativa.ts).
//
// ⚠️ «Cero peticiones» solo dice algo con un CONTROL al lado: que la letra se
// leyó (la pantalla la nombra) y, si es de las que servimos, que el navegador la
// descargó de verdad. Sin él, una pantalla que ni siquiera llega a pintar la
// letra también da cero ([[test-4xx-necesita-contador-de-intentos]]).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las peticiones a Google Fonts de la página y de cualquiera de sus iframes.
 * Se contestan vacías: si algo vuelve a pedirlas, el test las cuenta sin
 * esperar a la red (que en CI no hay).
 */
export async function contarGoogleFonts(page: Page): Promise<string[]> {
  const pedidas: string[] = [];
  await page.route(/^https?:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => {
    pedidas.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  return pedidas;
}

/**
 * Una letra de la app (`--font-poppins`), resuelta como la resuelve la página:
 * con una SONDA, sin escribir aquí el nombre que le da `next/font/local` (mismo
 * criterio que reservar-tema-de-la-app.spec.ts). `pila` es su `font-family`
 * computado; `cargada`, si el navegador ya tiene descargada alguna cara de su
 * primera familia.
 */
export async function letraDeLaApp(page: Page, variable: string): Promise<{ pila: string; cargada: boolean }> {
  return page.evaluate((v) => {
    const sonda = document.createElement('span');
    sonda.style.fontFamily = `var(${v})`;
    document.body.appendChild(sonda);
    const pila = getComputedStyle(sonda).fontFamily;
    sonda.remove();
    const primera = pila.split(',')[0].trim().replace(/^["']|["']$/g, '');
    let cargada = false;
    document.fonts.forEach((f) => {
      if (f.family.replace(/^["']|["']$/g, '') === primera && f.status === 'loaded') cargada = true;
    });
    return { pila, cargada };
  }, variable);
}
