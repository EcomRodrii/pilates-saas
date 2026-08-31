import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Brain · Fase 4 — el Inicio del portal deja de describir y propone.
//
// Los cuatro estados que no son "tienes clase" acababan todos en la lista
// entera con un texto genérico ("Hay clases con hueco esta semana"). Ahora,
// cuando hay algo real que ofrecer, la tarjeta dice QUÉ clase, CUÁNDO y POR QUÉ.
//
// El mock lleva a Marta con un Bono 10 acotado a Reformer Flow (tc-1) y doce
// asistencias a las 09:00. Sin su reserva de hoy, el Inicio entra en uno de los
// otros cuatro casos y aparece la propuesta.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('El Inicio propone una clase concreta, no una lista', () => {
  test('sin próxima clase: la tarjeta dice qué clase y por qué', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinProximaReserva: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    // Su bono solo cubre Reformer Flow, así que es lo único que puede proponerse.
    await expect(page.getByText(/Reformer Flow ·/).first()).toBeVisible();
    // Y NUNCA sin su porqué: es lo que separa una propuesta de un anuncio.
    await expect(
      page.getByText(/sueles entrenar|es lo que más haces|es la próxima con hueco/).first(),
    ).toBeVisible();
  });

  test('nunca propone una clase que su plan no cubre', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinProximaReserva: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    // El Bono 10 está acotado a tc-1: proponerle Mat o Barre la llevaría a un
    // error al intentar reservar.
    const tarjeta = page.locator('[data-bloque-sistema="proximaClase"]');
    await expect(tarjeta.getByText(/Mat & Respiración ·/)).toHaveCount(0);
    await expect(tarjeta.getByText(/Barre Sculpt ·/)).toHaveCount(0);
  });

  test('sin plan activo no se propone nada: se respeta el texto de siempre', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinProximaReserva: true, sinBono: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    // Nada que su plan cubra → ninguna propuesta, y la tarjeta se queda como
    // estaba. No aparece ningún motivo suelto sin clase que lo acompañe.
    const tarjeta = page.locator('[data-bloque-sistema="proximaClase"]');
    await expect(tarjeta.getByText(/sueles entrenar/)).toHaveCount(0);
    await expect(tarjeta.getByText(/es la próxima con hueco/)).toHaveCount(0);
  });

  test('con clase reservada la tarjeta sigue siendo la de siempre (sin propuesta encima)', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    // PROXIMA_CLASE ya tiene una clase concreta: proponerle otra encima sería
    // ruido, así que ahí no se calcula ninguna sugerencia.
    const tarjeta = page.locator('[data-bloque-sistema="proximaClase"]');
    await expect(tarjeta.getByText(/sueles entrenar/)).toHaveCount(0);
  });
});
