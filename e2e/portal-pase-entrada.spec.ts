import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Entrar al estudio es un CAMBIO DE ESTADO, y la hoja del pase tiene que
// contarlo como tal.
//
// Probado en vivo el 2026-07-30, con un check-in real: la recepción escaneó y
// la clienta tuvo que RECARGAR la página para ver algo. Dos motivos, los dos
// arreglados aquí:
//
//  1. La hoja solo preguntaba cada 75 s (el ritmo de renovar el token), así que
//     había hasta minuto y cuarto de silencio justo cuando ella está mirando
//     el móvil fijamente.
//  2. Y cuando por fin se enteraba, el único cambio era un renglón de gris
//     pequeño: el QR seguía puesto, pidiendo que lo enseñara otra vez.
// ─────────────────────────────────────────────────────────────────────────────

async function abrirPase(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/clases`);
  await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });
  // ses-1 (la reservada de Marta) es HOY, que es el día activo por defecto —
  // ya no hace falta el segmentado "Mis reservas" (retirado con el
  // rediseño "Tentare Studio App") para verla: sale inline en el día.
  await page.getByRole('button', { name: 'Ver mi pase' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Tu pase de acceso' })).toBeVisible();
}

test('con el pase pendiente se enseña el QR y el código', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await abrirPase(page);

  await expect(page.getByText('Enséñaselo a tu instructora al entrar.')).toBeVisible();
  await expect(page.getByText('o dile este código')).toBeVisible();
  await expect(page.getByText('Ya estás dentro')).toHaveCount(0);
});

test('al entrar, el QR SE VA y lo dice en grande', async ({ page }) => {
  await montarPortal(page, { conSesion: true, entraTrasPeticiones: 0 });
  await abrirPase(page);

  await expect(page.getByText('Ya estás dentro')).toBeVisible();
  await expect(page.getByText('Que vaya muy bien.')).toBeVisible();
  // Ni QR ni código: ya no hay nada que enseñar.
  await expect(page.getByText('o dile este código')).toHaveCount(0);
  await expect(page.getByText('Enséñaselo a tu instructora al entrar.')).toHaveCount(0);
});

test('se entera SIN recargar la página', async ({ page }) => {
  // Esto es exactamente lo que falló en vivo. La primera petición dice
  // «pendiente» y la siguiente ya dice «dentro» — como cuando recepción
  // escanea. La hoja tiene que cambiar sola.
  await montarPortal(page, { conSesion: true, entraTrasPeticiones: 1 });
  await abrirPase(page);

  await expect(page.getByText('Enséñaselo a tu instructora al entrar.')).toBeVisible();
  // Sin recargar, sin tocar nada: con el ritmo de 4 s tiene que llegar solo.
  await expect(page.getByText('Ya estás dentro')).toBeVisible({ timeout: 15_000 });
});
