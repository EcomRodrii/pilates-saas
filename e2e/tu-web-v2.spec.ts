import { test, expect, type Page, type Route } from '@playwright/test';
import { firmaCodigo } from '../lib/widgets/integracion.ts';
import { CONFIG_POR_DEFECTO } from '../lib/widgets/config.ts';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';
import { cabecerasDelMarco, htmlDelMarco } from '../lib/widgets/web-real/marco-html.ts';

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
// Un estudio que ya tenía su código por id ANTES de «Tu horario, tus clases»: la opción apagada en lo copiado, en
// lo guardado y en lo publicado (`PUBLICADA`, config `{}`). Lo nuevo con la opción se prueba más abajo.
const CONFIG_ANTIGUA = { ...CONFIG_POR_DEFECTO, soloHorario: false };
function copiaPorId() {
  const firma = firmaCodigo({ widget: HORARIO as never, config: CONFIG_ANTIGUA, origen: '', slug: SLUG, pieza: ID }, 'iframe');
  return { firma, en: '2026-10-01T10:05:00.000Z', metodo: 'iframe', pieza: ID, config: CONFIG_ANTIGUA };
}

type Respuesta = 'ok' | '409' | '500' | 'sin-red';

interface Contadores {
  piezas: Record<string, unknown>[];
  estilos: Record<string, unknown>[];
  patches: Record<string, unknown>[];
  lecturasPiezas: number;
  /** Las peticiones a «¿se puede enseñar mi web?» (su cuerpo). Sin web autorizada, ninguna. */
  webReal: Record<string, unknown>[];
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
  /** Las webs ya autorizadas para la forma sin marco. */
  dominios?: string[];
  /** El portapapeles dice que no (Safari puede): se cuentan los intentos en `window.__intentosCopiar`. */
  portapapelesNo?: boolean;
  /** Los planes que enseña la página de reservas (por defecto, una clase suelta). */
  planesPublicos?: unknown[];
  /** Qué contesta «¿se puede enseñar mi web?» (n = la petición que es, desde 1). Por defecto, `{}` como el resto de /api. */
  webReal?: (route: Route, n: number) => Promise<void> | void;
}) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825', widget_dominios_autorizados: opts.dominios ?? [],
    widget_builder: {
      ...(opts.widgetBuilder ?? {}),
      ...(opts.plataforma === null ? {} : { _web: { plataforma: opts.plataforma ?? 'wordpress', ...(opts.direccion ? { direccion: opts.direccion } : {}) } }),
    },
  };
  const c: Contadores = { piezas: [], estilos: [], patches: [], lecturasPiezas: 0, webReal: [], orden: [] };
  // Lo publicado cambia «en otra pestaña» justo cuando el servidor contesta 409 (no por contar lecturas:
  // en desarrollo, el modo estricto de React monta dos veces y la lee dos veces al entrar).
  let hubo409 = false;
  let soltar: () => void = () => {};
  const retenida = new Promise<void>(r => { soltar = r; });

  if (process.env.OSCURO === '1') await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
  await page.addInitScript(([key, uid, no]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
    const w = window as unknown as { __copiado?: string; __intentosCopiar?: number };
    w.__intentosCopiar = 0;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (t: string) => {
          w.__intentosCopiar = (w.__intentosCopiar ?? 0) + 1;
          if (no) return Promise.reject(new Error('no'));
          w.__copiado = t;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  }, [STORAGE_KEY, AUTH_UID, !!opts.portapapelesNo] as const);

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
    spots: [], planesTarifa: opts.planesPublicos ?? [{ id: 'p1', studioId: STUDIO_ID, tipo: 'PUNTUAL', activo: true, precio: 15, sesiones: 1, nombre: 'Clase suelta' }],
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
  // Una clase futura en el panel: la materia prima de «Una clase concreta».
  await page.route('**/rest/v1/sesiones**', route => json(route, [{
    id: 's1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-r', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), fin: new Date(Date.now() + 25 * 3600 * 1000).toISOString(),
    aforo_maximo: 8, cancelada: false,
  }]));
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
  await page.route('**/api/estudio/vista-previa-web', route => {
    c.webReal.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    return opts.webReal ? opts.webReal(route, c.webReal.length) : json(route, {});
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
const SOLO_MAT = { horario: { ...CONFIG_ANTIGUA, tipos: ['tc-m'], copiado: copiaPorId() } };
const PUBLICADA = (t = T0) => [{ id: ID, widget: 'horario', config: {}, actualizado_en: t }];

async function captura(page: Page, nombre: string, opc: { soloPagina?: boolean } = {}) {
  if (!CAPTURAS) return;
  // «Primeros pasos» flota encima (otra sesión lo pliega a su píldora, decisión 8): plegado, se ve la pantalla.
  const plegar = page.getByRole('button', { name: 'Plegar «Primeros pasos»' });
  if (await plegar.isVisible()) await plegar.click();
  await page.waitForTimeout(25_000);
  // Lo que se ve de verdad al llegar (la ventana, con lo pegajoso donde está) y, aparte, la página entera.
  if (!opc.soloPagina) await page.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
  const y = await page.evaluate(() => window.scrollY);
  // Desde arriba: con la página desplazada, lo pegajoso sale a media captura.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${CAPTURAS}/${nombre}${opc.soloPagina ? '' : '-completa'}.png`, fullPage: true });
  await page.evaluate(top => window.scrollTo(0, top), y);
}

const estilos = (page: Page) => page.getByRole('radiogroup', { name: 'Estilo de tus widgets' });
const niveles = (page: Page) => page.getByRole('radiogroup', { name: 'Cómo se ven tus widgets' });

/** Desde la portada, al paso «Cómo se ve», y otro estilo elegido (un borrador). */
async function elegirArena(page: Page) {
  await page.getByRole('button', { name: /^Cambiar el estilo/ }).click();
  await expect(pasos(page).getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
  // Dos niveles (decisión 4): los estilos están dentro de «Un estilo solo para tu web».
  await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
  const arena = estilos(page).getByRole('radio', { name: 'Arena', exact: true });
  await arena.click();
  await expect(arena).toHaveAttribute('aria-checked', 'true');
}

/** Desde la portada vacía, al asistente. */
async function empezar(page: Page) {
  await page.getByRole('button', { name: 'Poner mi horario en mi web' }).click({ timeout: 60_000 });
  await expect(pasos(page).getByRole('button', { name: 'Qué pones' })).toHaveAttribute('aria-current', 'step');
}
const irA = async (page: Page, nombre: 'Qué pones' | 'Dónde va' | 'Cómo se ve' | 'Ponlo en tu web') => {
  // Con el teclado: tras cambiar de paso, la línea de pasos queda bajo la barra de arriba (y «Primeros
  // pasos» flota encima: otra sesión lo pliega a su píldora, decisión 8), y un clic caería en ellas.
  await pasos(page).getByRole('button', { name: nombre }).press('Enter');
  await expect(pasos(page).getByRole('button', { name: nombre })).toHaveAttribute('aria-current', 'step');
};
/** Abre un pliegue visible por el texto de su título, solo si está cerrado (pulsarlo abierto lo cerraría). */
async function abrirPliegue(page: Page, titulo: string | RegExp) {
  const pliegue = page.locator('details').filter({ has: page.locator('summary', { hasText: titulo }) }).filter({ visible: true }).first();
  if (!(await pliegue.evaluate(d => (d as HTMLDetailsElement).open))) await pliegue.locator('summary').first().click();
}
const previa = (page: Page) => page.getByTitle(/^Vista previa:/);
/** El fondo del documento que pinta el iframe de la previa, cuando ya carga `trozo`. */
async function fondoDeLaPrevia(page: Page, trozo: string): Promise<string> {
  const marco = await previa(page).elementHandle();
  const frame = marco ? await marco.contentFrame() : null;
  if (!frame || !decodeURIComponent(frame.url()).includes(trozo)) return '';
  return frame.evaluate(() => getComputedStyle(document.body).backgroundColor).catch(() => '');
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

// ─────────────────────────────────────────────────────────────────────────────
// PR 2 · el contenido de los cuatro pasos (decisiones 2, 3, 4 y 7).
// ─────────────────────────────────────────────────────────────────────────────

test('Siguiente lleva al título del paso nuevo y le da el foco (#2743)', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await page.getByRole('button', { name: /Siguiente: dónde va/ }).click();
  const titulo = page.getByRole('heading', { name: 'Elige dónde va', exact: true });
  await expect(titulo).toBeInViewport();
  // El foco, en el contenedor del paso nuevo (lo anuncia el lector de pantalla), no en el botón que ya no está.
  await expect.poll(() => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && a.tabIndex === -1 && !a.hidden && !!a.textContent?.includes('Tu web está hecha con');
  })).toBe(true);
  // Y el título queda debajo de la barra de arriba, no tapado por ella. Con `poll`: el desplazamiento es
  // suave, y medirlo a medio camino (con la previa del móvil la página es más larga) daba falsos rojos.
  await expect.poll(async () => (await titulo.boundingBox())!.y, { timeout: 5_000 }).toBeGreaterThan(40);
});

test('la web se pregunta en «Dónde va»: monogramas, se guarda en `_web` UNA vez fusionando, y sin contestar no se sigue', async ({ page }) => {
  const { c } = await montar(page, { plataforma: null, widgetBuilder: { horario: { ...CONFIG_POR_DEFECTO, tipos: ['tc-m'] } } });
  await empezar(page);
  await irA(page, 'Dónde va');
  await expect(page.getByRole('button', { name: /Siguiente: cómo se ve/ })).toBeDisabled();
  const pregunta = page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' });
  // Decisión 7: un monograma neutro por plataforma (no el mismo globo para las cuatro); a mano, agencia y sin web, su icono.
  await expect(pregunta.locator('[data-monograma]')).toHaveText(['W', 'Wix', 'S', 'Wf']);
  await expect(pregunta.getByRole('radio', { name: /Otra o hecha a mano/ }).locator('svg')).toHaveCount(1);
  await page.waitForTimeout(800);
  expect(c.patches, 'nunca guardar al montar ni al cambiar de paso').toHaveLength(0);
  await pregunta.getByRole('radio', { name: /^Wix/ }).click();
  await page.getByRole('button', { name: 'Guardar mi web' }).click();
  await expect.poll(() => c.patches.length).toBe(1);
  const wb = c.patches[0].widget_builder as { _web?: { plataforma?: string }; horario?: { tipos?: string[] } };
  expect(wb._web?.plataforma).toBe('wix');
  // Fusionando: lo demás de `widget_builder` sigue en el cuerpo.
  expect(wb.horario?.tipos).toEqual(['tc-m']);
  await expect(page.getByText('Tu web está hecha con')).toBeVisible();
  await expect(page.locator('[data-monograma="wix"]').filter({ visible: true })).toHaveText('Wix');
  await expect(page.getByRole('button', { name: /Siguiente: cómo se ve/ })).toBeEnabled();
  await page.waitForTimeout(800);
  expect(c.patches).toHaveLength(1);
});

test('sin las tres etiquetas ni «Cómo llega cada cambio»: una línea en «Dónde va», la marca en «Ancho» y una frase en «Ponlo»', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  // Paso 1: «Más cosas» a la vista (sin plegar) y «Próximamente» se lee, no se pulsa.
  await expect(page.getByRole('radiogroup', { name: 'Más cosas para tu web' }).getByRole('radio', { name: /Una clase concreta/ })).toBeVisible();
  await expect(page.locator('summary', { hasText: 'Más cosas para tu web' })).toHaveCount(0);
  const proximamente = page.getByRole('list', { name: 'Próximamente' });
  await expect(proximamente).toBeVisible();
  await expect(proximamente.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Qué sale en tu horario' })).toBeVisible();

  for (const prohibido of ['Pegar el código otra vez', 'Siempre al día']) {
    await expect(page.getByText(prohibido, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText(/Con «(Publicar|Aplicar) en mi web»/)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Cómo llega cada cambio a tu web' })).toHaveCount(0);

  await irA(page, 'Dónde va');
  await expect(page.getByText('Lo de este paso va dentro del código. Si lo cambias cuando ya esté en tu web, tendrás que pegarlo otra vez; te lo diremos.')).toBeVisible();
  await irA(page, 'Cómo se ve');
  await abrirPliegue(page, 'Más ajustes');
  await expect(page.getByRole('group', { name: 'Ancho del widget' })).toBeVisible();
  await expect(page.getByText('Va en el código', { exact: true }).filter({ visible: true })).toHaveCount(1);
  // El diseño propio ya no está en «Cómo se ve»: se fue a «Ponlo en tu web».
  await expect(page.getByRole('switch', { name: /Usar un diseño propio/ }).filter({ visible: true })).toHaveCount(0);
  await irA(page, 'Ponlo en tu web');
  await expect(page.getByText(/^Lo pegas una vez\. Tus clases, precios y plazas se actualizan solos; el estilo y lo que enseña llegan cuando pulsas «Publicar en mi web»\.$/)).toBeVisible();
  // Los pasos de su plataforma, cada uno con su dibujo.
  await expect(page.getByRole('heading', { name: 'En WordPress, en 3 pasos' })).toBeVisible();
  await expect(page.locator('[data-dibujo-paso]').filter({ visible: true })).toHaveCount(3);
  await abrirPliegue(page, 'Para quien te hace la web');
  await expect(page.getByRole('heading', { name: 'Colores y letra propios solo en «Horario y reservas»' })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Usar un diseño propio/ }).filter({ visible: true })).toHaveCount(1);
  // Y en ninguno de los cuatro pasos (están todos montados) vuelven las etiquetas.
  for (const prohibido of ['Pegar el código otra vez', 'Siempre al día']) {
    await expect(page.getByText(prohibido, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText(/Con «(Publicar|Aplicar) en mi web»/)).toHaveCount(0);
});

test('con un enlace: «Dónde va» dice que lo de qué enseña no se aplica, y «Cómo se ve» no enseña controles que no hacen nada', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com', widgetBuilder: { horario: { ...CONFIG_POR_DEFECTO, metodo: 'enlace' } } });
  await empezar(page);
  await irA(page, 'Dónde va');
  await expect(page.getByRole('note').filter({ hasText: 'Con un enlace se abre tu página de reservas con todas tus clases' })).toBeVisible();
  await expect(page.getByText('Lo de este paso va dentro del enlace.', { exact: false })).toBeVisible();
  await irA(page, 'Cómo se ve');
  await expect(page.getByRole('note', { name: 'Este widget no cambia con el estilo' })).toContainText('Tu página de reservas no cambia con este estilo');
  await expect(niveles(page)).toHaveCount(0);
  await expect(estilos(page)).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Que se funda con tu web' })).toHaveCount(0);
});

test('«Igual que tu app» vacía estilo, letra y botones: el borrador de la vista previa ya no lleva letra; elegir el nivel no es un cambio', async ({ page }) => {
  const { c } = await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await irA(page, 'Cómo se ve');
  await expect(niveles(page).getByRole('radio', { name: /Igual que tu app/ })).toHaveAttribute('aria-checked', 'true');
  await expect(estilos(page)).toHaveCount(0);
  // Elegir «Un estilo solo para tu web» sin estilo abre los estilos y no deja nada sin publicar.
  await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
  await expect(estilos(page)).toBeVisible();
  await page.waitForTimeout(600);
  await expect(barra(page)).toHaveCount(0);
  // Su web oscura y fundido (valen en los dos niveles; sin fundido, «Tu web es…» solo dibuja la vista previa
  // y no hay nada que publicar), Arena y otra letra.
  await page.getByRole('radiogroup', { name: 'Cómo es tu web' }).getByRole('radio', { name: 'Oscura' }).click();
  await page.getByRole('switch', { name: 'Que se funda con tu web' }).click();
  await estilos(page).getByRole('radio', { name: 'Arena', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Letra de tus widgets' }).getByRole('radio', { name: 'Editorial' }).click();
  await expect.poll(async () => decodeURIComponent(await previa(page).getAttribute('src') ?? ''), { timeout: 20_000 }).toContain('"letra":"editorial"');
  await expect(barra(page)).toContainText('Sin publicar en tu web: el estilo');

  await niveles(page).getByRole('radio', { name: /Igual que tu app/ }).click();
  await expect(niveles(page).getByRole('radio', { name: /Igual que tu app/ })).toHaveAttribute('aria-checked', 'true');
  await expect(estilos(page)).toHaveCount(0);
  // El borrador que pinta la vista previa: su web oscura sigue (vale en los dos niveles), sin letra ni estilo.
  await expect.poll(async () => {
    const actual = decodeURIComponent(await previa(page).getAttribute('src') ?? '');
    return actual.includes('"web":"oscura"') && actual.includes('"fundido":true') && !actual.includes('"letra"');
  }, { timeout: 20_000 }).toBe(true);
  const src = decodeURIComponent(await previa(page).getAttribute('src') ?? '');
  expect(src).not.toContain('"letra"');
  expect(src).not.toContain('"estilo"');
  expect(src).not.toContain('"boton"');
  // Sigue sin publicar el fundido sobre su web oscura, y nada se ha mandado.
  await expect(barra(page)).toContainText('Sin publicar en tu web: el estilo');
  expect(c.estilos).toHaveLength(0);
});

test('con un diseño propio: «Cómo se ve» lo avisa y «Que siga este estilo» lo quita (lo pinta el documento de la vista previa)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await montar(page, {
    direccion: 'pilatescentro.example.com',
    widgetBuilder: { horario: { metodo: 'iframe', identidad: 'propia', marca: '#000000' } },
  });
  await empezar(page);
  await irA(page, 'Cómo se ve');
  const nota = page.getByRole('note', { name: 'Este widget no cambia con el estilo' });
  await expect(nota).toContainText('«Horario y reservas» no cambia con este estilo');
  await expect(nota).toContainText('se cambian en «Ponlo en tu web», en «Para quien te hace la web»');
  await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
  await estilos(page).getByRole('radio', { name: 'Carbón', exact: true }).click();
  // Con su diseño, la previa no sigue el estilo: lleva su color en la URL.
  await expect(previa(page)).toHaveAttribute('src', /marca=%23000000/);

  await nota.getByRole('button', { name: 'Que siga este estilo' }).click();
  await expect(nota).toHaveCount(0);
  await expect(previa(page)).not.toHaveAttribute('src', /marca=/);
  await expect.poll(() => fondoDeLaPrevia(page, '"estilo":"carbon"'), { timeout: 45_000 }).toBe('rgb(23, 24, 27)');
  // Y en «Ponlo en tu web», el interruptor del diseño propio está apagado.
  await irA(page, 'Ponlo en tu web');
  await abrirPliegue(page, 'Para quien te hace la web');
  await expect(page.getByRole('switch', { name: /Usar un diseño propio/ }).filter({ visible: true })).toHaveAttribute('aria-checked', 'false');
});

test('copiar entrega el texto EXACTO del código y dice «Copiado»', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await irA(page, 'Ponlo en tu web');
  const copiar = page.getByRole('button', { name: 'Copiar código' });
  await expect(copiar).toBeEnabled({ timeout: 30_000 });
  await copiar.click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
  const [copiado, codigo] = await Promise.all([
    page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado),
    page.locator('pre').textContent(),
  ]);
  expect(copiado).toBe(codigo);
});

