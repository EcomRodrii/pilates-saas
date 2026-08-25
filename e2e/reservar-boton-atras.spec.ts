import { test, expect, type Page } from '@playwright/test';
import { scriptSnippetIframe } from '../lib/reservar/snippet-embed.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Botón Atrás real (docs/rediseno-widget-sin-popup-diseno.md, petición
// explícita de seguimiento al rediseño "sin popup").
//
// Antes de este cambio, abrir la ficha de una clase o el flujo de login/pago
// era puro estado de React — el Atrás del navegador se saltaba el widget
// entero y sacaba de `/reservar/[slug]`. Ahora la ficha y el flujo son dos
// NIVELES de historial reales (`?paso=ficha|<Step>&clase=<id>`,
// `nivelDeVista` en app/reservar/[slug]/page.tsx): un Atrás cierra un nivel,
// no la página; un refresh sobre esa URL intenta reabrir el mismo sitio.
//
// Fixture deliberadamente SIN plan que exigir: una visitante sin sesión que
// pulsa "Reservar" cae en el paso 'login' de siempre (enlace mágico /
// contraseña), no en 'datos' (esa ruta — "pagar sin login" — ya la cubre
// reservar-pagar-sin-cuenta.spec.ts, y no hace falta duplicarla aquí: lo que
// importa en este fichero es el historial, no el paso concreto al que se
// entra).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
    },
    tiposClase: [
      { id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#8FC98A', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Sin planes a propósito: sin plan que exigir, "Reservar" en la ficha va
    // siempre a 'login' — mismo criterio que documenta el docblock de arriba.
    planesTarifa: [],
    sesiones: [
      { id: 'ses-r', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false },
      { id: 'ses-m', studioId: STUDIO_ID, tipoClaseId: 'tc-m', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T12:00:00', fin: '2026-08-12T12:50:00', aforoMaximo: 10, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function mocks(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture()) }));
  // Sin sesión — el fixture entero es para el camino no autenticado.
  await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
}

async function abrir(page: Page, query = '') {
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?tab=clases${query}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
}

const filaReformer = (page: Page) => page.getByRole('button', { name: /Reformer a las 10:00/ });
// `level: 2` porque la fila de la lista de detrás TAMBIÉN pinta el nombre de
// la clase como encabezado (`<h3>`, reserva-calendario.tsx) — sin acotar el
// nivel, este locator es ambiguo en cuanto la lista reaparece detrás.
const tituloFicha = (page: Page) => page.getByRole('heading', { level: 2, name: 'Reformer' });
const tituloLogin = (page: Page) => page.getByRole('heading', { name: 'Entra para reservar' });
const botonReservarFicha = (page: Page) => page.getByRole('button', { name: /^Reservar/ });

test('entrar en ficha → Atrás → vuelve a la lista, no sale de la página', async ({ page }) => {
  await abrir(page);
  await filaReformer(page).click();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBe('ficha');
  expect(new URL(page.url()).searchParams.get('clase')).toBe('ses-r');

  await page.goBack();

  // Sigue en /reservar/tentare — el Atrás cerró la ficha, no salió de la página.
  expect(new URL(page.url()).pathname).toBe(`/reservar/${SLUG}`);
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBeNull();
  await expect(tituloFicha(page)).not.toBeVisible();
  await expect(filaReformer(page)).toBeVisible();
});

test('lista → ficha → login → Atrás vuelve a la ficha, otro Atrás vuelve a la lista', async ({ page }) => {
  await abrir(page);
  await filaReformer(page).click();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });

  await botonReservarFicha(page).click();
  await expect(tituloLogin(page)).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get('paso')).toBe('login');
  expect(new URL(page.url()).searchParams.get('clase')).toBe('ses-r');

  // Un Atrás desde el flujo retrocede DENTRO del widget — a la ficha, no
  // directo a la lista (el criterio explícito del pedido: "retroceder
  // correctamente dentro del flujo antes de abandonar el widget").
  await page.goBack();
  await expect(tituloLogin(page)).not.toBeVisible();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get('paso')).toBe('ficha');

  // Y un segundo Atrás sí llega a la lista.
  await page.goBack();
  await expect(tituloFicha(page)).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('paso')).toBeNull();
  await expect(filaReformer(page)).toBeVisible();
});

test('refresh durante la ficha conserva la vista', async ({ page }) => {
  await abrir(page);
  await filaReformer(page).click();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
  // Y el CTA de reservar sigue siendo alcanzable — no una ficha "a medias".
  await expect(botonReservarFicha(page)).toBeVisible();
});

test('refresh durante el paso de login reabre el flujo (vía openBooking, no un estado a ciegas)', async ({ page }) => {
  await abrir(page);
  await filaReformer(page).click();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
  await botonReservarFicha(page).click();
  await expect(tituloLogin(page)).toBeVisible({ timeout: 30_000 });

  await page.reload();
  // openBooking() se vuelve a evaluar con el estado de auth ACTUAL (sigue sin
  // sesión) — el paso correcto sigue siendo 'login', reabierto de verdad, no
  // solo el parámetro de la URL.
  await expect(tituloLogin(page)).toBeVisible({ timeout: 30_000 });
});

