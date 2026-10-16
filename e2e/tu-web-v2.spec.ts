import { test, expect, type Page, type Route } from '@playwright/test';
import { firmaCodigo } from '../lib/widgets/integracion.ts';
import { CONFIG_POR_DEFECTO } from '../lib/widgets/config.ts';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu web» v2 (16-oct-2026, tras PANEL_NUEVO + MI_WEB_NUEVA): la portada «Tus
// widgets» (vacío que enseña, o una fila por pieza con UN estado y como mucho UN
// aviso), el asistente de cuatro pasos y la barra única «Publicar en mi web».
// Con el interruptor apagado, lo de siempre: lo vigilan sin tocarlos
// widget-builder, panel-nuevo-mi-web-widgets y widget-codigo-por-id-panel.
//
// ⚠️ Todos los caminos que escriben CUENTAN peticiones: «no dijo Publicado»
// también sería verdad con un botón que no manda nada (.claude/tentare-os.md).
// La red de seguridad (`**/api/**`) va PRIMERO: la ruta registrada después gana.
// Con CAPTURAS=<carpeta> (y ANCHO=375 para el móvil) guarda las capturas para el fundador.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const SLUG = 'pilates-centro';
const STORAGE_KEY = 'sb-example-auth-token';
const ID = 'Ab3dE5gH9k';
const T0 = '2026-09-29T10:00:00.000+00:00';
const T1 = '2026-10-15T09:00:00.000+00:00';
const CAPTURAS = process.env.CAPTURAS;

const HORARIO = widgetPorId('horario');
if (!esDisponible(HORARIO)) throw new Error('«Horario» debería estar disponible');

