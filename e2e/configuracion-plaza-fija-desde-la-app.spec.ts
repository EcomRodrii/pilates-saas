import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Peticiones desde su app» (plaza fija): lo que ve la alumna, al lado del
// interruptor.
//
// Los estudios decían que no les quedaba claro cómo se marcan las alumnas en una
// clase fija sin reservarla cada semana. Se pueden pedir desde la app, pero viene
// APAGADO de serie y nada lo explicaba: el ajuste era un interruptor sin más.
// Ahora, debajo, se enseña el cartel que ve la alumna con las MISMAS palabras que
// su app (`TEXTOS_PLAZA_FIJA`), atenuado mientras esté apagado.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const fila = (extra: Record<string, unknown> = {}) => ({
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
  email: 'cloe@example.com', moneda: 'EUR', plan: 'ESTUDIO', subscription_status: 'active',
  cancelacion_ventana_horas: 24, ...extra,
});
const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrirAjuste(page: Page, columnas: Record<string, unknown> = {}) {
  const patches: Record<string, unknown>[] = [];
  await montar(page);
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, fila(columnas));
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await ir(page, 'configuracion?tab=reservas');
  await page.locator('#plaza-fija-desde-la-app').click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Peticiones desde su app', exact: true })).toBeFocused({ timeout: 30_000 });
  return { patches };
}

test.describe('Configuración · peticiones de plaza fija desde la app', () => {
  test.describe.configure({ timeout: 180_000 });

  test('explica cómo se marcan las alumnas y enseña lo que ven, atenuado mientras esté apagado', async ({ page }) => {
    await abrirAjuste(page);

    // La explicación dice lo que hace de serie, cómo se pide y el límite de la cuota.
    await expect(page.getByText(/De serie, las plazas fijas las das tú, en recepción/)).toBeVisible();
    await expect(page.getByText(/con bono se reserva clase a clase/)).toBeVisible();

    const vista = page.getByTestId('vista-previa-plaza-fija');
    await expect(vista).toContainText('Así lo ve tu alumna');
    await expect(vista).toContainText('¿Vienes los martes a las 10:00?');
    await expect(vista).toContainText('sin que tengas que volver a hacerlo');
    await expect(vista).toContainText('Tu estudio tiene que confirmarla');
    await expect(vista).toContainText('Pedir plaza fija');
    await expect(vista).toContainText('Ahora tus alumnas no lo ven');
  });

  test('encendido, la vista previa deja de decir que no lo ven; y al guardar manda solo sus columnas', async ({ page }) => {
    const { patches } = await abrirAjuste(page);
    await page.getByRole('switch', { name: /Pueden pedir plaza fija/ }).click();

    await expect(page.getByTestId('vista-previa-plaza-fija')).not.toContainText('Ahora tus alumnas no lo ven');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    expect(patches[0]).toEqual({ plaza_fija_solicitar_desde_app: true, plaza_fija_pausa_desde_app: false });
  });

  test('ya encendido, se ve sin el aviso de «ahora no lo ven»', async ({ page }) => {
    await abrirAjuste(page, { plaza_fija_solicitar_desde_app: true });
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('¿Vienes los martes a las 10:00?');
    await expect(page.getByTestId('vista-previa-plaza-fija')).not.toContainText('Ahora tus alumnas no lo ven');
  });
});