test('si el portapapeles dice que no: nunca «Copiado», ni se guarda la copia (con contador de intentos)', async ({ page }) => {
  const { c } = await montar(page, { direccion: 'pilatescentro.example.com', portapapelesNo: true });
  await empezar(page);
  await irA(page, 'Ponlo en tu web');
  const copiar = page.getByRole('button', { name: 'Copiar código' });
  await expect(copiar).toBeEnabled({ timeout: 30_000 });
  await copiar.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __intentosCopiar?: number }).__intentosCopiar ?? 0)).toBeGreaterThan(0);
  await expect(page.getByText(/No se ha podido copiar/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiado' })).toHaveCount(0);
  // El código queda a la vista para copiarlo a mano.
  await expect(page.locator('pre')).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(c.patches.some(p => JSON.stringify(p.widget_builder ?? {}).includes('"copiado"'))).toBe(false);
});

test('«Una clase concreta» no da código hasta elegir la clase, que se pide allí mismo', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await page.getByRole('radiogroup', { name: 'Más cosas para tu web' }).getByRole('radio', { name: /Una clase concreta/ }).click();
  await expect(page.locator('pre')).toHaveCount(0);
  await irA(page, 'Ponlo en tu web');
  await expect(page.getByRole('status').filter({ hasText: 'Elige la clase para tener el código.' })).toBeVisible();
  await expect(page.getByText('Te falta un dato')).toBeVisible();
  await page.getByRole('combobox', { name: 'Qué clase' }).filter({ visible: true }).selectOption({ index: 1 });
  await expect(page.locator('pre')).toContainText(`/reservar/${SLUG}?`);
  await expect(page.getByRole('button', { name: /Copiar (el )?enlace/ })).toBeVisible();
});

