import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaLista, fixtureSociaLista, SLUG, SESION_ID } from './socia-lista.ts';

// La reserva se abre a una hora fija (30-sep-2026): «0 días antes, a las 09:00»
// y la clase es a las 10:00 del mismo día; el reloj marca las 08:00 de Madrid.
// Lo que se defiende:
//   · la clase dice «Se abre…» ANTES de pulsar, en vez de dejar pulsar y decir «no»;
//   · el botón no manda nada mientras tanto (contador a 0: no es un «no» del
//     servidor, es que ni se intenta);
//   · a la hora en punto se enciende SOLO —un temporizador, no el refresco de cada
//     minuto— y entonces sí reserva (contador a 1).
test.use({ timezoneId: 'Europe/Madrid' });

async function sembrar(page: Page) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const fixture = fixtureSociaLista();
  const conHora = { ...fixture, studio: { ...fixture.studio, reservaAntelacionMaximaDias: 0, reservaAntelacionHora: '09:00' } };
  // Después del arnés: Playwright prueba las rutas en orden inverso al registro.
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conHora) }));
  const intentos: unknown[] = [];
  await page.route('**/api/public/reserva', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    intentos.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
  });
  return intentos;
}

test('/reservar: dice cuándo se abre, no manda nada antes, y a su hora se enciende sola', async ({ page }) => {
  const intentos = await sembrar(page);
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await expect(page.getByText('Se abre mié 12 · 09:00').first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  const boton = page.locator('.reserva-cta-btn');
  await expect(boton).toHaveText('Se abre mié 12 · 09:00', { timeout: 30_000 });
  await expect(boton).toBeDisabled();
  await expect(page.getByText('La reserva de esta clase se abre hoy a las 09:00.')).toBeVisible();
  await boton.click({ force: true });
  await page.waitForTimeout(500);
  expect(intentos, 'con la reserva cerrada no se intenta nada').toHaveLength(0);

  // Pasan las 09:00: el botón se enciende sin recargar y entonces sí reserva.
  await page.clock.fastForward('01:00:30');
  await expect(boton).toBeEnabled({ timeout: 10_000 });
  await expect(boton).toHaveText(/^Reservar/);
  await boton.click();
  await expect.poll(() => intentos.length, { timeout: 15_000 }).toBe(1);
});

test('app de la alumna: la hoja espera con «Se abre…» y se enciende a su hora', async ({ page }) => {
  const intentos = await sembrar(page);
  await page.goto(`/portal/${SLUG}/reservar/${SESION_ID}`);
  const espera = page.getByTestId('reserva-aun-no-abre');
  await expect(espera).toBeVisible({ timeout: 60_000 });
  await expect(espera).toHaveText('Se abre mié 12 · 09:00');
  await expect(espera).toBeDisabled();
  await expect(page.getByText('La reserva se abre hoy a las 09:00')).toBeVisible();
  expect(intentos).toHaveLength(0);

  await page.clock.fastForward('01:00:30');
  await expect(espera).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /reservar/i }).first()).toBeEnabled();
});
