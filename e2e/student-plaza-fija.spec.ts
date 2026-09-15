import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Plaza fija + recuperaciones (F2, el caso canónico) en la Student PWA.
// El backend las tenía enteras y el payload las traía; la app las ignoraba.
// Lo que rompe a una alumna: no ver su plaza, no saber que tiene una clase
// por recuperar ni hasta cuándo, y que al cancelar su ocurrencia de plaza fija
// la app diga «no se devuelve» cuando el servidor SÍ le dio una recuperación.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { plaza?: boolean; recuperaciones?: number; cancelacion?: Record<string, unknown> } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  const socia = f.socia as unknown as Record<string, unknown>;
  // El reloj de sembrarSociaLista es el 2026-08-12 (miércoles, dow 3).
  socia.plazasFijas = opts.plaza === false ? [] : [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  socia.recuperaciones = Array.from({ length: opts.recuperaciones ?? 0 }, (_, i) => ({ id: `rec-${i}`, studioId: STUDIO_ID, socioId: SOCIO_ID, origenReservaId: null, motivo: null, caducaEl: `2026-09-${10 + i}`, estado: 'DISPONIBLE', usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' }));
  if (opts.cancelacion) {
    (f.socia.reservas as unknown[]).push({ id: 'res-pf', sesionId: SESION_ID, socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null });
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  if (opts.cancelacion) {
    await page.route('**/api/public/reserva', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.cancelacion) }));
  }
}

test.describe('Student PWA · plaza fija y recuperaciones', () => {
  test('Bonos enseña la plaza fija con su próxima ocurrencia y las recuperaciones con su caducidad', async ({ page }) => {
    await montar(page, { recuperaciones: 2 });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText(/Reformer · Sala 1 · próxima mañana/)).toBeVisible();
    await expect(tarjeta.getByText('2 clases por recuperar')).toBeVisible();
    await expect(tarjeta.getByText(/La primera caduca el/)).toBeVisible();
  });

  test('sin plaza ni recuperaciones no se pinta nada (ni en Bonos ni en Inicio)', async ({ page }) => {
    await montar(page, { plaza: false, recuperaciones: 0 });
    await page.goto(`${base}/bonos`);
    await expect(page.getByRole('heading', { name: /bonos/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
  });

  test('Inicio: tarjeta compacta con la plaza', async ({ page }) => {
    await montar(page);
    await page.goto(base);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  // Plaza fija desde su app (migr 20260916120000): PIDE, no cambia. El ajuste del
  // estudio lo resuelve el servidor (`lib/studio-seo.ts`), encendido en e2e con
  // `E2E_PLAZA_FIJA_APP` (playwright.config.ts).
  test('Bonos: pide una pausa de su plaza fija y queda a la espera del estudio', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-1' }) });
    });

    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    // El reloj de `sembrarSociaLista` es el 2026-08-12.
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    // Un camino que no llega a pedir nada «no miente», y no probaría nada.
    await expect(tarjeta.getByText(/Pausa pedida del .* esperando a tu estudio/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'solicitar_pausa', plazaId: 'pf-1', hasta: '2026-08-26' });
    // Hasta que el estudio conteste, su plaza sigue igual.
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  test('si el servidor dice que no, la app no dice que sí', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ya has pedido una pausa para esta plaza fija: tu estudio te contestará.' }) });
    });

    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    await expect(page.getByText(/Ya has pedido una pausa para esta plaza fija/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByText(/Pausa pedida del/)).toHaveCount(0);
  });

  test('al cancelar una ocurrencia de plaza fija, el toast dice que hay una clase para recuperar y hasta cuándo', async ({ page }) => {
    await montar(page, { cancelacion: { ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-11' } });
    await page.goto(`${base}/mis-reservas`);
    // Botón «Cancelar» de la tarjeta → diálogo → «Sí, cancelar…» (el copy exacto
    // depende del aviso de ventana; la confirmación empieza siempre igual).
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Sí, cancelar/ }).click();
    // `fechaCorta('2026-09-11')` → «vie 11 sep»: se comprueba el día y el número.
    await expect(page.getByText(/tienes una clase para recuperar hasta el \w+ 11 \w+/i)).toBeVisible({ timeout: 30_000 });
  });
});
