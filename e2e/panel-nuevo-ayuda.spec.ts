import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La ayuda de cada pantalla en el panel nuevo (interruptor `panelNuevo`): el ⓘ
// abre un panel lateral, como el de Bonsai, con qué es la pantalla, sus pasos
// rápidos (los del tutorial), lo que te quita de encima, las guías de la sección
// y el WhatsApp de soporte. Apagado, el ⓘ sigue siendo el recuadro de siempre.
// (Fichero propio y no al final de panel-nuevo-secciones.spec.ts: dos ramas que
// añaden tests al final del mismo fichero chocan y se comen el cierre.)
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function preparar(page: import('@playwright/test').Page, nuevo: boolean) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: nuevo,
  }));
}

test('encendido: el ⓘ abre la ayuda en un panel lateral, con sus pasos, sus guías y una persona', async ({ page }) => {
  await preparar(page, true);
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Ayuda: Calendario' }).click({ timeout: 30_000 });
  const cajon = page.getByRole('dialog', { name: 'Ayuda: Calendario' });
  await expect(cajon).toBeVisible();
  await expect(cajon.getByRole('heading', { name: 'Pasos rápidos' })).toBeVisible();
  await expect(cajon.getByText('Tu semana de clases.')).toBeVisible();
  await expect(cajon.getByRole('heading', { name: 'Guías paso a paso' })).toBeVisible();
  await expect(cajon.getByRole('link', { name: /Cómo crear una clase/ })).toHaveAttribute('href', '/ayuda/reservas/crear-una-clase');
  await expect(cajon.getByText('Te responde una persona, no una IA.')).toBeVisible();
  await cajon.getByRole('button', { name: 'Cerrar la ayuda' }).click();
  await expect(cajon).toHaveCount(0);
});

test('apagado: el ⓘ es el recuadro de siempre', async ({ page }) => {
  await preparar(page, false);
  await ir(page, 'calendario');
  await expect(page.getByRole('button', { name: 'Qué es Calendario' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Ayuda: Calendario' })).toHaveCount(0);
});