test('evitar entradas duplicadas: reabrir la MISMA ficha no apila historial de más', async ({ page }) => {
  // ⚠️ `window.history.length` NUNCA decrece con `history.go()`/Atrás — solo
  // cuenta el TOTAL de entradas de la sesión, cerrar solo mueve el puntero
  // hacia atrás. Y un `pushState` hecho desde una posición con entradas
  // "hacia adelante" las trunca y pone la nueva en su sitio (mismo índice) —
  // así que reabrir la MISMA ficha después de cerrarla no hace CRECER
  // `length`, la longitud vuelve a ser la de abrir la primera vez. Repetir
  // el ciclo dos veces prueba que no crece sin límite (lo que sí sería un
  // bucle de verdad).
  await abrir(page);
  const largoInicial = await page.evaluate(() => window.history.length);

  await filaReformer(page).click();
  await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
  const trasAbrir = await page.evaluate(() => window.history.length);
  expect(trasAbrir).toBe(largoInicial + 1);

  for (let ciclo = 0; ciclo < 2; ciclo++) {
    await page.getByRole('button', { name: 'Volver a las clases' }).click();
    await expect(tituloFicha(page)).not.toBeVisible();

    await filaReformer(page).click();
    await expect(tituloFicha(page)).toBeVisible({ timeout: 30_000 });
    // Ni crece sin límite ni se queda corta: sigue siendo exactamente UNA
    // entrada más que el listado, en cada vuelta del ciclo.
    expect(await page.evaluate(() => window.history.length)).toBe(trasAbrir);
  }
});

test('no rompe los filtros: el parámetro del snippet sobrevive a abrir/cerrar la ficha', async ({ page }) => {
  // `tipos=tc-m` (parámetro del snippet embebido, config-widget.ts): solo
  // Mat visible en la lista. Abrir/cerrar la ficha de Mat no debe perderlo.
  // ⚠️ `tipos=` solo se lee en `embedMode` (`resolverConfigWidget`,
  // app/reservar/[slug]/page.tsx) — sin `embed=1` el parámetro se ignora y
  // las dos clases se ven igual, sin relación con el botón Atrás.
  await abrir(page, '&embed=1&tipos=tc-m');
  await expect(page.getByRole('button', { name: /Mat a las 12:00/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Reformer a las/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Mat a las 12:00/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Mat' })).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get('tipos')).toBe('tc-m');

  await page.goBack();
  expect(new URL(page.url()).searchParams.get('tipos')).toBe('tc-m');
  await expect(page.getByRole('button', { name: /Mat a las 12:00/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reformer a las/ })).toHaveCount(0);
});

// ─── Dentro de un iframe (Modo A embebido) ─────────────────────────────────
// El Atrás del navegador es del TOP-level: por la historia de sesión conjunta
// del propio HTML (joint session history), un `history.pushState` dentro de
// un iframe se apila en la MISMA pila que la página que lo aloja, y el Atrás
// del navegador la recorre igual — sin necesitar ningún postMessage nuevo
// para esta parte. Mismo montaje de host real que
// reservar-embed-overlays-visibles.spec.ts.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

const APP = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? '3000'}`;
const HOST = 'http://localhost:4498';
const IFRAME_ID = 'tentare-widget-tentare-reservas';

test('funciona embebido en un iframe: Atrás cierra la ficha sin salir de la web del estudio', async ({ page }) => {
  await mocks(page);
  const script = scriptSnippetIframe({ origen: APP, slug: SLUG, iframeId: IFRAME_ID });
  const html = `<!doctype html><html><body style="margin:0">
<div style="height:200px;background:#eee">La web del estudio</div>
<iframe id="${IFRAME_ID}" src="${APP}/reservar/${SLUG}?embed=1&tab=clases" style="width:100%;height:600px;border:0" title="Reservas"></iframe>
${script}
</body></html>`;
  await page.route(`${HOST}/`, r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${HOST}/`);

  const frame = page.frameLocator(`#${IFRAME_ID}`);
  await frame.locator('#horario').waitFor({ timeout: 150_000 });
  await frame.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(frame.getByRole('heading', { level: 2, name: 'Reformer' })).toBeVisible({ timeout: 30_000 });

  // El Atrás lo pulsa la visitante en SU navegador — sobre la página del
  // HOST, no sobre el iframe directamente (así es como se usa de verdad).
  // ⚠️ `page.goBack()` (con o sin `waitUntil`) espera una navegación DEL
  // FRAME SUPERIOR — pero esta entrada de historial la empujó `pushState`
  // DENTRO del iframe: por la historia de sesión CONJUNTA del propio HTML
  // (joint session history), el navegador real la recorre igual al pulsar
  // Atrás, pero el wrapper de Playwright no lo reconoce como "una
  // navegación del top frame" y se queda esperando para siempre. La API
  // cruda (`window.history.back()`) es exactamente lo que dispara el botón
  // físico del navegador — sin ese desajuste.
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(500);

  // Sigue en la web del estudio (el host NUNCA navegó) y la ficha del
  // widget, dentro del iframe, se cerró.
  await expect(page.getByText('La web del estudio')).toBeVisible();
  await expect(frame.getByRole('heading', { level: 2, name: 'Reformer' })).not.toBeVisible();
  await expect(frame.getByRole('button', { name: /Reformer a las 10:00/ })).toBeVisible();
});
