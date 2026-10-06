import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Decisión del fundador (5-oct-2026): con la cuota EN PAUSA y nada activo, Bonos no ofrece «Renovar mi plan».
//
// `renovar-plan` renueva la suscripción ACTIVA o, si no hay ninguna, la más reciente — y esa puede ser la cuota en
// pausa. El botón le habría cobrado la renovación de algo que su estudio ha parado, bajo una frase que además mentía
// («Tus bonos anteriores están agotados o han caducado»). Ahora se le dice lo que pasa y con quién hablarlo.

const base = `/portal/${SLUG}`;
const CUOTA_EN_PAUSA = 'Tu cuota está en pausa. Habla con tu estudio para reanudarla.';

const PLANES = [
  { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual 2 días', tipo: 'MENSUAL', sesiones: null, precio: 69, activo: true },
  { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
];

async function montar(page: Page, suscripciones: Record<string, unknown>[]) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = PLANES;
  (f.socia as Record<string, unknown>).suscripciones = suscripciones;
  const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
  // Las rutas propias, SIEMPRE después del andamiaje: en Playwright gana la última registrada.
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  const renovar: unknown[] = [];
  const checkout: unknown[] = [];
  return {
    renovar, checkout,
    /** Lo que contesta el servidor al pedir la renovación. */
    async responder(status: number, cuerpo: unknown) {
      await page.route('**/api/public/renovar-plan', (r) => { renovar.push(r.request().postDataJSON()); return r.fulfill(json(cuerpo, status)); });
      await page.route('**/api/stripe/checkout', (r) => { checkout.push(r.request().postDataJSON()); return r.fulfill(json({ url: null }, 500)); });
    },
  };
}

const sus = (o: Record<string, unknown>) => ({
  socioId: SOCIO_ID, studioId: STUDIO_ID, fechaInicio: '2026-07-01', fechaFin: '2026-12-31', ...o,
});

test.describe('Student PWA · Bonos con la cuota en pausa', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('solo la cuota en pausa: sin «Renovar mi plan», con la frase de verdad, y sin pedir nada', async ({ page }) => {
    const m = await montar(page, [sus({ id: 'sus-mes', planId: 'plan-mes', estado: 'PAUSADA', sesionesRestantes: null })]);
    await m.responder(200, { reciboId: 'rec-x' });
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });

    const tarjeta = page.getByTestId('cuota-en-pausa');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText(CUOTA_EN_PAUSA);
    await expect(page.getByRole('button', { name: 'Renovar mi plan' })).toHaveCount(0);
    // La frase que mentía (no está agotada ni caducada: está en pausa) no sale.
    await expect(page.getByText('Tus bonos anteriores están agotados o han caducado.')).toHaveCount(0);
    // Comprar otra cosa sigue a un toque: no se ha quitado nada más.
    await expect(tarjeta.getByRole('link', { name: 'o comprar un bono distinto' })).toHaveAttribute('href', `${base}/comprar`);
    // Y su tarjeta dice lo que le pasa: «En pausa», nunca «Expirado».
    await expect(page.getByText('En pausa', { exact: true })).toBeVisible();
    await expect(page.getByText('Expirado', { exact: true })).toHaveCount(0);
    // Nadie ha pedido renovar nada.
    expect(m.renovar).toHaveLength(0);
    expect(m.checkout).toHaveLength(0);
  });

  test('con un bono caducado y sin cuota en pausa, «Renovar mi plan» sigue donde estaba', async ({ page }) => {
    const m = await montar(page, [sus({ id: 'sus-bono', planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 3, fechaFin: '2026-07-31' })]);
    await m.responder(200, { reciboId: 'rec-x' });
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Renovar mi plan' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('cuota-en-pausa')).toHaveCount(0);
  });

  test('si el servidor dice «cuota en pausa» al renovar, se le dice con las mismas palabras y no se cobra', async ({ page }) => {
    // Un bono agotado (sí sale «Renovar mi plan») y el servidor rechaza con el CÓDIGO: la cerradura de servidor va en
    // otra rama; aquí solo se traduce.
    const m = await montar(page, [sus({ id: 'sus-bono', planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 0 })]);
    await m.responder(409, { error: 'mensaje del servidor', codigo: 'cuota-en-pausa' });
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Renovar mi plan' }).click({ timeout: 30_000 });
    await expect(page.getByText(CUOTA_EN_PAUSA)).toBeVisible();
    expect(m.renovar.length, 'la petición de renovar no llegó a salir: el test no prueba nada').toBeGreaterThan(0);
    // No se llegó a ningún cobro, y el botón vuelve a estar disponible.
    expect(m.checkout).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Renovar mi plan' })).toBeEnabled();
  });
});
