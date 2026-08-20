import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Biblioteca de temas (/configuracion/apariencia) — la pantalla de llegada de
// Apariencia, donde se elige el tema viéndolo pintado. Antes esto era la
// categoría "Tema" dentro del editor; al mudarse a su propia pantalla, estas
// pruebas se mudaron con ella (el editor ya no duplica la galería).
//
// No se puede verificar en el preview de Vercel de la PR (Turnstile bloquea el
// login en *.vercel.app — ver README), así que la verificación pasa por aquí,
// mockeando red con page.route (mismo patrón que apariencia-boton-tarjeta).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const BLOQUES_HOME_DEFAULT = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
  { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
  { id: 'sistema-tiraSemana', kind: 'sistema', sistemaId: 'tiraSemana', oculto: true },
  { id: 'sistema-progresoSemanal', kind: 'sistema', sistemaId: 'progresoSemanal', oculto: true },
  // Bloque del catálogo ya añadido por la propietaria — tiene que sobrevivir
  // a instalar un tema nuevo.
  { id: 'b-texto-1', kind: 'texto', config: { titulo: 'Bienvenidas', texto: 'x' } },
];

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
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

  const puts: Record<string, unknown>[] = [];
  const putsBloquesHome: unknown[][] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      puts.push(body);
      return json(route, resolveTheme(body));
    }
    return json(route, themeResuelto);
  });
  let bloquesHomeActuales: unknown[] = BLOQUES_HOME_DEFAULT;
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    // El editor pide las tres de una vez al abrir. Este test solo modela
    // `home`; las otras dos van vacías, como antes.
    if (url.searchParams.get('pantalla') === 'todas') {
      return json(route, { home: bloquesHomeActuales, clases: [], bonos: [], reservar: [] });
    }
    if (url.searchParams.get('pantalla') !== 'home') return json(route, []);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsBloquesHome.push(body);
      bloquesHomeActuales = body;
      return json(route, body);
    }
    return json(route, bloquesHomeActuales);
  });
  // Las miniaturas son iframes del portal real y necesitan token. Sin este
  // mock caen en el `**/api/**` genérico, que devuelve `{}` — y sin token la
  // miniatura pinta su hueco gris, que es justo lo que NO se quiere probar.
  await page.route('**/api/theme/home-preview-token**', route => json(route, { token: 'token-e2e' }));
  // Y el contenido de las miniaturas se stubea: seis iframes renderizando el
  // portal de verdad contra `next dev` atascan la página entera — tumbaba
  // incluso el test de navegación de "Personalizar", que no toca miniaturas.
  // Lo que se prueba aquí es el ARMAZÓN (que hay un iframe por fila, al portal
  // de ese estudio y sin interacción); que el portal renderice bien es cosa de
  // los e2e del portal.
  await page.route('**/portal-preview/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>preview</body></html>' }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  return { puts, putsBloquesHome };
}

/** La fila de un tema dentro de la tarjeta "Biblioteca de temas". */
function filaTema(page: Page, id: string) {
  return page.locator(`[data-tema="${id}"]`);
}

