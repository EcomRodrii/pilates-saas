import { test, expect, type Page } from '@playwright/test';

// Horas de los fixtures sin zona: navegador en Madrid y reloj con su offset,
// como el resto de specs de /reservar (RES-7-f).
test.use({ timezoneId: 'Europe/Madrid' });

// ─────────────────────────────────────────────────────────────────────────────
// «Clase de prueba» (Tentare Widgets): la vista `?prueba=1` de /reservar.
//
// Lo que se vigila:
//  - solo salen las clases que cubre la oferta, a su precio, con la regla
//    «solo para tu primera visita» dicha antes de elegir;
//  - pagar la prueba manda al servidor el plan de PRUEBA (no la suelta), sin
//    código de descuento, y un «no puedes estrenarla» (409) se dice, no se
//    convierte en un pago que arranca;
//  - sin oferta activa se dice, con salida al horario, y no se intenta nada;
//  - ⚠️ regresión: fuera de `?prueba=1` la oferta NO existe (precio de la
//    suelta y «pagar y reservar» de siempre).
// Quién puede estrenarla lo decide el servidor (lib/billing/clase-prueba.ts,
// con tests propios); aquí se prueba hasta donde la página confía en él.
//
// ⚠️ Todo camino de fallo lleva contador de intentos
// ([[test-4xx-necesita-contador-de-intentos]]).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const S = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture(o: { prueba?: 'pago' | 'gratis' | null } = {}) {
  const prueba = o.prueba === undefined ? 'pago' : o.prueba;
  const planes: Record<string, unknown>[] = [
    { id: 'plan-suelto', studioId: S, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 22, sesiones: 1, activo: true },
  ];
  if (prueba) {
    planes.push({
      id: 'plan-prueba', studioId: S, nombre: 'Tu primera clase de Reformer', descripcion: 'Conoce el estudio con una clase guiada.',
      tipo: 'PUNTUAL', precio: prueba === 'pago' ? 10 : 0, sesiones: 1, validezDias: 30, activo: true, esPrueba: true,
      tiposClaseIds: ['tc-r'],
    });
  }
  const mk = (id: string, tipo: string, h: string) => ({
    id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-12T${h}:00:00`, fin: `2026-08-12T${h}:50:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12,
      reservaExigirPlan: true, stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: planes,
    sesiones: [mk('ses-r', 'tc-r', '10'), mk('ses-m', 'tc-m', '12')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function abrir(page: Page, query: string, datos = fixture()) {
  await page.clock.install({ time: new Date(`${AHORA}+02:00`) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datos) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  let intentosPago = 0;
  let ultimoBody: Record<string, unknown> = {};
  let respuesta: { status: number; body: unknown } | 'red' = { status: 409, body: { error: 'La clase de prueba es solo para tu primera visita al estudio.', codigo: 'prueba-no-disponible' } };
  await page.route('**/api/public/checkout-embebido', (r) => {
    intentosPago += 1;
    ultimoBody = r.request().postDataJSON() as Record<string, unknown>;
    if (respuesta === 'red') return r.abort('failed');
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
  });
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?${query}`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  return {
    intentos: () => intentosPago,
    body: () => ultimoBody,
    responder: (r: typeof respuesta) => { respuesta = r; },
  };
}

async function rellenarDatos(page: Page) {
  await page.getByPlaceholder('Nombre y apellido').fill('Nueva Alumna');
  await page.getByPlaceholder('Email').fill('nueva@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
}

test('solo las clases que cubre la oferta, a su precio, con la regla dicha antes de elegir', async ({ page }) => {
  await abrir(page, 'tab=clases&prueba=1');
  await expect(page.getByText('SOLO PARA TU PRIMERA VISITA')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tu primera clase de Reformer')).toBeVisible();
  const reformer = page.getByRole('button', { name: /Reformer a las 10:00/ });
  await expect(reformer).toBeVisible();
  await expect(reformer).toContainText('10 €');
  // Mat no la cubre la oferta: no sale.
  await expect(page.getByRole('button', { name: /Mat a las 12:00/ })).toHaveCount(0);
});

test('pagar la prueba manda el plan de PRUEBA, sin código; un 409 se dice y no arranca el pago', async ({ page }) => {
  const api = await abrir(page, 'tab=clases&prueba=1');
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  // La prueba ya es la oferta: sin campo de código.
  await expect(page.getByText('¿Tienes un código promocional?')).toHaveCount(0);
  await rellenarDatos(page);
  await expect.poll(api.intentos, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(api.body()).toMatchObject({ planId: 'plan-prueba', sesionId: 'ses-r', socioEmail: 'nueva@example.com' });
  expect(api.body().codigoDescuento).toBeUndefined();
  await expect(page.getByText('La clase de prueba es solo para tu primera visita al estudio.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pagar 10 € y reservar/ })).toHaveCount(0);
});

for (const [nombre, fallo] of [['un 500', { status: 500, body: { error: 'No se ha podido iniciar el pago.' } }], ['la red caída', 'red']] as const) {
  test(`⚠️ ${nombre} tampoco se anuncia como pago iniciado`, async ({ page }) => {
    const api = await abrir(page, 'tab=clases&prueba=1');
    api.responder(fallo);
    await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
    await rellenarDatos(page);
    await expect.poll(api.intentos, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /Pagar 10 € y reservar/ })).toHaveCount(0);
  });
}

test('prueba GRATIS: pide cuenta (no pasa por Stripe)', async ({ page }) => {
  const api = await abrir(page, 'tab=clases&prueba=1', fixture({ prueba: 'gratis' }));
  await expect(page.getByText('Gratis', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('heading', { name: 'Entra para reservar' })).toBeVisible({ timeout: 30_000 });
  expect(api.intentos()).toBe(0);
});

test('sin oferta activa: se dice, con salida al horario, y no se intenta ningún pago', async ({ page }) => {
  const api = await abrir(page, 'tab=clases&prueba=1', fixture({ prueba: null }));
  await expect(page.getByText('Ahora no hay clase de prueba')).toBeVisible({ timeout: 30_000 });
  const salida = page.getByRole('link', { name: 'Ver el horario' });
  await expect(salida).toHaveAttribute('href', `/reservar/${SLUG}?tab=clases`);
  await expect(page.getByRole('button', { name: /Reformer a las 10:00/ })).toHaveCount(0);
  expect(api.intentos()).toBe(0);
});

test('⚠️ regresión: fuera de `?prueba=1` la oferta no existe (precio y pago de la suelta)', async ({ page }) => {
  const api = await abrir(page, 'tab=clases');
  const reformer = page.getByRole('button', { name: /Reformer a las 10:00/ });
  await expect(reformer).toContainText('22 €', { timeout: 30_000 });
  await expect(reformer).not.toContainText('10 €');
  await expect(page.getByText('SOLO PARA TU PRIMERA VISITA')).toHaveCount(0);
  await reformer.click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tu primera clase de Reformer')).toHaveCount(0);
  await rellenarDatos(page);
  await expect.poll(api.intentos, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(api.body()).toMatchObject({ planId: 'plan-suelto' });
});
