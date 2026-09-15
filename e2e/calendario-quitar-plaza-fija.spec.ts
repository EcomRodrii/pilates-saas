import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La lista de una clase dice quién viene por su plaza fija y quién gasta una
// clase para recuperar, y quitarla cuenta lo que pasa de verdad.
//
// Antes todas las clientas parecían iguales, y el aviso decía «se libera su
// plaza» también a una fija, que la conserva. Lo que pasa con la recuperación
// lo decide el servidor (`/api/reservas/cancelar`): la pantalla lo repite.
// Cada camino de fallo lleva contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const STUDIO_ID = 'studio-test';
// `ses-3` del panel sembrado: una clase de mañana.
const SESION = 'ses-3';

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const reserva = (id: string, socioId: string) => ({
  id, studio_id: STUDIO_ID, sesion_id: SESION, socio_id: socioId, estado: 'CONFIRMADA', spot_id: null,
  posicion_espera: null, oferta_expira_en: null, check_in_en: null, creado_en: '2026-09-01T09:00:00Z',
  confirmacion_pedida_en: null, confirmado_en: null, recordatorio_confirmacion_en: null,
  valoracion_experiencia: null, cancelada_tardia: null,
});

async function abrirClase(page: Page, cancelar: { status?: number; body: unknown }) {
  await montar(page);
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  await page.route('**/rest/v1/reservas**', r => json(r, [
    reserva('res-pf-maria', 'soc-1'),
    reserva('res-laura', 'soc-2'),
    reserva('res-carmen', 'soc-3'),
  ]));
  await page.route('**/rest/v1/recuperaciones**', r => json(r, [{
    id: 'recup-1', studio_id: STUDIO_ID, socio_id: 'soc-2', origen_reserva_id: null, motivo: null,
    caduca_el: '2026-12-31', estado: 'USADA', usada_en_reserva_id: 'res-laura', creada_en: '2026-09-01T09:00:00Z',
  }]));
  const cancelaciones: Record<string, unknown>[] = [];
  await page.route('**/api/reservas/cancelar', r => {
    cancelaciones.push(r.request().postDataJSON());
    return json(r, cancelar.body, cancelar.status ?? 200);
  });

  await ir(page, `calendario?sesion=${SESION}`);
  await expect(page.getByRole('link', { name: 'María García Fernández' })).toBeVisible({ timeout: 60_000 });
  return { cancelaciones };
}

const filaDe = (page: Page, nombre: string) =>
  page.locator('div.group', { has: page.getByRole('link', { name: nombre }) });

test.describe('Calendario · plaza fija y recuperación en la lista de una clase', () => {
  test.describe.configure({ timeout: 180_000 });

  test('marca a la fija y a la que recupera, y a la fija no le dice que pierde su plaza', async ({ page }) => {
    const { cancelaciones } = await abrirClase(page, {
      body: { ok: true, recuperacionCreada: false, recuperacionCaducaEl: null, recuperacionAlCerrarSemana: false },
    });

    // Las marcas salen de la recuperación USADA y del id `res-pf-`, cargadas en la 2ª ola.
    await expect(filaDe(page, 'María García Fernández').getByText('Fija', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(filaDe(page, 'Laura Martín').getByText('Recuperación', { exact: true })).toBeVisible();
    await expect(filaDe(page, 'Carmen Del Río Sánchez').getByText('Fija', { exact: true })).toHaveCount(0);

    await filaDe(page, 'María García Fernández').getByRole('button', { name: 'Quitar reserva' }).click();
    await expect(page.getByText(/^Sigue con su plaza fija: solo se quita de esta clase/)).toBeVisible();
    expect(cancelaciones).toHaveLength(0);
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();

    await expect(page.getByText('Quitada de esta clase · sigue con su plaza fija')).toBeVisible();
    expect(cancelaciones).toEqual([{ reservaId: 'res-pf-maria' }]);
  });

  test('si el servidor le da una recuperación, lo dice con su caducidad', async ({ page }) => {
    await abrirClase(page, {
      body: { ok: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-10-31', recuperacionAlCerrarSemana: false },
    });
    await filaDe(page, 'María García Fernández').getByRole('button', { name: 'Quitar reserva' }).click();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    await expect(page.getByText('Quitada · tendrá una clase para recuperar hasta el 31 de octubre')).toBeVisible();
  });

  test('si el servidor dice que no, se enseña el motivo y sigue en la lista', async ({ page }) => {
    const { cancelaciones } = await abrirClase(page, {
      status: 400, body: { error: 'No se ha podido quitar la reserva' },
    });
    await filaDe(page, 'María García Fernández').getByRole('button', { name: 'Quitar reserva' }).click();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();

    await expect(page.getByText('No se ha podido quitar la reserva')).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(cancelaciones.length).toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: 'María García Fernández' })).toBeVisible();
  });
});
