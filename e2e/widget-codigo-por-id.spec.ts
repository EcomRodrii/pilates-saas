import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El código del widget por ID (30-sep-2026, lib/widgets/pieza.ts): un código
// pegado ya no lleva el contenido del widget, solo su id, y lo publicado se lee
// de Tentare. Este PR solo LEE el id (ningún código lo emite todavía): el panel
// lo empezará a dar cuando esto ya esté en producción, porque `widget.js` se
// queda hasta un día en la caché de las webs.
//
// Sin marco: con el bundle REAL (`public/widget.js`, `npm run build:widget`) en
// una web ficticia servida con `page.route`, como el resto de specs de la
// nativa. Dentro de una página: contra el servidor de e2e, donde la base de
// datos no existe; eso prueba el rewrite y el camino de fallo (el widget por
// defecto, sin el id en la URL), que es lo que sufriría una web si Tentare no
// pudiera leer el widget.
//
// Los caminos de fallo cuentan peticiones: «se ve el widget por defecto»
// también sería verdad con un bundle que no hubiera pedido nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(120_000);

const TENTARE = 'http://tentare.example.com';
const ANFITRIONA = 'http://albapilates.example.com';
const S = 'studio-alba';
const ID = 'Ab3dE5gH9k';
const BUNDLE = path.resolve('public/widget.js');
const cors = { 'access-control-allow-origin': ANFITRIONA, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };

function fx() {
  const ses = (id: string, h: string, tipo: string) => ({
    id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-12T${h}:00:00+02:00`, fin: `2026-08-12T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: { id: S, nombre: 'Estudio Alba', slug: 'alba', ciudad: 'Madrid', direccion: 'Calle Mayor 1', email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, colorPrimario: '#7A2E4F' },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat suelo', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sustitucionesConfirmadas: [],
    sesiones: [ses('s1', '10', 'tc-r'), ses('s2', '12', 'tc-m')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

const responder = (r: Route, cuerpo: unknown, status = 200) =>
  r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(cuerpo) });

/** Su web, con el código sin marco por ID; `pieza` responde por lo publicado. */
async function enSuWeb(page: Page, pieza: (r: Route) => Promise<void>) {
  expect(fs.existsSync(BUNDLE), 'Falta public/widget.js: genera el bundle con `npm run build:widget`.').toBe(true);
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.routeWebSocket(/\/realtime\/v1\//, () => {});
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route(`${TENTARE}/api/public/**`, r => responder(r, { ok: true }));
  await page.route(`${TENTARE}/widget.js`, r => r.fulfill({ path: BUNDLE, contentType: 'text/javascript' }));
  await page.route(`${TENTARE}/widget-fuentes/**`, r => r.fulfill({ status: 404 }));
  await page.route(`${TENTARE}/api/public/studio-data**`, r => responder(r, fx()));
  await page.route(`${TENTARE}/api/public/session**`, r => responder(r, { error: 'no' }, 401));
  await page.route(/^http:\/\/tentare\.example\.com\/api\/public\/widget-pieza\?/, pieza);
  await page.route(`${ANFITRIONA}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alba</title></head><body style="margin:0;padding:24px;font-family:Georgia,serif"><h1>Horarios</h1><div data-tentare-booking data-studio="alba" data-widget="${ID}"></div><script src="${TENTARE}/widget.js" async></script></body></html>`,
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ANFITRIONA}/horarios`);
}

test('sin marco con su id: se pinta con lo publicado (solo Reformer), no con lo que traiga su <div>', async ({ page }) => {
  const pedidas: string[] = [];
  await enSuWeb(page, r => {
    pedidas.push(r.request().url());
    return r.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ pares: [['tipos', 'tc-r'], ['identidad', 'estudio'], ['ref', 'web-horario']] }),
    });
  });
  await expect(page.getByText('Reformer').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Mat suelo')).toHaveCount(0);
  expect(pedidas.length).toBeGreaterThan(0);
  const pedida = new URL(pedidas[0]);
  expect(pedida.searchParams.get('slug')).toBe('alba');
  expect(pedida.searchParams.get('id')).toBe(ID);
});

test('sin marco con su id y Tentare sin poder leerlo (500): el horario entero, nunca un hueco en su web', async ({ page }) => {
  let intentos = 0;
  await enSuWeb(page, r => {
    intentos++;
    return r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'no' }) });
  });
  await expect(page.getByText('Reformer').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Mat suelo').first()).toBeVisible();
  expect(intentos).toBeGreaterThan(0);
});

test('dentro de una página con su id y sin poder leerlo: el widget por defecto, y el id ya no está en la dirección', async ({ page }) => {
  // El servidor de e2e no tiene base de datos: la ruta del id cae al widget por
  // defecto. Que la dirección final no lleve `w` prueba que pasó por el rewrite
  // (la página, por sí sola, lo dejaría ahí), y que conserve `embed` y `tab`,
  // que la query llega entera.
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'studio-test' }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...fx(), studio: { ...fx().studio, id: 'studio-test', slug: 'tentare' } }) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  const redirecciones: number[] = [];
  page.on('response', res => { if (res.url().includes(`w=${ID}`)) redirecciones.push(res.status()); });

  await page.goto(`/reservar/tentare?embed=1&tab=clases&w=${ID}`);
  const final = new URL(page.url());
  expect(final.pathname).toBe('/reservar/tentare');
  expect(final.searchParams.get('w')).toBeNull();
  expect(final.searchParams.get('embed')).toBe('1');
  expect(final.searchParams.get('tab')).toBe('clases');
  expect(redirecciones).toContain(307);
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 60_000 });
});