test('«Tu clase de prueba»: `prueba=1` en el código y sin la forma sin marco', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: /Tu clase de prueba/ }).click();
  await expect(page.locator('pre')).toContainText('prueba=1');
  await irA(page, 'Ponlo en tu web');
  await abrirPliegue(page, 'Para quien te hace la web');
  await expect(page.getByRole('switch', { name: 'Ponerlo sin marco' })).toHaveCount(0);
});

test('autorizar su web: con y sin «www» en UNA petición; con un 4xx, en rojo y la lista no cambia (con contador)', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com', dominios: ['https://midominio.com'] });
  let respuesta: 'ok' | '403' = 'ok';
  const envios: string[][] = [];
  await page.route('**/api/estudio/widget-dominios', route => {
    const cuerpo = route.request().postDataJSON() as { dominios: string[] };
    envios.push(cuerpo.dominios);
    return respuesta === 'ok'
      ? json(route, { ok: true, dominios: cuerpo.dominios })
      : json(route, { error: 'Solo la propietaria puede cambiar las webs autorizadas.' }, 403);
  });
  await empezar(page);
  await irA(page, 'Ponlo en tu web');
  await abrirPliegue(page, 'Para quien te hace la web');
  await page.getByRole('switch', { name: 'Ponerlo sin marco' }).click();
  const lista = page.getByRole('list', { name: 'Webs autorizadas' });
  await expect(lista).toContainText('https://midominio.com');
  const campo = page.getByLabel('Dirección de la web que quieres autorizar');
  await campo.fill('otrodominio.com');
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await expect.poll(() => envios.length, { timeout: 10_000 }).toBe(1);
  expect(envios[0]).toEqual(expect.arrayContaining(['https://midominio.com', 'https://otrodominio.com', 'https://www.otrodominio.com']));
  await expect(lista).toContainText('https://www.otrodominio.com');

  respuesta = '403';
  await campo.fill('tercero.com');
  await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
  await expect.poll(() => envios.length, { timeout: 10_000 }).toBe(2);
  await expect(page.getByRole('alert').filter({ hasText: 'Solo la propietaria puede cambiar las webs autorizadas.' })).toBeVisible();
  await expect(lista).not.toContainText('tercero.com');
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

  test('los cuatro pasos caben: sin desbordar, con «Más cosas» a la vista y los pasos dibujados uno debajo de otro', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    const desborda = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await expect(page.getByRole('radiogroup', { name: 'Más cosas para tu web' })).toBeVisible();
    expect(await desborda()).toBe(false);
    for (const p of ['Dónde va', 'Cómo se ve', 'Ponlo en tu web'] as const) {
      await irA(page, p);
      expect(await desborda(), p).toBe(false);
    }
    const dibujos = page.locator('[data-dibujo-paso]').filter({ visible: true });
    await expect(dibujos).toHaveCount(3);
    // Medidos a la vez: la página puede estar aún desplazándose hasta el título del paso.
    const [a, b] = await dibujos.evaluateAll(els => els.slice(0, 2).map(e => e.getBoundingClientRect().toJSON() as DOMRect));
    expect(b.top).toBeGreaterThan(a.bottom);
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
    await expect(page.getByRole('heading', { name: 'Cómo se ve', exact: true })).toBeVisible();
    await captura(page, `v2-paso-3-como-${ancho}`);
    await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
    const arena = estilos(page).getByRole('radio', { name: 'Arena', exact: true });
    await arena.click();
    await expect(barra(page)).toContainText('Sin publicar en tu web: el estilo');
    await captura(page, `v2-paso-3-como-estilo-propio-${ancho}`);
    await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
    await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
    await captura(page, `v2-paso-4-ponlo-${ancho}`);
    await abrirPliegue(page, 'Para quien te hace la web');
    await page.getByRole('heading', { name: /Colores y letra propios solo en/ }).scrollIntoViewIfNeeded();
    await captura(page, `v2-paso-4-para-quien-te-hace-la-web-${ancho}`, { soloPagina: false });
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

// ─────────────────────────────────────────────────────────────────────────────
// «Tu horario, tus clases»: el horario dentro de una página, sin la página
// completa debajo (lib/widgets/solo-horario.ts; /reservar lo entiende con `solo=1`).
// Una opción a la vista en «Qué pones», ENCENDIDA en un código nuevo; y, para
// quien ya tiene pegado un código de antes (que no cambia solo), un aviso que
// dice cómo recuperarlo, con su control: no sale a quien no le toca.
// ─────────────────────────────────────────────────────────────────────────────

const interruptorSolo = (page: Page) => page.getByRole('switch', { name: 'Tu horario, tus clases' }).filter({ visible: true });
const codigoVisible = (page: Page) => page.locator('pre');
/** La foto de una config de ANTES de la opción: sin el campo (así la guardó el panel de antes). */
const { soloHorario: _sinCampo, ...CONFIG_DE_ANTES } = CONFIG_POR_DEFECTO;
const TEXTO_RECOPIAR = 'Si en tu web te salen los bonos y las cuotas debajo del horario, vuelve a copiar el código: el nuevo trae «Tu horario, tus clases» activado. El que ya tienes pegado no cambia solo.';
const filaHorario = (page: Page) => page.getByRole('list', { name: 'Tus widgets' }).getByRole('listitem').filter({ hasText: 'Horario y reservas' });

/** Lo pegado ANTES de la opción: un código de siempre (sin `solo=1`), con su foto sin el campo. */
function copiaDeAntes(por: 'congelado' | 'id') {
  const firma = firmaCodigo({ widget: HORARIO as never, config: { ...CONFIG_POR_DEFECTO, soloHorario: false }, origen: '', slug: SLUG, pieza: por === 'id' ? ID : null }, 'iframe');
  return { firma, en: '2026-10-01T10:05:00.000Z', metodo: 'iframe', ...(por === 'id' ? { pieza: ID } : {}), config: CONFIG_DE_ANTES };
}

test('«Tu horario, tus clases» está a la vista en «Qué pones», ENCENDIDA en un código nuevo, y al apagarla el código copiado lo refleja', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { c } = await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  // A la vista (no escondida en «Más opciones»), con su explicación en positivo.
  await expect(interruptorSolo(page)).toBeVisible();
  await expect(interruptorSolo(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Solo se ven tus clases y reservar. Sin tus bonos ni tus cuotas debajo.')).toBeVisible();
  expect(await page.locator('body').innerText(), 'ningún texto de este paso habla de «nada más debajo»').not.toMatch(/nada más debajo/i);
  // El código nuevo lleva `solo=1`, y la vista previa también: ve lo mismo que copia.
  await expect(codigoVisible(page)).toContainText('solo=1');
  await expect.poll(async () => await previa(page).getAttribute('src') ?? '', { timeout: 30_000 }).toContain('solo=1');
  // Apagarla: el código y la vista previa dejan de llevarlo.
  await interruptorSolo(page).click();
  await expect(interruptorSolo(page)).toHaveAttribute('aria-checked', 'false');
  await expect(codigoVisible(page)).not.toContainText('solo=1');
  await expect.poll(async () => await previa(page).getAttribute('src') ?? '', { timeout: 30_000 }).not.toContain('solo=1');
  // Y lo que se publica al pasar a «Ponlo en tu web» (donde nace el código por id) la lleva APAGADA: el código
  // que se pega es el de siempre (`w=<id>`) y lo que dice su web lo decide lo publicado.
  await irA(page, 'Ponlo en tu web');
  await expect.poll(() => c.piezas.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(c.piezas[0]).toMatchObject({ widget: 'horario', config: { soloHorario: false } });
});

test('en un código nuevo, lo que se publica al crear el código por id lleva la opción ENCENDIDA (es lo que su web leerá)', async ({ page }) => {
  const { c } = await montar(page, { direccion: 'pilatescentro.example.com' });
  await empezar(page);
  await irA(page, 'Ponlo en tu web');
  await expect.poll(() => c.piezas.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(c.piezas[0]).toMatchObject({ widget: 'horario', config: { soloHorario: true } });
  const copiar = page.getByRole('button', { name: 'Copiar código' });
  await expect(copiar).toBeEnabled({ timeout: 30_000 });
  await copiar.click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado)).toContain(`w=${ID}`);
});

test('«Tu horario, tus clases» no se ofrece donde no existe: en un enlace no sale ni se promete', async ({ page }) => {
  await montar(page, { direccion: 'pilatescentro.example.com', widgetBuilder: { horario: { ...CONFIG_POR_DEFECTO, metodo: 'enlace' } } });
  await empezar(page);
  await expect(interruptorSolo(page)).toHaveCount(0);
  await expect(page.getByText(/Sin tus bonos ni tus cuotas debajo/)).toHaveCount(0);
  await expect(codigoVisible(page)).not.toContainText('solo=1');
});

test('el aviso de recuperarlo: quien tiene pegado un código de ANTES lo ve en su fila, con las palabras del fundador, y su botón copia el nuevo con la opción', async ({ page }) => {
  const { c } = await montar(page, {
    direccion: 'pilatescentro.example.com',
    widgetBuilder: { horario: { ...CONFIG_DE_ANTES, metodo: 'iframe', copiado: copiaDeAntes('congelado') } },
  });
  const fila = filaHorario(page);
  await expect(fila).toBeVisible({ timeout: 60_000 });
  const aviso = fila.locator('[data-aviso-fila]');
  await expect(aviso).toHaveAttribute('data-aviso-fila', 'solo-horario');
  await expect(aviso).toContainText(TEXTO_RECOPIAR);
  // No dice «lo cambiaste»: lo de ahora es lo mismo salvo la opción, y eso lo cuenta este aviso, no un desfase.
  await expect(fila).not.toContainText('Lo cambiaste después de copiarlo');
  await expect(fila.locator('[data-estado-en-tu-web]')).not.toHaveText('Tu web tiene lo de antes');
  // Y su botón lleva a copiar el código nuevo, que la lleva.
  await aviso.getByRole('button', { name: 'Copiar el código nuevo' }).click();
  await expect(pasos(page).getByRole('button', { name: 'Ponlo en tu web' })).toHaveAttribute('aria-current', 'step');
  // En «Ponlo en tu web» también se dice, junto al botón de copiar.
  await expect(page.locator('[data-aviso-solo-horario="copiar"]')).toContainText(TEXTO_RECOPIAR);
  // El código nuevo nace por id: lo que su web leerá es lo que se publica, y lleva la opción.
  await expect.poll(() => c.piezas.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(c.piezas[0]).toMatchObject({ widget: 'horario', config: { soloHorario: true } });
  const copiar = page.getByRole('button', { name: /Copiar el código/ }).first();
  await expect(copiar).toBeEnabled({ timeout: 30_000 });
  await copiar.click();
  expect(await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado)).toContain(`w=${ID}`);
  // Ya copiado el nuevo, el aviso se va (la copia nueva no es «de antes»).
  await irA(page, 'Qué pones');
  await page.getByRole('button', { name: /^Salir/ }).click();
  await expect(filaHorario(page).locator('[data-aviso-fila="solo-horario"]')).toHaveCount(0);
});

test('CONTROL del aviso: no sale a quien aún no ha pegado nada, ni a quien ya tiene su código nuevo (con la opción o apagada a propósito)', async ({ page }) => {
  // Nada copiado: el vacío que enseña, sin ninguna fila ni aviso.
  await montar(page, { direccion: 'pilatescentro.example.com' });
  await expect(page.getByRole('heading', { name: 'Pon tu horario en tu web' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-aviso-fila]')).toHaveCount(0);
  await expect(page.locator('[data-aviso-solo-horario]')).toHaveCount(0);
});

for (const caso of [
  { nombre: 'con la opción encendida', solo: true },
  { nombre: 'con la opción apagada a propósito', solo: false },
]) {
  test(`CONTROL del aviso: quien ya copió el código NUEVO ${caso.nombre} no lo ve`, async ({ page }) => {
    const config = { ...CONFIG_POR_DEFECTO, soloHorario: caso.solo };
    const firma = firmaCodigo({ widget: HORARIO as never, config, origen: '', slug: SLUG, pieza: null }, 'iframe');
    await montar(page, {
      direccion: 'pilatescentro.example.com',
      widgetBuilder: { horario: { ...config, metodo: 'iframe', copiado: { firma, en: '2026-10-16T10:05:00.000Z', metodo: 'iframe', config } } },
    });
    // La fila está (hay algo copiado) y NO lleva el aviso.
    await expect(filaHorario(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-aviso-fila="solo-horario"]')).toHaveCount(0);
    await expect(filaHorario(page)).not.toContainText('vuelve a copiar el código');
  });
}

test('por id: el aviso dice «activa y publica» (el código pegado no cambia), el botón enciende la opción y «Publicar» la manda; publicada, el aviso se va', async ({ page }) => {
  const { c } = await montar(page, {
    direccion: 'pilatescentro.example.com',
    piezas: PUBLICADA(),
    widgetBuilder: { horario: { ...CONFIG_DE_ANTES, metodo: 'iframe', copiado: copiaDeAntes('id') } },
  });
  const fila = filaHorario(page);
  await expect(fila).toBeVisible({ timeout: 60_000 });
  const aviso = fila.locator('[data-aviso-fila]');
  await expect(aviso).toHaveAttribute('data-aviso-fila', 'solo-horario');
  await expect(aviso).toContainText('activa «Tu horario, tus clases» y pulsa «Publicar en mi web»: el código que ya tienes pegado no cambia');
  // Al llegar, NADA está sin publicar (no se enciende sola: no se toca lo publicado sin pedirlo).
  await expect(barra(page)).toHaveCount(0);
  expect(c.piezas.length + c.estilos.length).toBe(0);
  await aviso.getByRole('button', { name: 'Activar «Tu horario, tus clases»' }).click();
  // Ahora sí queda sin publicar, con su nombre en la barra.
  await expect(pasos(page).getByRole('button', { name: 'Qué pones' })).toHaveAttribute('aria-current', 'step');
  await expect(barra(page)).toContainText('la opción «Tu horario, tus clases» de «Horario y reservas»', { timeout: 30_000 });
  await publicar(page).click();
  await expect.poll(() => c.piezas.length, { timeout: 30_000 }).toBe(1);
  expect(c.piezas[0]).toMatchObject({ widget: 'horario', config: { soloHorario: true } });
  await expect(barra(page).getByText(PUBLICADO)).toBeVisible();
  // Publicada la opción, el aviso se va.
  await page.getByRole('button', { name: /^Salir/ }).click();
  await expect(filaHorario(page).locator('[data-aviso-fila="solo-horario"]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// PR 3 · La vista previa (decisión 6): en el móvil por defecto y a tamaño real,
// el ordenador que se lee, la anterior mientras carga, «Abrir en una pestaña»
// con la dirección de verdad y, por debajo de las dos columnas, en una hoja.
// ─────────────────────────────────────────────────────────────────────────────

const dispositivos = (page: Page) => page.getByRole('group', { name: 'Dispositivo de la vista previa' }).filter({ visible: true }).first();
/** La escala con que se pinta el iframe de la previa (su caja en pantalla frente a su ancho de verdad). */
const escalaDe = (page: Page) => previa(page).evaluate(el => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
/** Espera a que la previa cargue de verdad el horario, para medir dentro. */
async function previaCargada(page: Page) {
  // Al cambiar de Móvil a Ordenador el iframe cambia de marco (del iPhone al Mac) y se monta otro:
  // si se coge el de antes justo al cambiar, se suelta y se vuelve a por el nuevo.
  for (let intento = 0; ; intento++) {
    await expect(previa(page)).toHaveCount(1, { timeout: 30_000 });
    const marco = await previa(page).elementHandle();
    const frame = await marco!.contentFrame();
    try {
      await frame!.locator('#horario').waitFor({ timeout: 120_000 });
      return frame!;
    } catch (e) {
      if (intento >= 2 || !String(e).includes('detached')) throw e;
    }
  }
}
/** Retiene el documento de la previa que lleva el estilo Arena (el cambio que se hace) hasta `soltar()`. */
async function retenerArena(page: Page) {
  const estado = { retener: false, retenidas: 0, soltar: () => {} };
  const retenida = new Promise<void>(r => { estado.soltar = r; });
  await page.route(u => u.pathname.startsWith(`/reservar/${SLUG}`), async route => {
    if (estado.retener && route.request().resourceType() === 'document' && decodeURIComponent(route.request().url()).includes('"estilo":"arena"')) {
      estado.retenidas += 1;
      await retenida;
    }
    return route.continue();
  });
  return estado;
}

test.describe('la vista previa a 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('la portada vacía enseña su horario DE VERDAD en el móvil (no un hueco en blanco), sin dejarse tocar', async ({ page }) => {
    await montar(page, { plataforma: null });
    const escaparate = page.getByTitle('Tu horario, como lo verá tu alumna');
    await expect(escaparate).toBeVisible({ timeout: 60_000 });
    await expect(escaparate).toHaveAttribute('inert', '');
    const marco = await escaparate.elementHandle();
    const frame = await marco!.contentFrame();
    // Que llegue a CARGAR (con `loading="lazy"` dentro de un marco escalado no cargaba nunca: el móvil en blanco).
    await expect.poll(() => frame!.url(), { timeout: 30_000 }).toContain(`/reservar/${SLUG}`);
    // Lleva el marcador de la vista previa: ni cuenta visitas ni reserva.
    expect(new URL(frame!.url()).searchParams.get('vista-previa')).toBe('1');
    await frame!.locator('#horario').waitFor({ timeout: 120_000 });
    await expect(frame!.getByRole('button', { name: /Reformer a las 10:00/ }).first()).toBeVisible();
  });

  test('entra en «Móvil», en el iPhone y a su ancho de verdad sin cortarse; «Ordenador», en el Mac, se lee (≥ 0,75), lo dice y tiene «Ver a tamaño real»', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    await expect(dispositivos(page).getByRole('button')).toHaveText(['Móvil', 'Ordenador']);
    await expect(dispositivos(page).getByRole('button', { name: 'Móvil' })).toHaveAttribute('aria-pressed', 'true');
    await previaCargada(page);
    // El iPhone del panel, con la página a la anchura de su pantalla (no la de un ordenador encogida).
    const iphone = page.locator('[data-marco-movil]');
    await expect(iphone.getByTestId('iphone-isla')).toBeVisible();
    expect(await previa(page).evaluate(el => (el as HTMLElement).offsetWidth)).toBeGreaterThanOrEqual(390);
    // A 900 de alto el teléfono entero no cabe a 1: baja lo justo para verse entero, sin cortarse.
    const tel = (await iphone.boundingBox())!;
    expect(tel.y + tel.height, 'el iPhone se sale por abajo').toBeLessThanOrEqual(900 + 1);
    expect(tel.x + tel.width).toBeLessThanOrEqual(1440);
    // La barra de estado del iPhone no tapa la página: la dirección y la web van por debajo.
    const estado = (await iphone.getByTestId('iphone-estado').boundingBox())!;
    const pagina = (await iphone.locator('[data-vista-previa]').boundingBox())!;
    expect(pagina.y).toBeGreaterThanOrEqual(estado.y + estado.height - 0.5);

    await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
    const frame = await previaCargada(page);
    // El MacBook: el notch arriba, y la ventana del navegador empieza por debajo de él.
    const notch = (await page.getByTestId('mac-notch').boundingBox())!;
    const ventana = (await page.getByTestId('mac-pantalla').locator('[data-vista-previa]').boundingBox())!;
    expect(ventana.y, 'el notch tapa la página').toBeGreaterThanOrEqual(notch.y + notch.height);
    await expect(page.getByTestId('mac-base')).toBeVisible();
    await expect.poll(() => escalaDe(page)).toBeGreaterThanOrEqual(0.75);
    const escala = await escalaDe(page);
    // La letra de una tarjeta de clase tal como la ve la dueña: 11 px como poco.
    const letra = await frame.getByRole('button', { name: /Reformer a las 10:00/ }).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(letra * escala, `letra de ${letra} px a ${escala.toFixed(2)}`).toBeGreaterThanOrEqual(11);
    // Ordenador y móvil no se pintan igual.
    expect(await previa(page).evaluate(el => (el as HTMLElement).offsetWidth)).toBeGreaterThan(450);
    await expect(page.getByText(/Así se ve en una ventana estrecha de ordenador\./)).toBeVisible();
    // «Ver a tamaño real»: la web de 1200 en una hoja, con su propio iframe (con otro título).
    await page.getByRole('button', { name: 'Ver a tamaño real' }).click();
    const hoja = page.getByRole('dialog', { name: 'La vista previa a tamaño real' });
    await expect(hoja).toBeVisible();
    const real = hoja.getByTitle(/^A tamaño real:/);
    await expect(real).toBeVisible();
    // La web de 1200 entera, a 1: a 1440 cabe (con `poll`: la hoja entra con una animación de escala).
    await expect.poll(() => real.evaluate(el => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth)).toBeGreaterThanOrEqual(0.99);
    await hoja.getByRole('button', { name: 'Cerrar la vista previa a tamaño real' }).click();
    await expect(hoja).toHaveCount(0);
  });

  test('con una ventana alta, el iPhone va a tamaño real', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1300 });
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    await previaCargada(page);
    // La página, a 402 (la pantalla del iPhone) y el teléfono, a 1 o casi.
    expect(await escalaDe(page)).toBeGreaterThanOrEqual(0.95);
    const caja = (await previa(page).boundingBox())!;
    expect(caja.width, `el móvil mide ${Math.round(caja.width)} px`).toBeGreaterThanOrEqual(390 * 0.95);
  });

  test('mientras carga un cambio, se queda la vista previa de antes con «Actualizando…» encima', async ({ page }) => {
    const r = await retenerArena(page);
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    const antes = await previaCargada(page);
    const srcAntes = await previa(page).getAttribute('src');
    await irA(page, 'Cómo se ve');
    r.retener = true;
    await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
    await estilos(page).getByRole('radio', { name: 'Arena', exact: true }).click();
    await expect.poll(() => r.retenidas, { timeout: 20_000 }).toBeGreaterThan(0);
    // La de antes sigue delante y con su horario; la nueva carga detrás, sin el título de la vista previa.
    await expect(page.getByText('Actualizando…')).toBeVisible();
    await expect(previa(page)).toHaveCount(1);
    expect(await previa(page).getAttribute('src')).toBe(srcAntes);
    await expect(antes.locator('#horario')).toBeVisible();
    const detras = page.getByTitle('Cargando la vista previa');
    await expect(detras).toHaveCount(1);
    await expect(detras).toHaveAttribute('aria-hidden', 'true');
    r.soltar();
    // Al cargar, la nueva pasa delante y la de antes se va.
    await expect.poll(async () => decodeURIComponent(await previa(page).getAttribute('src') ?? ''), { timeout: 60_000 }).toContain('"estilo":"arena"');
    await expect(detras).toHaveCount(0);
    await expect(page.getByText('Actualizando…')).toHaveCount(0, { timeout: 30_000 });
  });

  test('«Abrir en una pestaña» lleva la dirección de verdad: sin `vista-previa` ni el borrador', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    await irA(page, 'Cómo se ve');
    await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
    await estilos(page).getByRole('radio', { name: 'Arena', exact: true }).click();
    // La previa sí lleva el marcador y el borrador…
    await expect.poll(async () => decodeURIComponent(await previa(page).getAttribute('src') ?? ''), { timeout: 20_000 }).toContain('"estilo":"arena"');
    expect(await previa(page).getAttribute('src')).toContain('vista-previa=1');
    // …y la pestaña no: es lo que verá su alumna, y ahí se reserva de verdad.
    const href = await page.getByRole('link', { name: 'Abrir el widget en una pestaña nueva' }).getAttribute('href');
    expect(href).toContain(`/reservar/${SLUG}`);
    expect(href).not.toContain('vista-previa');
    expect(href).not.toContain('borrador-web');
  });
});

test.describe('la vista previa dice que es un ejemplo, y su barra de direcciones nombra la web del estudio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('la leyenda lo dice claro y sin tecnicismos: un ejemplo con su nombre y su color; su web real puede verse distinta', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    await previaCargada(page);
    const leyenda = page.locator('section[aria-label="Vista previa"] p').filter({ hasText: /Es un ejemplo de página/ });
    await expect(leyenda).toBeVisible();
    await expect(leyenda).toContainText('con el nombre y el color de tu estudio: tu web real puede verse distinta');
    await expect(leyenda).toContainText('El widget sí es el de verdad, con tus clases de hoy.');
    // Ya no habla de «dibujo»: era jerga.
    await expect(page.locator('section[aria-label="Vista previa"]')).not.toContainText('un dibujo de tu web');
  });

  test('la barra de direcciones: la web que contestó; si no, una autorizada; si no, «tu-web.com» (nunca la de otro)', async ({ page }) => {
    // Con su dirección.
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    await previaCargada(page);
    await expect(page.locator('[data-marco-movil]')).toContainText('pilatescentro.example.com');
  });

  test('sin dirección contestada, la de una web autorizada', async ({ page }) => {
    await montar(page, { dominios: ['https://www.estudiogranada.example.com'] });
    await empezar(page);
    await previaCargada(page);
    await expect(page.locator('[data-marco-movil]')).toContainText('www.estudiogranada.example.com');
    await expect(page.locator('[data-marco-movil]')).not.toContainText('tu-web.com');
  });

  test('sin ninguna, «tu-web.com», en el iPhone y en el Mac', async ({ page }) => {
    await montar(page, {});
    await empezar(page);
    await previaCargada(page);
    await expect(page.locator('[data-marco-movil]')).toContainText('tu-web.com');
    await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
    await previaCargada(page);
    await expect(page.getByTestId('mac-pantalla')).toContainText('tu-web.com');
  });
});

