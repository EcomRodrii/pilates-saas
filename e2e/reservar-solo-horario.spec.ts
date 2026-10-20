import { test, expect, type Page } from '@playwright/test';
import { fixtureSociaLista, sembrarSociaLista, SLUG, STUDIO_ID } from './socia-lista.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu horario, tus clases» (`solo=1`, 17-oct-2026): el horario incrustado, sin
// la página completa debajo.
//
// El fallo real: un estudio con cuota y bono ve, debajo de su horario en su web,
// la banda «Bonos y membresías» (y «Sobre nosotros», las cifras y el pie), y no
// puede quitarlas: `pie=0` solo quita el último. `vistaUnica` valía para
// `tab=planes|equipo|contacto` y la clase de prueba, pero el horario es
// `tab=clases`.
//
// ⚠️ Cada «no está» tiene su CONTROL: la misma URL sin `solo=1` SÍ lo pinta. Sin
// él, «no hay banda» sería verdad también con una página que no llegó a cargar
// (.claude/tentare-os.md). Y lo del horario que tiene que seguir funcionando
// —reservar y el botón de comprar cuando falta el plan— se prueba CON la opción.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const PLANES = [
  { id: 'p-cuota', studioId: STUDIO_ID, tipo: 'MENSUAL', activo: true, precio: 89, nombre: 'Cuota Reformer', periodicidadMeses: 1 },
  { id: 'p-bono', studioId: STUDIO_ID, tipo: 'BONO', activo: true, precio: 100, nombre: 'Bono 10 clases', sesiones: 10 },
];

/** Un estudio con cuota y bono a la venta y una visitante sin sesión (lo que ve quien llega a su web). */
async function montarVisitante(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  // «Sobre nosotros» solo se pinta con texto escrito por la propietaria.
  const f = { ...fixtureSociaLista(), socia: null, planesTarifa: PLANES, reservarSobreTitulo: 'Quiénes somos', reservarSobreTexto: 'Somos tres y llevamos ocho años.' };
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
}

async function abrir(page: Page, query: string) {
  for (let intento = 0; intento < 3; intento++) {
    if (!(await page.goto(`/reservar/${SLUG}?${query}`).then(() => true).catch(() => false))) continue;
    if (await page.locator('#horario').waitFor({ timeout: 40_000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error('el horario no llegó a cargar');
}

const tarjeta = (page: Page) => page.getByRole('button', { name: /Reformer a las 10:00/ });

test('CONTROL: sin `solo=1`, debajo del horario sale lo de siempre (bonos y cuotas, «Sobre nosotros» y el pie)', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'embed=1&tab=clases');
  await expect(tarjeta(page)).toBeVisible();
  await expect(page.locator('#bonos-membresias')).toHaveCount(1);
  await expect(page.locator('#bonos-membresias').getByText('Cuota Reformer')).toBeVisible();
  await expect(page.locator('#bonos-membresias').getByText('Bono 10 clases')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(1);
});

test('CONTROL: `pie=0` sin `solo=1` solo quita el pie; la banda de bonos sigue (el fallo)', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'embed=1&tab=clases&pie=0');
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.locator('#bonos-membresias')).toHaveCount(1);
});

test('con `solo=1`: el horario y nada de la página completa debajo (ni bonos ni cuotas, ni «Sobre nosotros», ni el pie)', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'embed=1&tab=clases&solo=1');
  await expect(tarjeta(page)).toBeVisible();
  await expect(page.locator('#bonos-membresias')).toHaveCount(0);
  await expect(page.getByText('Cuota Reformer')).toHaveCount(0);
  await expect(page.getByText('Bono 10 clases')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toHaveCount(0);
  await expect(page.getByText('Somos tres y llevamos ocho años.')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
});

test('fuera del modo incrustado `solo=1` no hace nada: la página completa de siempre', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'tab=clases&solo=1');
  await expect(page.locator('#bonos-membresias')).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(1);
});

test('un valor que no es `1` se ignora, nunca se lee como «sí»', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'embed=1&tab=clases&solo=quizá');
  await expect(page.locator('#bonos-membresias')).toHaveCount(1);
});

