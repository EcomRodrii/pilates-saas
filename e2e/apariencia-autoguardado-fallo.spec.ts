import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El camino de FALLO del autoguardado del editor de temas.
//
// Este fichero existe porque la regla que este repo repite —"page.route mockea
// la red, así que ningún test ve nunca un 4xx"— describe un HÁBITO, no un
// límite: los mocks siempre devuelven 200 porque nadie los escribe de otra
// forma. `route.abort()` produce un fallo de red de verdad, que es exactamente
// lo que ve la propietaria cuando se le cae el wifi a media faena.
//
// Y aquí importa más que en otros sitios: si el autoguardado revirtiera el
// estado local al fallar, le BORRARÍA lo que acaba de escribir. Esa es la
// aserción central de abajo, no el texto del aviso.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const BLOQUES_HOME = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
];

async function montar(page: Page) {
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

  const estado = { fallar: false, puts: 0 };
  const bloques: Record<string, unknown[]> = { home: BLOQUES_HOME, clases: [], bonos: [], reservar: [] };

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, {
    orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] }, portalHome: { orden: [], ocultos: [] },
  }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED' }));
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    const pantalla = url.searchParams.get('pantalla') ?? 'home';
    // `pantalla=todas`: el editor carga las tres de una sola vez (antes eran
    // tres peticiones para una misma lectura del layout). El mock tiene que
    // conocer esa forma o el editor se queda sin bloques y el test falla
    // diciendo que no encuentra una sección — que es justo lo que pasó.
    if (pantalla === 'todas') return json(route, bloques);
    if (route.request().method() === 'PUT') {
      estado.puts++;
      // ⚠️ `abort`, no un 500: se parece más a lo que de verdad pasa (wifi
      // caído, servidor inalcanzable) y es el caso que ningún test del repo
      // había mirado nunca.
      if (estado.fallar) return route.abort('failed');
      bloques[pantalla] = route.request().postDataJSON() as unknown[];
      return json(route, bloques[pantalla]);
    }
    return json(route, bloques[pantalla]);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  return estado;
}

const chip = (page: Page) => page.locator('[data-estado-guardado]');

test.describe('Autoguardado — el camino de fallo', () => {
  test('si el guardado falla, lo avisa y NO revierte lo que hay en pantalla', async ({ page }) => {
    const estado = await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    // Un primer cambio con la red bien, para tener línea base confirmada.
    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();
    await expect(chip(page)).toHaveText(/Guardado/, { timeout: 15_000 });

    // Se cae la red y la propietaria sigue trabajando.
    estado.fallar = true;
    await page.getByRole('button', { name: 'Ocultar Esta semana' }).click();

    // 1) Lo dice, y lo dice sin optimismo.
    await expect(chip(page)).toHaveText('No se ha podido guardar — se sigue intentando', { timeout: 15_000 });

    // 2) Su trabajo sigue en pantalla. Revertir al estado del servidor aquí le
    //    borraría lo que acaba de hacer.
    //
    //    ⚠️ Honestidad sobre esta aserción: hoy NO puede fallar por culpa del
    //    hook, porque `useAutoguardado` no es dueño de ese estado y no tiene
    //    con qué revertirlo. Se deja igualmente como GUARDA de futuro: el
    //    arreglo "natural" que a alguien se le ocurrirá algún día —sincronizar
    //    desde la respuesta del servidor— rompería esto, y es justo entonces
    //    cuando hace falta que salte.
    await expect(page.getByRole('button', { name: 'Mostrar Esta semana' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();
  });

  test('cuando vuelve la red, guarda solo — sin que la propietaria toque nada', async ({ page }) => {
    const estado = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    estado.fallar = true;
    await page.getByRole('button', { name: 'Ocultar Esta semana' }).click();
    await expect(chip(page)).toHaveText('No se ha podido guardar — se sigue intentando', { timeout: 15_000 });

    // Vuelve la red. Nadie pulsa nada: el reintento es del propio mecanismo
    // (2 s el primero). Si no reintentara, el aviso se quedaría fijo para
    // siempre y el borrador nunca llegaría.
    estado.fallar = false;
    await expect(chip(page)).toHaveText(/Guardado/, { timeout: 20_000 });

    // Y sigue sin publicar: recuperarse de un fallo no es publicar.
    await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeVisible();
  });

  test('el aviso de fallo se ve en rojo, no como texto gris de adorno', async ({ page }) => {
    const estado = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    const colorNormal = await chip(page).evaluate((el) => getComputedStyle(el).color);

    estado.fallar = true;
    await page.getByRole('button', { name: 'Ocultar Esta semana' }).click();
    await expect(chip(page)).toHaveText('No se ha podido guardar — se sigue intentando', { timeout: 15_000 });

    // Un "no se ha podido guardar" en el mismo gris que "Guardado" se lee como
    // decoración y nadie reacciona.
    const colorFallo = await chip(page).evaluate((el) => getComputedStyle(el).color);
    expect(colorFallo).not.toBe(colorNormal);
  });
});
