import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, SOCIO_ID, type OpcionesSocia } from './socia-completa';

// Perfil (P14, 5-oct-2026): la tarjeta de alumna con hasta tres cifras que nunca son cero, las filas con su baldosa,
// «Seguridad» en lugar de «Contraseña y verificación», sin la fila «Bonos», el método de pago a la vista y el premio de
// invitar solo si el estudio lo da. Con contador de studio-data en cada test, y `sinMockear()` vacío.

test.describe.configure({ timeout: 150_000 });

const PERFIL = `/portal/${SLUG}/perfil`;

async function montar(page: Page, o: OpcionesSocia & { payload?: (f: Record<string, unknown>) => void; status?: number } = {}) {
  let fixture: Record<string, unknown> | null = null;
  const a = await sembrarSociaCompleta(page, { relojMadrid: true, ...o, ajustar: (f) => { o.payload?.(f); fixture = f; } });
  let pedidas = 0;
  await page.route('**/api/public/studio-data', (r) => {
    pedidas++;
    if (o.status && o.status >= 400) return r.fulfill({ status: o.status, contentType: 'application/json', body: JSON.stringify({ error: 'fallo' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  await page.goto(PERFIL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible({ timeout: 60_000 });
  return { a, pedidas: () => pedidas };
}

const socia = (f: Record<string, unknown>) => f.socia as Record<string, unknown>;
const asistidas = (n: number) => (f: Record<string, unknown>) => {
  socia(f).reservas = Array.from({ length: n }, (_, i) => ({
    id: `res-a${i}`, socioId: SOCIO_ID, sesionId: `ses-pasada-${i}`, estado: 'ASISTIDA', creadoEn: '2026-07-01T09:00:00Z',
  }));
};

test('con clases, bono y una recuperación: las tres cifras, cada una a su sitio', async ({ page }) => {
  const { a, pedidas } = await montar(page, {
    bono: 5,
    payload: (f) => {
      asistidas(3)(f);
      socia(f).recuperaciones = [{ id: 'rec-1', socioId: SOCIO_ID, estado: 'DISPONIBLE', caducaEl: '2026-09-30' }];
    },
  });
  const tarjeta = page.getByTestId('tarjeta-socia');
  await expect(tarjeta).toBeVisible({ timeout: 45_000 });
  await expect(tarjeta).toContainText(/3\s*clases contigo/);
  await expect(tarjeta.getByRole('link', { name: /^5 te quedan/ })).toHaveAttribute('href', `/portal/${SLUG}/bonos`);
  await expect(tarjeta.getByRole('link', { name: '1 recuperación' })).toHaveAttribute('href', `/portal/${SLUG}/bonos`);
  // Las clases no llevan a ninguna parte (el Historial aún no las enseña todas).
  await expect(tarjeta.getByRole('link', { name: /clases contigo/ })).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('recién llegada: «Aún no has venido a ninguna clase»; la misma con alta de 2019, no', async ({ page }) => {
  const nueva = await montar(page, { bono: null });
  await expect(page.getByTestId('tarjeta-socia')).toContainText('Aún no has venido a ninguna clase.', { timeout: 45_000 });
  await expect(page.getByTestId('tarjeta-socia').getByRole('link')).toHaveAttribute('href', `/portal/${SLUG}/reservar`);
  expect(nueva.pedidas()).toBeGreaterThan(0);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const antigua = await montar(page, { bono: null, payload: (f) => { (socia(f).socio as Record<string, unknown>).fechaAlta = '2019-03-04'; } });
  await expect(page.getByTestId('tarjeta-socia')).toContainText('Reserva tu próxima clase', { timeout: 45_000 });
  await expect(page.getByText('Aún no has venido')).toHaveCount(0);
  expect(antigua.pedidas()).toBeGreaterThan(0);
});

test('las filas: una baldosa por fila, «Seguridad», sin «Mi plan», y el método de pago a la vista', async ({ page }) => {
  const { a, pedidas } = await montar(page, { conTarjeta: true });
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'Seguridad' })).toHaveAttribute('href', `/portal/${SLUG}/perfil/seguridad`, { timeout: 45_000 });
  await expect(main.getByText('Contraseña y verificación')).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Mi plan', exact: true })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /Escribir al estudio/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /Privacidad y datos/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /Método de pago/ })).toContainText('Visa ··4242');
  // Una baldosa por fila: 4 de cuenta, 3 de pagos, 6 del estudio y cerrar sesión.
  await expect(main.locator('[data-baldosa]')).toHaveCount(14);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('el premio de invitar solo si el estudio lo da, con su condición real', async ({ page }) => {
  const con = await montar(page, { reglasCreditos: [{ trigger: 'REFERIDO_AMIGO', creditos: 50, topeMensual: 2 }] });
  await expect(page.getByTestId('premio-invitar')).toHaveText(
    'Si es nueva y crea su cuenta con tu enlace, ganas 50 créditos cuando venga a su primera clase · hasta 2 amigas al mes',
    { timeout: 45_000 },
  );
  // La hoja sigue sin prometer nada.
  await page.getByTestId('abrir-invitar').click();
  await expect(page.getByRole('dialog', { name: 'Invitar a una amiga' })).not.toContainText(/premio|regalo|gratis/i);
  expect(con.pedidas()).toBeGreaterThan(0);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const sin = await montar(page);
  await expect(page.getByTestId('abrir-invitar')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('premio-invitar')).toHaveCount(0);
  expect(sin.pedidas()).toBeGreaterThan(0);
});

test('studio-data falla: ni cifras ni frases de ausencia, y las filas siguen', async ({ page }) => {
  const { pedidas } = await montar(page, { status: 500 });
  await expect.poll(pedidas).toBeGreaterThan(0);
  await expect(page.getByTestId('tarjeta-socia-cargando')).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByTestId('tarjeta-socia')).toHaveCount(0);
  await expect(page.getByText(/clases contigo|Aún no has venido|te quedan/)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Seguridad' })).toBeVisible();
});
