import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La lista de espera se puede desactivar POR TIPO DE CLASE.
//
// ⚠️ Es una de las cuatro reglas de reserva sobrescribibles por tipo (migr
// `20260730152516`, `tipos_clase.permite_lista_espera`, `NULL` = hereda del
// estudio), y el servidor la resuelve con `heredaOverride` antes de llamar a
// `reservar_plaza`. La app de la alumna solo conocía la del ESTUDIO: en un tipo
// que la prohíbe dentro de un estudio que la permite, ofrecía «Unirme a la
// lista de espera» sobre una clase llena — y el servidor lo habría rechazado.
//
// El estudio sembrado por `E2E_TEST` tiene `permiteListaEspera: true`, así que
// aquí se prueba justo la combinación que rompía.

const base = `/portal/${SLUG}`;

async function montar(page: Page, permiteListaEsperaDelTipo: boolean | null) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.tiposClase as Record<string, unknown>[])[0].permiteListaEspera = permiteListaEsperaDelTipo;
  // La clase, llena: diez plazas y diez reservas. `proyectarClases` cuenta
  // FILAS de `aforoReservas` (una por reserva, `sesion_id` en snake_case).
  f.aforoReservas = Array.from({ length: 10 }, (_, i) => ({ id: `af-${i}`, sesion_id: SESION_ID, estado: 'CONFIRMADA' }));
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: f.aforoReservas })));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  void STUDIO_ID;
}

test.describe('Student PWA · lista de espera por tipo de clase', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('si el TIPO la prohíbe, no se ofrece aunque el estudio la permita', async ({ page }) => {
    await montar(page, false);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const completa = page.getByRole('button', { name: 'Clase completa' });
    await expect(completa, 'debería decir que está completa y no dejar pulsar').toBeVisible({ timeout: 30_000 });
    await expect(completa).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /lista de espera/i }),
      'ofrece una lista de espera que el servidor va a rechazar',
    ).toHaveCount(0);
  });

  test('sin regla propia del tipo, se hereda la del estudio y sí se ofrece', async ({ page }) => {
    await montar(page, null);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Unirme a la lista de espera/i })).toBeVisible({ timeout: 30_000 });
  });

  test('y si el tipo la permite explícitamente, también', async ({ page }) => {
    await montar(page, true);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Unirme a la lista de espera/i })).toBeVisible({ timeout: 30_000 });
  });
});