test.describe('Biblioteca de temas', () => {
  // La miniatura pasa a ser el portal REAL en pequeño (ThemeThumbVivo), no un
  // dibujo a mano. El dibujo reflejaba color, accesos y barra — pero NO la
  // cabecera, ni la tarjeta principal, ni `bloquesHome`, que es justo lo que
  // separa un tema de una paleta.
  test('cada tema enseña el portal de verdad, con los bloques que ESE tema dejaría', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // Un iframe por fila, apuntando al portal real del estudio.
    // La miniatura no se monta hasta que se ve (IntersectionObserver): sin
    // acercar la fila, el test comprueba un iframe que a propósito no existe.
    await filaTema(page, 'oliva').scrollIntoViewIfNeeded();
    const marcoOliva = filaTema(page, 'oliva').locator('iframe');
    await expect(marcoOliva).toHaveCount(1);
    await expect(marcoOliva).toHaveAttribute('src', /\/portal-preview\/studio-carmen/);

    // No se navega dentro de una miniatura de 96 px.
    await expect(marcoOliva).toHaveCSS('pointer-events', 'none');
  });

  test('lista los temas de la galería, con el activo marcado "En uso"', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // Tentada (el predeterminado), el tema de siempre, los tres de diseño y
    // Sereno. Ni uno más: 'geometric' y 'editorial' se retiraron.
    for (const id of ['tentada', 'classic', 'oliva', 'bloom', 'noir', 'sereno']) {
      await expect(filaTema(page, id)).toBeVisible();
    }
    for (const id of ['geometric', 'editorial']) {
      await expect(filaTema(page, id)).toHaveCount(0);
    }
    // ⚠️ Sin themeId guardado el tema en uso sigue siendo "classic", NO Tentada.
    // Que Tentada sea "el predeterminado" significa que abre la biblioteca y que
    // resuelve el portal del kit cuando no hay ninguno — no que se aplique sola
    // a un estudio que ya tiene el suyo. Este assert es lo que impide que se
    // convierta en retroactiva por descuido.
    await expect(filaTema(page, 'classic').getByText('En uso')).toBeVisible();
    await expect(filaTema(page, 'tentada').getByText('En uso')).toHaveCount(0);
    await expect(filaTema(page, 'noir').getByText('En uso')).toHaveCount(0);
  });

  test('"Tu tema" muestra el tema instalado con su versión', async ({ page }) => {
    await montar(page, { themeId: 'oliva', themeVersion: 1 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('"Usar" en un tema lo guarda en el borrador con sus defaults', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // "Usar" solo aparece en los temas que NO están en uso.
    const usarOliva = filaTema(page, 'oliva').getByRole('button', { name: 'Usar' });
    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      usarOliva.click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('oliva');
    expect(body.themeVersion).toBe(5);
    expect(body.portalHeadingFontId).toBe('outfit');
    expect(body.themeCustomized).toBe(false);
  });

  test('"Usar" en Noir manda su paleta, la barra oscura y el acento destacado', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'noir').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('noir');
    expect(body.barraOscura).toBe(true);
    expect(body.barraClasica).toBe(true);
    expect(body.primary).toBe('#1E2B22');
    expect(body.secondary).toBe('#A9B79B');
    expect(body.destacado).toBe('#D9B166');
    // Noir con sombra: lo dice la tabla del encargo (HANDOFF-temas §1). Estaba
    // en `flat` por una lectura del prototipo que la contradecía.
    expect(body.cardStyle).toBe('elevated');
    expect(body.radioTema).toEqual({ card: 24, boton: 18, chip: 999 });
    // Noir es el ÚNICO con accesos en círculo, y su barra lleva las 4
    // etiquetas pero SIN relleno (su icono activo es dorado, no macizo).
    // Noir NO lleva titular grande — ése solo lo tiene Bloom en el prototipo.
    expect(body.variantes).toEqual({ cabeceraInicio: 'nombre', accesosRapidos: 'circulos', barra: 'todas', tarjetaPrincipal: 'rotulada', bienvenida: 'marca' });
    // ⚠️ La versión se afirma en DOS sitios (aquí y en theme-definitions.test.ts)
    // y al subirlas por `escalaTexto` solo actualicé el unitario. Noir va una
    // por delante desde que su cardStyle pasó a `elevated`. `defaults` no es
    // retroactivo: subir la versión es lo que hace que el cambio llegue a quien
    // ya lo tenga instalado.
    expect(body.themeVersion).toBe(6);
  });

  test('"Usar" en Bloom manda la barra flotante y el radio de la tarjeta', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'bloom').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('bloom');
    expect(body.barraFlotante).toBe(true);
    expect(body.barraClasica).toBeFalsy(); // sigue flotando — el prototipo solo hace clásica Oliva/Noir
    expect(body.destacado).toBe('#FF8FB1');
    expect(body.cardStyle).toBe('elevated');
    expect(body.radioTema).toEqual({ card: 30, boton: 999, chip: 999, acceso: 22 });
    // Bloom conserva la píldora flotante → NO declara `barra`: su etiqueta
    // sigue apareciendo solo en la activa (`conTexto: !tabPill || activo`).
    const variantesBloom = body.variantes as Record<string, string>;
    expect(variantesBloom.barra).toBeUndefined();
    expect(variantesBloom.retos).toBe('color');
    expect(body.themeVersion).toBe(5);
  });

  test('"Usar" en Sereno manda la tinta de marca, el malva destacado y la barra flotante', async ({ page }) => {
    // La prueba de que Sereno pasa por el Theme Builder EXISTENTE: se elige de
    // la misma biblioteca, se guarda en el mismo borrador y con el mismo PUT
    // que los otros cuatro. Si algún día hiciera falta un camino propio, este
    // test dejaría de tener sentido — y ese es justo el aviso.
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'sereno').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('sereno');
    // La marca es la TINTA y el malva es el destacado, no al revés.
    expect(body.primary).toBe('#221F1C');
    expect(body.destacado).toBe('#8A6478');
    expect(body.fontId).toBe('figtree');
    expect(body.portalHeadingFontId).toBe('libreCaslon');
    expect(body.barraFlotante).toBe(true);
    expect(body.barraClasica).toBeFalsy();
    expect(body.cardStyle).toBe('elevated');
    expect(body.radioTema).toEqual({ card: 22, boton: 16, chip: 999, acceso: 18 });
    // Las cuatro pestañas con etiqueta — a diferencia de Bloom, que hereda
    // «solo la activa» por no declarar el eje.
    expect((body.variantes as Record<string, string>).barra).toBe('todas');
    expect(body.themeVersion).toBe(1);
  });

  test('"Usar" en Oliva manda su radio de tarjeta/botón y la barra clásica', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'oliva').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('oliva');
    expect(body.barraClasica).toBe(true);
    expect(body.barraOscura).toBeFalsy(); // clásica, no oscura — esa es solo de Noir
    expect(body.cardStyle).toBe('flat');
    expect(body.radioTema).toEqual({ card: 26, boton: 20, chip: 999, acceso: 20 });
    expect(body.variantes).toEqual({ cabeceraInicio: 'saludo', accesosRapidos: 'rejilla', barra: 'todasRelleno', tarjetaPrincipal: 'rotulada', bienvenida: 'foto' });
    expect(body.themeVersion).toBe(5);
  });

  test('"Usar" en Oliva siembra el Inicio: tiraSemana visible, estaSemana/invitarAmiga ocultos, catálogo intacto', async ({ page }) => {
    const { putsBloquesHome } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // waitForResponse, no waitForRequest: el evento "request" puede llegar
    // ANTES de que nuestro propio handler de page.route (que hace el
    // putsBloquesHome.push) termine de ejecutarse — carrera real, vista en
    // vivo (waitForRequest resolvía con el array todavía vacío). La
    // respuesta solo llega DESPUÉS de que route.fulfill() corra, así que
    // esperar a la respuesta garantiza que el push ya sucedió.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques') && r.url().includes('pantalla=home') && r.request().method() === 'PUT'),
      filaTema(page, 'oliva').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = putsBloquesHome.at(-1) as Array<Record<string, unknown>>;
    const porId = (id: string) => body.find((b) => b.sistemaId === id);
    expect(porId('accesosRapidos')?.oculto).toBeFalsy();
    expect(porId('tiraSemana')?.oculto).toBeFalsy();
    expect(porId('contenidoEstudio')?.oculto).toBeFalsy();
    expect(porId('estaSemana')?.oculto).toBe(true);
    expect(porId('invitarAmiga')?.oculto).toBe(true);
    expect(porId('progresoSemanal')?.oculto).toBe(true); // Oliva no lo pide
    // El bloque del catálogo que ya tenía la propietaria sigue ahí.
    expect(body.some((b) => b.kind === 'texto' && b.id === 'b-texto-1')).toBe(true);
  });

  // ⚠️ "Personalizar" era un Link FIJO a la ruta del editor, SIN el id del
  // tema de su fila: pulsaras el que pulsaras, entrabas con TU tema. Por eso
  // Oliva, Bloom y Noir parecían el mismo tema — nunca llegabas a verlos.
  test('"Personalizar" en un tema que NO tienes lo instala y abre el editor', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    const fila = filaTema(page, 'noir');
    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      fila.getByRole('button', { name: 'Personalizar' }).click(),
    ]);

    // Se instala EL DE SU FILA, no el que ya tenías.
    expect(puts.at(-1)!.themeId).toBe('noir');
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/, { timeout: 15_000 });
  });

  test('"Personalizar" del tema EN USO sigue siendo un enlace directo, sin reinstalar', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });
    // Sin themeId guardado el tema en uso es "classic".
    await filaTema(page, 'classic').getByRole('link', { name: 'Personalizar' }).click();
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/, { timeout: 15_000 });
    // Reinstalarlo pisaría los ajustes finos que la propietaria ya tuviera.
    expect(puts).toHaveLength(0);
  });

  test('"Personalizar" (arriba, Tu tema) lleva al editor', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Personalizar' }).first().click();
    // Timeout explícito, como los toBeVisible de arriba: el webServer es
    // `next dev`, así que la PRIMERA navegación a /editor tiene que compilar la
    // ruta bajo demanda y eso se come de sobra los 5s por defecto de
    // toHaveURL. En CI no se veía porque `retries: 1` reintentaba con la ruta
    // ya compilada; en local, sin reintento, fallaba 2 de cada 3 veces.
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/, { timeout: 30_000 });
  });
});
