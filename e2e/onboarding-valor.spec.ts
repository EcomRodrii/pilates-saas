import { test, expect, type Page, type Route } from '@playwright/test';

// Lo primero que ve la propietaria, antes del asistente: la pantalla del logo.
// Se monta como el resto de e2e del panel (sesión sembrada en localStorage).
const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Un PNG opaco de 16×16 (dos franjas, oliva y arena), en base64. */
const PNG_16 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGMwsVAlCTGMaqCJhpuH5pGERjXQRAMAlpBlEEjYkw4AAAAASUVORK5CYII=';

/** `estudio` se suma a la fila de `studios` que lee el panel: así se monta una
 *  bienvenida que no es el primer contacto (ya hay logo, es una sede nueva…).
 *  Va aquí y no en un `page.route` del test porque el estudio se lee al cargar,
 *  y un mock registrado después del `goto` llegaría tarde. */
export async function montarBienvenida(page: Page, { estudio = {} }: { estudio?: Record<string, unknown> } = {}) {
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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // `bienvenida_vista_en: null` es lo que dispara la pantalla completa.
  await page.route('**/rest/v1/studios**', route =>
    // El UPDATE (sellar la bienvenida, guardar el logo) pide `select=id` y
    // cuenta filas: con un objeto suelto (o `[]`) cuenta como no guardado.
    route.request().method() === 'PATCH'
      ? json(route, [{ id: STUDIO_ID }])
      : json(route, {
        id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
        owner_auth_user_id: AUTH_UID, bienvenida_vista_en: null,
        ...estudio,
      }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
}

// ⚠️ La baraja de cuatro pantallas de valor YA NO va delante. Quien llega aquí
// ha decidido registrarse, y eran cuatro clics sin ninguna acción antes del
// primer horario. Solo queda la pantalla del logo, que es la única que pide algo.
test('la primera pantalla es el logo, sin baraja de valor ni preguntas', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Ponle tu logo y ya es tuyo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Tus alumnas reservan solas, a cualquier hora' })).toHaveCount(0);
  await expect(page.getByText('¿Cuántos centros tienes?')).toHaveCount(0);
  // Una sola pantalla: ni «1 de N» ni riel de avance.
  await expect(page.getByText(/^1 de \d/)).toHaveCount(0);
});

// Quien ya se ha decidido no necesita que le vendan nada — y la salida está
// desde la PRIMERA pantalla, no escondida hasta el final.
test('se puede saltar el logo desde la primera pantalla', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('heading', { name: 'Ponle tu logo y ya es tuyo' })).toHaveCount(0);
  await expect(page.getByText('¿Cuántos centros tienes?')).toBeVisible();
});

// Tenti es el blob de canvas, el único: el yogui SVG de #1333 se retiró
// (dos mascotas con el mismo nombre son peores que ninguna). Sus colores salen
// de los tokens de la marca —un canvas no deja ver sus píxeles a un e2e, así
// que lo dice `data-paleta`—, y el índigo y el coral del kit original no
// pueden haberse colado en el DOM.
test('Tenti se pinta con los colores de marca, no con el índigo del kit', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Ponle tu logo y ya es tuyo' })).toBeVisible({ timeout: 30_000 });
  const tenti = page.locator('canvas[data-tenti]');
  await expect(tenti).toHaveCount(1);
  await expect(tenti).toHaveAttribute('data-paleta', 'tokens');
  await expect(tenti).toHaveAttribute('data-estado', 'reposo');
  // Decorativo: el h1 ya dice lo que pasa.
  await expect(tenti).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('svg[viewBox="0 0 160 160"]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain('#3D3B73');
  expect(html).not.toContain('#F07C80');
});

