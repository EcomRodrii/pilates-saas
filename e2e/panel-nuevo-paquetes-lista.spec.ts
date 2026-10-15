import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Paquetes en el panel nuevo (interruptor `panelNuevo`), como «Cuotas» de
// Bonsai: de serie, una lista con una fila por tarifa (qué es, sesiones, para
// qué sirve, precio, cuántas la tienen, si está a la venta) y sus acciones en un
// ⋮. Las tarjetas siguen a un toque, y la elección se recuerda.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('tentare-primeros-pasos-plegado', '1'); } catch { /* sin almacenamiento */ } });
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await ir(page, 'productos');
}

test('de serie, una lista: cada tarifa en su fila con sesiones, precio, quién la tiene y su estado', async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole('button', { name: 'Lista', pressed: true })).toBeVisible({ timeout: 30_000 });
  const fila = page.getByTestId('fila-plan').filter({ hasText: 'Mensual ilimitado' });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Se renueva cada mes');
  await expect(fila).toContainText('89');
  await expect(fila).toContainText('A la venta');
  await expect(page.getByRole('columnheader', { name: 'La tienen' })).toBeVisible();
});

test('el ⋮ de una fila abre la tarifa para editarla', async ({ page }) => {
  await abrir(page);
  const fila = page.getByTestId('fila-plan').filter({ hasText: 'Mensual ilimitado' });
  await fila.getByRole('button', { name: 'Acciones de Mensual ilimitado' }).click({ timeout: 30_000 });
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('se puede pasar a tarjetas, y se recuerda al volver', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Tarjetas' }).click({ timeout: 30_000 });
  await expect(page.getByTestId('fila-plan')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Mensual ilimitado' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tarjetas', pressed: true })).toBeVisible({ timeout: 30_000 });
});
