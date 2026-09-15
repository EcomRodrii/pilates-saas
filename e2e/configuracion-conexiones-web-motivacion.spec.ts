import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Conexiones», «Mi app y mi web» y «Motivación» en filas con su valor (15-sep, v2).
//
// Conexiones eran tarjetas de un catálogo con una pastilla y una frase debajo
// que podían contradecirse; Motivación se guardaba al salir de cada campo y
// estaba entera detrás de un bloqueo de plan. Lo que se fija aquí:
//   · cada conexión con UN estado, agrupadas: con problemas arriba, luego
//     conectadas y sin conectar, a 375 y a 1024 y sin salirse de lado;
//   · la dirección de tu página en su fila, con «Copiar» que solo dice
//     «Copiado» si el portapapeles lo tiene (#994), y su cajón;
//   · Network se guarda al tocarlo y vuelve atrás si el servidor dice que no,
//     contando que SÍ se intentó y que solo viajó su columna;
//   · los créditos no se escriben al salir del campo sino con «Guardar», y si
//     el servidor dice que no el cajón se queda abierto con lo escrito;
//   · el plan va en la pastilla de la fila, no tapando la sección;
//   · ocultar tu página (16-sep): la fila con su valor, un cajón que confirma la
//     consecuencia antes de escribir y que, con un 500, se queda con el error;
//   · escribir un número en una acción de créditos apagada la enciende (16-sep).
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', nif: 'B12345674', iva_por_defecto: 21,
  zoom_email: 'estudio@example.com', google_calendar_email: null, klaviyo_account_name: null,
  visible_en_network: false, creditos_nombre: null, creditos_caducan_meses: null, racha_clases_semana: null,
};

const integracion = (tipo: string, extra: Record<string, unknown>) => ({
  id: `intg-${tipo.toLowerCase()}`, studio_id: STUDIO_ID, tipo, activo: true, actualizado_en: '2026-08-01T10:00:00Z',
  ultimo_ok_en: null, ultimo_error: null, ultimo_error_en: null, ...extra,
});

// Kisi falló la última vez; Mailchimp funciona; Zoom, conectado por su cuenta.
const INTEGRACIONES = [
  integracion('KISI', { ultimo_error: 'Invalid API key', ultimo_error_en: '2026-08-20T10:00:00Z' }),
  integracion('MAILCHIMP', { ultimo_ok_en: '2026-08-18T10:00:00Z' }),
];

const REGLAS = [{
  id: 'rwr-1', studio_id: STUDIO_ID, trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir a clase', descripcion: null,
  creditos: 10, activa: true, tope_mensual: null, unidad_euros: null, creado_en: '2026-01-01T00:00:00Z',
}];

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: {
  fila?: Record<string, unknown>;
  fallo?: 500;
  falloReglas?: 500;
  falloPagina?: 500;
} = {}) {
  const patches: Record<string, unknown>[] = [];
  const reglas: { metodo: string; cuerpo: unknown }[] = [];
  const puts: { oculta: boolean; clave?: string }[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, { ...FILA, ...opts.fila });
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/rest/v1/integraciones**', r => json(r, INTEGRACIONES));
  await page.route('**/rest/v1/reward_rules**', r => {
    if (r.request().method() === 'GET') return json(r, REGLAS);
    reglas.push({ metodo: r.request().method(), cuerpo: r.request().postDataJSON() });
    if (opts.falloReglas === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: 'rwr-nueva' }]);
  });
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
  await page.route(u => u.pathname === '/api/integrations/config', r => json(r, { config: { apiKey: 'kisi_example' } }));
  await page.route(u => u.pathname === '/api/pagina-publica', r => {
    if (r.request().method() === 'GET') return json(r, { oculta: false, tieneClave: false });
    const cuerpo = r.request().postDataJSON() as { oculta: boolean; clave?: string };
    puts.push(cuerpo);
    if (opts.falloPagina === 500) return json(r, { error: 'No se ha podido cambiar la visibilidad de la página. Vuelve a intentarlo.' }, 500);
    return json(r, { oculta: cuerpo.oculta, tieneClave: cuerpo.clave === undefined ? undefined : cuerpo.clave !== '' });
  });
  await ir(page, ruta);
  return { patches, reglas, puts };
}

