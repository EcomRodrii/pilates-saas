import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de clases — verificado sobre `PortalReservasView`
// (`components/portal/portal-reservas-view.tsx`, ruta `/reservas`).
//
// Fase 3 (Tentare Studio App, literal al diseño): «Mis reservas» dejó de
// organizarse en pestañas (Próximas/Pasadas/Canceladas/Lista de espera) y
// pasó a ser un solo scroll — Próximas arriba, luego lista de espera/plaza
// fija/bono/pagos si los hay, y «Historial» (asistidas + no-shows) al final,
// sin pestaña que pulsar. Las canceladas dejaron de listarse en esta
// pantalla del todo (decisión de producto explícita: el dato sigue en BD,
// solo no aparece aquí) — este spec, escrito para el sistema de pestañas
// anterior, ya no puede comprobar "la cancelada sigue viéndose en su propia
// pestaña" porque esa pestaña no existe.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('el historial de asistidas vive en Mis reservas, no en una agenda semanal', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Historial', { exact: true })).toBeVisible();
  await expect(page.getByText('Asistida').first()).toBeVisible();
  // Y NO es la agenda semanal: su selector de día no está por ninguna parte.
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveCount(0);
});

test('las 12 clases de muestra aparecen todas como asistidas, sin pestaña que pulsar', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('Asistida', { exact: true })).toHaveCount(12);
  // Sin pestañas: ningún control con role="tab" queda en esta pantalla.
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('sin historial (sinHistorial), la sección no se pinta en absoluto', async ({ page }) => {
  // Sin relleno inventado: si no hay ninguna reserva pasada, "Historial" ni
  // su rótulo aparecen — no una lista vacía con un mensaje.
  await montarPortal(page, { conSesion: true, sinHistorial: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('Historial', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Asistida')).toHaveCount(0);
});
