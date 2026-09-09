import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Recompensas pendientes de entregar», en la home del panel.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Los canjes vivían SOLO en Configuración → Gamificación → Canjes: tres niveles
// dentro de Ajustes. La socia paga con sus créditos, se presenta en el
// mostrador esperando algo, y quien la atiende no tenía forma de saberlo sin ir
// a buscarlo. El encargo lo pedía con todas las letras: la propietaria no
// debería tener que esperar a que la alumna llegue con un código para
// descubrir que ha hecho un canje.
//
// Se vigilan las DOS vías de entrega, porque la segunda es una decisión de
// producto y no un extra: se entrega reconociendo a la clienta (su fila) o con
// el código. Si el código fuera obligatorio, pasaría de ayuda a barrera.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO = 'studio-e2e';

const json = (r: Route, b: unknown) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const CANJE = {
  id: 'rwd-1', studio_id: STUDIO, socio_id: 'soc-1', catalog_item_id: 'rwc-1',
  creditos_gastados: 5, estado: 'PENDIENTE', codigo: 'TNT-AH6YDD', creado_en: '2026-09-09T15:00:00Z',
};

/** Deja el panel con UN canje pendiente y la RPC de entrega contada. */
async function conCanjePendiente(page: Page, opts: { rpc?: (body: string) => unknown } = {}) {
  await montar(page);
  const llamadas: string[] = [];

  await page.route('**/rest/v1/reward_redemptions**', (r) => json(r, [CANJE]));
  await page.route('**/rest/v1/reward_catalog**', (r) => json(r, [{ id: 'rwc-1', nombre: 'Botella del estudio' }]));
  await page.route('**/rest/v1/socios**', (r) => json(r, [{ id: 'soc-1', nombre: 'Marcos', apellidos: 'Roca' }]));
  await page.route('**/rest/v1/rpc/entregar_canje', (r) => {
    const cuerpo = r.request().postData() ?? '';
    llamadas.push(cuerpo);
    const respuesta = opts.rpc ? opts.rpc(cuerpo) : 'rwd-1';
    if (respuesta === 'ERROR') {
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'YA_ENTREGADO' }) });
    }
    return json(r, respuesta);
  });

  return llamadas;
}

test.describe('Canjes pendientes en la home', () => {
  test('la propietaria ve el canje sin ir a buscarlo, con quién y con qué código', async ({ page }) => {
    await conCanjePendiente(page);
    await ir(page, 'dashboard');

    const tarjeta = page.getByTestId('canjes-pendientes');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText('recompensa pendiente de entregar');
    await expect(tarjeta).toContainText('Marcos Roca');
    await expect(tarjeta).toContainText('Botella del estudio');
    await expect(tarjeta).toContainText('TNT-AH6YDD');
  });

  test('se entrega desde su fila, SIN pedir el código', async ({ page }) => {
    const llamadas = await conCanjePendiente(page);
    await ir(page, 'dashboard');
    const tarjeta = page.getByTestId('canjes-pendientes');
    await expect(tarjeta).toContainText('Marcos Roca', { timeout: 30_000 });

    await tarjeta.getByRole('button', { name: 'Entregar' }).first().click();

    // ⚠️ Contador de intentos: sin esto, «la fila desapareció» podría ser verdad
    // por no haber llamado a nadie. Es el punto ciego que este repo ya documenta.
    await expect.poll(() => llamadas.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // Y por la vía del ID, que es la que no exige código.
    expect(llamadas[0]).toContain('rwd-1');
    await expect(tarjeta).toHaveCount(0);
  });

  test('y también con el código que trae la socia', async ({ page }) => {
    const llamadas = await conCanjePendiente(page);
    await ir(page, 'dashboard');
    await expect(page.getByTestId('canjes-pendientes')).toContainText('Marcos Roca', { timeout: 30_000 });

    await page.getByLabel('Código de canje').fill('tnt-ah6ydd');
    await page.getByLabel('Código de canje').press('Enter');

    await expect.poll(() => llamadas.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // Va el código, no el id: es la otra puerta de la misma RPC.
    expect(llamadas[0]).toContain('tnt-ah6ydd');
  });

  test('un código ya usado se dice, y la fila NO desaparece', async ({ page }) => {
    // Lo contrario sería lo peor: quitar la fila haría creer que se entregó.
    await conCanjePendiente(page, { rpc: () => 'ERROR' });
    await ir(page, 'dashboard');
    const tarjeta = page.getByTestId('canjes-pendientes');
    await expect(tarjeta).toContainText('Marcos Roca', { timeout: 30_000 });

    await page.getByLabel('Código de canje').fill('TNT-AH6YDD');
    await tarjeta.getByRole('button', { name: 'Entregar' }).last().click();

    await expect(page.getByText(/ya se ha utilizado/i)).toBeVisible({ timeout: 15_000 });
    await expect(tarjeta).toContainText('Marcos Roca');
  });
});