const valor = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
// El id va en el botón de la fila si abre su cajón, o en la fila si lleva su acción.
const estado = (page: Page, id: string) => page.locator(`[id="${id}"] [data-estado-ajuste]`);
const cajon = (page: Page) => page.getByRole('dialog').first();
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const grupos = (page: Page) => page.locator('[data-tour="configuracion-vista"] section > h3').allTextContents();

const VISTAS = [
  { nombre: 'móvil 375×812', ancho: 375, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  { nombre: 'escritorio 1024×768', ancho: 1024, use: { viewport: { width: 1024, height: 768 } } },
] as const;

for (const vista of VISTAS) {
  test.describe(`Conexiones, web y motivación en ${vista.nombre}`, () => {
    test.use(vista.use);

    test('Conexiones: un estado por fila, agrupadas por cómo están, y la conectada abre su cajón', async ({ page }) => {
      await abrir(page, 'configuracion?tab=conexiones');
      await expect(estado(page, 'integracion-kisi')).toHaveText('Con problemas', { timeout: 30_000 });
      await expect(valor(page, 'integracion-kisi')).toHaveText(/^Falló el 20 ago.*: Invalid API key$/);
      await expect(estado(page, 'integracion-zoom')).toHaveText('Conectado');
      await expect(valor(page, 'integracion-zoom')).toHaveText('estudio@example.com');
      await expect(estado(page, 'integracion-mailchimp')).toHaveText('Conectado');
      await expect(valor(page, 'integracion-mailchimp')).toHaveText(/^Funciona · última vez el 18 ago/);
      await expect(estado(page, 'integracion-zapier')).toHaveText('Sin conectar');
      // Sin la clave de su app en el servidor, no hay nada que conectar: ese es su estado.
      for (const id of ['integracion-google_calendar', 'integracion-klaviyo']) {
        await expect(estado(page, id)).toHaveText(/^(Sin conectar|No disponible todavía)$/);
      }
      // UN estado por fila, nunca la pareja «No conectado» + «Todavía no disponible».
      for (const id of ['integracion-google_calendar', 'integracion-zoom', 'integracion-kisi', 'integracion-klaviyo', 'integracion-mailchimp', 'integracion-zapier']) {
        await expect(estado(page, id), id).toHaveCount(1);
      }
      await expect(page.getByText('No conectado', { exact: true })).toHaveCount(0);
      const titulos = await grupos(page);
      expect(titulos.slice(0, 3)).toEqual(['Con problemas', 'Conectadas', 'Sin conectar']);
      expect(titulos).toContain('Quién puede ver tus datos');
      await expect(valor(page, 'aplicaciones-con-acceso')).toHaveText('Ninguna app tiene acceso');
      // Stripe, WhatsApp y Gmail no se repiten: una fila lleva a su sección.
      await expect(page.locator('#fila-a-cobros')).toHaveAttribute('href', '/configuracion?tab=cobros#integracion-stripe');
      await expect(page.locator('#integracion-stripe')).toHaveCount(0);
      expect(await desborde(page), 'Conexiones se sale de lado').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`conexiones-${vista.ancho}.png`), fullPage: true });

      await page.locator('#integracion-zoom').click();
      await expect(titulo(page, 'Zoom')).toBeFocused();
      await expect(cajon(page).getByText('Conectado con estudio@example.com.')).toBeVisible();
      await expect(cajon(page).getByRole('button', { name: 'Probar conexión' })).toBeVisible();
      await expect(cajon(page).getByRole('button', { name: 'Desconectar Zoom' })).toBeVisible();
    });

    test('Mi app y mi web: la dirección corta con «Copiar», Network como un sí/no y las herramientas', async ({ page }) => {
      await abrir(page, 'configuracion?tab=web');
      // El botón de la fila (con el id) ocupa el fondo; el valor va a su lado, no dentro.
      await expect(page.locator('li:has(> #direccion-y-enlaces) [data-resumen]')).toHaveText(/\/reservar\/pilates-centro$/, { timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Copiar el enlace de tu página' })).toBeVisible();
      await expect(valor(page, 'pagina-publica')).toHaveText('Visible para todo el mundo');
      await expect(page.getByRole('switch', { name: 'Aparecer en Tentare Network' })).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('#fila-herramienta-contenido-de-tu-app')).toBeVisible();
      await expect(page.locator('#fila-herramienta-widgets')).toBeVisible();
      expect(await desborde(page), 'Mi app y mi web se sale de lado').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`web-${vista.ancho}.png`), fullPage: true });

      await page.locator('#direccion-y-enlaces').click();
      await expect(titulo(page, 'Dirección y enlaces')).toBeFocused();
      await expect(cajon(page).getByRole('textbox', { name: 'Dirección de tu página de reservas' })).toHaveValue('pilates-centro');
      await expect(cajon(page).getByText('Página de reservas', { exact: true })).toBeVisible();
      await expect(cajon(page).getByText('App de tus alumnas', { exact: true })).toBeVisible();
      await expect(guardar(page), 'sin cambios, ni barra ni «Guardar» gris').toHaveCount(0);
    });

    test('Motivación: el plan en la pastilla de cada fila y los créditos con su valor', async ({ page }) => {
      await abrir(page, 'configuracion?tab=motivacion');
      await expect(valor(page, 'reglas')).toHaveText('Se llaman créditos · no caducan · racha de 1 clase por semana', { timeout: 30_000 });
      await expect(valor(page, 'creditos-por-accion')).toHaveText('1 de 7 dan créditos · 10 por asistir');
      await expect(page.locator('[data-estado-ajuste]').filter({ hasText: 'Incluido en tu plan' })).toHaveCount(3);
      await expect(page.locator('#fila-herramienta-recompensas-y-logros')).toBeVisible();
      // Los canjes son trabajo: van en la bandeja de Inicio, no aquí.
      await expect(page.getByText('Canjes pendientes')).toHaveCount(0);
      expect(await desborde(page), 'Motivación se sale de lado').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`motivacion-${vista.ancho}.png`), fullPage: true });

      await page.locator('#creditos-por-accion').click();
      await expect(titulo(page, 'Créditos por acción')).toBeFocused();
      // Sin regla guardada no se da ningún crédito: sale apagada.
      await expect(cajon(page).getByRole('switch', { name: 'Asistir a clase' })).toHaveAttribute('aria-checked', 'true');
      await expect(cajon(page).getByRole('switch', { name: 'Renovar plan' })).toHaveAttribute('aria-checked', 'false');
    });
  });
}

