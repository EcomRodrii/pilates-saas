import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';
import { CONFIG_POR_DEFECTO } from '../lib/widgets/config.ts';
import { generarCodigo } from '../lib/widgets/integracion.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El widget sin marco, «Mi cuenta → Reservas» (29-sep-2026): cancelar pide
// confirmación y dice si se pierde la sesión del bono, como la página. Antes
// cancelaba al primer toque, y el aviso de cancelación tardía no salía nunca:
// la ventana del estudio no le llegaba (quedaba en 0).
//
// Con el bundle REAL (`public/widget.js`, lo genera `npm run build:widget`) en
// una web ficticia servida con `page.route`, como e2e/widget-nativa-estilo.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(120_000);

const TENTARE = 'http://tentare.example.com';
const ANFITRIONA = 'http://albapilates.example.com';
const S = 'studio-alba';
const SOCIO_ID = 'socio-nativa';
const BUNDLE = path.resolve('public/widget.js');
const cors = { 'access-control-allow-origin': ANFITRIONA, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };

test.beforeAll(() => {
  expect(fs.existsSync(BUNDLE), 'Falta public/widget.js: genera el bundle con `npm run build:widget`.').toBe(true);
});

function fx() {
  const ses = (id: string, h: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-12T${h}:00:00+02:00`, fin: `2026-08-12T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false,
  });
  const reservas = [
    // A las 10:00 y son las 08:00: dentro de las 12 h, y el estudio no devuelve la sesión.
    { id: 'res-1', studioId: S, socioId: SOCIO_ID, sesionId: 's1', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-08-01T09:00:00Z' },
    { id: 'res-2', studioId: S, socioId: SOCIO_ID, sesionId: 's2', estado: 'LISTA_ESPERA', spotId: null, posicionEspera: 1, ofertaExpiraEn: '2026-08-12T08:30:00+02:00', checkInEn: null, creadoEn: '2026-08-02T09:00:00Z' },
  ];
  return {
    studio: {
      id: S, nombre: 'Estudio Alba', slug: 'alba', ciudad: 'Madrid', direccion: 'Calle Mayor 1', email: 'hola@example.com',
      telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, cancelacionDevolverBonoTardia: false, colorPrimario: '#7A2E4F',
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sustitucionesConfirmadas: [], sesiones: [ses('s1', '10'), ses('s2', '18')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [],
    aforoReservas: reservas.map(r => ({ id: r.id, sesion_id: r.sesionId, estado: r.estado })),
    socia: {
      socio: { id: SOCIO_ID, studioId: S, nombre: 'Socia', apellidos: 'Prueba', email: 'socia-nativa@example.com', aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null } },
      reservas, plazasFijas: [], recibos: [], suscripciones: [],
    },
  };
}

const responder = (r: Route, cuerpo: unknown, status = 200) =>
  r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(cuerpo) });

async function enSuWeb(page: Page) {
  const w = widgetPorId('horario');
  if (!esDisponible(w)) throw new Error('«Horario y reservas» debería estar disponible');
  const div = /<div data-tentare-booking[^>]*><\/div>/.exec(generarCodigo({ widget: w, config: CONFIG_POR_DEFECTO, origen: TENTARE, slug: 'alba', colorEstudio: '#7A2E4F' }, 'nativa', 'html').codigo)?.[0];
  if (!div) throw new Error('El código sin marco debería llevar su <div>');
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.routeWebSocket(/\/realtime\/v1\//, () => {});
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route(`${TENTARE}/api/public/**`, r => responder(r, { ok: true }));
  await page.route(`${TENTARE}/widget.js`, r => r.fulfill({ path: BUNDLE, contentType: 'text/javascript' }));
  await page.route(`${TENTARE}/widget-fuentes/**`, r => r.fulfill({ status: 404 }));
  await page.route(`${TENTARE}/api/public/studio-data**`, r => responder(r, fx()));
  await page.route(`${TENTARE}/api/public/session**`, r => responder(r, { socioId: SOCIO_ID, nombre: 'Socia Prueba', email: 'socia-nativa@example.com' }));
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: 'socia-nativa@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.route(`${ANFITRIONA}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alba</title></head><body style="margin:0;padding:24px;font-family:Georgia,serif"><h1>Horarios</h1>${div}<script src="${TENTARE}/widget.js" async></script></body></html>`,
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ANFITRIONA}/horarios`);
  await page.getByRole('button', { name: 'Mi cuenta' }).click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Mi cuenta' })).toBeVisible();
}

test('sin marco: cancelar pide confirmación y dice que se pierde la sesión; «No, mantener» no manda nada', async ({ page }) => {
  await enSuWeb(page);
  // Después del andamiaje: registrada antes, la red de seguridad la taparía.
  let cancelaciones = 0;
  await page.route(`${TENTARE}/api/public/reserva**`, r => {
    if (r.request().method() !== 'OPTIONS') cancelaciones++;
    return responder(r, { ok: true });
  });
  const tarjeta = page.getByRole('article').filter({ hasText: 'Hoy · 10:00' });
  await tarjeta.getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(tarjeta).toContainText('¿Quieres cancelar esta reserva? Con menos de 12h de antelación no se te devolverá la sesión del bono.');
  await tarjeta.getByRole('button', { name: 'No, mantener' }).click();
  await page.waitForTimeout(300);
  expect(cancelaciones).toBe(0);

  await tarjeta.getByRole('button', { name: 'Cancelar reserva' }).click();
  await tarjeta.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect.poll(() => cancelaciones).toBe(1);
});

test('sin marco: una plaza ofrecida dice «Plaza para ti» y hasta cuándo', async ({ page }) => {
  await enSuWeb(page);
  const tarjeta = page.getByRole('article').filter({ hasText: 'Hoy · 18:00' });
  await expect(tarjeta.getByText('Plaza para ti', { exact: true })).toBeVisible();
  await expect(tarjeta).toContainText('¡Se ha liberado una plaza! Tienes hasta las 08:30 para aceptarla.');
  await expect(tarjeta.getByRole('button', { name: 'Aceptar plaza' })).toBeVisible();
});
