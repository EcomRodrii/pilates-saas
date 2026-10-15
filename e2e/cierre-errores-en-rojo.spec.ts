import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Cierre: un error se ve como error, y un acierto como acierto (P0.3, tanda 5).
//
// El aviso propio de esta pantalla era SIEMPRE rojo y sin `role`: «Envío
// automático activado» salía igual que «No se ha podido eliminar el ingreso».
// Ahora usa el aviso compartido del panel. Con contador: el DELETE se intentó.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const anio = new Date().getFullYear();
const INGRESO = {
  id: 'ing-1', studioId: 'studio-test', fecha: `${anio}-03-14`, concepto: 'Taller de primavera', cliente: null, nif: null,
  baseImponible: 82.64, tipoIVA: 21, cuotaIVA: 17.36, total: 100, nota: null, creadoEn: `${anio}-03-14T10:00:00Z`,
};

test('si el servidor no deja eliminar un ingreso, se dice en rojo y el ingreso sigue en la lista', async ({ page }) => {
  await montar(page);
  const borrados: string[] = [];
  // Después del arnés: gana la ruta registrada más tarde.
  await page.route((u) => u.pathname === '/api/ingresos-manuales', (r) => {
    if (r.request().method() === 'DELETE') {
      borrados.push(r.request().postData() ?? '');
      return json(r, { error: 'fallo' }, 500);
    }
    return json(r, { ingresos: [INGRESO] });
  });
  await ir(page, 'cierre');

  const fila = page.getByRole('row').filter({ hasText: 'Taller de primavera' });
  await expect(fila).toBeVisible({ timeout: 60_000 });
  await fila.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect.poll(() => borrados.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(borrados[0]).toContain('ing-1');
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido eliminar el ingreso' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No se ha podido eliminar' })).toHaveCount(0);
  await expect(fila).toBeVisible();
});