test('con `solo=1` el horario sigue funcionando: la visitante pulsa una clase y llega a reservar', async ({ page }) => {
  await montarVisitante(page);
  await abrir(page, 'embed=1&tab=clases&solo=1');
  await tarjeta(page).click();
  // Sin sesión: «Entra para reservar» (el flujo de siempre, con su captcha y su correo).
  await expect(page.getByText(/Entra para reservar|Tus datos/)).toBeVisible({ timeout: 30_000 });
});

/** Una socia ya lista, en un estudio que exige plan y vende un bono: falta el plan, así que reservar no puede. */
async function montarSociaSinPlan(page: Page) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const f = fixtureSociaLista();
  f.studio = { ...f.studio, reservaExigirPlan: true } as typeof f.studio;
  f.planesTarifa = PLANES as typeof f.planesTarifa;
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  let intentos = 0;
  await page.route('**/api/public/reserva', r => { intentos += 1; return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no"}' }); });
  return { intentos: () => intentos };
}

async function intentarReservarSinPlan(page: Page, query: string) {
  await abrir(page, query);
  await tarjeta(page).click();
  // La ficha de la clase y su «Reservar»; sin plan, la reserva no sale y se pasa al paso de confirmar.
  await page.getByRole('button', { name: /^Reservar$/ }).last().click({ timeout: 30_000 });
  const confirmar = page.getByRole('button', { name: /Confirmar reserva/ });
  if (await confirmar.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)) await confirmar.click();
}

test('CONTROL: sin `solo=1`, reservar sin plan lleva a «Ver bonos y membresías» (la banda existe en la página)', async ({ page }) => {
  await montarSociaSinPlan(page);
  await abrir(page, 'embed=1&tab=clases');
  // Antes de abrir la clase (con ella abierta, la página esconde sus secciones): la banda está.
  await expect(page.locator('#bonos-membresias')).toHaveCount(1);
  await intentarReservarSinPlan(page, 'embed=1&tab=clases');
  const aviso = page.getByRole('alert').or(page.locator('[class*=destructive]')).filter({ hasText: /Necesitas un plan o bono/ }).first();
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(aviso.getByRole('button', { name: 'Ver bonos y membresías' })).toBeVisible();
});

test('con `solo=1`, reservar sin plan NO manda a una banda que no está: «Comprar un bono» se abre en otra pestaña', async ({ page }) => {
  const { intentos } = await montarSociaSinPlan(page);
  await intentarReservarSinPlan(page, 'embed=1&tab=clases&solo=1');
  const aviso = page.locator('[class*=destructive]').filter({ hasText: /Necesitas un plan o bono/ }).first();
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  // Ni el botón que hace scroll a la nada…
  await expect(page.getByRole('button', { name: 'Ver bonos y membresías' })).toHaveCount(0);
  await expect(page.locator('#bonos-membresias')).toHaveCount(0);
  // …sino la tienda del portal, FUERA del marco de la web del estudio.
  const comprar = aviso.getByRole('link', { name: 'Comprar un bono' });
  await expect(comprar).toBeVisible();
  await expect(comprar).toHaveAttribute('href', `/portal/${SLUG}/comprar`);
  await expect(comprar).toHaveAttribute('target', '_blank');
  // El gate decidió sin llegar al servidor: no se reservó nada.
  expect(intentos()).toBe(0);
});

test('con `solo=1` una socia lista reserva igual: la petición sale (y sin `solo=1`, también: control)', async ({ page }) => {
  await sembrarSociaLista(page, { relojMadrid: true });
  let intentos = 0;
  await page.route('**/api/public/reserva', r => {
    intentos += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-e2e' }) });
  });
  for (const query of ['embed=1&tab=clases', 'embed=1&tab=clases&solo=1']) {
    const antes = intentos;
    await abrir(page, query);
    await tarjeta(page).click();
    await page.getByRole('button', { name: /^Reservar$/ }).last().click({ timeout: 30_000 });
    await expect.poll(() => intentos, { timeout: 15_000, message: `la reserva no salió con «${query}»` }).toBeGreaterThan(antes);
  }
});
