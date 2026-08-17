import { test, expect } from '@playwright/test';
import { SLUG, STUDIO_ID, AHORA, fixtureSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// Cuando los datos del estudio NO cargan, el widget tiene que decirlo.
//
// Lo que hacía antes, medido en el navegador con la API pública devolviendo
// 500: pintaba la página ENTERA con aspecto normal —hero, pestañas, horario
// vacío— usando los valores por defecto, que eran los de Tentare: nombre
// «Tentare», teléfono «+34 951 000 000», email «hola@tentare.es» y una
// dirección de ejemplo. Una clienta veía la página de reservas de SU estudio
// anunciando otra empresa, sin un solo aviso de que algo hubiera fallado, y lo
// único que podía concluir es que su estudio se había quedado sin clases.
//
// ⚠️ La ruta se CALIENTA con una carga buena antes de romper nada. Sin eso, el
// servidor de desarrollo devuelve su propio 404 mientras compila y el test
// mide el andamiaje en vez del producto — pasó al encontrar esto.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

/** Identidad de la plataforma que NUNCA debe salir en la página de un estudio. */
const IDENTIDAD_AJENA = [/\+34 951 000 000/, /hola@tentare\.es/, /Calle Larios 12/];

test('si el horario no carga, lo dice y ofrece reintentar', async ({ page }) => {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));

  let roto = false;
  await page.route('**/api/public/studio-data', (r) => (roto
    ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) })));

  // Calienta: la ruta queda compilada y se comprueba que el camino bueno va.
  //
  // ⚠️ Con reintento a propósito. En frío, la PRIMERA petición a esta ruta
  // puede devolver el 404 del propio servidor de desarrollo mientras compila, y
  // ese 404 es HTML servido: la página no se recupera sola después. Sin este
  // bucle, el test mide el arranque del servidor y no el producto — es lo que
  // hizo parecer, mientras se investigaba esto, que el widget respondía 404 a
  // un error del servidor y durante las cargas lentas. No era verdad.
  for (let intento = 0; intento < 6; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').isVisible().catch(() => false)) break;
    if (await page.locator('#horario').waitFor({ timeout: 40_000 }).then(() => true).catch(() => false)) break;
  }
  await expect(page.locator('#horario')).toBeVisible({ timeout: 60_000 });

  // Y ahora se rompe.
  roto = true;
  await page.reload();

  await expect(page.getByText(/No hemos podido cargar el horario/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();

  // Lo que importa de verdad: ni rastro de la identidad de la plataforma.
  const texto = await page.locator('body').innerText();
  for (const patron of IDENTIDAD_AJENA) {
    expect(texto, `se coló la identidad de la plataforma: ${patron}`).not.toMatch(patron);
  }
  // Y tampoco el horario a medias, que es lo que hacía pensar «mi estudio no
  // tiene clases» en vez de «esto ha fallado».
  await expect(page.locator('#horario')).toHaveCount(0);
});

// ── Los otros dos estados: no había nada roto, y este test es lo que hace que
//    siga siendo verdad ────────────────────────────────────────────────────────
//
// Se comprueban porque quitar las identidades por defecto (arriba) toca justo
// lo que se ve mientras NO hay datos. Un cambio futuro que se pase de frenada
// dejaría un hero con el nombre en blanco durante la carga, o un horario mudo
// cuando el estudio no tiene clases — dos cosas que se leen como «esto está
// roto» y que nadie reporta.

test('mientras cargan los datos se dice que está cargando, sin identidad a medias', async ({ page }) => {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));

  let lento = false;
  await page.route('**/api/public/studio-data', async (r) => {
    if (lento) await new Promise((res) => setTimeout(res, 8000));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) });
  });

  for (let intento = 0; intento < 6; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 40_000 }).then(() => true).catch(() => false)) break;
  }

  lento = true;
  const navegacion = page.reload();
  await expect(page.getByText(/Cargando horario/)).toBeVisible({ timeout: 30_000 });
  // Y nada de la identidad de la plataforma mientras tanto.
  const texto = await page.locator('body').innerText();
  for (const patron of IDENTIDAD_AJENA) {
    expect(texto, `se coló la identidad de la plataforma durante la carga: ${patron}`).not.toMatch(patron);
  }
  await navegacion.catch(() => { /* la navegación puede seguir en vuelo */ });
});

test('un estudio sin clases lo dice, en vez de enseñar un hueco mudo', async ({ page }) => {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));

  let sinClases = false;
  await page.route('**/api/public/studio-data', (r) => {
    const fx = fixtureSociaLista();
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(sinClases ? { ...fx, sesiones: [] } : fx),
    });
  });

  for (let intento = 0; intento < 6; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 40_000 }).then(() => true).catch(() => false)) break;
  }

  sinClases = true;
  await page.reload();
  await expect(page.locator('#horario')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Sin clases este día/)).toBeVisible({ timeout: 30_000 });
  // El estudio sigue siendo el suyo: sin clases no es lo mismo que sin estudio.
  await expect(page.getByText(/Estudio Alma/).first()).toBeVisible();
});