test.describe('Guardar de verdad', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('Network se guarda al tocarlo y, si el servidor dice que no, vuelve atrás con solo su columna', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=web', { fallo: 500 });
    const interruptor = page.getByRole('switch', { name: 'Aparecer en Tentare Network' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
    await expect(interruptor).toBeEnabled();

    await interruptor.click();
    await expect(page.locator('#network').getByRole('alert')).toHaveText(/^No se ha guardado: .+\.$/, { timeout: 10_000 });
    // «No mintió» también sería verdad si nunca se hubiera intentado.
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(patches[0]).toEqual({ visible_en_network: true });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  });

  test('los créditos no se guardan al salir del campo; con «Guardar» y un 500, el cajón se queda con lo escrito', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=motivacion', { fallo: 500 });
    await expect(valor(page, 'reglas')).toHaveText(/^Se llaman créditos/, { timeout: 30_000 });
    await page.locator('#reglas').click();
    await expect(titulo(page, 'Cómo funcionan tus créditos')).toBeFocused();

    const nombre = page.getByRole('textbox', { name: 'Nombre de tus créditos' });
    await nombre.fill('puntos');
    await nombre.blur();
    await page.waitForTimeout(300);
    expect(patches, 'salir del campo no escribe').toHaveLength(0);
    await expect(cajon(page).locator('[data-consecuencia]')).toHaveText('Así queda: Se llaman puntos · no caducan · racha de 1 clase por semana.');

    await guardar(page).click();
    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/, { timeout: 10_000 });
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    // Solo la columna que cambió (#2027).
    expect(patches[0]).toEqual({ creditos_nombre: 'puntos' });
    await expect(nombre).toHaveValue('puntos');
    await expect(page.getByText('Créditos guardados')).toHaveCount(0);
    await expect(valor(page, 'reglas')).toHaveText(/^Se llaman créditos/);
  });

  test('encender una acción sin regla la crea con su cifra, con UNA escritura', async ({ page }) => {
    const { reglas } = await abrir(page, 'configuracion?tab=motivacion#creditos-por-accion');
    await expect(titulo(page, 'Créditos por acción')).toBeVisible({ timeout: 30_000 });
    await cajon(page).getByRole('switch', { name: 'Renovar plan' }).click();
    await expect(cajon(page).locator('[data-consecuencia]')).toHaveText('Así queda: 2 de 7 dan créditos · 10 por asistir.');
    await guardar(page).click();

    await expect(page.getByText('Créditos por acción guardados')).toBeVisible({ timeout: 10_000 });
    expect(reglas).toHaveLength(1);
    expect(reglas[0].metodo).toBe('POST');
    expect(reglas[0].cuerpo).toMatchObject({ trigger: 'RENOVACION_PLAN', creditos: 40, activa: true });
  });

  test('escribir un número en una acción apagada la enciende, a la vista, y se guarda encendida', async ({ page }) => {
    const { reglas } = await abrir(page, 'configuracion?tab=motivacion#creditos-por-accion');
    await expect(titulo(page, 'Créditos por acción')).toBeVisible({ timeout: 30_000 });
    const interruptor = cajon(page).getByRole('switch', { name: 'Renovar plan' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');

    await cajon(page).getByRole('spinbutton', { name: 'Créditos por Renovar plan' }).fill('10');
    // Antes de guardar: lo que se ve encendido es lo que se va a guardar.
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(cajon(page).locator('[data-consecuencia]')).toHaveText('Así queda: 2 de 7 dan créditos · 10 por asistir.');
    expect(reglas, 'escribir no guarda nada').toHaveLength(0);

    await guardar(page).click();
    await expect(page.getByText('Créditos por acción guardados')).toBeVisible({ timeout: 10_000 });
    expect(reglas.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(reglas).toHaveLength(1);
    expect(reglas[0].metodo).toBe('POST');
    expect(reglas[0].cuerpo).toMatchObject({ trigger: 'RENOVACION_PLAN', creditos: 10, activa: true });
  });

  test('ocultar tu página: la fila dice cómo está, se confirma con la consecuencia y, con un 500, el cajón se queda con el error', async ({ page }) => {
    const { puts } = await abrir(page, 'configuracion?tab=web', { falloPagina: 500 });
    await expect(valor(page, 'pagina-publica')).toHaveText('Visible para todo el mundo', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('pagina-publica-fila-375.png') });

    await page.locator('#pagina-publica').click();
    await expect(titulo(page, 'Ocultar tu página')).toBeFocused();
    await expect(cajon(page).getByRole('radio', { name: /^Visible/ })).toBeChecked();
    await expect(guardar(page), 'sin cambios, sin «Guardar»').toHaveCount(0);
    await cajon(page).getByRole('radio', { name: /^Oculta/ }).check();
    await expect(cajon(page).getByLabel('Clave para dejar entrar (opcional)')).toBeVisible();
    // Las opciones llevan `transition-colors` (150 ms): sin esperar, la captura sale a medio cambiar.
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath('pagina-publica-cajon-375.png') });

    await guardar(page).click();
    const confirmacion = page.getByRole('dialog').filter({ hasText: '¿Ocultar tu página?' });
    await expect(confirmacion).toContainText('la app de tus alumnas');
    expect(puts, 'sin confirmar no se escribe').toHaveLength(0);
    await confirmacion.getByRole('button', { name: 'Ocultar', exact: true }).click();

    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/, { timeout: 10_000 });
    // «No mintió» también sería verdad si nunca se hubiera intentado.
    expect(puts.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(puts[0]).toEqual({ oculta: true });
    await expect(titulo(page, 'Ocultar tu página')).toBeVisible();
    await expect(cajon(page).getByRole('radio', { name: /^Oculta/ })).toBeChecked();
    await expect(page.getByText('Tu página ya no se ve.')).toHaveCount(0);
    await expect(valor(page, 'pagina-publica')).toHaveText('Visible para todo el mundo');
  });

  test('ocultar tu página con clave: con la respuesta del servidor se cierra y la fila lo dice', async ({ page }) => {
    const { puts } = await abrir(page, 'configuracion?tab=web#pagina-publica');
    await expect(titulo(page, 'Ocultar tu página')).toBeVisible({ timeout: 30_000 });
    await cajon(page).getByRole('radio', { name: /^Oculta/ }).check();
    await cajon(page).getByLabel('Clave para dejar entrar (opcional)').fill('clave-e2e');
    await guardar(page).click();
    const confirmacion = page.getByRole('dialog').filter({ hasText: '¿Ocultar tu página?' });
    await expect(confirmacion).toContainText('Solo entra y reserva quien tenga la clave.');
    await confirmacion.getByRole('button', { name: 'Ocultar', exact: true }).click();

    await expect(page.getByText('Tu página ya no se ve.')).toBeVisible({ timeout: 10_000 });
    expect(puts).toEqual([{ oculta: true, clave: 'clave-e2e' }]);
    await expect(valor(page, 'pagina-publica')).toHaveText('Oculta: solo entra quien tenga la clave');
    await expect(titulo(page, 'Ocultar tu página')).toHaveCount(0);
  });
});

