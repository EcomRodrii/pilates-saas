import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El Widget Builder del panel (Configuración → API → Widgets para tu web).
//
// El encargo es literal: «cada control debe estar conectado al widget real» —
// así que lo que se comprueba aquí es la CADENA entera dentro del panel:
// control → snippet (el string real que se copia) → vista previa real. La otra
// mitad de la cadena (snippet pegado → widget instalado lo respeta) ya la
// vigila e2e/widget-config-params.spec.ts sobre la página pública.
//
// Mismo andamiaje de panel autenticado con mocks que
// e2e/apariencia-reservar-orden.spec.ts / e2e/aforo-hereda-la-sala.spec.ts.
// ⚠️ Fechas RELATIVAS a hoy, nunca fijas ([[e2e-fecha-fija-cruza-de-mes]]) — y
// sin page.clock: el builder usa debounces reales (guardado, vista previa).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const SLUG = 'pilates-centro';
const STORAGE_KEY = 'sb-example-auth-token';

const TIPOS = [
  { id: 'tc-r', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracion_min: 50 },
  { id: 'tc-m', studio_id: STUDIO_ID, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', duracion_min: 50 },
];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8, color: '#7C6A52' }];
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Ana Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#7C6A52' },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Bea Gil', activo: false, rol: 'INSTRUCTOR', color: '#52607C' },
];

