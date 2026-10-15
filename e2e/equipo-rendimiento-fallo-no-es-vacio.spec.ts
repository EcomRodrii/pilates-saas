import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Equipo → Rendimiento: un fallo de carga NO es un equipo vacío.
//
// Antes `fetchRendimientoInstructoras()` devolvía `[]` ante un 500 o un corte de
// red, y la pantalla lo pintaba como «Todavía no hay instructoras de alta»: un
// fallo nuestro contado como si a la propietaria le faltara equipo. Mismo error
// que ya se corrigió en la rejilla de Equipo (`falloTarjetas`).
//
// Lo que se fija:
//   · con un 500 o sin red, se dice que ha fallado y se ofrece «Reintentar», y
//     NO se dice que no hay instructoras — contando que la petición SÍ salió:
//     un test de fallo sin contador puede pasar sin haber intentado nada;
//   · «Reintentar» vuelve a pedir y, si el servidor ya contesta, pinta el informe;
//   · con `{ items: [] }` (el servidor contesta bien, sin filas) sí se dice que
//     no hay instructoras, y no se habla de ningún fallo.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const MARTA = {
  instructorId: 'ins-marta', nombre: 'Marta Ruiz', nAlumnasAtribuidas: 8, datosInsuficientes: false,
  retencionPct: 75, nParaRetencion: 8, conversionPct: 50, nParaConversion: 4, redSocialPct: 25,
};

const TEXTO_FALLO = 'No hemos podido cargar el rendimiento';
const TEXTO_VACIO = 'Todavía no hay instructoras de alta.';

/** Monta el panel y contesta `/api/equipo/rendimiento` con lo que diga `responder`. */
async function abrir(page: Page, responder: (r: Route) => Promise<void>) {
  let intentos = 0;
  await montar(page);
  // Después de montar(): Playwright prueba las rutas en orden inverso al registro,
  // y registrada antes la tapaba el comodín `**/api/**` del andamiaje.
  await page.route((u) => u.pathname === '/api/equipo/rendimiento', (r) => {
    intentos++;
    return responder(r);
  });
  await ir(page, 'equipo/rendimiento');
  return { intentos: () => intentos };
}

test('con un 500 dice que ha fallado, no que no hay instructoras', async ({ page }) => {
  const { intentos } = await abrir(page, (r) => json(r, { error: 'No se ha podido completar la operación.' }, 500));

  await expect(page.getByText(TEXTO_FALLO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Es un problema nuestro, no que te falten instructoras.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByText(TEXTO_VACIO)).toHaveCount(0);
  expect(intentos(), 'la petición del rendimiento tiene que salir').toBeGreaterThan(0);
});

test('sin red dice que ha fallado, no que no hay instructoras', async ({ page }) => {
  const { intentos } = await abrir(page, (r) => r.abort('internetdisconnected'));

  await expect(page.getByText(TEXTO_FALLO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(TEXTO_VACIO)).toHaveCount(0);
  expect(intentos(), 'la petición del rendimiento tiene que salir').toBeGreaterThan(0);
});

test('«Reintentar» vuelve a pedir y, si el servidor ya contesta, pinta el informe', async ({ page }) => {
  // Un interruptor y no «la primera falla»: en desarrollo React monta el efecto
  // dos veces, y la segunda petición taparía a la primera.
  let falla = true;
  const { intentos } = await abrir(page, (r) => (falla ? json(r, { error: 'caído' }, 500) : json(r, { items: [MARTA] })));

  await expect(page.getByText(TEXTO_FALLO)).toBeVisible({ timeout: 30_000 });
  const antes = intentos();
  expect(antes).toBeGreaterThan(0);

  falla = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.getByRole('heading', { name: 'Marta Ruiz' })).toBeVisible();
  await expect(page.getByText(TEXTO_FALLO)).toHaveCount(0);
  expect(intentos(), '«Reintentar» tiene que volver a pedir').toBeGreaterThan(antes);
});

test('con `{ items: [] }` sí dice que no hay instructoras, sin hablar de fallos', async ({ page }) => {
  const { intentos } = await abrir(page, (r) => json(r, { items: [] }));

  await expect(page.getByText(TEXTO_VACIO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(TEXTO_FALLO)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  expect(intentos(), 'la petición del rendimiento tiene que salir').toBeGreaterThan(0);
});
