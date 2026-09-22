import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Peticiones desde su app» (plaza fija): lo que ve la alumna, al lado del
// interruptor.
//
// Los estudios decían que no les quedaba claro cómo se marcan las alumnas en una
// clase fija sin reservarla cada semana. Investigado a fondo (22-sep): el ajuste
// venía APAGADO de serie en los 7 estudios de producción, sin ningún motivo de
// negocio para tenerlo así — con eso apagado, ninguna alumna veía NUNCA la opción
// de quedarse fija. Ahora viene ENCENDIDO de serie (migr
// `20260922151000_plaza_fija_desde_app_por_defecto`); el estudio lo sigue pudiendo
// apagar si prefiere seguir dándolas a mano en recepción. Debajo del interruptor
// se enseña el cartel que ve la alumna con las MISMAS palabras que su app
// (`TEXTOS_PLAZA_FIJA`), atenuado mientras esté apagado.
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

  test('de serie ya viene encendido: explica cómo se marcan las alumnas y enseña lo que ven, sin el aviso de que no lo ven', async ({ page }) => {
    await abrirAjuste(page);

    // La explicación dice lo que hace de serie, cómo se pide y el límite de la cuota.
    await expect(page.getByText(/pueden pedir quedarse fijas en una clase que se repite/)).toBeVisible();
    await expect(page.getByText(/con bono se reserva clase a clase/)).toBeVisible();

    const vista = page.getByTestId('vista-previa-plaza-fija');
    await expect(vista).toContainText('Así lo ve tu alumna');
    await expect(vista).toContainText('¿Vienes los martes a las 10:00?');
    await expect(vista).toContainText('tu plaza queda reservada cada semana');
    await expect(vista).toContainText('Tu estudio tiene que confirmarla');
    await expect(vista).toContainText('Pedir clase fija');
    await expect(vista).not.toContainText('Ahora tus alumnas no lo ven');
  });

  test('apagado a mano, se ve atenuado con el aviso de que no lo ven', async ({ page }) => {
    await abrirAjuste(page, { plaza_fija_solicitar_desde_app: false });
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('¿Vienes los martes a las 10:00?');
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Ahora tus alumnas no lo ven');
  });

  test('apagarlo (de serie viene encendido) manda solo sus columnas al guardar', async ({ page }) => {
    const { patches } = await abrirAjuste(page);
    await page.getByRole('switch', { name: /Pueden pedir plaza fija/ }).click();

    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Ahora tus alumnas no lo ven');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    expect(patches[0]).toEqual({ plaza_fija_solicitar_desde_app: false, plaza_fija_pausa_desde_app: false });
  });
});