// Mañana a las 10:00 en hora LOCAL (formato sin zona, como los fixtures de
// widget-config-params) — siempre dentro de la rejilla de 7 días del preview.
function mananaA(hora: number): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hora)}:00:00`;
}

// Catálogo público que consume la vista previa del widget embebido
// (PreviewWidgetScript → useDatosWidget → /api/public/studio-data). Con plan
// PUNTUAL activo y sin socia, la hoja de reserva enseña «Reservar por 15 €» —
// la materia prima del toggle «Ocultar precio».
function fixturePublico() {
  return {
    studio: { id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, colorPrimario: '#343825' },
    tiposClase: [
      { id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'p1', studioId: STUDIO_ID, tipo: 'PUNTUAL', activo: true, precio: 15, nombre: 'Clase suelta' }],
    sustitucionesConfirmadas: [],
    sesiones: [
      { id: 's1', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: mananaA(10), fin: mananaA(11), aforoMaximo: 8, cancelada: false },
      { id: 's2', studioId: STUDIO_ID, tipoClaseId: 'tc-m', salaId: 'sala-1', instructorId: 'ins-1', inicio: mananaA(12), fin: mananaA(13), aforoMaximo: 8, cancelada: false },
    ],
    aforoReservas: [], socia: null,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: { widgetBuilder?: Record<string, unknown> } = {}) {
  const studioRow = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825',
    widget_dominios_autorizados: ['https://midominio.com'],
    widget_builder: opts.widgetBuilder ?? {},
  };
  // PATCHes reales que el builder manda al guardar (updateStudio con debounce).
  const patches: Record<string, unknown>[] = [];

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
    // Portapapeles determinista: lo copiado acaba en window.__copiado, para
    // poder afirmar el STRING exacto (nunca los tokens coloreados del
    // resaltador — ese es justo el bug que este test vigila).
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t: string) => { (window as unknown as { __copiado?: string }).__copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/api/oauth/consentimientos**', route => json(route, { apps: [] }));
  await page.route('**/api/public/studio-data**', route => json(route, fixturePublico()));
  await page.route('**/api/public/session**', route => json(route, { error: 'no' }, 404));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
    }
    return json(route, studioRow);
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));

  await page.goto('/configuracion?tab=api');
  await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
  return { patches };
}

const snippet = (page: Page) => page.locator('pre');

test.describe('Widget Builder — cada control conectado al snippet y a la vista previa', () => {

  test('⚠️ sin tocar nada, el snippet no lleva NINGÚN parámetro extra (defaults no se emiten)', async ({ page }) => {
    await montar(page);
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain(`/reservar/${SLUG}?embed=1&tab=clases`);
    for (const nunca of ['tipos=', 'instructoras=', 'salas=', 'vista=', 'ocultar-', 'diseno=', 'marca=', 'fondo=', 'tinta=', 'fuente=', 'fuente-display=']) {
      expect(codigo, `un default emitido (${nunca}) rompe el contrato Momence`).not.toContain(nunca);
    }
  });

  test('elegir un tipo de clase mete tipos=<id> en el snippet, y se persiste en widget_builder', async ({ page }) => {
    const { patches } = await montar(page);
    await page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Reformer' }).click();
    await expect(snippet(page)).toContainText('tipos=tc-r');
    // Y con la instructora activa además, la lista va separada por comas.
    await page.getByRole('group', { name: 'Instructoras' }).getByRole('button', { name: 'Ana Ruiz' }).click();
    await expect(snippet(page)).toContainText('instructoras=ins-1');
    // La inactiva no se ofrece: un filtro por alguien que ya no da clases
    // dejaría el calendario vacío.
    await expect(page.getByRole('group', { name: 'Instructoras' }).getByRole('button', { name: 'Bea Gil' })).toHaveCount(0);
    // El guardado llega con debounce — se espera al PATCH real, no se asume.
    await expect.poll(
      () => patches.some(p => typeof p.widget_builder === 'object' && p.widget_builder !== null
        && JSON.stringify(p.widget_builder).includes('tc-r')),
      { timeout: 10_000 },
    ).toBe(true);
  });

  test('⚠️ Ocultar precio: el snippet gana el atributo Y la vista previa real lo pierde', async ({ page }) => {
    await montar(page);
    await page.getByRole('button', { name: /Calendario embebido \(sin iframe\)/ }).click();

    // Estado de partida: el calendario REAL montado en la vista previa enseña
    // el precio en la hoja de reserva.
    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja = page.getByRole('dialog');
    await expect(hoja.locator('.reserva-cta-btn')).toHaveText(/Reservar por 15 €/);
    await hoja.getByRole('button', { name: 'Cerrar' }).click();
    await expect(hoja).toHaveCount(0);

    await page.getByRole('button', { name: 'Ocultar precio' }).click();
    await expect(snippet(page)).toContainText('data-ocultar-precio');

    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja2 = page.getByRole('dialog');
    await expect(hoja2.locator('.reserva-cta-btn')).toHaveText('Reservar');
    await expect(hoja2).not.toContainText('€');
  });

  test('⚠️ copiar entrega el string EXACTO del snippet, nunca los tokens coloreados', async ({ page }) => {
    await montar(page);
    await page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Mat' }).click();
    const codigo = await snippet(page).textContent();
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    const copiado = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(copiado).toBe(codigo);
    expect(copiado).toContain('tipos=tc-m');
  });

  test('al volver a entrar, la config guardada en widget_builder se restaura entera', async ({ page }) => {
    await montar(page, {
      widgetBuilder: { clases: { vista: 'hoy', tipos: ['tc-r'], ocultarPrecio: true, marca: '#112233' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('vista=hoy');
    expect(codigo).toContain('tipos=tc-r');
    expect(codigo).toContain('ocultar-precio=1');
    expect(codigo).toContain('marca=%23112233');
    // Y los controles reflejan lo restaurado — no solo el texto del snippet.
    await expect(page.getByRole('button', { name: 'Ocultar precio' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Reformer' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('⚠️ tipografía: entra en el snippet (iframe y script), pinta la previa real y se persiste', async ({ page }) => {
    const { patches } = await montar(page);

    // Iframe (Modo A): el nombre viaja como query param CONGELADO — el mismo
    // vocabulario `fuente=`/`fuente-display=` que ya resuelve resolverApariencia.
    await page.getByLabel('Tipografía', { exact: true }).fill('Space Grotesk');
    await page.getByLabel('Tipografía de titulares').fill('Lobster');
    await expect(snippet(page)).toContainText('fuente=Space%20Grotesk');
    await expect(snippet(page)).toContainText('fuente-display=Lobster');

    // Un nombre inválido NO entra en el snippet (misma puerta que el parser).
    await page.getByLabel('Tipografía de titulares').fill('Foo"; }');
    await expect(page.getByText('Solo letras, números y espacios', { exact: false })).toBeVisible();
    await expect(snippet(page)).not.toContainText('fuente-display=');
    await page.getByLabel('Tipografía de titulares').fill('Lobster');

    // Persistencia en widget_builder (debounce real, se espera al PATCH).
    await expect.poll(
      () => patches.some(p => typeof p.widget_builder === 'object' && p.widget_builder !== null
        && JSON.stringify(p.widget_builder).includes('Space Grotesk')),
      { timeout: 10_000 },
    ).toBe(true);

    // Script (Modo B): atributos data-* y la vista previa REAL del panel — la
    // familia computada del calendario montado, no un texto decorativo.
    await page.getByRole('button', { name: /Calendario embebido \(sin iframe\)/ }).click();
    await page.getByLabel('Tipografía', { exact: true }).fill('Space Grotesk');
    await page.getByLabel('Tipografía de titulares').fill('Lobster');
    await expect(snippet(page)).toContainText('data-fuente="Space Grotesk"');
    await expect(snippet(page)).toContainText('data-fuente-display="Lobster"');
    const boton = page.getByRole('button', { name: '10:00 Reformer' });
    await boton.waitFor();
    // El <link> de Google Fonts se inyecta en el documento del panel (igual
    // que hará montarUno en la web real) y la previa computa la familia.
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('link[href*="Space+Grotesk"]').length)).toBe(1);
    const fam = await boton.evaluate(el => getComputedStyle(el.closest('div[style*="--font-ui"]')!).fontFamily);
    expect(fam).toContain('Space Grotesk');
  });

  test('al volver a entrar, la tipografía guardada se restaura (control y snippet)', async ({ page }) => {
    await montar(page, {
      widgetBuilder: { clases: { fuente: 'Space Grotesk', fuenteDisplay: 'Lobster' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('fuente=Space%20Grotesk');
    expect(codigo).toContain('fuente-display=Lobster');
    await expect(page.getByLabel('Tipografía', { exact: true })).toHaveValue('Space Grotesk');
    await expect(page.getByLabel('Tipografía de titulares')).toHaveValue('Lobster');
  });

  test('⚠️ guardar un dominio dispara el registro de wallets (contador real, no fe)', async ({ page }) => {
    const { patches } = await montar(page);
    // Registrada DESPUÉS de montar: en Playwright la última ruta gana, así
    // que esta pisa el catch-all **/api/** para poder CONTAR los intentos —
    // sin contador, este test saldría verde sin haberse pedido nada
    // ([[test-4xx-necesita-contador-de-intentos]]).
    let intentosWallet = 0;
    await page.route('**/api/widget/dominios-wallet', route => {
      intentosWallet++;
      return json(route, { registrados: [] });
    });

    await page.getByRole('button', { name: /Calendario embebido \(sin iframe\)/ }).click();
    await page.getByPlaceholder('midominio.com').fill('otrodominio.com');
    await page.getByRole('button', { name: 'Añadir' }).click();

    // Primero el guardado real del dominio (PATCH a studios)...
    await expect.poll(
      () => patches.some(p => Array.isArray(p.widget_dominios_autorizados)
        && (p.widget_dominios_autorizados as string[]).includes('https://otrodominio.com')),
      { timeout: 10_000 },
    ).toBe(true);
    // ...y detrás, el fire-and-forget que registra el dominio para Apple Pay.
    await expect.poll(() => intentosWallet, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('los widgets que no honran filtros no los ofrecen (nada de UI fake)', async ({ page }) => {
    await montar(page);
    // La tarjeta del selector, no la pestaña «Citas» de Configuración — se
    // distingue por su descripción, que forma parte del nombre accesible.
    await page.getByRole('button', { name: /Para servicios con hora concreta/ }).click();
    await expect(page.getByText('Personaliza apariencia y colores')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tipos de clase' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ocultar precio' })).toHaveCount(0);
    // Pero los colores sí: en Modo A pintan la página embebida entera.
    await expect(page.getByText('Color primario')).toBeVisible();
  });
});