test.describe('Estados y portapapeles', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('sin el plan, la pastilla lo dice y lo de dentro se ve pero lleva a los planes', async ({ page }) => {
    await abrir(page, 'configuracion?tab=motivacion', { fila: { plan: null } });
    await expect(page.locator('[data-estado-ajuste]').filter({ hasText: 'Desde el plan Estudio' })).toHaveCount(3, { timeout: 30_000 });
    // La sección no está tapada: sus filas se tocan.
    await page.locator('#reglas').click();
    await expect(titulo(page, 'Cómo funcionan tus créditos')).toBeFocused();
    await expect(cajon(page).getByRole('link', { name: /Disponible en el plan Estudio/ })).toHaveAttribute('href', '/suscripcion');
  });

  test('«Copiar» solo dice «Copiado» si el portapapeles lo tiene', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await abrir(page, 'configuracion?tab=web');
    const copiar = page.getByRole('button', { name: 'Copiar el enlace de tu página' });
    await expect(copiar).toBeVisible({ timeout: 30_000 });
    await copiar.click();
    await expect(copiar).toHaveText('Copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/reservar\/pilates-centro$/);
  });

  test('si el navegador no deja copiar (Safari sin permiso), no dice «Copiado»', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new DOMException('NotAllowedError')) },
        configurable: true,
      });
    });
    await abrir(page, 'configuracion?tab=web');
    const copiar = page.getByRole('button', { name: 'Copiar el enlace de tu página' });
    await expect(copiar).toBeVisible({ timeout: 30_000 });
    await copiar.click();
    await expect(page.getByText('No se ha podido copiar. Selecciona el enlace y cópialo a mano.')).toBeVisible();
    await expect(copiar).toHaveText('Copiar');
  });

  test('Kisi con problemas abre su cajón con su clave cargada, para probar o desconectar', async ({ page }) => {
    await abrir(page, 'configuracion?tab=conexiones#integracion-kisi');
    await expect(titulo(page, 'Kisi')).toBeVisible({ timeout: 30_000 });
    await expect(cajon(page).getByLabel('Clave API')).toHaveValue('kisi_example');
    await expect(cajon(page).getByRole('button', { name: 'Probar conexión' })).toBeVisible();
    await expect(cajon(page).getByRole('button', { name: 'Desconectar Kisi' })).toBeVisible();
    await expect(guardar(page)).toHaveCount(0);
  });
});
