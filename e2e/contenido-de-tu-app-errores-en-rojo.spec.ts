import { test, expect } from '@playwright/test';
import { montar } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración › Contenido de tu app: un fallo se ve como fallo (P0.3, tanda 8).
//
// El aviso en línea del editor era el mismo texto gris para «Mensaje destacado
// guardado.» que para «no se ha podido…». Ahora el fallo sale en rojo y como
// `alert`. Con contador: el INSERT del banner se intentó de verdad.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

test('si el banner no se puede crear, se dice en rojo y como alert', async ({ page }) => {
  await montar(page);
  const intentos: string[] = [];
  // Después del arnés: gana la ruta registrada más tarde. Sin red: el mensaje es
  // siempre el de «sin conexión», que no depende del texto del servidor.
  await page.route('**/rest/v1/contenido_portal_banners**', (r) => {
    if (r.request().method() === 'POST') {
      intentos.push(r.request().postData() ?? '');
      return r.abort('failed');
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/configuracion?tab=descubre', { waitUntil: 'domcontentloaded' });

  const anadir = page.getByRole('button', { name: 'Añadir banner' });
  await expect(anadir).toBeVisible({ timeout: 60_000 });
  await anadir.click();

  await expect.poll(() => intentos.length, { timeout: 20_000 }).toBeGreaterThan(0);
  // El aviso en línea, una sola vez (antes salía repetido en lista y cabecera),
  // en rojo y como `alert`; ninguno con el aspecto de un acierto.
  const enLinea = page.locator('p[role="alert"]').filter({ hasText: /conexión/i });
  await expect(enLinea).toHaveCount(1);
  await expect(enLinea).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /conexión/i })).toHaveCount(0);
});
