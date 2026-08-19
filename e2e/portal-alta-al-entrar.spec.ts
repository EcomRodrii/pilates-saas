import { test, expect } from '@playwright/test';
import { SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El alta al entrar — por las DOS puertas.
//
// Decisión de producto explícita: quien entra y todavía no es socia de ese
// estudio SE DA DE ALTA SOLA. Vale igual con Google que con el enlace del
// correo: en las dos ha probado que controla ese email, y esa prueba es la que
// autoriza el alta. Que solo una de las dos diera de alta es justo lo que dejaba
// a quien pedía el enlace sin ser socia en «el enlace ya no vale», un callejón
// sin salida.
//
// ⚠️ Lo que se prueba aquí es la CERRADURA, que es lo que no puede fallar: la
// identidad sale del JWT verificado, nunca del body. Sin eso, un endpoint que
// crea socias sería una vía para dar de alta a nombre de cualquiera.
//
// El viaje completo (ida a Google y vuelta) no se puede ejercitar sin una
// cuenta real de Google, así que eso hay que mirarlo en un estudio de pruebas
// antes de fiarse — misma limitación que el resto de lo que depende de un
// tercero.
// ─────────────────────────────────────────────────────────────────────────────

test('sin sesión verificada NO se puede dar de alta a nadie', async ({ request }) => {
  const r = await request.post('/api/public/alta-al-entrar', {
    data: { slug: SLUG, nombre: 'Quien Sea' },
  });
  expect(r.status()).toBe(401);
});

test('con un token inventado tampoco', async ({ request }) => {
  const r = await request.post('/api/public/alta-al-entrar', {
    headers: { Authorization: 'Bearer no-soy-un-token' },
    data: { slug: SLUG },
  });
  expect(r.status()).toBe(401);
});

test('sin estudio no hace nada', async ({ request }) => {
  const r = await request.post('/api/public/alta-al-entrar', { data: {} });
  expect(r.status()).toBe(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// La otra puerta: crear cuenta SIN Google, con el enlace del correo.
//
// ⚠️ Este es el bug que se venía arrastrando. `resolver` deja la sesión en
// `null` cuando el email autenticado no es socia del estudio, y `/clave-nueva`
// leía ese `null` como «el enlace ya no vale». Quien intentaba crear cuenta por
// correo veía un error rojo diciéndole que su enlace había caducado —cuando
// había funcionado— y no tenía forma de pasar de ahí.
//
// Por eso el test cuenta las PETICIONES al alta: sin ese contador, «no salió el
// error» podría ser verdad por cualquier otro motivo y taparía justo el fallo.
// ─────────────────────────────────────────────────────────────────────────────

test('con el enlace del correo, quien no era socia se da de alta y NO ve «caducado»', async ({ page }) => {
  const { montarPortal } = await import('./portal-mock');
  let altas = 0;
  let yaEsSocia = false;

  await montarPortal(page, { conSesion: true, kit: 'sereno' });

  // Se registran DESPUÉS de montarPortal: en Playwright manda la última ruta.
  await page.route('**/api/public/alta-al-entrar', async (route) => {
    altas += 1;
    yaEsSocia = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"creada":true}' });
  });
  await page.route('**/api/public/session', async (route) => {
    // Antes del alta el servidor dice «no la conozco» — que es exactamente lo
    // que pasa de verdad con un email que todavía no es socia.
    if (!yaEsSocia) { await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"no"}' }); return; }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ socioId: 'soc-1', nombre: 'Marta', email: 'marta@example.com' }),
    });
  });

  await page.goto(`/portal/${SLUG}/clave-nueva`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // Se intentó el alta de verdad. Sin esto el resto del test no prueba nada.
  await expect.poll(() => altas, { timeout: 30_000 }).toBeGreaterThan(0);

  // Y acaba donde tiene que acabar: eligiendo contraseña, no en el callejón.
  await expect(page.getByText(/ya no vale/i)).toHaveCount(0);
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30_000 });
});

test('un enlace de verdad caducado sigue diciendo que caducó', async ({ page }) => {
  // ⚠️ La contraparte: sin token de Supabase no hay a quien dar de alta, y el
  // mensaje tiene que seguir apareciendo. Si el arreglo de arriba se comiera
  // también este caso, la socia se quedaría mirando «comprobando» para siempre.
  const { montarPortal } = await import('./portal-mock');
  let altas = 0;
  await montarPortal(page, { conSesion: false, kit: 'sereno' });
  await page.route('**/api/public/alta-al-entrar', async (route) => {
    altas += 1;
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"no"}' });
  });

  await page.goto(`/portal/${SLUG}/clave-nueva`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page.getByText(/ya no vale/i)).toBeVisible({ timeout: 30_000 });
  // Y ni se molestó en pedir un alta: no hay nadie autenticado a quien darla.
  expect(altas).toBe(0);
});
