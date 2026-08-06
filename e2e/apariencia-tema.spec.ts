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
  // `retos` tiene que estar (oculto) para que resembrar con Bloom pueda
  // DESocultarlo: `sembrarBloquesHome` solo reordena bloques que ya existen,
  // así que sin esta fila la aserción "retos queda visible" pasaría vacía
  // (`find()` → undefined, y `undefined?.oculto` ya es falsy).
  { id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos', oculto: true },
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
  // Borrador y PUBLICADO por separado: instalar/actualizar un tema solo toca
  // el borrador, y "Volver a lo publicado" tiene que poder recuperar el otro.
  // Un único array haría pasar esa prueba sin probar nada.
  let bloquesHomeActuales: unknown[] = BLOQUES_HOME_DEFAULT;
  const bloquesHomePublicados: unknown[] = BLOQUES_HOME_DEFAULT;
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pantalla') !== 'home') return json(route, []);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsBloquesHome.push(body);
      bloquesHomeActuales = body;
      return json(route, body);
    }
    return json(route, url.searchParams.get('publicado') === '1' ? bloquesHomePublicados : bloquesHomeActuales);
  });
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
  test('lista los temas de la galería, con el activo marcado "En uso"', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // Los tres temas con paleta propia de la última tanda, y los previos.
    for (const id of ['classic', 'geometric', 'editorial', 'oliva', 'bloom', 'noir']) {
      await expect(filaTema(page, id)).toBeVisible();
    }
    // Sin themeId guardado, el tema resuelto es "classic" → es el que está en uso.
    await expect(filaTema(page, 'classic').getByText('En uso')).toBeVisible();
    await expect(filaTema(page, 'noir').getByText('En uso')).toHaveCount(0);
  });

  test('"Tu tema" muestra el tema instalado con su versión', async ({ page }) => {
    await montar(page, { themeId: 'editorial', themeVersion: 1 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('"Usar" en un tema lo guarda en el borrador con sus defaults', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // "Usar" solo aparece en los temas que NO están en uso.
    const usarGeometrico = filaTema(page, 'geometric').getByRole('button', { name: 'Usar' });
    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      usarGeometrico.click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('geometric');
    expect(body.themeVersion).toBe(1);
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
    expect(body.cardStyle).toBe('flat');
    expect(body.radioTema).toEqual({ card: 24, boton: 18, chip: 999 });
    // Noir es el ÚNICO con accesos en círculo, y su barra lleva las 4
    // etiquetas pero SIN relleno (su icono activo es dorado, no macizo).
    // Noir NO lleva titular grande — ése solo lo tiene Bloom en el prototipo.
    expect(body.variantes).toEqual({ cabeceraInicio: 'nombre', accesosRapidos: 'circulos', barra: 'todas', tarjetaPrincipal: 'rotulada', bienvenida: 'marca' });
    expect(body.themeVersion).toBe(4);
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
    expect(body.themeVersion).toBe(4);
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
    expect(body.themeVersion).toBe(4);
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

  // ── Actualizar a una versión nueva del tema instalado ────────────────────
  // `defaults` no es retroactivo: quien instaló Bloom v2 se quedó con esos
  // valores congelados en el borrador. Antes no había botón para salir de ahí
  // (la fila de la biblioteca solo pinta "Usar" si el tema NO está en uso), y
  // el único rodeo era instalar otro tema y volver.

  const avisoVersion = (page: Page) => page.locator('[data-aviso="version-nueva"]');

  test('un tema instalado en versión vieja ofrece actualizar', async ({ page }) => {
    await montar(page, { themeId: 'bloom', themeVersion: 2 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await expect(avisoVersion(page)).toBeVisible();
    await expect(avisoVersion(page).getByText('Hay una versión nueva de Bloom (v3)')).toBeVisible();
    await expect(avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' })).toBeVisible();
  });

  test('actualizar manda los defaults de la versión nueva y limpia "personalizado"', async ({ page }) => {
    const { puts } = await montar(page, { themeId: 'bloom', themeVersion: 2, themeCustomized: true, primary: '#000000' });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/theme') && r.request().method() === 'PUT'),
      avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('bloom');
    expect(body.themeVersion).toBe(3);
    // El color que la propietaria había tocado a mano vuelve al del tema —
    // decisión explícita: se ofrece siempre, avisando, en vez de dejar sin
    // salida al estudio que personalizó.
    expect(body.primary).toBe('#7C5CFC');
    expect(body.themeCustomized).toBe(false);

    // Y lo que ve la propietaria después: el aviso desaparece, la versión sube
    // y el cambio queda pendiente de publicar (no se le ha publicado nada a
    // las socias por pulsar "Actualizar").
    await expect(avisoVersion(page)).toHaveCount(0);
    await expect(page.getByText('v3').first()).toBeVisible();
    await expect(page.getByText(/sin publicar/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver a lo publicado' })).toBeVisible();
  });

  test('actualizar resiembra los bloques del Inicio del tema', async ({ page }) => {
    // El caso que motiva la feature: Bloom v3 añadió el bloque `retos`, que un
    // estudio con v2 instalada no tenía. Actualizar solo la config lo dejaría
    // fuera y la actualización sería a medias.
    const { putsBloquesHome } = await montar(page, { themeId: 'bloom', themeVersion: 2 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques') && r.url().includes('pantalla=home') && r.request().method() === 'PUT'),
      avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' }).click(),
    ]);

    const body = putsBloquesHome.at(-1) as Array<Record<string, unknown>>;
    expect(body.find((b) => b.sistemaId === 'retos')?.oculto).toBeFalsy();
    // Y el contenido de la propietaria sigue intacto, igual que al instalar.
    expect(body.some((b) => b.kind === 'texto' && b.id === 'b-texto-1')).toBe(true);
  });

  test('un tema personalizado también puede actualizar, pero avisa de lo que pierde', async ({ page }) => {
    await montar(page, { themeId: 'bloom', themeVersion: 2, themeCustomized: true });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await expect(avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' })).toBeVisible();
    await expect(avisoVersion(page).getByText(/se pierden los retoques/)).toBeVisible();
  });

  test('"Volver a lo publicado" devuelve también los bloques del Inicio', async ({ page }) => {
    // Actualizar resiembra el Inicio, así que deshacer solo el ThemeConfig
    // dejaba a la propietaria con su tema de siempre y el Inicio del tema que
    // había probado.
    const { putsBloquesHome } = await montar(page, { themeId: 'bloom', themeVersion: 2 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques') && r.request().method() === 'PUT'),
      avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' }).click(),
    ]);
    // El Inicio quedó con el orden de Bloom: retos visible, estaSemana fuera.
    const trasActualizar = putsBloquesHome.at(-1) as Array<Record<string, unknown>>;
    expect(trasActualizar.find((b) => b.sistemaId === 'retos')?.oculto).toBe(false);
    expect(trasActualizar.find((b) => b.sistemaId === 'estaSemana')?.oculto).toBe(true);

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques') && r.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Volver a lo publicado' }).click(),
    ]);

    // Y ahora vuelve EXACTAMENTE lo publicado, no un resembrado.
    const trasVolver = putsBloquesHome.at(-1);
    expect(trasVolver).toEqual(BLOQUES_HOME_DEFAULT);
  });

  test('"Volver a lo publicado" conserva el "personalizado" que estaba publicado', async ({ page }) => {
    // `elegirTema` fuerza themeCustomized:false (correcto al instalar, el tema
    // queda puro). Al revertir es un dato más que restaurar: si lo publicado
    // estaba personalizado, tiene que seguir diciéndolo.
    const { puts } = await montar(page, { themeId: 'bloom', themeVersion: 2, themeCustomized: true });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/theme') && r.request().method() === 'PUT'),
      avisoVersion(page).getByRole('button', { name: 'Actualizar a v3' }).click(),
    ]);
    expect(puts.at(-1)!.themeCustomized).toBe(false);

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/theme') && r.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Volver a lo publicado' }).click(),
    ]);
    expect(puts.at(-1)!.themeCustomized).toBe(true);
    expect(puts.at(-1)!.themeVersion).toBe(2);
  });

  test('un tema ya al día no ofrece actualizar', async ({ page }) => {
    await montar(page, { themeId: 'bloom', themeVersion: 3 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(avisoVersion(page)).toHaveCount(0);
  });

  test('una versión instalada por DELANTE del catálogo no ofrece "actualizar" hacia atrás', async ({ page }) => {
    // Un despliegue revertido deja el catálogo por debajo de lo instalado.
    // Comparar con `!==` anunciaría una regresión como si fuera una mejora.
    await montar(page, { themeId: 'bloom', themeVersion: 9 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(avisoVersion(page)).toHaveCount(0);
  });

  test('"Personalizar" lleva al editor', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Personalizar' }).first().click();
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/);
  });
});
