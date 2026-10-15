import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// En el móvil, «Crear clase» es un «+» redondo en absoluto arriba a la derecha.
// Con el panel nuevo, «Cómo funciona» va en la fila del título y el «+» se le
// montaba encima (se veía «Cómo funci» cortado). La cabecera le reserva el hueco.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 375, height: 812 } });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

test('en el móvil, el «+» de crear clase no tapa «Cómo funciona»', async ({ page }) => {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await ir(page, 'calendario');
  const crear = page.getByRole('button', { name: 'Crear clase' });
  // «Cómo funciona» se anuncia como «Enséñame «Calendario» paso a paso».
  const comoFunciona = page.getByRole('button', { name: /Enséñame «Calendario»/ });
  await expect(crear).toBeVisible({ timeout: 30_000 });
  await expect(comoFunciona).toBeVisible();
  const a = (await crear.boundingBox())!;
  const b = (await comoFunciona.boundingBox())!;
  const seCruzan = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(seCruzan, `«+» ${JSON.stringify(a)} y «Cómo funciona» ${JSON.stringify(b)}`).toBe(false);
});
