import { test, expect, type Page, type Route } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Las cuatro baldosas de debajo del buscador (decisión del fundador, 7-oct-2026):
// Comunidad · Instructoras · Chat · Mis favoritos. Clases y Mi plan salieron
// porque ya están en la barra de abajo.
//
// «Chat» no es un enlace a la bandeja: abre (o reutiliza) la conversación con
// el mostrador y entra en ella. Por eso se cuenta la petición que la abre —un
// test de «entra en la conversación» sin contador podría estar verde por haber
// llegado a otro sitio sin intentar nada— y se prueba también el camino en que
// el servidor dice que no: entonces va a la bandeja, nunca se queda en nada.
//
// ⚠️ Las rutas propias van DESPUÉS de `sembrarSociaCompleta`: en Playwright gana
// la última registrada, y antes del andamiaje no existirían.

test.describe.configure({ timeout: 150_000 });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const INICIO = `/portal/${SLUG}`;
const CONVERSACIONES = '/api/public/mensajeria/conversaciones';

const baldosas = (page: Page) => page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');

/** Cuenta los POST que abren la conversación y contesta lo que se le diga; el GET sigue al andamiaje. */
async function contarAperturas(page: Page, responder: (r: Route) => Promise<void>) {
  const cuerpos: unknown[] = [];
  await page.route((u) => u.pathname === CONVERSACIONES, async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    cuerpos.push(r.request().postDataJSON());
    return responder(r);
  });
  return cuerpos;
}

test('las cuatro baldosas, en su orden, y cada una lleva a su sitio', async ({ page }) => {
  const a = await sembrarSociaCompleta(page, { posts: 1 });
  await page.goto(INICIO);

  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  // El nombre accesible lleva el título y el pie (el pie se cae por debajo de 360 px; a 390 se ve).
  await expect(baldosas(page)).toHaveText([
    /^Comunidad\s*Lo que pasa en tu estudio$/,
    /^Instructoras\s*Conoce al equipo$/,
    /^Chat\s*Escribe al estudio$/,
    /^Mis favoritos\s*Tus clases guardadas$/,
  ]);
  await expect(baldosas(page).nth(0)).toHaveAttribute('href', `${INICIO}/comunidad`);
  await expect(baldosas(page).nth(1)).toHaveAttribute('href', `${INICIO}/instructoras`);
  // Sin JS (o con ⌘-clic) Chat es la bandeja; al tocarlo, la conversación (test de abajo).
  await expect(baldosas(page).nth(2)).toHaveAttribute('href', `${INICIO}/mensajes`);
  await expect(baldosas(page).nth(3)).toHaveAttribute('href', `${INICIO}/reservar?filtro=Favoritas`);

  // Ninguna repite la barra de abajo.
  const barra = page.getByRole('navigation', { name: 'Principal' });
  for (const repetida of ['Clases', 'Mi plan']) {
    await expect(page.getByRole('navigation', { name: 'Accesos rápidos' }).getByText(repetida, { exact: true })).toHaveCount(0);
  }
  await expect(barra).toBeVisible();

  // Que «Comunidad» y «Chat» quepan sin partir: una sola línea de título.
  for (const titulo of ['Comunidad', 'Chat']) {
    const t = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByText(titulo, { exact: true });
    const alto = await t.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(Math.round(alto), `«${titulo}» parte en dos líneas`).toBe(1);
  }

  // Comunidad: el tablón del estudio.
  await baldosas(page).nth(0).click();
  await expect(page).toHaveURL(`${INICIO}/comunidad`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Comunidad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Publicación 1 del estudio.')).toBeVisible();
  expect(a.llamadas()['/api/public/comunidad/posts']).toBeGreaterThan(0);

  await page.goto(INICIO);
  await baldosas(page).nth(1).click();
  await expect(page).toHaveURL(`${INICIO}/instructoras`, { timeout: 30_000 });

  await page.goto(INICIO);
  await baldosas(page).nth(3).click();
  await expect(page).toHaveURL(`${INICIO}/reservar?filtro=Favoritas`, { timeout: 30_000 });
  expect(a.sinMockear()).toEqual([]);
});

test('Inicio no pide las conversaciones al cargar: el chat se abre al tocarlo', async ({ page }) => {
  const a = await sembrarSociaCompleta(page);
  const cuerpos = await contarAperturas(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"conv-e2e"}' }));
  await page.goto(INICIO);
  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible({ timeout: 30_000 });

  expect(cuerpos).toHaveLength(0);
  expect(a.llamadas()[CONVERSACIONES] ?? 0).toBe(0);
  expect(a.llamadas()['/api/public/comunidad/posts'] ?? 0).toBe(0);
});

test('Chat abre la conversación con el estudio, directa', async ({ page }) => {
  const a = await sembrarSociaCompleta(page);
  const cuerpos = await contarAperturas(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"conv-e2e"}' }));
  await page.goto(INICIO);
  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  // Los datos de Inicio llegan del navegador: con esto, la página ya está hidratada y el toque lo recibe React.
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link', { name: /^Chat/ }).click();
  await expect(page).toHaveURL(`${INICIO}/mensajes/conv-e2e`, { timeout: 30_000 });
  // Una sola petición, y la del mostrador (no la de una instructora).
  expect(cuerpos).toHaveLength(1);
  expect(cuerpos[0]).toMatchObject({ tipo: 'ALUMNA_MOSTRADOR' });
  // Y la pantalla del hilo pidió sus mensajes: se entró de verdad.
  await expect.poll(() => a.llamadas()[`${CONVERSACIONES}/conv-e2e/mensajes`] ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('si el servidor no abre la conversación, Chat lleva a la bandeja (y lo intentó)', async ({ page }) => {
  const a = await sembrarSociaCompleta(page, { conversaciones: 1 });
  const cuerpos = await contarAperturas(page, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No se ha podido abrir la conversación."}' }));
  await page.goto(INICIO);
  await expect(baldosas(page)).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link', { name: /^Chat/ }).click();
  await expect(page).toHaveURL(`${INICIO}/mensajes`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Mensajes' })).toBeVisible({ timeout: 30_000 });
  expect(cuerpos.length).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});