const TIPOS = [
  { id: 'tc-r', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracion_min: 50 },
  { id: 'tc-m', studio_id: STUDIO_ID, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', duracion_min: 50 },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** La copia de un código por id del horario, copiada con lo de siempre (su foto). */
function copiaPorId() {
  const firma = firmaCodigo({ widget: HORARIO as never, config: CONFIG_POR_DEFECTO, origen: '', slug: SLUG, pieza: ID }, 'iframe');
  return { firma, en: '2026-10-01T10:05:00.000Z', metodo: 'iframe', pieza: ID, config: CONFIG_POR_DEFECTO };
}

type Respuesta = 'ok' | '409' | '500' | 'sin-red';

interface Contadores {
  piezas: Record<string, unknown>[];
  estilos: Record<string, unknown>[];
  patches: Record<string, unknown>[];
  lecturasPiezas: number;
  /** El orden en que llegaron los POST a publicar. */
  orden: string[];
}

async function montar(page: Page, opts: {
  widgetBuilder?: Record<string, unknown>;
  piezas?: unknown[];
  /** Lo que devuelve `widget_piezas` a partir de la segunda lectura (tras un 409). */
  piezasDespues?: unknown[];
  pieza?: Respuesta;
  /** Retiene la respuesta de `widget-pieza` hasta que se llame a la función que devuelve `montar`. */
  retenerPieza?: boolean;
  plataforma?: string | null;
  direccion?: string;
}) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825', widget_dominios_autorizados: [],
    widget_builder: {
      ...(opts.widgetBuilder ?? {}),
      ...(opts.plataforma === null ? {} : { _web: { plataforma: opts.plataforma ?? 'wordpress', ...(opts.direccion ? { direccion: opts.direccion } : {}) } }),
    },
  };
  const c: Contadores = { piezas: [], estilos: [], patches: [], lecturasPiezas: 0, orden: [] };
  // Lo publicado cambia «en otra pestaña» justo cuando el servidor contesta 409 (no por contar lecturas:
  // en desarrollo, el modo estricto de React monta dos veces y la lee dos veces al entrar).
  let hubo409 = false;
  let soltar: () => void = () => {};
  const retenida = new Promise<void>(r => { soltar = r; });

  if (process.env.OSCURO === '1') await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t: string) => { (window as unknown as { __copiado?: string }).__copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', route => json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/api/oauth/consentimientos**', route => json(route, { apps: [] }));
  await page.route('**/api/public/session**', route => json(route, { error: 'no' }, 404));
  await page.route(u => u.pathname === '/api/estudio/interruptores', route => json(route, { panelNuevo: true, miWebNueva: true }));
  // Lo que pinta la vista previa (la página de reservas de verdad, dentro de un iframe).
  const manana = (h: number) => { const d = new Date(Date.now() + 86_400_000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00:00`; };
  await page.route('**/api/public/studio-data**', route => json(route, {
    studio: { id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, colorPrimario: '#343825' },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [{ id: 'p1', studioId: STUDIO_ID, tipo: 'PUNTUAL', activo: true, precio: 15, sesiones: 1, nombre: 'Clase suelta' }],
    citasServicios: [], citasDisponibilidad: [], sustitucionesConfirmadas: [],
    sesiones: [
      { id: 's1', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: manana(10), fin: manana(11), aforoMaximo: 8, cancelada: false },
      { id: 's2', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: manana(18), fin: manana(19), aforoMaximo: 8, cancelada: false },
    ],
    aforoReservas: [], socia: null,
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
      c.patches.push(cuerpo);
      Object.assign(studioRow, cuerpo);
      return json(route, [{ id: STUDIO_ID }]);
    }
    return json(route, studioRow);
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/widget_piezas**', route => {
    c.lecturasPiezas += 1;
    return json(route, hubo409 && opts.piezasDespues ? opts.piezasDespues : (opts.piezas ?? []));
  });
  await page.route('**/api/estudio/widget-estilo', route => {
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    c.estilos.push(cuerpo);
    c.orden.push('estilo');
    return json(route, { aplicado: cuerpo.estilo, anterior: cuerpo.esperado });
  });
  await page.route('**/api/estudio/widget-pieza', async route => {
    if (route.request().method() !== 'POST') return json(route, {}, 405);
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    c.piezas.push(cuerpo);
    c.orden.push('pieza');
    if (opts.retenerPieza) await retenida;
    const r = opts.pieza ?? 'ok';
    if (r === 'sin-red') return route.abort('internetdisconnected');
    if (r === '409') hubo409 = true;
    if (r === '409') return json(route, { error: 'Mientras lo tenías abierto, se aplicaron otros cambios a este widget. Recarga la página para ver lo que hay en tu web antes de aplicar.' }, 409);
    if (r === '500') return json(route, { error: 'No se han podido aplicar los cambios. Vuelve a intentarlo.' }, 500);
    return json(route, { id: ID, config: cuerpo.config, actualizadoEn: '2026-10-16T08:00:00.000+00:00' });
  });

  await page.goto('/configuracion?tab=web&abrir=widgets');
  return { c, soltar: () => soltar() };
}

const barra = (page: Page) => page.getByRole('region', { name: 'Publicar en tu web' });
const publicar = (page: Page) => barra(page).getByRole('button', { name: 'Publicar en mi web' });
const pasos = (page: Page) => page.getByRole('list', { name: 'Pasos' });
const PUBLICADO = 'Publicado. Tu web lo enseñará en unos minutos.';
/** El horario copiado por id, y AHORA enseñando solo Mat: «qué clases salen» sin publicar. */
const SOLO_MAT = { horario: { ...CONFIG_POR_DEFECTO, tipos: ['tc-m'], copiado: copiaPorId() } };
const PUBLICADA = (t = T0) => [{ id: ID, widget: 'horario', config: {}, actualizado_en: t }];

async function captura(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  // «Primeros pasos» flota encima (otra sesión lo pliega a su píldora, decisión 8): plegado, se ve la pantalla.
  const plegar = page.getByRole('button', { name: 'Plegar «Primeros pasos»' });
  if (await plegar.isVisible()) await plegar.click();
  await page.waitForTimeout(25_000);
  // Desde arriba: con la página desplazada, lo pegajoso sale a media captura.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
}

/** Desde la portada, al paso «Cómo se ve», y otro estilo elegido (un borrador). */
async function elegirArena(page: Page) {
  await page.getByRole('button', { name: /^Cambiar el estilo/ }).click();
  await expect(pasos(page).getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
  const arena = page.getByRole('radiogroup', { name: 'Estilo de tus widgets' }).getByRole('radio', { name: 'Arena', exact: true });
  await arena.click();
  await expect(arena).toHaveAttribute('aria-checked', 'true');
}

test('sin nada copiado: el vacío que enseña, sin escribir nada al montar, y el asistente de cuatro pasos con «Terminar»', async ({ page }) => {
  const { c } = await montar(page, { plataforma: null });
  await expect(page.getByRole('heading', { name: 'Pon tu horario en tu web' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('group', { name: 'Qué ver' }).getByRole('button')).toHaveText(['Tus widgets', 'Cómo le va a tu página']);
  // Lo de antes era la pregunta de la web, nada más entrar: ya no.
  await expect(page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' })).toHaveCount(0);
  await page.waitForTimeout(2500);
  expect(c.patches, 'nunca guardar al montar').toHaveLength(0);
  expect(c.piezas.length + c.estilos.length).toBe(0);
  await expect(barra(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Poner mi horario en mi web' }).click();
  await expect(pasos(page).getByRole('button')).toHaveText([/Qué pones/, /Dónde va/, /Cómo se ve/, /Ponlo en tu web/]);
  await expect(pasos(page).getByRole('button', { name: 'Qué pones' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Elige qué pones en tu web' })).toBeVisible();
  // Los cuatro pasos montados: el código está en el DOM desde el principio.
  await expect(page.locator('pre')).toHaveCount(1);
  // Sin su web no se salta «Dónde va»: ni con la línea de pasos.
  // Con el teclado: tras cambiar de paso, la página sube al TÍTULO del paso y la línea queda bajo la
  // barra de arriba (y «Primeros pasos» flota encima; otra sesión lo pliega a su píldora, decisión 8).
  await pasos(page).getByRole('button', { name: 'Ponlo en tu web' }).press('Enter');
  await expect(pasos(page).getByRole('button', { name: 'Dónde va' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: /Siguiente: cómo se ve/ })).toBeDisabled();
  const pregunta = page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' });
  await pregunta.getByRole('radio', { name: /WordPress/ }).click();
  await page.getByRole('button', { name: 'Guardar mi web' }).click();
  // Se guarda UNA vez, fusionando (lo demás de `widget_builder` sigue), y no navega.
  await expect.poll(() => c.patches.length).toBe(1);
  expect((c.patches[0].widget_builder as { _web?: { plataforma?: string } })._web?.plataforma).toBe('wordpress');
  await expect(pasos(page).getByRole('button', { name: 'Dónde va' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('Tu web está hecha con')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Dónde lo quieres' })).toBeVisible();
  await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
  await expect(page.getByRole('heading', { name: 'Cómo se ve', exact: true })).toBeVisible();
  // Sin la barra de aplicar de siempre: se publica con la barra única.
  await expect(page.getByRole('group', { name: 'Aplicar el estilo en tu web' })).toHaveCount(0);
  await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
  await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await expect(page.getByRole('heading', { name: 'Pon tu horario en tu web' })).toBeVisible();
});

test('con copias: la fila enseña UN estado y SOLO el aviso que gana (la web sin autorizar, delante del desfase y del diseño propio)', async ({ page }) => {
  // Copiado sin marco con diseño propio y su web sin autorizar; después, puesto dentro de una página
  // (otra forma: desfase seguro). Los tres avisos encajan a la vez.
  const propia = { identidad: 'propia', marca: '#E11D48' };
  const foto = { ...CONFIG_POR_DEFECTO, ...propia, metodo: 'nativa' };
  await montar(page, {
    direccion: 'pilatescentro.example.com',
    widgetBuilder: {
      horario: { ...foto, metodo: 'iframe', copiado: { firma: 'x', en: '2026-10-01T10:05:00.000Z', metodo: 'nativa', config: foto } },
    },
  });
  const fila = page.getByRole('list', { name: 'Tus widgets' }).getByRole('listitem').filter({ hasText: 'Horario y reservas' });
  await expect(fila).toBeVisible({ timeout: 60_000 });
  // Decisión del fundador (16-oct): la web sin autorizar, lo único que no deja cargar el widget, va primero.
  await expect(fila.locator('[data-aviso-fila]')).toHaveAttribute('data-aviso-fila', 'web-sin-autorizar');
  await expect(fila.locator('[data-aviso-fila]')).toHaveCount(1);
  await expect(fila.locator('[data-estado-en-tu-web]')).toHaveCount(1);
  await expect(fila.locator('[data-estado-en-tu-web]')).toHaveText('Tu web tiene lo de antes');
  await expect(fila).toContainText('no está entre las webs autorizadas');
  await expect(fila).not.toContainText('Tiene su propio diseño');
  await expect(fila).not.toContainText('Lo cambiaste después de copiarlo');
  await expect(fila.getByRole('button', { name: 'Copiar el código nuevo' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tu estilo' })).toBeVisible();
  await expect(page.locator('#portada-web')).toHaveText('Tu web');
});

test('publicar el estilo y una pieza: dos POST en secuencia, y «Publicado» solo después de los dos 200', async ({ page }) => {
  const { c, soltar } = await montar(page, { piezas: PUBLICADA(), widgetBuilder: SOLO_MAT, retenerPieza: true });
  await expect(barra(page)).toContainText('qué clases salen de «Horario y reservas»', { timeout: 60_000 });
  await elegirArena(page);
  await expect(barra(page)).toContainText('Sin publicar en tu web: el estilo y qué clases salen de «Horario y reservas»');
  await publicar(page).click();
  const dialogo = page.getByRole('dialog', { name: '¿Publicar este estilo en tu web?' });
  await expect(dialogo).toContainText('Y a la vez, lo que enseña «Horario y reservas»: qué clases salen.');
  await dialogo.getByRole('button', { name: 'Publicar en mi web' }).click();
  await expect.poll(() => c.piezas.length).toBe(1);
  expect(c.orden).toEqual(['estilo', 'pieza']);
  expect(c.piezas[0]).toMatchObject({ widget: 'horario', esperado: T0, config: { tipos: ['tc-m'] } });
  // El estilo ya contestó, la pieza no: nada de «Publicado» todavía.
  await page.waitForTimeout(600);
  await expect(page.getByText(PUBLICADO)).toHaveCount(0);
  soltar();
  await expect(barra(page).getByText(PUBLICADO)).toBeVisible();
  await expect(barra(page)).not.toContainText('Sin publicar');
  expect(c.estilos).toHaveLength(1);
});

test('500 en la pieza con el estilo bien: lo dice a medias, nunca «Publicado», y la pieza sigue sin publicar', async ({ page }) => {
  const { c } = await montar(page, { piezas: PUBLICADA(), widgetBuilder: SOLO_MAT, pieza: '500' });
  await elegirArena(page);
  await publicar(page).click();
  await page.getByRole('dialog', { name: '¿Publicar este estilo en tu web?' }).getByRole('button', { name: 'Publicar en mi web' }).click();
  await expect.poll(() => c.piezas.length).toBeGreaterThan(0);
  expect(c.estilos.length).toBeGreaterThan(0);
  await expect(barra(page).getByRole('alert')).toContainText('Publicado el estilo. «Horario y reservas» no se ha podido publicar');
  await expect(page.getByText(PUBLICADO)).toHaveCount(0);
  await expect(barra(page)).toContainText('Sin publicar en tu web: qué clases salen de «Horario y reservas»');
});

test('409 en la pieza: lo dice, vuelve a leer lo publicado y el siguiente intento va contra lo leído', async ({ page }) => {
  const { c } = await montar(page, { piezas: PUBLICADA(T0), piezasDespues: PUBLICADA(T1), widgetBuilder: SOLO_MAT, pieza: '409' });
  await expect(publicar(page)).toBeVisible({ timeout: 60_000 });
  const antes = c.lecturasPiezas;
  await publicar(page).click();
  await expect.poll(() => c.piezas.length).toBe(1);
  expect(c.piezas[0]).toMatchObject({ esperado: T0 });
  await expect(barra(page).getByRole('alert')).toContainText('acaba de cambiar desde otra pestaña');
  await expect.poll(() => c.lecturasPiezas).toBeGreaterThan(antes);
  await expect(page.getByText(PUBLICADO)).toHaveCount(0);
  // No se reintenta solo: hace falta otro clic, y ese va con el `esperado` nuevo.
  await page.waitForTimeout(500);
  expect(c.piezas).toHaveLength(1);
  await publicar(page).click();
  await expect.poll(() => c.piezas.length).toBe(2);
  expect(c.piezas[1]).toMatchObject({ esperado: T1 });
});

test('doble clic: una sola petición por API', async ({ page }) => {
  const { c } = await montar(page, { piezas: PUBLICADA(), widgetBuilder: SOLO_MAT, retenerPieza: true });
  await expect(publicar(page)).toBeVisible({ timeout: 60_000 });
  await publicar(page).dblclick();
  await expect.poll(() => c.piezas.length).toBe(1);
  await page.waitForTimeout(800);
  expect(c.piezas).toHaveLength(1);
  expect(c.estilos).toHaveLength(0);
});

test('«Descartar» no manda nada a publicar y quita lo pendiente', async ({ page }) => {
  const { c } = await montar(page, { piezas: PUBLICADA(), widgetBuilder: SOLO_MAT });
  await elegirArena(page);
  await expect(barra(page)).toContainText('el estilo y qué clases salen');
  await barra(page).getByRole('button', { name: 'Descartar' }).click();
  await expect(barra(page)).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(c.piezas.length + c.estilos.length).toBe(0);
});

test('sin red: nunca «Publicado», lo dice en rojo y lo pendiente se queda', async ({ page }) => {
  const { c } = await montar(page, { piezas: PUBLICADA(), widgetBuilder: SOLO_MAT, pieza: 'sin-red' });
  await expect(publicar(page)).toBeVisible({ timeout: 60_000 });
  await publicar(page).click();
  await expect.poll(() => c.piezas.length).toBeGreaterThan(0);
  await expect(barra(page).getByRole('alert')).toContainText('Revisa tu conexión');
  await expect(page.getByText(PUBLICADO)).toHaveCount(0);
  await expect(barra(page)).toContainText('Sin publicar en tu web');
});

test.describe('a 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('la barra no desborda, el botón se ve y la fila parte el dominio', async ({ page }) => {
    const larga = 'una-direccion-de-estudio-muy-muy-larga-para-probar.example.com';
    await montar(page, {
      piezas: PUBLICADA(), direccion: larga,
      widgetBuilder: { horario: { ...SOLO_MAT.horario } },
    });
    await expect(publicar(page)).toBeVisible({ timeout: 60_000 });
    await expect(publicar(page)).toBeInViewport();
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(desborda).toBe(false);
    const caja = await barra(page).boundingBox();
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(375 + 1);
    // La tarjeta «Tu web» nombra la dirección larga sin salirse.
    const web = page.locator('section[aria-labelledby="portada-web"]');
    await expect(web).toContainText(larga);
    const cajaWeb = await web.boundingBox();
    expect(cajaWeb!.x + cajaWeb!.width).toBeLessThanOrEqual(375 + 1);
  });
});

test.describe('capturas para el fundador (solo con CAPTURAS=<carpeta>; ANCHO=375 para el móvil)', () => {
  test.skip(!CAPTURAS, 'solo con CAPTURAS');
  // Esperan a que la vista previa (la página real de reservas, lenta en desarrollo) cargue antes de cada captura.
  test.setTimeout(600_000);
  const ancho = Number(process.env.ANCHO ?? 1440);
  test.use({ viewport: { width: ancho, height: 900 } });

  test('la portada vacía y los cuatro pasos', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await expect(page.getByRole('heading', { name: 'Pon tu horario en tu web' })).toBeVisible({ timeout: 60_000 });
    await captura(page, `v2-portada-vacia-${ancho}`);
    await page.getByRole('button', { name: 'Poner mi horario en mi web' }).click();
    await expect(page.getByRole('heading', { name: 'Elige qué pones en tu web' })).toBeVisible();
    await captura(page, `v2-paso-1-que-${ancho}`);
    await page.getByRole('button', { name: /Siguiente: dónde va/ }).click();
    await expect(page.getByText('Tu web está hecha con')).toBeVisible();
    await captura(page, `v2-paso-2-donde-${ancho}`);
    await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
    const arena = page.getByRole('radiogroup', { name: 'Estilo de tus widgets' }).getByRole('radio', { name: 'Arena', exact: true });
    await arena.click();
    await expect(barra(page)).toContainText('Sin publicar en tu web: el estilo');
    await captura(page, `v2-paso-3-como-${ancho}`);
    await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
    await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
    await captura(page, `v2-paso-4-ponlo-${ancho}`);
  });

  test('la portada con piezas', async ({ page }) => {
    const planes = widgetPorId('planes');
    if (!esDisponible(planes)) throw new Error('«Planes» debería estar disponible');
    await montar(page, {
      piezas: PUBLICADA(), direccion: 'pilatescentro.example.com',
      widgetBuilder: {
        ...SOLO_MAT,
        planes: { ...CONFIG_POR_DEFECTO, metodo: 'popup', textoBoton: 'Ver precios', copiado: { firma: 'x', en: '2026-09-30T10:05:00.000Z', metodo: 'popup', config: { ...CONFIG_POR_DEFECTO, metodo: 'popup' } } },
        prueba: { ...CONFIG_POR_DEFECTO, metodo: 'enlace', copiado: { firma: 'y', en: '2026-10-15T10:05:00.000Z', metodo: 'enlace', config: { ...CONFIG_POR_DEFECTO, metodo: 'enlace' } } },
      },
    });
    await expect(page.getByRole('list', { name: 'Tus widgets' })).toBeVisible({ timeout: 60_000 });
    await expect(barra(page)).toBeVisible();
    await captura(page, `v2-portada-con-piezas-${ancho}`);
  });
});
