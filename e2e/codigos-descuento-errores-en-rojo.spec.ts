import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración › Códigos de descuento: un fallo se ve como fallo (P0.3, tanda 9).
//
// Desactivar un código que el servidor no deja cambiar salía con el ✓ verde
// del éxito. Con contador: el UPDATE se intentó de verdad.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const CODIGO = {
  id: 'cod-1', studio_id: 'studio-test', codigo: 'OTONO10', descripcion: 'Otoño', tipo: 'PORCENTAJE', valor: 10,
  usos: 0, usos_max: null, expira: null, activo: true, creado_en: '2026-10-01T10:00:00Z', min_importe: null, solo_nuevas: false,
};

test('si el código no se puede desactivar, se dice en rojo y sigue activo', async ({ page }) => {
  await montar(page);
  const intentos: string[] = [];
  // Después del arnés: gana la ruta registrada más tarde. Sin red: el mensaje es
  // siempre el de «sin conexión», que no depende del texto del servidor.
  await page.route('**/rest/v1/codigos_descuento**', (r) => {
    if (r.request().method() === 'PATCH') {
      intentos.push(r.request().postData() ?? '');
      return r.abort('failed');
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CODIGO]) });
  });
  await ir(page, 'configuracion?tab=cobros&abrir=codigos-descuento');

  await expect(page.getByText('OTONO10')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Desactivar' }).first().click();

  await expect.poll(() => intentos.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: /conexión/i }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /conexión/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Desactivar' }).first()).toBeVisible();
});
