import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { enOscuro } from './panel-sembrado';
import { json, conAsistente, chat, sugerencia, abrirDesdeLaBarra, SALDO } from './asistente-andamiaje';

// ─────────────────────────────────────────────────────────────────────────────
// Los packs de consultas de «Pregúntale a Tentare» (fase 3, 6-oct-2026).
//
//   · Sin consultas, DENTRO del chat: los tres packs para la propietaria y
//     «pídeselo a la propietaria» para la gerente (sin un solo botón de pagar).
//   · Comprar solo abre Stripe. La vuelta NO felicita a ciegas: pregunta al
//     servidor y espera a que el webhook haya creado el pack.
//   · La compra que falla (400, 500, red caída) lo dice y no redirige; cada
//     caso cuenta sus peticiones: un «no mintió» sin intento no prueba nada.
//   · /suscripcion: «Consultas de Tentare» con el uso del mes, los packs vivos
//     y los tres para comprar.
//
// Nunca se llama a Stripe: POST /api/asistente/packs y su estado van mockeados.
// Los mocks propios van DESPUÉS de `conAsistente()` (gana la última ruta).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const SESION = 'cs_test_e2epack0123456789';
const PACKS_VIVOS = [
  { id: 'p1', quedan: 64, caducaEn: '2027-03-02T10:00:00Z' },
  { id: 'p2', quedan: 300, caducaEn: '2027-10-06T10:00:00Z' },
];

const CAPTURAS = process.env.PACKS_CAPTURAS;
async function captura(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(CAPTURAS, `packs-${nombre}.png`) });
}

/** El saldo con lo de los packs, en las dos formas que pide la app (`?solo=disponible` y entero). */
async function conSaldo(page: Page, saldo: Record<string, unknown>) {
  await page.route((u) => u.pathname === '/api/asistente/saldo', (r) =>
    new URL(r.request().url()).searchParams.get('solo') === 'disponible' ? json(r, { disponible: true }) : json(r, saldo));
}

/** /suscripcion con el plan pagado (activo), como la ve la propietaria o la gerente. */
async function conSuscripcion(page: Page, esPropietaria = true) {
  await page.route('**/api/billing/status**', (r) => json(r, {
    plan: 'ESTUDIO', subscriptionStatus: 'active', activo: true, configurado: true, esPropietaria,
    bloqueado: false, enPrueba: false, pruebaTermina: null, periodoTermina: '2026-11-01T10:00:00+00:00',
  }));
}

const SIN_SALDO = (r: Route) => json(r, { error: 'Sin consultas disponibles', codigo: 'SIN_SALDO', disponibles: 0 }, 429);

