import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// El botón de ayuda de la esquina (10-nov-2026): cuatro pestañas y el WhatsApp dentro
// de «Mensajes». Sustituye al botón flotante de WhatsApp.
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const VERSIONES = [
  { id: 'v2', version: '0.10', titulo: 'Versión de prueba', fecha_publicacion: '2026-11-05', changelog_cambios: [{ texto: 'Una novedad de prueba.', etiqueta: 'NUEVA_FUNCIONALIDAD', orden: 0 }] },
];

test.use({ viewport: { width: 1280, height: 800 } });

async function abrir(page: Page) {
  await ir(page, 'dashboard');
  await page.getByTestId('boton-ayuda').click({ timeout: 90_000 });
  const panel = page.getByRole('dialog', { name: 'Ayuda de Tentare' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('Botón de ayuda', () => {
  test('abre en Inicio, recorre las cuatro pestañas y Escape lo cierra', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/changelog_versiones**', r => json(r, VERSIONES));
    const panel = await abrir(page);
    await expect(panel.getByRole('heading', { name: /¿En qué te ayudamos\?/ })).toBeVisible();
    await expect(panel.getByRole('tab', { name: 'Inicio' })).toHaveAttribute('aria-selected', 'true');

    await panel.getByRole('tab', { name: 'Novedades' }).click();
    await expect(panel.getByText('Versión de prueba')).toBeVisible();
    await panel.getByRole('tab', { name: 'Mensajes' }).click();
    await expect(panel.getByRole('link', { name: /Escribir por WhatsApp/ })).toHaveAttribute('href', /wa\.me\/34603556580/);
    await expect(panel.getByText('Te responde una persona, no una IA.')).toBeVisible();
    await panel.getByRole('tab', { name: 'Ayuda' }).click();
    await expect(panel.getByText(/\d+ categorías/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Ayuda de Tentare' })).toHaveCount(0);
  });

  test('un mensaje llega a las dos vías, y si fallan las dos no dice «Enviado» y conserva lo escrito', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/changelog_versiones**', r => json(r, VERSIONES));
    let registros = 0;
    let correos = 0;
    let fallan = false;
    await page.route('**/rest/v1/soporte_solicitudes**', r => {
      if (r.request().method() === 'GET') return json(r, []);
      registros++;
      return fallan ? json(r, { code: 'XX000', message: 'error' }, 500) : r.fulfill({ status: 201, body: '' });
    });
    await page.route(u => u.pathname === '/api/soporte', r => { correos++; return fallan ? json(r, { error: 'no' }, 502) : json(r, { ok: true }); });

    const panel = await abrir(page);
    await panel.getByRole('tab', { name: 'Mensajes' }).click();

    fallan = true;
    await panel.getByLabel('Mensaje', { exact: true }).fill('No me deja cobrar una cuota');
    await panel.getByRole('button', { name: 'Enviar' }).click();
    await expect(panel.getByRole('alert')).toContainText('No hemos podido enviar tu mensaje');
    expect(registros, 'intentó escribir el registro').toBeGreaterThan(0);
    expect(correos, 'intentó mandar el correo').toBeGreaterThan(0);
    await expect(panel.getByLabel('Mensaje', { exact: true })).toHaveValue('No me deja cobrar una cuota');

    fallan = false;
    await panel.getByRole('button', { name: 'Reintentar' }).click();
    await expect(panel.getByText('Enviado. Gracias.')).toBeVisible();
  });

  test('la propietaria ve los mensajes de su estudio', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/changelog_versiones**', r => json(r, VERSIONES));
    await page.route('**/rest/v1/soporte_solicitudes**', r => json(r, [
      { id: 's1', tipo: 'MEJORA', mensaje: 'Estaría bien poder duplicar una clase', creado_en: '2026-11-08T10:00:00Z' },
    ]));
    const panel = await abrir(page);
    await panel.getByRole('tab', { name: 'Mensajes' }).click();
    await expect(panel.getByText('Estaría bien poder duplicar una clase')).toBeVisible();
    await expect(panel.getByText(/Mejora · 8 nov 2026/)).toBeVisible();
  });

  test('el menú de perfil abre el mismo panel', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/changelog_versiones**', r => json(r, VERSIONES));
    await ir(page, 'dashboard');
    await page.getByRole('button', { name: /cloe@example\.com|Cloe/i }).first().click({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Ayuda', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Ayuda de Tentare' })).toBeVisible();
  });
});