test.describe('la vista previa a 375', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('no va encima del paso: «Ver cómo queda» la abre en una hoja, en el móvil y sin salirse', async ({ page }) => {
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await empezar(page);
    // Sin la hoja abierta no hay ningún iframe cargando a escondidas.
    await expect(page.getByRole('button', { name: 'Ver cómo queda' })).toBeVisible();
    await expect(previa(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver cómo queda' }).click();
    const hoja = page.getByRole('dialog', { name: 'Cómo queda en tu web' });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole('group', { name: 'Dispositivo de la vista previa' }).getByRole('button', { name: 'Móvil' })).toHaveAttribute('aria-pressed', 'true');
    const iframe = hoja.getByTitle(/^Vista previa:/);
    await expect(iframe).toBeVisible();
    const caja = (await iframe.boundingBox())!;
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(375 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
    await hoja.getByRole('button', { name: 'Cerrar la vista previa' }).click();
    await expect(hoja).toHaveCount(0);
  });
});

test.describe('capturas de la vista previa (solo con CAPTURAS_PR3=<carpeta>)', () => {
  const carpeta = process.env.CAPTURAS_PR3;
  test.skip(!carpeta, 'solo con CAPTURAS_PR3');
  test.setTimeout(600_000);
  /** La ventana tal cual, con la previa ya cargada. */
  async function foto(page: Page, nombre: string) {
    const plegar = page.getByRole('button', { name: 'Plegar «Primeros pasos»' });
    if (await plegar.isVisible().catch(() => false)) await plegar.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${carpeta}/${nombre}.png` });
  }

  test('oscuro, iPhone y Mac, y la portada vacía', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await montar(page, { direccion: 'pilatescentro.example.com' });
    await expect(page.getByRole('heading', { name: 'Pon tu horario en tu web' })).toBeVisible({ timeout: 60_000 });
    const escaparate = await page.getByTitle('Tu horario, como lo verá tu alumna').elementHandle();
    await (await escaparate!.contentFrame())!.locator('#horario').waitFor({ timeout: 120_000 });
    await foto(page, 'vacio-pon-tu-horario-1440');
    await page.evaluate(() => localStorage.setItem('panel-dark-mode', '1'));
    await page.reload();
    await empezar(page);
    await irA(page, 'Cómo se ve');
    await previaCargada(page);
    await foto(page, 'previa-movil-oscuro-1440');
    await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
    await previaCargada(page);
    await foto(page, 'previa-ordenador-oscuro-1440');
  });

  for (const ancho of [1440, 375]) {
    test(`móvil y ordenador${ancho > 400 ? ' y «Actualizando…»' : ''} a ${ancho}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: ancho > 400 ? 900 : 812 });
      const r = await retenerArena(page);
      await montar(page, { direccion: 'pilatescentro.example.com' });
      await empezar(page);
      await irA(page, 'Cómo se ve');
      const estrecho = ancho < 400;
      if (estrecho) await page.getByRole('button', { name: 'Ver cómo queda' }).click();
      await previaCargada(page);
      await foto(page, `previa-movil-${ancho}`);
      await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
      await previaCargada(page);
      await foto(page, `previa-ordenador-${ancho}`);
      // «Actualizando…» sobre la de antes, solo a dos columnas: en la hoja, cerrarla para cambiar
      // el estilo la desmonta, y al abrirla otra vez no hay «la de antes» que enseñar.
      if (estrecho) return;
      await dispositivos(page).getByRole('button', { name: 'Móvil' }).click();
      await previaCargada(page);
      r.retener = true;
      await niveles(page).getByRole('radio', { name: /Un estilo solo para tu web/ }).click();
      await estilos(page).getByRole('radio', { name: 'Arena', exact: true }).click();
      await expect(page.getByText('Actualizando…')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${carpeta}/previa-actualizando-${ancho}.png` });
      r.soltar();
    });
  }
});

test.describe('capturas de «Tu horario, tus clases» (solo con CAPTURAS_SOLO=<carpeta>)', () => {
  const carpeta = process.env.CAPTURAS_SOLO;
  test.skip(!carpeta, 'solo con CAPTURAS_SOLO');
  test.setTimeout(900_000);
  const PLANES_CAPTURA = [
    { id: 'p-cuota', studioId: STUDIO_ID, tipo: 'MENSUAL', activo: true, precio: 89, nombre: 'Cuota Reformer', periodicidadMeses: 1 },
    { id: 'p-bono', studioId: STUDIO_ID, tipo: 'BONO', activo: true, precio: 100, nombre: 'Bono 10 clases', sesiones: 10 },
  ];
  async function foto(page: Page, nombre: string) {
    const plegar = page.getByRole('button', { name: 'Plegar «Primeros pasos»' });
    if (await plegar.isVisible().catch(() => false)) await plegar.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${carpeta}/${nombre}.png` });
  }
  /** Baja la página dibujada hasta lo último: ahí es donde se ve lo que sale debajo del horario. */
  const bajarLaPrevia = (page: Page) => page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-vista-previa]')) el.scrollTop = el.scrollHeight;
  });

  for (const ancho of [1440, 375]) {
    test(`el paso con la opción, y la vista previa con y sin lo de debajo, a ${ancho}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: ancho > 400 ? 900 : 812 });
      await montar(page, { dominios: ['https://www.pilatescentro.example.com'], planesPublicos: PLANES_CAPTURA });
      await empezar(page);
      const estrecho = ancho < 400;
      await expect(interruptorSolo(page)).toBeVisible();
      if (!estrecho) await previaCargada(page);
      await page.getByText('Solo se ven tus clases y reservar.').scrollIntoViewIfNeeded();
      await foto(page, `paso-que-con-la-opcion-${ancho}`);

      /** Móvil y ordenador, bajados hasta el final de la página dibujada. */
      async function previas(estado: string) {
        if (estrecho) await page.getByRole('button', { name: 'Ver cómo queda' }).click();
        for (const [dispositivo, nombre] of [['Móvil', 'movil'], ['Ordenador', 'ordenador']] as const) {
          await dispositivos(page).getByRole('button', { name: dispositivo }).click();
          await previaCargada(page);
          await page.waitForTimeout(2500);
          await bajarLaPrevia(page);
          await foto(page, `previa-${estado}-${nombre}-${ancho}`);
        }
        if (estrecho) await page.getByRole('button', { name: 'Cerrar la vista previa' }).click();
      }

      // Con la opción encendida (lo que sale en un código nuevo): el horario y nada más.
      await previas('opcion-activada-sin-bonos');
      // Y apagada (lo de antes): debajo del horario, los bonos y las cuotas.
      await interruptorSolo(page).click();
      await expect(interruptorSolo(page)).toHaveAttribute('aria-checked', 'false');
      await page.waitForTimeout(1500);
      await previas('opcion-apagada-con-bonos');
    });
  }

  test('la leyenda de «ejemplo» y la barra de direcciones con la web del estudio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await montar(page, { dominios: ['https://www.pilatescentro.example.com'], planesPublicos: PLANES_CAPTURA });
    await empezar(page);
    await previaCargada(page);
    await page.waitForTimeout(2500);
    await page.locator('section[aria-label="Vista previa"]').scrollIntoViewIfNeeded();
    await foto(page, 'leyenda-ejemplo-y-direccion-movil-1440');
    await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
    await previaCargada(page);
    await foto(page, 'leyenda-ejemplo-y-direccion-ordenador-1440');
  });

  test('el aviso de recuperarlo, en la fila y en «Ponlo en tu web»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await montar(page, {
      dominios: ['https://www.pilatescentro.example.com'], planesPublicos: PLANES_CAPTURA, direccion: 'pilatescentro.example.com',
      widgetBuilder: { horario: { ...CONFIG_DE_ANTES, metodo: 'iframe', copiado: copiaDeAntes('congelado') } },
    });
    await expect(filaHorario(page)).toBeVisible({ timeout: 60_000 });
    await foto(page, 'aviso-recuperarlo-fila-1440');
    await filaHorario(page).getByRole('button', { name: 'Copiar el código nuevo' }).click();
    await expect(page.locator('[data-aviso-solo-horario]')).toBeVisible();
    await page.locator('[data-aviso-solo-horario]').scrollIntoViewIfNeeded();
    await foto(page, 'aviso-recuperarlo-ponlo-1440');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Su web REAL detrás del widget en la vista previa («Tu web» v2, punto 3).
//
// El servidor decide si su web deja que la enseñemos (cabeceras, en node:test:
// lib/widgets/web-real); aquí se mockea ESA respuesta (localhost no es público, y
// la ruta real se probaría contra Internet) y se prueba lo que pasa en el panel:
//  · se deja → su web de fondo en un documento NUESTRO (/vista-previa-web) con su
//    propio sandbox, y el widget encima con la etiqueta de «colocación orientativa»;
//  · no se deja / no se sabe / tope → el ejemplo de siempre, el aviso y «Probar de nuevo»;
//  · sin web autorizada, NI UNA petición.
// ⚠️ Cada camino de fallo CUENTA las peticiones (webReal) y tiene su control que sí escribe.
// ─────────────────────────────────────────────────────────────────────────────
const ORIGEN_WEB = 'https://web-ok.example.com';
const seDeja = (route: Route) => json(route, { estado: 'se-deja', permiso: 'permiso-e2e' });
const noSeDeja = (route: Route) => json(route, { estado: 'no-se-deja' });
const AVISO_NO_SE_DEJA = 'Tu web no permite que la mostremos aquí (es una protección normal de muchas webs). Así se verá tu widget en una página de ejemplo.';
const FRASE_COLOCACION = 'No sabemos dónde lo pegarás: aquí va en un sitio fijo. Lo que sí ves de verdad es cómo pega con la letra y el color de tu web.';
const suWeb = (page: Page) => page.locator('[data-su-web]').filter({ visible: true });
const verWeb = (page: Page) => page.getByRole('group', { name: 'Qué se ve detrás del widget' }).filter({ visible: true });
const leyendaEjemplo = (page: Page) => page.locator('section[aria-label="Vista previa"] p').filter({ hasText: /Es un ejemplo de página/ });

/** Sirve el documento que enmarca su web (con las cabeceras de VERDAD que le pone el servidor) y una web de ejemplo. */
async function servirSuWeb(page: Page) {
  const docs: string[] = [];
  const webs: string[] = [];
  await page.route(u => u.pathname === '/vista-previa-web', route => {
    docs.push(route.request().url());
    return route.fulfill({ status: 200, headers: cabecerasDelMarco(ORIGEN_WEB), body: htmlDelMarco(ORIGEN_WEB) });
  });
  await page.route(`${ORIGEN_WEB}/**`, route => {
    webs.push(route.request().url());
    return route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Web del estudio</title><body style="font:20px Georgia"><h1>Pilates Centro de verdad</h1><script>document.body.dataset.js="1"</script>',
    });
  });
  return { docs, webs };
}
const marcoDeSuWeb = (page: Page) => page.frames().find(f => f.url().startsWith(ORIGEN_WEB));

for (const dispositivo of ['Móvil', 'Ordenador'] as const) {
  const nombre = dispositivo === 'Móvil' ? 'iPhone' : 'Mac';
  test.describe(`su web detrás del widget · ${nombre}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('se deja: su web de fondo en NUESTRO documento con su sandbox, el widget encima con la etiqueta, y el interruptor va y vuelve sin preguntar otra vez', async ({ page }) => {
      const consola: string[] = [];
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) consola.push(m.text()); });
      const { c } = await montar(page, { dominios: [ORIGEN_WEB], direccion: 'web-ok.example.com', webReal: seDeja });
      await servirSuWeb(page);
      await empezar(page);
      if (dispositivo === 'Ordenador') await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
      await previaCargada(page);

      await expect(suWeb(page)).toBeVisible({ timeout: 30_000 });
      expect(c.webReal.length, 'tiene que haber preguntado (si no, el resto no prueba nada)').toBeGreaterThan(0);
      expect(c.webReal).toEqual([{ forzar: false }]);
      // Lo que se enmarca desde el panel es NUESTRO documento (con su permiso), nunca la web directamente.
      const doc = suWeb(page).locator('iframe[title="Tu web, de fondo (orientativo)"]');
      await expect(doc).toHaveAttribute('src', '/vista-previa-web?t=permiso-e2e');
      // La web, dentro, con el sandbox justo y sin referrer.
      const documento = await (await doc.elementHandle())!.contentFrame();
      const suMarco = documento!.locator('iframe');
      await expect(suMarco).toHaveAttribute('sandbox', 'allow-scripts');
      expect(await suMarco.getAttribute('sandbox')).not.toContain('allow-same-origin');
      await expect(suMarco).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect(suMarco).toHaveAttribute('loading', 'lazy');
      await expect(suMarco).toHaveAttribute('title', /Tu web, tal como se ve ahora/);
      await expect.poll(() => marcoDeSuWeb(page)?.url() ?? '', { timeout: 30_000 }).toContain(ORIGEN_WEB);
      // MEDIDO: los únicos orígenes que la pantalla del constructor enmarca son el del propio panel
      // (/reservar y /vista-previa-web) y la web del estudio. Ni Stripe ni el captcha cuelgan del panel.
      const origenes = new Set(page.frames().filter(f => f !== page.mainFrame()).map(f => { try { return new URL(f.url()).origin; } catch { return f.url(); } }));
      expect([...origenes].sort()).toEqual([new URL(page.url()).origin, ORIGEN_WEB].sort());
      const web = marcoDeSuWeb(page)!;
      await expect(web.getByRole('heading', { name: 'Pilates Centro de verdad' })).toBeVisible();
      // Corre su JavaScript (allow-scripts), pero en un origen opaco: no ve nuestras cookies ni almacenamiento.
      expect(await web.evaluate(() => `${document.body.dataset.js}|${window.origin}`)).toBe('1|null');
      // La política del documento la aplica el navegador: deja pasar su web y NO otra.
      const bloqueada = await documento!.evaluate(() => new Promise<boolean>(res => {
        document.addEventListener('securitypolicyviolation', () => res(true), { once: true });
        const f = document.createElement('iframe');
        f.src = 'https://otra-web.example.org/';
        document.body.appendChild(f);
        setTimeout(() => res(false), 5000);
      }));
      expect(bloqueada, 'frame-src debe bloquear cualquier otra web').toBe(true);
      expect(consola.filter(t => t.includes(`Framing '${ORIGEN_WEB}`)), 'ninguna violación contra SU web (la única es la de la web ajena que probamos)').toEqual([]);

      // El widget (el /reservar de verdad) va encima, con su etiqueta, y no tapa la barra de direcciones.
      const etiqueta = page.locator('[data-colocacion-orientativa]').filter({ visible: true });
      await expect(etiqueta).toHaveText('Así quedaría: colocación orientativa');
      await expect(previa(page)).toBeVisible();
      const pantalla = dispositivo === 'Móvil' ? page.locator('[data-marco-movil]') : page.getByTestId('mac-pantalla');
      const cajaEtiqueta = (await etiqueta.boundingBox())!;
      const cajaPantalla = (await pantalla.boundingBox())!;
      expect(cajaEtiqueta.y).toBeGreaterThan(cajaPantalla.y + 40);
      expect(cajaEtiqueta.y + cajaEtiqueta.height).toBeLessThan(cajaPantalla.y + cajaPantalla.height);
      await expect(pantalla).toContainText('web-ok.example.com');
      const cajaDir = (await pantalla.getByText('web-ok.example.com', { exact: true }).first().boundingBox())!;
      expect(cajaEtiqueta.y, 'la etiqueta no cubre la barra de direcciones').toBeGreaterThan(cajaDir.y + cajaDir.height);
      // La leyenda lo dice con las palabras del fundador.
      const leyenda = page.locator('section[aria-label="Vista previa"] p').filter({ hasText: 'Así quedaría: colocación orientativa.' });
      await expect(leyenda).toContainText(FRASE_COLOCACION);
      await expect(leyendaEjemplo(page)).toHaveCount(0);

      // El interruptor: ver la página de ejemplo quita su web y trae la leyenda de siempre; volver NO pregunta otra vez.
      await verWeb(page).getByRole('button', { name: 'Ver página de ejemplo' }).click();
      await expect(suWeb(page)).toHaveCount(0);
      await expect(leyendaEjemplo(page)).toBeVisible();
      await verWeb(page).getByRole('button', { name: 'Ver mi web' }).click();
      await expect(suWeb(page)).toBeVisible();
      expect(c.webReal, 'ir y volver no vuelve a consultar').toHaveLength(1);
    });
  });
}

test.describe('su web detrás del widget · lo que no se deja', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('no se deja: el mensaje exacto, el ejemplo de siempre, «Ver mi web» apagado, NI UN documento de su web; «Probar de nuevo» salta la caché (con contador) y, si ahora sí, la enseña', async ({ page }) => {
    const { c } = await montar(page, { dominios: [ORIGEN_WEB], webReal: (route, n) => n === 1 ? noSeDeja(route) : seDeja(route) });
    const { docs } = await servirSuWeb(page);
    await empezar(page);
    await previaCargada(page);
    const aviso = page.locator('[data-aviso-su-web="no-se-deja"]');
    await expect(aviso).toContainText(AVISO_NO_SE_DEJA);
    await expect(aviso).not.toContainText(/X-Frame|CSP|cabecera|frame-ancestors|iframe/i);
    expect(c.webReal.length).toBeGreaterThan(0);
    await expect(suWeb(page)).toHaveCount(0);
    expect(docs, 'sin permiso, nadie pide el documento de su web').toHaveLength(0);
    // Sigue el ejemplo de siempre.
    await expect(leyendaEjemplo(page)).toBeVisible();
    await expect(verWeb(page).getByRole('button', { name: 'Ver mi web' })).toBeDisabled();
    await expect(verWeb(page).getByRole('button', { name: 'Ver página de ejemplo' })).toHaveAttribute('aria-pressed', 'true');

    // CONTROL: «Probar de nuevo» SÍ pregunta (forzando) y, con una respuesta distinta, su web aparece.
    await aviso.getByRole('button', { name: 'Probar de nuevo' }).click();
    await expect(suWeb(page)).toBeVisible({ timeout: 30_000 });
    expect(c.webReal).toEqual([{ forzar: false }, { forzar: true }]);
    await expect(page.locator('[data-aviso-su-web]')).toHaveCount(0);
  });

  const CASOS: { nombre: string; responder: (r: Route) => Promise<void> | void; fase: string; texto: RegExp }[] = [
    { nombre: 'el servidor no sabe', responder: r => json(r, { estado: 'sin-saber' }), fase: 'sin-saber', texto: /no hemos podido abrir tu web/ },
    { nombre: 'un 500', responder: r => json(r, { error: 'x' }, 500), fase: 'sin-saber', texto: /no hemos podido abrir tu web/ },
    { nombre: 'sin red', responder: r => r.abort('internetdisconnected'), fase: 'sin-saber', texto: /no hemos podido abrir tu web/ },
    { nombre: 'el tope de consultas', responder: r => json(r, { estado: 'tope' }), fase: 'tope', texto: /Has probado muchas veces/ },
    { nombre: 'una respuesta rara (se deja, sin permiso)', responder: r => json(r, { estado: 'se-deja' }), fase: 'sin-saber', texto: /no hemos podido abrir tu web/ },
  ];
  for (const caso of CASOS) {
    test(`${caso.nombre}: el ejemplo, un aviso sin jerga y «Probar de nuevo»; jamás su web (con contador)`, async ({ page }) => {
      const { c } = await montar(page, { dominios: [ORIGEN_WEB], webReal: caso.responder });
      const { docs } = await servirSuWeb(page);
      await empezar(page);
      await previaCargada(page);
      await expect(page.locator(`[data-aviso-su-web="${caso.fase}"]`)).toContainText(caso.texto);
      expect(c.webReal.length, 'tiene que haber intentado: si no, «no la enseñó» sería verdad por no haber hecho nada').toBeGreaterThan(0);
      await expect(suWeb(page)).toHaveCount(0);
      expect(docs).toHaveLength(0);
      await expect(page.getByRole('button', { name: 'Probar de nuevo' })).toBeVisible();
      await expect(leyendaEjemplo(page)).toBeVisible();
    });
  }

  test('sin web autorizada: NI UNA petición, ni interruptor, ni aviso; el ejemplo de siempre', async ({ page }) => {
    const { c } = await montar(page, { webReal: seDeja });
    const { docs } = await servirSuWeb(page);
    await empezar(page);
    await previaCargada(page);
    await page.waitForTimeout(2500);
    expect(c.webReal, 'sin web autorizada no se consulta nada').toHaveLength(0);
    expect(docs).toHaveLength(0);
    await expect(page.locator('[data-control-su-web]')).toHaveCount(0);
    await expect(page.locator('[data-su-web]')).toHaveCount(0);
    await expect(leyendaEjemplo(page)).toBeVisible();
  });

  test('una web autorizada sin https tampoco se consulta: el servidor solo mira https', async ({ page }) => {
    const { c } = await montar(page, { dominios: ['http://localhost:4000'], webReal: seDeja });
    await empezar(page);
    await previaCargada(page);
    await page.waitForTimeout(2500);
    expect(c.webReal).toHaveLength(0);
    await expect(page.locator('[data-control-su-web]')).toHaveCount(0);
  });

  test('el documento de su web de verdad (sin mocks): sin permiso o con uno falso, 403 que solo puede enmarcar el panel y sin ningún marco', async ({ request }) => {
    for (const q of ['', '?t=', '?t=x.y.z', '?t=web-real.AAAA.BBBB']) {
      const r = await request.get(`/vista-previa-web${q}`);
      expect(r.status(), q).toBe(403);
      expect(r.headers()['content-security-policy']).toBe("frame-ancestors 'self'");
      expect(r.headers()['x-frame-options']).toBe('SAMEORIGIN');
      expect(r.headers()['cache-control']).toContain('no-store');
      expect(await r.text()).not.toContain('<iframe');
    }
  });

  test('la consulta de verdad exige sesión: sin ella, 401 (y no se hace nada)', async ({ request }) => {
    const r = await request.post('/api/estudio/vista-previa-web', { data: { forzar: true } });
    expect(r.status()).toBe(401);
  });
});

test.describe('capturas de su web detrás del widget (solo con CAPTURAS_WEB=<carpeta>; OSCURO=1 para el modo oscuro)', () => {
  const carpeta = process.env.CAPTURAS_WEB;
  test.skip(!carpeta, 'solo con CAPTURAS_WEB');
  test.setTimeout(600_000);
  test.use({ viewport: { width: 1440, height: 900 } });
  const modo = process.env.OSCURO === '1' ? 'oscuro' : 'claro';
  async function foto(page: Page, nombre: string) {
    const plegar = page.getByRole('button', { name: 'Plegar «Primeros pasos»' });
    if (await plegar.isVisible().catch(() => false)) await plegar.click();
    await page.waitForTimeout(3000);
    await page.locator('section[aria-label="Vista previa"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${carpeta}/${nombre}-${modo}.png` });
  }
  for (const dispositivo of ['Móvil', 'Ordenador'] as const) {
    test(`su web enmarcable + widget, ${dispositivo}`, async ({ page }) => {
      await montar(page, { dominios: [ORIGEN_WEB], direccion: 'web-ok.example.com', webReal: seDeja });
      await servirSuWeb(page);
      await empezar(page);
      if (dispositivo === 'Ordenador') await dispositivos(page).getByRole('button', { name: 'Ordenador' }).click();
      await previaCargada(page);
      await expect(suWeb(page)).toBeVisible({ timeout: 30_000 });
      await foto(page, `web-enmarcable-${dispositivo === 'Móvil' ? 'iphone' : 'mac'}`);
      if (dispositivo === 'Móvil') {
        await verWeb(page).getByRole('button', { name: 'Ver página de ejemplo' }).click();
        await foto(page, 'interruptor-ver-ejemplo-iphone');
      }
    });
  }
  test('su web no enmarcable', async ({ page }) => {
    await montar(page, { dominios: [ORIGEN_WEB], direccion: 'web-ok.example.com', webReal: noSeDeja });
    await empezar(page);
    await previaCargada(page);
    await expect(page.locator('[data-aviso-su-web="no-se-deja"]')).toBeVisible();
    await foto(page, 'web-no-enmarcable-iphone');
  });
  test('sin web autorizada', async ({ page }) => {
    await montar(page, {});
    await empezar(page);
    await previaCargada(page);
    await foto(page, 'sin-web-autorizada-iphone');
  });
});
