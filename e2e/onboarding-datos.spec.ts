import { test, expect, type Page, type Route } from '@playwright/test';

// Punto 3 del empujón al onboarding: lo que se pregunta tiene que acabar
// CONFIGURANDO algo. Este spec vigila el camino completo de las dos piezas que
// faltaban — «Clase suelta», que se ofrecía y se tiraba, y la ficha de la
// propietaria— comprobando lo que sale hacia /api/onboarding/configurar.
const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  const configurar: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // ⚠️ El catch-all va PRIMERO y la ruta concreta DESPUÉS: Playwright resuelve
  // las rutas en orden inverso al de registro, así que la última registrada
  // gana. Al revés, `**/api/**` se tragaba la llamada a configurar y el
  // contador se quedaba a cero — que se lee igual que «el asistente no la
  // manda», y no lo era.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/onboarding/configurar', route => {
    configurar.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, { ok: true });
  });
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: AUTH_UID, bienvenida_vista_en: null,
    }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
  return { configurar };
}

/** Recorre el asistente hasta el final. En cada paso, si una de las opciones
 *  que nos interesan está en pantalla la pulsa; si no, avanza con Enter — el
 *  asistente permite pasar sin contestar, que es el criterio de «todo
 *  saltable» y lo que hace que este recorrido no dependa del orden exacto de
 *  las preguntas. */
async function recorrer(page: Page, aElegir: string[]) {
  const pendientes = new Set(aElegir);
  for (let i = 0; i < 40; i++) {
    let pulsado = false;
    for (const etiqueta of [...pendientes]) {
      // Sin `exact`: cada opción se pinta con su número delante («3 Clase
      // suelta»), así que el nombre accesible NO es solo la etiqueta.
      const b = page.getByRole('button', { name: etiqueta });
      if (await b.count() > 0) {
        await b.first().click();
        pendientes.delete(etiqueta);
        pulsado = true;
        break;
      }
    }
    if (!pulsado) await page.keyboard.press('Enter');
    await page.waitForTimeout(140);
  }

  // ⚠️ El resumen NO se cierra con Enter. El manejador de teclado del asistente
  // sale antes si `fase !== 'wizard'`, así que en la última pantalla las teclas
  // no hacen nada y hay que PULSAR. Sin esto, `finalizar()` nunca corre: no se
  // guarda la bienvenida, no se llama al ejecutor, y el test se lee como «el
  // asistente no manda las respuestas» cuando lo que pasa es que no ha
  // terminado. Costó un rato descubrirlo.
  await page.getByRole('button', { name: 'Entrar al panel' }).click({ timeout: 15_000 });
}

test('«Clase suelta» y «doy clases» llegan al ejecutor, no se quedan por el camino', async ({ page }) => {
  const { configurar } = await montar(page);

  // El asistente abre con la intro tecleada; su botón la cierra.
  await page.getByRole('button', { name: 'Empezar' }).click({ timeout: 30_000 });
  await expect(page.getByText('¿Cuántos centros tienes?')).toBeVisible();
  await recorrer(page, ['Clase suelta', 'Sí, yo doy clases']);

  await expect.poll(() => configurar.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const cuerpo = configurar.at(-1)!;
  expect(cuerpo.usaClaseSuelta).toBe(true);
  expect(cuerpo.imparteClases).toBe(true);
});