// La intro tecleada del asistente («Tu estudio ya está en marcha…») decía lo
// MISMO que las pantallas de valor, así que la propietaria se comía dos
// bienvenidas seguidas antes de que le preguntáramos nada. El asistente arranca
// ya en la primera pregunta.
test('no hay dos bienvenidas: tras el logo se pregunta, no se saluda otra vez', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('button', { name: 'Saltar' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Saltar' }).click();

  await expect(page.getByText('¿Cuántos centros tienes?')).toBeVisible();
  // Ni la frase de la intro vieja ni su botón.
  await expect(page.getByText('Tu estudio ya está en marcha')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empezar' })).toHaveCount(0);
});

// El criterio del fundador era «nombre + logo bastan», y el logo no se pedía en
// ningún sitio: ni en el alta ni en las once preguntas del asistente.
test('se pide el logo y se puede seguir sin ponerlo', async ({ page }) => {
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Ponle tu logo y ya es tuyo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Elige tu logo' })).toBeVisible();
  // No bloquea: se entra al asistente sin haber subido nada.
  await page.getByRole('button', { name: 'Montar mi estudio' }).click();
  await expect(page.getByText('¿Cuántos centros tienes?')).toBeVisible();
});

// ── Perfil: tres preguntas en una pantalla ──────────────────────────────────
// «Cuántos centros», «de qué software vienes» y «cuántas alumnas» son las tres
// únicas preguntas del asistente que NO configuran nada: solo alimentan el
// panel interno para saber de qué competidor llega cada estudio. Ocupaban tres
// pantallas completas de un asistente que ya era demasiado largo.
test('las tres preguntas de perfil caben en una sola pantalla', async ({ page }) => {
  await montarBienvenida(page);
  await page.getByRole('button', { name: 'Saltar' }).click({ timeout: 30_000 });

  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible();
  for (const etiqueta of ['¿Cuántos centros tienes?', '¿Con qué lo llevas ahora?', '¿Cuántas alumnas activas tienes?']) {
    await expect(page.getByLabel(etiqueta)).toBeVisible();
  }
  // Y ya no son tres pasos: el asistente encoge.
  await expect(page.getByText('01 — 11')).toBeVisible();
});

// Las tres son opcionales: «Prefiero no decirlo» es una respuesta. Dejar el
// botón apagado hasta contestar convertiría en obligatorio lo que no lo es.
test('se puede pasar del perfil sin contestar nada', async ({ page }) => {
  await montarBienvenida(page);
  await page.getByRole('button', { name: 'Saltar' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Pasa a la siguiente pregunta, que ya es de las que SÍ configuran algo.
  await expect(page.getByText('¿Cuántas salas tienes?')).toBeVisible();
});

// El asistente permite elegir con las teclas 1-N. Sobre un desplegable, teclear
// un número disparaba la elección de una opción que no existe.
test('los atajos numéricos no disparan nada en la pantalla de perfil', async ({ page }) => {
  await montarBienvenida(page);
  await page.getByRole('button', { name: 'Saltar' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible();
  await page.keyboard.press('2');
  // Sigue en la misma pantalla y sin nada seleccionado.
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible();
  await expect(page.getByLabel('¿Cuántos centros tienes?')).toHaveValue('');
});

// ── Tenti: cuándo saluda y cuándo se alegra ─────────────────────────────────
// Saluda UNA vez y solo cuando se le ve: con el fundido terminado y dentro de
// la pantalla. `data-saludo` es un contador de saludos de verdad, y este
// observador apunta cómo estaba Tenti en el instante de cada uno. Va en un
// init script para no llegar tarde: el saludo cae a ~2 s de montar.
async function apuntarSaludos(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __saludos: Array<{ n: string; opacidad: string; enPantalla: boolean }> };
    w.__saludos = [];
    new MutationObserver((cambios) => {
      for (const c of cambios) {
        const canvas = c.target as HTMLElement;
        if (!canvas.matches('canvas[data-tenti]')) continue;
        const r = canvas.getBoundingClientRect();
        w.__saludos.push({
          n: canvas.dataset.saludo ?? '',
          opacidad: getComputedStyle(canvas.parentElement!).opacity,
          enPantalla: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
        });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-saludo'] });
  });
}

const saludosApuntados = (page: Page) =>
  page.evaluate(() => (window as unknown as { __saludos: Array<{ n: string; opacidad: string; enPantalla: boolean }> }).__saludos);

test('Tenti saluda una vez, y solo cuando ya se le ve', async ({ page }) => {
  await apuntarSaludos(page);
  await montarBienvenida(page);
  const tenti = page.locator('canvas[data-tenti]');
  await expect(tenti).toHaveAttribute('data-saludo', '1', { timeout: 30_000 });
  // `saludaAlAparecer`, o saludar al montar, también dejaría un '1': lo que lo
  // distingue es que entonces el envoltorio aún era transparente.
  expect(await saludosApuntados(page)).toEqual([{ n: '1', opacidad: '1', enPantalla: true }]);
  await page.waitForTimeout(3000);
  await expect(tenti).toHaveAttribute('data-saludo', '1');
  expect(await saludosApuntados(page)).toHaveLength(1);
});

// La bienvenida vuelve en cada arranque en frío hasta que se sella, y cada sede
// nueva de una cadena nace sin sellar: ahí ya se conocen, y saludar otra vez
// sería un «hola» de quien no se acuerda de ti.
const YA_SE_CONOCEN: Array<{ caso: string; preparar: (page: Page) => Promise<void>; estudio?: Record<string, unknown> }> = [
  {
    caso: 'con el asistente a medias en este navegador',
    preparar: async (page) => {
      await page.addInitScript((studioId) => {
        localStorage.setItem('tentare-onboarding-wizard-v2', JSON.stringify({ studioId, paso: 1, ans: {}, guardadoEn: Date.now() }));
      }, STUDIO_ID);
    },
  },
  {
    caso: 'si ya tiene logo',
    preparar: async () => {},
    // Un PNG en línea: una URL de verdad saldría a la red desde el <img> de PasoLogo.
    estudio: { logo_url: `data:image/png;base64,${PNG_16}` },
  },
  {
    caso: 'en una sede nueva de una cadena',
    preparar: async () => {},
    estudio: { cadena_id: 'cadena-e2e' },
  },
];

for (const { caso, preparar, estudio } of YA_SE_CONOCEN) {
  test(`Tenti no vuelve a saludar ${caso}`, async ({ page }) => {
    await preparar(page);
    await montarBienvenida(page, { estudio });
    const tenti = page.locator('canvas[data-tenti]');
    await expect(tenti).toHaveAttribute('data-paleta', 'tokens', { timeout: 30_000 });
    // Más que lo que tarda el saludo del primer contacto (~2 s).
    await page.waitForTimeout(3000);
    // Se le ve (el fundido terminó y está en pantalla) y aun así no saluda: no
    // vale un «no saludó» porque nunca llegó a verse.
    expect(await tenti.evaluate((c) => getComputedStyle(c.parentElement!).opacity)).toBe('1');
    await expect(tenti).toBeInViewport();
    await expect(tenti).not.toHaveAttribute('data-saludo');
  });
}

test('con «reducir movimiento» Tenti está quieto y no saluda', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await montarBienvenida(page);
  const tenti = page.locator('canvas[data-tenti]');
  await expect(tenti).toHaveAttribute('data-quieto', '1', { timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(tenti).not.toHaveAttribute('data-saludo');
  // Quieto, no escondido: el fundido se apaga, pero Tenti sigue ahí.
  await expect(tenti).toBeVisible();
});

// Se alegra con lo que ha dicho la base de datos, no con el clic: si
// `studios.logo_url` no acepta el logo, PasoLogo enseña su error y Tenti no
// celebra lo que no ha pasado.
async function subirLogo(page: Page, filasDelPatch: unknown[]) {
  // Después del arnés: gana la última ruta registrada.
  await page.route('**/storage/v1/object/**', (route) => json(route, { Key: `avatars/logo-${STUDIO_ID}`, Id: 'e2e' }));
  const patches = { n: 0 };
  await page.route('**/rest/v1/studios**', (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patches.n++;
    return json(route, filasDelPatch);
  });
  await expect(page.getByRole('button', { name: 'Elige tu logo' })).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PNG_16, 'base64'),
  });
  return patches;
}

test('Tenti se alegra cuando el logo queda guardado', async ({ page }) => {
  await montarBienvenida(page);
  const patches = await subirLogo(page, [{ id: STUDIO_ID }]);
  await expect(page.locator('canvas[data-tenti]')).toHaveAttribute('data-emocion', 'feliz');
  await expect(page.getByRole('img', { name: 'Logo de Studio Carmen' })).toBeVisible();
  expect(patches.n).toBeGreaterThan(0);
});

test('si el logo no se guarda, Tenti no se alegra', async ({ page }) => {
  await montarBienvenida(page);
  const patches = await subirLogo(page, []);
  // El error es de PasoLogo, y llega después del PATCH: esperarlo es esperar
  // a que la respuesta ya se haya tratado.
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  expect(patches.n).toBeGreaterThan(0);
  await expect(page.locator('canvas[data-tenti]')).not.toHaveAttribute('data-emocion');
  await expect(page.getByRole('img', { name: 'Logo de Studio Carmen' })).toHaveCount(0);
});

// En un iPhone con Safari (≈390×664 de pantalla útil) el yogui iba entre el
// logo y «Montar mi estudio», y sus 104 px más el hueco empujaban el único botón
// por debajo del primer pantallazo. Tenti va en la fila del botón, a 64 px.
// ⚠️ No se mide «el botón cabe en 664 px»: eso depende de cuántas líneas parta
// el texto, y en el CI (Linux) parte una más que en un Mac y el botón quedaba
// 17 px más abajo sin que Tenti tuviera nada que ver. Se mide lo que sí es suyo:
// entre el pie del logo y el botón no hay ningún bloque.
test('en el móvil Tenti va en la fila del botón y no lo empuja hacia abajo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await montarBienvenida(page);
  const boton = page.getByRole('button', { name: 'Montar mi estudio' });
  await expect(boton).toBeVisible({ timeout: 30_000 });
  const tenti = page.locator('canvas[data-tenti]');
  await expect(tenti).toHaveCount(1);
  const caja = await boton.boundingBox();
  const pie = await page.getByText('Sale en tu página de reservas').boundingBox();
  expect(caja).not.toBeNull();
  expect(pie).not.toBeNull();
  expect(caja!.y - (pie!.y + pie!.height)).toBeLessThan(48);
  expect((await tenti.boundingBox())?.width).toBe(64);
  // En la misma fila que el botón: el envoltorio de Tenti es su hermano.
  expect(await tenti.evaluate((c) => {
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Montar mi estudio'));
    return c.parentElement?.parentElement === boton?.parentElement;
  })).toBe(true);
  // Y cuando la fila se ve, saluda (si ya cabía en pantalla, el scroll no hace nada).
  await boton.scrollIntoViewIfNeeded();
  await expect(tenti).toHaveAttribute('data-saludo', '1');
});

// Tenti es adorno: sin canvas 2D (o con el motor lanzando) no queda nada en su
// hueco y la pantalla sigue entera — ni «Algo ha ido mal», ni un botón menos.
test('sin canvas 2D no hay Tenti y la bienvenida sigue entera', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await montarBienvenida(page);
  await expect(page.getByRole('heading', { name: 'Ponle tu logo y ya es tuyo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Elige tu logo' })).toBeVisible();
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Montar mi estudio' }).click();
  await expect(page.getByText('¿Cuántos centros tienes?')).toBeVisible();
});
