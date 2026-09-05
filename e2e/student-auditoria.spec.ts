import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Los tres hallazgos confirmados que quedaban de la auditoría.

const base = `/portal/${SLUG}`;

async function montar(page: Page, ajustar: (f: Record<string, unknown>) => void = () => {}, opts: { noLeidas?: number; borrarTarjeta?: number } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  ajustar(f);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [], unread: opts.noLeidas ?? 0 }),
  }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  const borrados: unknown[] = [];
  await page.route('**/api/public/tarjeta', (r) => {
    borrados.push(r.request().postDataJSON());
    const s = opts.borrarTarjeta ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { ok: true } : { error: 'No se ha podido quitar la tarjeta.' }) });
  });
  return borrados;
}

/** Bono acotado a un tipo de clase distinto al de la sesión del fixture (tc-r). */
function bonoQueNoCubre(f: Record<string, unknown>) {
  f.planesTarifa = [{ id: 'plan-mat', studioId: STUDIO_ID, nombre: 'Bono Mat 10', precio: 90, sesiones: 10, activo: true, tipo: 'BONO', tiposClaseIds: ['tc-mat'] }];
  const socia = f.socia as Record<string, unknown>;
  socia.suscripciones = [{ id: 'sus-mat', studioId: STUDIO_ID, socioId: 'socio-e2e-1', planId: 'plan-mat', estado: 'ACTIVA', sesionesRestantes: 8, fechaInicio: '2026-08-01', fechaFin: null }];
}

test.describe('Student PWA · resto de la auditoría', () => {
  test('un bono que NO cubre este tipo de clase no promete «no pagas nada hoy»', async ({ page }) => {
    await montar(page, bonoQueNoCubre);
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    // El bono es de Mat y la clase es Reformer: se dice, en vez de prometer.
    await expect(page.getByText(/tu bono no incluye este tipo de clase/i)).toBeVisible();
    await expect(page.getByText(/no pagas nada hoy/i)).toHaveCount(0);
  });

  test('un bono SIN tipos acotados sigue cubriendo cualquier clase', async ({ page }) => {
    await montar(page, (f) => {
      f.planesTarifa = [{ id: 'plan-gen', studioId: STUDIO_ID, nombre: 'Bono 10', precio: 90, sesiones: 10, activo: true, tipo: 'BONO' }];
      (f.socia as Record<string, unknown>).suscripciones = [{ id: 'sus-gen', studioId: STUDIO_ID, socioId: 'socio-e2e-1', planId: 'plan-gen', estado: 'ACTIVA', sesionesRestantes: 8, fechaInicio: '2026-08-01', fechaFin: null }];
    });
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    await expect(page.getByText(/no pagas nada hoy/i)).toBeVisible();
  });

  test('el punto de la campana se enciende con avisos sin leer', async ({ page }) => {
    await montar(page, () => {}, { noLeidas: 3 });
    await page.goto(base);
    await expect(page.getByRole('link', { name: /notificaciones, 3 sin leer/i })).toBeVisible({ timeout: 30_000 });
  });

  test('sin avisos sin leer, el punto no aparece', async ({ page }) => {
    await montar(page, () => {}, { noLeidas: 0 });
    await page.goto(base);
    await expect(page.getByRole('link', { name: /^notificaciones$/i })).toBeVisible({ timeout: 30_000 });
  });

  test('la tarjeta guardada se ve y se puede quitar', async ({ page }) => {
    const borrados = await montar(page, (f) => {
      const socia = f.socia as Record<string, unknown>;
      const socio = socia.socio as Record<string, unknown>;
      socio.tarjetaMarca = 'Visa'; socio.tarjetaUltimos4 = '4242'; socio.tarjetaExpMes = 12; socio.tarjetaExpAnio = 2027;
    });
    await page.goto(`${base}/perfil/pago`);
    const t = page.getByTestId('tarjeta');
    await expect(t).toBeVisible({ timeout: 30_000 });
    await expect(t.getByText(/Visa •••• 4242/)).toBeVisible();
    await expect(t.getByText('Caduca 12/2027')).toBeVisible();

    await page.getByRole('button', { name: /^quitar tarjeta$/i }).click();
    await page.getByRole('button', { name: /sí, quitar la tarjeta/i }).click();
    await expect.poll(() => borrados.length).toBe(1);
    expect(borrados[0]).toEqual({ studioId: STUDIO_ID });
    await expect(page.getByText(/tarjeta eliminada/i)).toBeVisible();
  });

  test('sin tarjeta guardada se dice, no se pinta una vacía', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil/pago`);
    await expect(page.getByText(/no tienes ninguna tarjeta guardada/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tarjeta')).toHaveCount(0);
  });
});
