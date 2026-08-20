import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, AHORA, fixtureSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// El aviso de «no se ha podido iniciar el pago» tiene que LEERSE, también sobre
// una web oscura.
//
// Usaba las clases `text-destructive` / `bg-destructive/10` del PANEL, que no
// participan del modo del widget. Medido: el aviso salía EXACTAMENTE igual en
// claro y en oscuro —rojo teja #A8442A sobre un fondo al 10 %—, que sobre una
// web oscura da ~2,8:1 con texto de 13 px. Por debajo de AA, y es justo el
// error que la alumna más necesita poder leer.
//
// Se comprueba por CONTRASTE calculado, no por «existe el elemento»: un aviso
// presente e ilegible pasa cualquier test de existencia.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(300_000);

/** Luminancia relativa (WCAG 2.1) de un `rgb(...)`. */
function luminancia(css: string): number {
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) throw new Error(`color no reconocido: ${css}`);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(+m[1]) + 0.7152 * canal(+m[2]) + 0.0722 * canal(+m[3]);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function fixtureConPlanes() {
  return {
    ...fixtureSociaLista(),
    planesTarifa: [
      { id: 'p-b10', studioId: STUDIO_ID, nombre: 'Bono 10', tipo: 'BONO', precio: 175, sesiones: 10, activo: true },
      { id: 'p-mes', studioId: STUDIO_ID, nombre: 'Ilimitado', tipo: 'MENSUAL', precio: 129, sesiones: null, activo: true },
    ],
  };
}

async function abrirYRomperElPago(page: Page, url: string) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureConPlanes()) }));
  // El checkout falla: es el único camino por el que se ve este aviso.
  await page.route('**/api/stripe/checkout', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'No se ha podido iniciar el pago.' }) }));

  // Calentado con reintento: en frío la primera petición puede devolver el 404
  // del servidor de desarrollo mientras compila (ver reservar-si-falla-lo-dice).
  // 3 × 30 s como mucho: con 6 × 40 s el calentamiento por sí solo agotaba el
  // tiempo del test y Playwright cerraba la página a media prueba.
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(url);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }

  const boton = page.getByRole('button', { name: /Bono 10|Contratar|Elegir/ }).first();
  await boton.scrollIntoViewIfNeeded();
  await boton.click({ timeout: 30_000 });
  await expect(avisoPago(page)).toBeVisible({ timeout: 30_000 });
}

/** El aviso del pago, no cualquier `role=alert` de la página. */
function avisoPago(page: Page) {
  return page.getByRole('alert').filter({ hasText: /No se ha podido iniciar el pago/ });
}

/** Color del aviso y el fondo real sobre el que se lee. */
async function colores(page: Page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('[role=alert]')]
      .find(n => /No se ha podido iniciar el pago/.test((n as HTMLElement).innerText || '')) as HTMLElement;
    const cs = getComputedStyle(el);
    // El fondo del aviso es translúcido, así que lo que de verdad hay detrás es
    // el primer ancestro con fondo opaco — o el body.
    let n: HTMLElement | null = el.parentElement;
    let detras = 'rgb(255, 255, 255)';
    while (n) {
      const b = getComputedStyle(n).backgroundColor;
      const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(b);
      if (m && (m[4] === undefined || Number(m[4]) > 0.9)) { detras = `rgb(${m[1]}, ${m[2]}, ${m[3]})`; break; }
      n = n.parentElement;
    }
    return { texto: cs.color, detras };
  });
}

test('el error de pago se lee en claro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await abrirYRomperElPago(page, `/reservar/${SLUG}?tab=clases`);
  const { texto, detras } = await colores(page);
  const ratio = contraste(texto, detras);
  expect(ratio, `contraste ${ratio.toFixed(2)}:1 (${texto} sobre ${detras})`).toBeGreaterThanOrEqual(4.5);
});

test('el error de pago se lee sobre una web OSCURA', async ({ page }) => {
  // El caso que fallaba: mismo rojo oscuro del panel, pero ahora sobre negro.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrirYRomperElPago(page, `/reservar/${SLUG}?embed=1&tab=clases&fondo=%23121212&texto=claro`);

  const { texto } = await colores(page);
  // Contra el fondo oscuro real que pidió el estudio, no contra el que herede
  // el nodo: en modo transparente el ancestro puede no pintar nada.
  const ratio = contraste(texto, 'rgb(18, 18, 18)');
  expect(ratio, `contraste ${ratio.toFixed(2)}:1 (${texto} sobre #121212)`).toBeGreaterThanOrEqual(4.5);
});