test('propietaria sin consultas: la tarjeta con los tres packs en el chat; comprar va a Stripe y la vuelta espera al servidor', async ({ page }) => {
  const n = await conAsistente(page, { responder: SIN_SALDO });
  await conSaldo(page, { ...SALDO, usadas: 200, disponibles: 0, packsQuedan: 0, packs: [], puedeComprar: true });
  await conSuscripcion(page);
  const compras: unknown[] = [];
  await page.route((u) => u.pathname === '/api/asistente/packs', (r) => {
    compras.push(r.request().postDataJSON());
    // Lo que haría Stripe al pagar: volver a la success_url con su sesión.
    return json(r, { url: `/suscripcion?pack=ok&desde=asistente&session_id=${SESION}#consultas` });
  });
  let consultasEstado = 0;
  await page.route((u) => u.pathname === '/api/asistente/packs/estado', (r) => {
    consultasEstado++;
    expect(new URL(r.request().url()).searchParams.get('session_id')).toBe(SESION);
    // Las primeras veces el webhook aún no ha llegado: «confirmando», nunca «listo».
    // (Dos y no una: en `next dev` el StrictMode lanza el efecto dos veces y la primera respuesta se descarta.)
    return json(r, consultasEstado <= 2 ? { estado: 'CONFIRMANDO' } : { estado: 'ACREDITADO', unidades: 300, caducaEn: '2027-10-06T10:00:00Z' });
  });

  await abrirDesdeLaBarra(page);
  // Con 0 la tarjeta ya sale en la bienvenida, antes de chocar con el «sin saldo».
  await expect(chat(page).getByTestId('sin-consultas')).toBeVisible();
  await sugerencia(page, '¿Cuántas alumnas activas tengo?').click();
  await expect(chat(page).getByRole('alert')).toHaveText('Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  expect(n.preguntas).toBeGreaterThan(0);
  const tarjeta = chat(page).getByTestId('sin-consultas').last();
  await expect(tarjeta).toBeVisible();
  for (const nombre of ['Comprar 100 consultas por 9 €', 'Comprar 300 consultas por 24 €', 'Comprar 1.000 consultas por 69 €']) {
    await expect(tarjeta.getByRole('button', { name: nombre })).toBeVisible();
  }
  await expect(tarjeta).toContainText('Pago único con IVA incluido');
  await captura(page, 'chat-sin-consultas-1280-claro');

  await tarjeta.getByRole('button', { name: 'Comprar 300 consultas por 24 €' }).click();
  await expect(page).toHaveURL(/\/suscripcion/, { timeout: 30_000 });
  expect(compras).toEqual([{ unidades: 300, desde: 'asistente' }]);
  const seccion = page.getByTestId('consultas-tentare');
  await expect(seccion.getByText('Estamos confirmando tu pago con Stripe…')).toBeVisible({ timeout: 30_000 });
  await expect(seccion.getByText('Listo: 300 consultas más. Caducan el 6 de octubre de 2027.')).toBeVisible({ timeout: 15_000 });
  expect(consultasEstado).toBeGreaterThan(2);
  await expect(seccion.getByRole('link', { name: 'Volver al chat' })).toHaveAttribute('href', '/asistente');
  // La vuelta se quita de la URL: recargar mañana no repite «confirmando».
  await expect(page).toHaveURL(/\/suscripcion#consultas$/);
});

test('la compra falla (400, 500, red caída): lo dice, no se va a Stripe, y cada intento llegó al servidor', async ({ page }) => {
  await conAsistente(page);
  await conSaldo(page, { ...SALDO, packsQuedan: 0, packs: [], puedeComprar: true });
  await conSuscripcion(page);
  let intentos = 0;
  let caso: 400 | 500 | 'red' = 400;
  await page.route((u) => u.pathname === '/api/asistente/packs', (r) => {
    intentos++;
    if (caso === 'red') return r.abort('connectionreset');
    return json(r, { error: caso === 400 ? 'Ese pack no existe' : 'No se pudo abrir el pago. Inténtalo de nuevo en un momento: no se ha cobrado nada.' }, caso);
  });
  await page.goto('/suscripcion');
  const seccion = page.getByTestId('consultas-tentare');
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  const comprar = seccion.getByRole('button', { name: 'Comprar 100 consultas por 9 €' });

  await comprar.click();
  await expect(seccion.locator('[data-error-compra]')).toContainText('Ese pack no existe');
  expect(intentos).toBeGreaterThan(0);

  caso = 500;
  await comprar.click();
  await expect(seccion.locator('[data-error-compra]')).toContainText('no se ha cobrado nada');
  expect(intentos).toBe(2);

  caso = 'red';
  await comprar.click();
  await expect(seccion.locator('[data-error-compra]')).toContainText('No se ha podido conectar');
  expect(intentos).toBe(3);
  await expect(page).toHaveURL(/\/suscripcion$/);
  // Y los botones vuelven a estar disponibles para reintentar.
  await expect(comprar).toBeEnabled();
});

test('gerente sin consultas: «pídeselo a la propietaria» y ni un botón de pagar; con poco saldo, el aviso lo dice igual', async ({ page }) => {
  let saldo: Record<string, unknown> = { ...SALDO, usadas: 197, disponibles: 3, packsQuedan: 0, puedeComprar: false };
  const n = await conAsistente(page, { rol: 'MANAGER', responder: SIN_SALDO });
  await page.route((u) => u.pathname === '/api/asistente/saldo', (r) =>
    new URL(r.request().url()).searchParams.get('solo') === 'disponible' ? json(r, { disponible: true }) : json(r, saldo));
  let compras = 0;
  await page.route((u) => u.pathname === '/api/asistente/packs', (r) => { compras++; return json(r, { error: 'x' }, 403); });

  // La gerente no ve el Centro de Control: entra directa al chat.
  await page.goto('/asistente');
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  // Menos del 10 % de la cuota: el aviso discreto bajo el campo.
  await expect(chat(page).getByTestId('asistente-saldo')).toContainText('Te quedan 3 consultas este mes');
  await expect(chat(page).getByTestId('saldo-bajo')).toHaveText('Pídele más a la propietaria');

  saldo = { ...saldo, disponibles: 0 };
  await sugerencia(page, '¿Cuántas alumnas activas tengo?').click();
  await expect(chat(page).getByRole('alert')).toHaveText('Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  expect(n.preguntas).toBeGreaterThan(0);
  const tarjeta = chat(page).getByTestId('sin-consultas');
  await expect(tarjeta).toContainText('Pídeselo a la propietaria');
  await expect(tarjeta.getByRole('button')).toHaveCount(0);
  await expect(chat(page).getByRole('button', { name: /^Comprar/ })).toHaveCount(0);
  expect(compras).toBe(0);
  await captura(page, 'chat-gerente-1280-claro');
});

test('propietaria con poco saldo: «Comprar más» bajo el campo lleva a Suscripción', async ({ page }) => {
  await conAsistente(page);
  await conSaldo(page, { ...SALDO, usadas: 195, disponibles: 5, packsQuedan: 0, packs: [], puedeComprar: true });
  await abrirDesdeLaBarra(page);
  await expect(chat(page).getByTestId('asistente-saldo')).toContainText('Te quedan 5 consultas este mes');
  await expect(chat(page).getByTestId('saldo-bajo')).toHaveAttribute('href', '/suscripcion#consultas');
});

test('/suscripcion: el uso del mes, los packs vivos y los tres packs; con packs, «te quedan» no dice «este mes»', async ({ page }) => {
  await conAsistente(page);
  await conSaldo(page, { ...SALDO, usadas: 200, disponibles: 364, packsQuedan: 364, packs: PACKS_VIVOS, puedeComprar: true });
  await conSuscripcion(page);
  await page.goto('/suscripcion');
  const seccion = page.getByTestId('consultas-tentare');
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  await expect(seccion.getByTestId('consultas-uso')).toHaveText('200 de 200 este mes');
  await expect(seccion.getByTestId('consultas-quedan')).toHaveText('Te quedan 364 consultas');
  await expect(seccion.locator('[data-pack-vivo]')).toHaveCount(2);
  await expect(seccion.locator('[data-pack-vivo]').first()).toContainText('Quedan 64');
  await expect(seccion.locator('[data-pack-vivo]').first()).toContainText('caduca el 2 de marzo de 2027');
  await expect(seccion.locator('[data-pack]')).toHaveCount(3);
  await expect(seccion.locator('[data-pack="1000"]')).toContainText('69 €');
  await seccion.scrollIntoViewIfNeeded();
  await captura(page, 'suscripcion-1280-claro');
});

test('/suscripcion, gerente: ve el uso, pero no los packs (dinero) ni botones de compra', async ({ page }) => {
  await conAsistente(page, { rol: 'MANAGER' });
  await conSaldo(page, { ...SALDO, packsQuedan: 0, puedeComprar: false });
  await conSuscripcion(page, false);
  await page.goto('/suscripcion');
  const seccion = page.getByTestId('consultas-tentare');
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  await expect(seccion).toContainText('Solo la propietaria puede comprar packs de consultas. Pídeselo a ella.');
  await expect(seccion.getByRole('button')).toHaveCount(0);
});

test('/suscripcion: salir del pago sin terminar lo dice, y sin pagar no se pregunta por ningún pack', async ({ page }) => {
  await conAsistente(page);
  await conSaldo(page, { ...SALDO, packsQuedan: 0, packs: [], puedeComprar: true });
  await conSuscripcion(page);
  let estado = 0;
  await page.route((u) => u.pathname === '/api/asistente/packs/estado', (r) => { estado++; return json(r, { estado: 'SIN_PAGAR' }); });
  await page.goto('/suscripcion?pack=cancel#consultas');
  await expect(page.getByTestId('consultas-tentare').getByText('Has salido del pago sin terminarlo: no se ha cobrado nada.')).toBeVisible({ timeout: 60_000 });
  expect(estado).toBe(0);
});

// Capturas para revisar a ojo (PACKS_CAPTURAS=<dir>): móvil a 390 y oscuro.
test('capturas: móvil y oscuro', async ({ page }) => {
  test.skip(!CAPTURAS, 'solo para revisar a ojo');
  await enOscuro(page);
  await conAsistente(page, { responder: SIN_SALDO });
  await conSaldo(page, { ...SALDO, usadas: 200, disponibles: 0, packsQuedan: 364, packs: PACKS_VIVOS, puedeComprar: true });
  await conSuscripcion(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrirDesdeLaBarra(page);
  await sugerencia(page, '¿Cuántas alumnas activas tengo?').click();
  await expect(chat(page).getByTestId('sin-consultas').last()).toBeVisible();
  await captura(page, 'chat-sin-consultas-1280-oscuro');
  await page.goto('/suscripcion');
  await expect(page.getByTestId('consultas-tentare')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('consultas-tentare').scrollIntoViewIfNeeded();
  await captura(page, 'suscripcion-1280-oscuro');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/suscripcion');
  await expect(page.getByTestId('consultas-tentare')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('consultas-tentare').scrollIntoViewIfNeeded();
  await captura(page, 'suscripcion-390-oscuro');
  await page.goto('/asistente');
  await expect(chat(page).getByTestId('sin-consultas')).toBeVisible({ timeout: 60_000 });
  await captura(page, 'chat-sin-consultas-390-oscuro');
});

test('capturas: móvil en claro', async ({ page }) => {
  test.skip(!CAPTURAS, 'solo para revisar a ojo');
  await page.setViewportSize({ width: 390, height: 844 });
  await conAsistente(page, { responder: SIN_SALDO });
  await conSaldo(page, { ...SALDO, usadas: 200, disponibles: 0, packsQuedan: 364, packs: PACKS_VIVOS, puedeComprar: true });
  await conSuscripcion(page);
  await page.goto('/asistente');
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  await sugerencia(page, '¿Cuántas alumnas activas tengo?').click();
  await expect(chat(page).getByTestId('sin-consultas').last()).toBeVisible();
  await captura(page, 'chat-sin-consultas-390-claro');
  await page.goto('/suscripcion');
  await expect(page.getByTestId('consultas-tentare')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('consultas-tentare').scrollIntoViewIfNeeded();
  await captura(page, 'suscripcion-390-claro');
});
