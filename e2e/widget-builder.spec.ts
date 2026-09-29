import { test, expect, type Page, type Route } from '@playwright/test';
import { firmaDeUrl } from '../lib/widgets/firma-contenido.ts';
import { firmaCodigo } from '../lib/widgets/integracion.ts';
import { esCopiaCompleta, leerConfigs } from '../lib/widgets/config.ts';
import { WIDGETS, esDisponible, type WidgetDisponible } from '../lib/widgets/catalogo.ts';

// RES-7-f: la hora de una clase se enseña en la zona del ESTUDIO, no en la del
// navegador. Los fixtures llevan la hora sin zona («10:00» del navegador), así que
// el navegador va en Madrid (como en el resto de specs que miran horas) y el reloj
// simulado lleva su offset explícito: sin él lo interpretaba el runner, y en CI
// (UTC) «las 8:00» eran las 10:00 de Madrid.
test.use({ timezoneId: 'Europe/Madrid' });

// ─────────────────────────────────────────────────────────────────────────────
// «Tentare Widgets»: el constructor del panel (Configuración → Mi app y mi web →
// Widgets para tu web).
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
//
// El recorrido (28-sep): «¿Con qué está hecha tu web?» una vez, y tres pasos
// —Qué y dónde, Cómo se ve, Ponlo en tu web—. Los tres pasos están SIEMPRE
// montados (el oculto, con `hidden`): el <pre> del código está en el DOM desde
// el principio y se lee con `textContent`, nunca con `innerText` ni
// `toBeVisible`, porque va plegado y en el último paso.
// ⚠️ La vista previa del iframe NO se aserta: en e2e /reservar tarda ~15 s en
// llegar (el tema se pide a un Supabase de mentira que reintenta en servidor).
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
    citasServicios: [], citasDisponibilidad: [],
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

/**
 * `plataforma`: la respuesta a «¿Con qué está hecha tu web?», ya guardada en
 * `widget_builder._web` como la dejaría una visita anterior. Sin ella, el
 * constructor empieza por la pregunta (un estudio que llega por primera vez).
 */
async function montar(page: Page, opts: { widgetBuilder?: Record<string, unknown>; plataforma?: string } = {}) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825',
    widget_dominios_autorizados: ['https://midominio.com'],
    widget_builder: { ...(opts.widgetBuilder ?? {}), ...(opts.plataforma ? { _web: { plataforma: opts.plataforma } } : {}) },
  };
  // PATCHes reales que el builder manda al guardar (updateStudio con debounce).
  // Lo guardado se queda en la fila: al recargar se lee lo último, como en la BD.
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
      const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(cuerpo);
      Object.assign(studioRow, cuerpo);
      // Lo que devuelve PostgREST con `select=id`; `[]` sería «no se guardó».
      return json(route, [{ id: STUDIO_ID }]);
    }
    return json(route, studioRow);
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  // Una clase futura en el panel: la materia prima de «Reserva una clase».
  await page.route('**/rest/v1/sesiones**', route => json(route, [{
    id: 's1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-r', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), fin: new Date(Date.now() + 25 * 3600 * 1000).toISOString(),
    aforo_maximo: 8, cancelada: false,
  }]));

  await page.goto('/configuracion?tab=api');
  await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
  return { patches };
}

const snippet = (page: Page) => page.locator('pre');
const paso = (page: Page, nombre: 'Qué y dónde' | 'Cómo se ve' | 'Ponlo en tu web') =>
  page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: nombre, exact: true }).click();
const donde = (page: Page, nombre: RegExp) => page.getByRole('radiogroup', { name: 'Dónde lo quieres' }).getByRole('radio', { name: nombre }).click();

/** Abre un pliegue visible por el texto de su título, solo si está cerrado (pulsarlo abierto lo cerraría). */
async function abrir(page: Page, titulo: string) {
  const pliegue = page.locator('details:visible', { has: page.locator('summary', { hasText: titulo }) }).first();
  if (!(await pliegue.evaluate(d => (d as HTMLDetailsElement).open))) await pliegue.locator('summary').first().click();
}

async function widget(page: Page, nombre: RegExp) {
  // `count()` no espera: recién montado, el grupo puede no estar pintado aún y
  // daría 0 aunque el widget sea de los principales.
  const grupo = page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' });
  await expect(grupo).toBeVisible();
  const principal = grupo.getByRole('radio', { name: nombre });
  if (await principal.count()) return principal.click();
  await abrir(page, 'Más cosas para tu web');
  await page.getByRole('radiogroup', { name: 'Más cosas para tu web' }).getByRole('radio', { name: nombre }).click();
}

/** «Ponerlo sin marco» (integración nativa), en «Para quien te hace la web». */
async function sinMarco(page: Page) {
  await paso(page, 'Ponlo en tu web');
  await abrir(page, 'Para quien te hace la web');
  await page.getByRole('switch', { name: 'Ponerlo sin marco' }).click();
}

/** La portada «Lo que tienes en tu web» (Fase C): con algo copiado, se entra por ella. */
const portada = (page: Page) => page.getByRole('region', { name: 'Lo que tienes en tu web' });

const soloAlgunas = (page: Page) => page.getByRole('group', { name: 'Qué clases salen' }).getByRole('button', { name: 'Solo algunas' }).click();
const ultimoBuilder = (patches: Record<string, unknown>[]) =>
  [...patches].reverse().find(p => typeof p.widget_builder === 'object' && p.widget_builder !== null)?.widget_builder as Record<string, Record<string, unknown>> | undefined;

test.describe('Tentare Widgets — cada control conectado al código y a la vista previa', () => {

  test('⚠️ sin tocar nada, el código solo lleva la pestaña y la etiqueta del widget', async ({ page }) => {
    await montar(page);
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain(`/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario`);
    for (const nunca of ['tipos=', 'instructoras=', 'salas=', 'vista=', 'ocultar-', 'diseno=', 'marca=', 'fondo=', 'tinta=', 'fuente=', 'fuente-display=', 'vista-previa']) {
      expect(codigo, `un default emitido (${nunca}) rompe el contrato del constructor`).not.toContain(nunca);
    }
  });

  test('la pregunta de la web: se contesta una vez, se guarda en `_web` sin comerse lo demás y ordena la recomendación', async ({ page }) => {
    const { patches } = await montar(page, {
      widgetBuilder: { horario: { tipos: ['tc-r'] }, algoDeOtraVersion: { x: 1 } },
    });
    const pregunta = page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' });
    await expect(pregunta).toBeVisible();
    // Hasta contestar no hay pasos que dar.
    await expect(page.getByRole('navigation', { name: 'Pasos' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    for (const p of ['WordPress', 'Wix', 'Squarespace', 'Webflow', 'Otra o hecha a mano', 'Me la lleva una agencia', 'Aún no tengo web']) {
      await expect(pregunta.getByRole('radio', { name: new RegExp(p) })).toBeVisible();
    }

    await pregunta.getByRole('radio', { name: /Wix/ }).click();
    await page.getByLabel(/¿Cuál es su dirección\?/).fill('https://www.estudio.example.com/inicio');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect.poll(() => ultimoBuilder(patches)?._web, { timeout: 10_000 })
      .toEqual({ plataforma: 'wix', direccion: 'www.estudio.example.com' });
    // FUSIONA: lo que había (y lo que no entiende) sigue ahí.
    const guardado = ultimoBuilder(patches)!;
    expect(guardado.algoDeOtraVersion).toEqual({ x: 1 });
    expect(guardado.horario.tipos).toEqual(['tc-r']);

    await expect(page.getByText('www.estudio.example.com').first()).toBeVisible();
    // En Wix, un botón de su web con nuestro enlace: se copia el ENLACE.
    const dondeLoQuieres = page.getByRole('radiogroup', { name: 'Dónde lo quieres' });
    await expect(dondeLoQuieres.getByRole('radio', { name: /Un botón/ })).toHaveAttribute('aria-checked', 'true');
    await expect(dondeLoQuieres.getByRole('radio', { name: /Un botón/ })).toContainText('Recomendado');
    await expect(page.getByText(/En Wix te recomendamos un botón de tu propia web/)).toBeVisible();
    await expect(snippet(page)).toHaveText(new RegExp(`/reservar/${SLUG}\\?ref=web-horario$`));

    // «Cambiar» vuelve a la pregunta con lo contestado, y «Cancelar» a donde estaba.
    await page.getByRole('button', { name: 'Cambiar con qué está hecha tu web' }).click();
    await expect(pregunta.getByRole('radio', { name: /Wix/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Qué y dónde', exact: true })).toHaveAttribute('aria-current', 'step');
  });

  test('con la web contestada no se pregunta otra vez: sus pasos, Ordenador y Móvil, y nada engañoso en la previa', async ({ page }) => {
    await montar(page, { plataforma: 'wordpress' });
    await expect(page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Qué y dónde', exact: true })).toHaveAttribute('aria-current', 'step');
    const dispositivo = page.getByRole('group', { name: 'Dispositivo de la vista previa' });
    await expect(dispositivo.getByRole('button')).toHaveText(['Ordenador', 'Móvil']);
    await expect(page.getByRole('button', { name: 'Web oscura' })).toHaveCount(0);

    await paso(page, 'Ponlo en tu web');
    await expect(page.getByText(/añade un bloque «HTML personalizado»/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiar código' })).toBeVisible();
    await expect(page.getByText('Aún no lo has copiado desde aquí.')).toBeVisible();
  });

  test('«Más cosas para tu web»: lo que no existe todavía se lee, pero no se pulsa', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const que = page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' });
    await expect(que.getByRole('radio', { name: /Tu horario, para que reserven/ })).toHaveAttribute('aria-checked', 'true');
    await expect(que.getByRole('radio', { name: /Tu horario/ })).toContainText('Lo que más se usa');
    await abrir(page, 'Más cosas para tu web');
    const mas = page.getByRole('radiogroup', { name: 'Más cosas para tu web' });
    // «Bonos y packs» sigue siendo su propia tarjeta.
    await expect(mas.getByRole('radio', { name: /Bonos y packs/ })).toBeVisible();
    // Los «Próximamente» se ven, pero no son un botón.
    await expect(page.getByText('Tarjetas regalo', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Tarjetas regalo/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Tarjetas regalo/ })).toHaveCount(0);
    // El «Calendario embebido» ya no es un widget, y la videoteca (congelada) ni aparece.
    await expect(page.getByText(/Calendario embebido/)).toHaveCount(0);
    await expect(page.getByText('Videoteca')).toHaveCount(0);
  });

  test('elegir un tipo de clase mete tipos=<id> en el código, y se persiste en widget_builder sin perder `_web`', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    // Con «Todas» no hay nada que marcar.
    await expect(page.getByRole('group', { name: 'Solo estas clases' })).toHaveCount(0);
    await soloAlgunas(page);
    await page.getByRole('group', { name: 'Solo estas clases' }).getByRole('button', { name: 'Reformer' }).click();
    await expect(snippet(page)).toContainText('tipos=tc-r');
    await page.getByRole('group', { name: 'Solo las de estas instructoras' }).getByRole('button', { name: 'Ana Ruiz' }).click();
    await expect(snippet(page)).toContainText('instructoras=ins-1');
    // La inactiva no se ofrece: un filtro por alguien que ya no da clases
    // dejaría el calendario vacío.
    await expect(page.getByRole('group', { name: 'Solo las de estas instructoras' }).getByRole('button', { name: 'Bea Gil' })).toHaveCount(0);
    await expect.poll(() => JSON.stringify(ultimoBuilder(patches)?.horario ?? {}), { timeout: 10_000 }).toContain('tc-r');
    expect(ultimoBuilder(patches)?._web).toEqual({ plataforma: 'otra' });
    await expect(page.getByRole('status').filter({ hasText: 'Tus ajustes están guardados. Lo que va en el código llega a tu web cuando lo pegues.' })).toBeVisible();

    // «Todas» quita los filtros del código.
    await page.getByRole('group', { name: 'Qué clases salen' }).getByRole('button', { name: 'Todas' }).click();
    await expect(snippet(page)).not.toContainText('tipos=');
    await expect(snippet(page)).not.toContainText('instructoras=');
  });

  test('⚠️ integración sin marco: apagar «El precio» cambia el código Y la vista previa real', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await sinMarco(page);
    await expect(snippet(page)).toContainText('data-tentare-booking');
    await expect(snippet(page)).toContainText('data-identidad="estudio"');

    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja = page.locator('.paso-anim');
    await expect(hoja.locator('.reserva-cta-btn')).toHaveText(/Reservar por 15 €/);
    await hoja.getByRole('button', { name: 'Volver a las clases' }).click();
    await expect(hoja).toHaveCount(0);

    await paso(page, 'Qué y dónde');
    await expect(page.getByText(/Ahora va sin marco/)).toBeVisible();
    await page.getByRole('switch', { name: 'El precio' }).click();
    await expect(snippet(page)).toContainText('data-ocultar-precio');

    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja2 = page.locator('.paso-anim');
    await expect(hoja2.locator('.reserva-cta-btn')).toHaveText('Reservar');
    await expect(hoja2).not.toContainText('€');
  });

  test('⚠️ copiar entrega el string EXACTO del código, nunca los tokens coloreados', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await soloAlgunas(page);
    await page.getByRole('group', { name: 'Solo estas clases' }).getByRole('button', { name: 'Mat' }).click();
    const codigo = await snippet(page).textContent();
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    const copiado = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(copiado).toBe(codigo);
    expect(copiado).toContain('tipos=tc-m');
  });

  test('⚠️ si el portapapeles dice que no, no dice «Copiado» ni guarda la copia', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('no')) },
        configurable: true,
      });
    });
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByText(/No se ha podido copiar/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiado' })).toHaveCount(0);
    // Y el código queda a la vista para copiarlo a mano.
    await expect(snippet(page)).toBeVisible();
    await page.waitForTimeout(1_500);
    expect(patches.some(p => JSON.stringify(p.widget_builder ?? {}).includes('"copiado"'))).toBe(false);
  });

  test('⚠️ código antiguo: al copiar se guarda su huella; cambiar algo que va en el código después avisa, y copiar otra vez lo quita', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    const aviso = page.getByText(/Has cambiado algo que va en el código después de copiarlo/);

    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect.poll(() => typeof ultimoBuilder(patches)?.horario?.copiado, { timeout: 10_000 }).toBe('object');
    // La huella nunca viaja en el código.
    expect(await snippet(page).textContent()).not.toContain('copiado');
    expect(ultimoBuilder(patches)?._web).toEqual({ plataforma: 'otra' });

    // Otra visita, sin tocar nada: lo copiado sigue siendo lo de ahora. Con
    // algo copiado se entra por «Lo que tienes en tu web».
    await page.reload();
    await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
    await expect(portada(page)).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar Horario y reservas', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' })).toBeVisible();
    await expect(aviso).toHaveCount(0);
    await paso(page, 'Ponlo en tu web');
    await expect(page.getByText(/Lo copiaste aquí el/)).toBeVisible();

    // Cambia algo que va en el código: el aviso sale EN ESE MOMENTO.
    await paso(page, 'Qué y dónde');
    await page.getByRole('switch', { name: 'El precio' }).click();
    await expect(aviso).toBeVisible();
    await page.getByRole('button', { name: 'Ir a copiarlo' }).click();
    await page.getByRole('button', { name: 'Copiar el código nuevo' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect(aviso).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado)).toContain('ocultar-precio=1');

    // El «Ancho» solo cambia el `style` del iframe, y también va en el código:
    // la huella tiene que verlo.
    await paso(page, 'Cómo se ve');
    await page.getByRole('group', { name: 'Ancho del widget' }).getByRole('button', { name: 'Todo el ancho' }).click();
    await expect(aviso).toBeVisible();
    // Y la tarjeta del widget lo dice también, para cuando no esté abierto.
    await paso(page, 'Qué y dónde');
    await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: /Tu horario/ })).toContainText('Cambiado después de copiarlo');
  });

  test('código antiguo: una copia de otra visita con otra huella avisa desde el principio, con su fecha', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { horario: { copiado: { firma: 'huellavieja', en: '2026-09-12T10:00:00.000Z' } } },
    });
    // En la portada, en su fila: de una copia de antes solo se sabe QUE cambió.
    await expect(portada(page).getByText('Lo cambiaste después de copiarlo: tu web sigue con lo de antes.')).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar Horario y reservas', exact: true }).click();
    await expect(page.getByText(/Has cambiado algo que va en el código después de copiarlo el 12 sept?\./)).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: /Tu horario/ })).toContainText('Cambiado después de copiarlo');
    await page.getByRole('button', { name: 'Ir a copiarlo' }).click();
    await expect(page.getByRole('button', { name: 'Copiar el código nuevo' })).toBeVisible();
  });

  test('al volver a entrar, lo guardado con el constructor anterior se restaura en el widget nuevo', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { clases: { vista: 'hoy', tipos: ['tc-r'], ocultarPrecio: true, marca: '#112233' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('vista=hoy');
    expect(codigo).toContain('tipos=tc-r');
    expect(codigo).toContain('ocultar-precio=1');
    expect(codigo).toContain('marca=%23112233');
    await expect(page.getByRole('switch', { name: 'El precio' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('group', { name: 'Qué clases salen' }).getByRole('button', { name: 'Solo algunas' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Solo estas clases' }).getByRole('button', { name: 'Reformer' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('switch', { name: 'Al abrir, solo las clases de hoy' })).toHaveAttribute('aria-checked', 'true');
    // «Más opciones» se abrió solo por esto; apagarlo no le cierra el pliegue
    // en la cara.
    await page.getByRole('switch', { name: 'Al abrir, solo las clases de hoy' }).click();
    await expect(page.getByRole('switch', { name: 'Al abrir, solo las clases de hoy' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Al abrir, solo las clases de hoy' })).toBeVisible();
    // Tocó un color: su diseño era propio, no se le apaga en silencio.
    await paso(page, 'Cómo se ve');
    await expect(page.getByRole('switch', { name: /Usar un diseño propio/ })).toHaveAttribute('aria-checked', 'true');
  });

  async function elegirFuente(page: Page, campo: string, familia: string) {
    await page.getByRole('button', { name: campo, exact: true }).click();
    await page.getByRole('option', { name: new RegExp(familia) }).click();
  }

  test('⚠️ letra: con un diseño propio entra en el código (en la página y sin marco) y pinta la previa real', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    await paso(page, 'Cómo se ve');
    // Sin diseño propio, la letra es la del estilo de sus widgets (en su
    // propio grupo, que no va en el código): no hay selector de fuente suelto.
    await expect(page.getByRole('button', { name: 'Letra', exact: true })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Estilo de tus widgets' }).getByRole('radio', { name: /Igual que tu app · Crema/ }))
      .toHaveAttribute('aria-checked', 'true');
    await abrir(page, 'Un diseño distinto');
    await page.getByRole('switch', { name: /Usar un diseño propio/ }).click();
    await elegirFuente(page, 'Letra', 'Poppins');
    await elegirFuente(page, 'Letra de los titulares', 'Playfair Display');
    await expect(snippet(page)).toContainText('fuente=Poppins');
    await expect(snippet(page)).toContainText('fuente-display=Playfair%20Display');

    await page.getByRole('button', { name: 'Letra', exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(11); // 10 + «la de por defecto»
    await page.keyboard.press('Escape');

    await expect.poll(() => JSON.stringify(ultimoBuilder(patches) ?? {}), { timeout: 10_000 }).toContain('Poppins');

    // El mismo widget sin marco lleva la misma letra.
    await sinMarco(page);
    await expect(snippet(page)).toContainText('data-fuente="Poppins"');
    await expect(snippet(page)).toContainText('data-fuente-display="Playfair Display"');
    const boton = page.getByRole('button', { name: '10:00 Reformer' });
    await boton.waitFor();
    const fam = await boton.evaluate(el => getComputedStyle(el.closest('div[style*="--font-ui"]')!).fontFamily);
    expect(fam).toContain('Poppins');
  });

  test('al volver a entrar, una letra escrita a mano con el constructor viejo se conserva', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { clases: { fuente: 'Space Grotesk', fuenteDisplay: 'Lobster' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('fuente=Space%20Grotesk');
    expect(codigo).toContain('fuente-display=Lobster');
    await paso(page, 'Cómo se ve');
    await expect(page.getByRole('button', { name: 'Letra', exact: true })).toContainText('Space Grotesk');
    await expect(page.getByRole('button', { name: 'Letra de los titulares', exact: true })).toContainText('Lobster');
  });

  test('⚠️ autorizar su web: con y sin «www» en la MISMA petición, y dispara el registro de wallets (contador real, no fe)', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    const envios: string[][] = [];
    await page.route('**/api/estudio/widget-dominios', route => {
      const cuerpo = route.request().postDataJSON() as { dominios: string[] };
      envios.push(cuerpo.dominios);
      return json(route, { ok: true, dominios: cuerpo.dominios });
    });
    let intentosWallet = 0;
    await page.route('**/api/widget/dominios-wallet', route => {
      intentosWallet++;
      return json(route, { registrados: [] });
    });

    await sinMarco(page);
    await expect(page.getByRole('list', { name: 'Webs autorizadas' })).toContainText('https://midominio.com');
    await page.getByLabel('Dirección de la web que quieres autorizar').fill('otrodominio.com');
    await page.getByRole('button', { name: 'Autorizar', exact: true }).click();
    await expect.poll(
      () => envios.some(d => d.includes('https://otrodominio.com') && d.includes('https://www.otrodominio.com') && d.includes('https://midominio.com')),
      { timeout: 10_000 },
    ).toBe(true);
    expect(envios).toHaveLength(1);
    expect(patches.some(p => 'widget_dominios_autorizados' in p)).toBe(false);
    await expect.poll(() => intentosWallet, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('los widgets que no honran filtros no los ofrecen (nada de UI fake), y el color va sin códigos a la vista', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await widget(page, /Citas/);
    await expect(page.getByRole('group', { name: 'Qué clases salen' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'El precio' })).toHaveCount(0);
    await expect(page.getByText(/Ningún servicio de cita se puede reservar online todavía/)).toBeVisible();
    await expect(snippet(page)).toContainText('tab=citas');
    await paso(page, 'Cómo se ve');
    await abrir(page, 'Un diseño distinto');
    await page.getByRole('switch', { name: /Usar un diseño propio/ }).click();
    await expect(page.getByLabel('Color principal')).toBeVisible();
    // Ningún «#343825» a la vista: el hex solo vive dentro del selector de color.
    expect(await page.locator('#widgets').innerText()).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  test('un botón (encima o a su página) y un enlace generan el código real de cada forma', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await donde(page, /Un botón/);
    await expect(snippet(page)).toContainText('data-tentare-popup=');
    await expect(snippet(page)).toContainText('/widget-popup.js');
    // En la previa, el botón real sobre su web: abre la ventana de verdad.
    await expect(page.getByRole('button', { name: 'Reservar clase' })).toHaveAttribute('data-tentare-popup', /vista-previa=1/);
    await page.getByRole('textbox', { name: 'Texto del botón' }).fill('Ven a probar');
    await expect(snippet(page)).toContainText('>Ven a probar</button>');
    // El marcador de la previa se queda en la previa: ni en lo copiado ni en
    // lo que se le manda a quien le hace la web.
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    const copiadoPopup = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(copiadoPopup).toContain('data-tentare-popup=');
    expect(copiadoPopup).not.toContain('vista-previa');
    await abrir(page, '¿Te lleva la web otra persona? Mándaselo');
    await page.getByRole('button', { name: 'Copiar el mensaje' }).click();
    const mensaje = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(mensaje).toContain('data-tentare-popup=');
    expect(mensaje).not.toContain('vista-previa');
    await paso(page, 'Qué y dónde');

    await page.getByRole('group', { name: 'Qué hace el botón' }).getByRole('button', { name: 'Lleva a tu página de reservas' }).click();
    await expect(snippet(page)).toContainText(`<a href="`);
    await expect(snippet(page)).not.toContainText('<script');

    await donde(page, /Un enlace/);
    await expect(snippet(page)).toHaveText(new RegExp(`/reservar/${SLUG}\\?ref=web-horario$`));
    // Con un enlace no se ofrece ningún filtro: el enlace no se lo lleva.
    await expect(page.getByRole('group', { name: 'Qué clases salen' })).toHaveCount(0);
    await paso(page, 'Ponlo en tu web');
    // Ya copió el botón de antes: lo de ahora es otra cosa, y así se dice.
    await expect(page.getByRole('button', { name: 'Copiar el enlace nuevo' })).toBeVisible();
  });

  test('React: el mismo widget como componente, para quien hace la web', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await paso(page, 'Ponlo en tu web');
    await abrir(page, 'Para quien te hace la web');
    await page.getByRole('button', { name: 'Copiar el componente de React' }).click();
    const copiado = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(copiado).toContain('export function TentareHorarioYReservas()');
    expect(copiado).toContain('tentareEmbedAltura');
    // Lo que se enseña y se copia con el botón grande sigue siendo el HTML.
    await expect(snippet(page)).not.toContainText('export function');
  });

  test('«Una clase concreta» no da código hasta elegir la clase, que se pide allí mismo, y entonces es un enlace directo', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await widget(page, /Una clase concreta/);
    await expect(snippet(page)).toHaveCount(0);
    await paso(page, 'Ponlo en tu web');
    // Solo el paso habla del código; la previa tiene su propio texto.
    await expect(page.getByRole('status').filter({ hasText: 'Elige la clase para tener el código.' })).toBeVisible();
    await expect(page.getByText('Te falta un dato')).toBeVisible();
    await page.getByRole('combobox', { name: 'Qué clase' }).selectOption({ index: 1 });
    await expect(snippet(page)).toContainText(`/reservar/${SLUG}?sesion=`);
    await expect(page.getByRole('button', { name: 'Copiar enlace' })).toBeVisible();
  });

  test('el embudo por widget: el mes del widget activo en el constructor y la tabla «Por widget»', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    // Registrada DESPUÉS de montar: la última ruta gana sobre el catch-all.
    let lecturas = 0;
    await page.route('**/rest/v1/rpc/embudo_widget_por_origen', route => {
      lecturas++;
      return json(route, [
        { origen: 'web-horario', tipo: 'widget_loaded', n: 200 },
        { origen: 'web-horario', tipo: 'booking_completed', n: 9 },
        { origen: 'web-planes', tipo: 'widget_loaded', n: 50 },
        { origen: null, tipo: 'widget_loaded', n: 300 },
      ]);
    });
    await page.reload();
    await expect(page.getByText('Este mes: 200 visitas · 9 reservas · 4,5 %')).toBeVisible({ timeout: 60_000 });
    expect(lecturas).toBeGreaterThan(0);
    // Con otro widget, su propia línea.
    await widget(page, /Citas/);
    await expect(page.getByText('Aún no ha llegado nadie desde aquí este mes')).toBeVisible();

    await page.getByRole('button', { name: 'Ver resultados' }).click();
    const tabla = page.getByRole('region', { name: 'Por widget' });
    await expect(tabla).toBeVisible();
    const filas = tabla.getByRole('row');
    // Cabecera + horario + planes + sin etiqueta (siempre al final).
    await expect(filas).toHaveCount(4);
    await expect(filas.nth(1)).toContainText('Horario y reservas');
    await expect(filas.nth(1)).toContainText('4,5 %');
    await expect(filas.nth(3)).toContainText('Sin etiqueta');
  });

  test('«Tu clase de prueba»: aviso sin oferta, `prueba=1` en el código y sin la forma sin marco', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    await widget(page, /Tu clase de prueba/);
    await expect(page.getByText(/No tienes ninguna clase de prueba activa/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a Paquetes' })).toHaveAttribute('href', '/productos');
    // Recomendado: un botón que se abre encima.
    await expect(snippet(page)).toContainText('data-tentare-popup=');
    await expect(snippet(page)).toContainText('prueba=1');
    await donde(page, /Un enlace/);
    await expect(snippet(page)).toContainText('?prueba=1&ref=web-prueba');
    await paso(page, 'Ponlo en tu web');
    await abrir(page, 'Para quien te hace la web');
    await expect(page.getByRole('switch', { name: 'Ponerlo sin marco' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase B (28-sep): el ESTILO de sus widgets no va en el código. Se prueba en la
// vista previa (un borrador que solo ve ella) y se aplica en su web con
// «Aplicar en mi web», por su propio endpoint.
//
// Lo que se vigila es lo de siempre con una pantalla que escribe (#500/#505/
// #560 y #565): nunca «Aplicado en tu web» sin que el servidor lo diga, y en
// cada camino de fallo un CONTADOR de peticiones —un test de fallo que pasa
// porque no se llegó a intentar nada es un test hueco—. Las rutas se registran
// DESPUÉS de montar(): la última gana al comodín `/api/**`, que responde `{}`
// (y un `{}` también tiene que leerse como fallo). De la vista previa solo se
// mira su `src`, por donde viaja el borrador, nunca lo que pinta (ver arriba).
// ─────────────────────────────────────────────────────────────────────────────

const ARENA = { estilo: 'arena', letra: null, boton: null, web: null, colorWeb: null, fundido: false, forma: null, densidad: null, ocultarPie: false };
const MENSAJE_FUNDIDO = 'Con este color de web, el texto fundido no se lee bien. Prueba «En su propio recuadro».';
const NO_APLICADO = 'No se ha aplicado. Tu web sigue como estaba. Vuelve a intentarlo.';

interface CuerpoEstilo { estilo: Record<string, unknown> | null; esperado: Record<string, unknown> | null; motivo: string }

/** Cada POST a /api/estudio/widget-estilo, con su cuerpo; responde lo que diga `responder`. */
async function servidorDelEstilo(page: Page, responder: (route: Route, cuerpo: CuerpoEstilo) => Promise<void>) {
  const cuerpos: CuerpoEstilo[] = [];
  await page.route('**/api/estudio/widget-estilo', async route => {
    const cuerpo = route.request().postDataJSON() as CuerpoEstilo;
    cuerpos.push(cuerpo);
    await responder(route, cuerpo);
  });
  return cuerpos;
}
/** Lo que responde el servidor cuando escribe: lo aplicado y lo que había (su `esperado`, que coincidía). */
const escribe = (route: Route, c: CuerpoEstilo) => json(route, { aplicado: c.estilo, anterior: c.esperado });

const estilos = (page: Page) => page.getByRole('radiogroup', { name: 'Estilo de tus widgets' });
const arena = (page: Page) => estilos(page).getByRole('radio', { name: 'Arena', exact: true });
const barraEstilo = (page: Page) => page.getByRole('group', { name: 'Aplicar el estilo en tu web' });
const estadoEstilo = (page: Page) => barraEstilo(page).getByRole('status');
const botonAplicar = (page: Page) => barraEstilo(page).getByRole('button', { name: 'Aplicar en mi web' });
const previa = (page: Page) => page.getByTitle(/^Vista previa:/);
const dialogoAplicar = (page: Page) => page.getByRole('dialog', { name: '¿Aplicar este estilo en tu web?' });

async function aplicarYConfirmar(page: Page) {
  await botonAplicar(page).click();
  await expect(dialogoAplicar(page)).toBeVisible();
  await dialogoAplicar(page).getByRole('button', { name: 'Aplicar en mi web' }).click();
}

test.describe('El estilo de tus widgets: se prueba en la previa y se aplica en su web, sin mentir', () => {

  test('elegir otro estilo es un borrador: la previa lo enseña, el código no cambia y no se manda nada', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, escribe);
    const codigo = await snippet(page).textContent();
    await paso(page, 'Cómo se ve');
    await expect(estilos(page).getByRole('radio', { name: /Igual que tu app · Crema/ })).toHaveAttribute('aria-checked', 'true');
    await expect(estadoEstilo(page)).toHaveText('Es lo que hay ahora en tu web');
    await expect(botonAplicar(page)).toBeDisabled();

    await arena(page).click();
    await expect(arena(page)).toHaveAttribute('aria-checked', 'true');
    await expect(estadoEstilo(page)).toContainText('Cambios sin aplicar');
    await expect(previa(page)).toHaveAttribute('src', /vista-previa=1&borrador-web=/);
    expect(decodeURIComponent((await previa(page).getAttribute('src'))!)).toContain('"estilo":"arena"');
    // Nada de esto va en el código: el estilo vive en su web, no en lo copiado.
    expect(await snippet(page).textContent()).toBe(codigo);
    expect(codigo).not.toContain('borrador-web');
    // Y donde se copia se le recuerda que copiar no se lo lleva.
    await paso(page, 'Ponlo en tu web');
    await expect(page.getByText('Tienes cambios de estilo sin aplicar. No van en el código: aplícalos en «Cómo se ve».')).toBeVisible();
    await page.waitForTimeout(500);
    expect(cuerpos).toHaveLength(0);
  });

  test('«Descartar» vuelve a lo que hay en su web sin mandar nada', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, escribe);
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await expect(estadoEstilo(page)).toContainText('Cambios sin aplicar');
    await barraEstilo(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(estadoEstilo(page)).toHaveText('Es lo que hay ahora en tu web');
    await expect(estilos(page).getByRole('radio', { name: /Igual que tu app · Crema/ })).toHaveAttribute('aria-checked', 'true');
    await expect(previa(page)).not.toHaveAttribute('src', /borrador-web=/);
    await page.waitForTimeout(500);
    expect(cuerpos).toHaveLength(0);
  });

  test('⚠️ «Aplicar en mi web»: la confirmación nombra lo copiado (si sigue siendo el código de ahora), el cuerpo es exacto y «Aplicado» llega con la respuesta', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      // Una copia de otra visita cuya huella no es la de su código de ahora:
      // no sabemos qué lleva lo pegado, así que no se nombra.
      widgetBuilder: { horario: { copiado: { firma: 'huella', en: '2026-09-12T10:00:00.000Z' } } },
    });
    const cuerpos = await servidorDelEstilo(page, escribe);
    // Con algo copiado se entra por la portada: desde su tarjeta del estilo.
    await expect(portada(page)).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar el estilo', exact: true }).click();
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await botonAplicar(page).click();
    await expect(dialogoAplicar(page)).toContainText('No tienes que volver a pegar ningún código.');
    await expect(dialogoAplicar(page)).not.toContainText('los que copiaste desde aquí');
    await dialogoAplicar(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogoAplicar(page)).toHaveCount(0);

    // Copiado el código de ahora, ya se sabe qué hay pegado: se nombra.
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar el código nuevo' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await paso(page, 'Cómo se ve');
    await expect(arena(page)).toHaveAttribute('aria-checked', 'true');
    await botonAplicar(page).click();
    const dialogo = dialogoAplicar(page);
    await expect(dialogo).toContainText('No tienes que volver a pegar ningún código.');
    await expect(dialogo).toContainText('Entre ellos, los que copiaste desde aquí: Horario y reservas.');
    await expect(dialogo).toContainText('Los widgets con un diseño propio dentro de su código no cambian.');
    // Abrir la confirmación no manda nada todavía.
    expect(cuerpos).toHaveLength(0);
    await dialogo.getByRole('button', { name: 'Aplicar en mi web' }).click();

    await expect(estadoEstilo(page)).toHaveText('Aplicado en tu web · hace un momento');
    await expect(barraEstilo(page)).toContainText('Aplicado en tu web. Tus widgets lo toman al volver a abrirse.');
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0]).toEqual({ estilo: ARENA, esperado: null, motivo: 'aplicar' });
    // Aplicado ya no es un borrador: la previa carga lo publicado, como cualquier web.
    await expect(previa(page)).not.toHaveAttribute('src', /borrador-web=/);
    await expect(botonAplicar(page)).toBeDisabled();
    await expect(barraEstilo(page).getByRole('button', { name: 'Deshacer' })).toBeVisible();
  });

  test('«Deshacer» vuelve a lo que el servidor leyó al aplicar, con lo aplicado como `esperado`', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, escribe);
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await aplicarYConfirmar(page);
    await expect(estadoEstilo(page)).toHaveText('Aplicado en tu web · hace un momento');

    await barraEstilo(page).getByRole('button', { name: 'Deshacer' }).click();
    await expect(barraEstilo(page)).toContainText('Hemos vuelto a poner el estilo de antes en tu web.');
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[1]).toEqual({ estilo: null, esperado: ARENA, motivo: 'deshacer' });
    await expect(estadoEstilo(page)).toHaveText('Es lo que hay ahora en tu web');
    await expect(estilos(page).getByRole('radio', { name: /Igual que tu app · Crema/ })).toHaveAttribute('aria-checked', 'true');
    await expect(barraEstilo(page).getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  });

  test('⚠️ si el servidor dice que no (400, 500, sin red o una respuesta vacía), nunca «Aplicado» y el borrador se queda', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    let responder: (route: Route) => Promise<void> = route => json(route, {});
    const cuerpos = await servidorDelEstilo(page, route => responder(route));
    await paso(page, 'Cómo se ve');
    await arena(page).click();

    const casos: [string, (route: Route) => Promise<void>][] = [
      ['400', route => json(route, { error: 'Los cambios de estilo no son válidos.' }, 400)],
      ['500', route => json(route, { error: 'No se ha podido aplicar el estilo. Vuelve a intentarlo.' }, 500)],
      ['sin red', route => route.abort('failed')],
      ['200 con {}', route => json(route, {})],
    ];
    for (const [caso, respuesta] of casos) {
      responder = respuesta;
      const antes = cuerpos.length;
      await aplicarYConfirmar(page);
      await expect.poll(() => cuerpos.length, { message: `${caso}: ni lo intentó` }).toBeGreaterThan(antes);
      await expect(barraEstilo(page).getByRole('alert'), caso).toHaveText(NO_APLICADO);
      await expect(page.getByText(/Aplicado en tu web/), caso).toHaveCount(0);
      await expect(estadoEstilo(page), caso).toContainText('Cambios sin aplicar');
      await expect(arena(page), caso).toHaveAttribute('aria-checked', 'true');
    }
    expect(cuerpos.length).toBeGreaterThan(0);
  });

  test('⚠️ 409: otra pestaña lo cambió entretanto; se dice, se vuelve a leer lo que hay y el siguiente intento va contra eso', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    let responder: (route: Route, c: CuerpoEstilo) => Promise<void> = route => json(route, { error: 'El estilo ha cambiado' }, 409);
    const cuerpos = await servidorDelEstilo(page, (route, c) => responder(route, c));
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await expect(arena(page)).toHaveAttribute('aria-checked', 'true');

    // Lo que hay en su web desde ahora es lo que dejó la otra pestaña (Piedra).
    // Su lectura se retiene hasta haber mirado qué dice el panel mientras tanto.
    const PIEDRA = { ...ARENA, estilo: 'piedra' };
    let lecturas = 0;
    let soltar: () => void = () => {};
    const retenida = new Promise<void>(r => { soltar = () => r(); });
    await page.route('**/api/theme', async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      lecturas++;
      await retenida;
      await json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12, widgetWeb: PIEDRA });
    });
    const lecturasAntes = lecturas;

    await aplicarYConfirmar(page);
    await expect.poll(() => cuerpos.length).toBe(1);
    await expect(barraEstilo(page).getByRole('alert'))
      .toHaveText('El estilo de tus widgets acaba de cambiar desde otra pestaña. Recarga la página para ver el de ahora.');
    // Tras el 409 vuelve a leer lo que hay (contador real, no fe)…
    await expect.poll(() => lecturas, { message: 'tras el 409 no se volvió a leer el tema' }).toBeGreaterThan(lecturasAntes);
    // …y mientras no lo tiene, no afirma qué hay en su web ni deja aplicar contra lo viejo.
    await expect(estadoEstilo(page)).toContainText('Leyendo lo que hay ahora en tu web');
    await expect(estadoEstilo(page)).not.toHaveText('Es lo que hay ahora en tu web');
    await expect(page.getByText('Es lo que hay ahora en tu web')).toHaveCount(0);
    await expect(botonAplicar(page)).toBeDisabled();
    await expect(page.getByText(/Aplicado en tu web/)).toHaveCount(0);

    soltar();
    // Leído: el aviso del 409 se queda, y su borrador (Arena) también.
    await expect(estadoEstilo(page)).toContainText('Cambios sin aplicar');
    await expect(barraEstilo(page).getByRole('alert'))
      .toHaveText('El estilo de tus widgets acaba de cambiar desde otra pestaña. Recarga la página para ver el de ahora.');
    await expect(arena(page)).toHaveAttribute('aria-checked', 'true');

    // Si lo vuelve a aplicar, el `esperado` es lo que acaba de leer, no lo de antes.
    responder = escribe;
    await aplicarYConfirmar(page);
    await expect(estadoEstilo(page)).toHaveText('Aplicado en tu web · hace un momento');
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[0]).toEqual({ estilo: ARENA, esperado: null, motivo: 'aplicar' });
    expect(cuerpos[1]).toEqual({ estilo: ARENA, esperado: PIEDRA, motivo: 'aplicar' });
  });

  test('422: el servidor no lo deja por contraste, y se enseña su motivo', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, route =>
      json(route, { error: 'Contraste insuficiente', errores: [{ campo: 'colorWeb', mensaje: MENSAJE_FUNDIDO }] }, 422));
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await aplicarYConfirmar(page);
    await expect.poll(() => cuerpos.length).toBeGreaterThan(0);
    await expect(barraEstilo(page).getByRole('alert')).toHaveText(MENSAJE_FUNDIDO);
    await expect(page.getByText(/Aplicado en tu web/)).toHaveCount(0);
  });

  test('⚠️ doble clic en «Aplicar en mi web»: una sola petición', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, async (route, c) => {
      // Lento a propósito: el segundo clic llega con la primera aún en vuelo.
      await new Promise(r => setTimeout(r, 1_500));
      await escribe(route, c);
    });
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await botonAplicar(page).click();
    await dialogoAplicar(page).getByRole('button', { name: 'Aplicar en mi web' }).dblclick();
    await expect(estadoEstilo(page)).toHaveText('Aplicando…');
    await expect(botonAplicar(page)).toBeDisabled();
    await expect(estadoEstilo(page)).toHaveText('Aplicado en tu web · hace un momento', { timeout: 10_000 });
    expect(cuerpos).toHaveLength(1);
  });

  test('fundido sobre una web gris que no se lee: se avisa y «Aplicar» no se deja pulsar (0 peticiones)', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    const cuerpos = await servidorDelEstilo(page, escribe);
    await paso(page, 'Cómo se ve');
    await page.getByRole('radiogroup', { name: 'Cómo es tu web' }).getByRole('radio', { name: 'Otro color' }).click();
    await page.getByLabel('Color de tu web').fill('#808080');
    await page.getByRole('radiogroup', { name: 'Fondo', exact: true }).getByRole('radio', { name: 'Que se funda con tu web' }).click();
    await expect(page.getByText(MENSAJE_FUNDIDO)).toBeVisible();
    await expect(estadoEstilo(page)).toContainText('Cambios sin aplicar');
    await expect(botonAplicar(page)).toBeDisabled();
    // La previa lo enseña igual, para que vea por qué.
    await expect(previa(page)).toHaveAttribute('src', /borrador-web=/);
    await page.waitForTimeout(500);
    expect(cuerpos).toHaveLength(0);
  });

  test('si no se puede leer lo que hay en su web, se dice y no se deja aplicar nada a ciegas', async ({ page }) => {
    await montar(page, { plataforma: 'otra' });
    let lecturas = 0;
    await page.route('**/api/theme**', route => { lecturas++; return json(route, { error: 'no' }, 500); });
    const cuerpos = await servidorDelEstilo(page, escribe);
    await page.reload();
    await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
    await paso(page, 'Cómo se ve');
    const tarjeta = page.getByRole('region', { name: '¿Cómo quieres que se vea?' });
    await expect(tarjeta.getByRole('alert')).toHaveText('No hemos podido leer el estilo de tus widgets.');
    expect(lecturas).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Aplicar en mi web' })).toHaveCount(0);
    await expect(estilos(page)).toHaveCount(0);

    // Con el tema de vuelta, «Reintentar» lo trae.
    await page.route('**/api/theme**', route => json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
    await tarjeta.getByRole('button', { name: 'Reintentar' }).click();
    await expect(estilos(page).getByRole('radio', { name: /Igual que tu app · Crema/ })).toHaveAttribute('aria-checked', 'true');
    expect(cuerpos).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase C (28-sep): «Lo que tienes en tu web». Con algo copiado, el constructor
// abre por la portada: cada pieza copiada, qué cambió después de copiarla y
// dónde se ha visto (`widget_vistos()`), con qué versión.
//
// Lo que se vigila es que nunca diga lo que no sabe: «Aún no lo vemos» solo con
// la respuesta de verdad (un 500 no es «nada»), y «Visto en…» con cuándo y
// dónde. Cada caso lleva su CONTADOR de lecturas: sin él, «no dice nada» puede
// ser verdad por no haber preguntado. La ruta se registra DESPUÉS de montar()
// (la última gana al comodín `/rest/v1/**`, que responde `[]`) y se recarga.
// ⚠️ Con `**` al final: la lectura va filtrada por etiqueta
// (`?origen=in.(web-horario)`), y sin él la ruta no la reconoce.
// ─────────────────────────────────────────────────────────────────────────────

/** La versión que /reservar calcula del horario por defecto, dentro de una página. */
const FIRMA_AHORA = firmaDeUrl(new URLSearchParams('embed=1&tab=clases&ref=web-horario'));
/** La de una copia anterior (sin el precio): está en el historial de lo copiado. */
const FIRMA_ANTERIOR = firmaDeUrl(new URLSearchParams('embed=1&tab=clases&ocultar-precio=1&ref=web-horario'));
/** Una que nunca se copió desde aquí (retocada a mano, o de otra cuenta). */
const FIRMA_A_MANO = 'c1zzzzz';
const WEB_ALBA = 'http://albapilates.example.com';
/** Lo de ahora frente a esa copia: el precio apagado después de copiarlo. */
const CONFIG_SIN_PRECIO = { mostrarPrecio: false };

/** Una copia de esta fase: su forma, la foto de la config, la versión que verá la página y el historial. */
const COPIA_CON_FOTO = {
  firma: 'abc123', en: '2026-09-12T10:00:00.000Z',
  metodo: 'iframe', config: {}, contenido: FIRMA_AHORA, anteriores: [`incrustado:${FIRMA_ANTERIOR}`],
};

const haceHoras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
/** Una fila de `widget_vistos()`; las horas, contadas al responder. */
const fila = (firma: string | null, ultimoHaceHoras: number) => ({
  origen: 'web-horario', forma: 'incrustado', anfitrion: WEB_ALBA, firma,
  primero: haceHoras(72), ultimo: haceHoras(ultimoHaceHoras), n: 4,
});

type Respuesta = { status: number; cuerpo: unknown };
/** `widget_vistos()` con lo que diga `responder`, y cuántas veces se ha pedido. */
async function lectorDeVistos(page: Page, responder: () => Respuesta) {
  let lecturas = 0;
  await page.route('**/rest/v1/rpc/widget_vistos**', route => {
    lecturas++;
    const r = responder();
    return json(route, r.cuerpo, r.status);
  });
  return () => lecturas;
}

/** La respuesta de verdad a `widget_vistos()`, con este estado: registrarla ANTES de recargar. */
const respuestaVistos = (page: Page, status: number) =>
  page.waitForResponse(r => r.url().includes('/rest/v1/rpc/widget_vistos') && r.status() === status);

async function recargar(page: Page) {
  await page.reload();
  await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
  await expect(portada(page)).toBeVisible();
}

const VERSIONES = /versión anterior|versión distinta|dos versiones/;

test.describe('Lo que tienes en tu web: lo copiado, qué cambió y dónde se ve, sin decir lo que no sabe', () => {

  test('lo visto en su web: aún no, visto hace 2 h y, si la lectura falla, nada', async ({ page }) => {
    await montar(page, { plataforma: 'otra', widgetBuilder: { horario: { copiado: COPIA_CON_FOTO } } });
    let respuesta: Respuesta = { status: 200, cuerpo: [] };
    const lecturas = await lectorDeVistos(page, () => respuesta);

    // Nada todavía: se dice, con lo que hará falta para verlo.
    await recargar(page);
    await expect.poll(lecturas, { message: 'ni se pidió lo visto' }).toBeGreaterThan(0);
    const fila1 = portada(page).getByRole('listitem').filter({ hasText: 'Horario y reservas' });
    await expect(fila1).toContainText('Dentro de una página · copiado el 12 sep');
    await expect(fila1).toContainText('Aún no ha llegado nadie desde aquí este mes');
    await expect(fila1).toContainText('Aún no lo vemos en tu web. Cuando alguien abra la página donde lo pegaste, aparecerá aquí.');
    // Sin cambios desde que lo copió: ni ámbar ni nada que volver a copiar.
    await expect(fila1).not.toContainText('Lo cambiaste después de copiarlo');
    await expect(fila1.getByRole('button', { name: /Copiar el/ })).toHaveCount(0);
    // Nada de pasos ni vista previa en la portada.
    await expect(page.getByRole('navigation', { name: 'Pasos' })).toHaveCount(0);

    // Visto con la versión de ahora: dónde y cuándo, sin veredicto de versión.
    respuesta = { status: 200, cuerpo: [fila(FIRMA_AHORA, 2)] };
    let antes = lecturas();
    await recargar(page);
    await expect.poll(lecturas).toBeGreaterThan(antes);
    await expect(portada(page).getByText('Visto en albapilates.example.com hace 2 h', { exact: true })).toBeVisible();
    await expect(portada(page).getByText(VERSIONES)).toHaveCount(0);
    await expect(portada(page).getByText(/Aún no lo vemos/)).toHaveCount(0);
    // El anfitrión es texto, nunca un enlace a una dirección que llega de fuera.
    await expect(portada(page).getByRole('link', { name: /albapilates/ })).toHaveCount(0);

    // La lectura falla: ni «Aún no» (sería mentira) ni «Visto».
    respuesta = { status: 500, cuerpo: { message: 'fallo' } };
    antes = lecturas();
    const fallo = respuestaVistos(page, 500);
    await recargar(page);
    // El 500 ya ha llegado a la página (entero): lo que se aserta abajo es lo
    // que pinta CON él, no lo de antes de tenerlo.
    await (await fallo).finished();
    await expect.poll(lecturas, { message: 'el 500 ni se llegó a pedir' }).toBeGreaterThan(antes);
    await expect(portada(page).getByText('Aún no ha llegado nadie desde aquí este mes')).toBeVisible();
    // Un fotograma para que React pinte lo que hizo con él.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    await expect(portada(page).getByText(/Aún no lo vemos/)).toHaveCount(0);
    await expect(portada(page).getByText(/Visto (en|hace)/)).toHaveCount(0);
  });

  test('la versión que enseña su web: anterior, distinta o dos a la vez, cada una con «Copiar el código nuevo»', async ({ page }) => {
    await montar(page, { plataforma: 'otra', widgetBuilder: { horario: { copiado: COPIA_CON_FOTO } } });
    let respuesta: Respuesta = { status: 200, cuerpo: [fila(FIRMA_ANTERIOR, 3)] };
    const lecturas = await lectorDeVistos(page, () => respuesta);

    await recargar(page);
    await expect.poll(lecturas).toBeGreaterThan(0);
    await expect(portada(page).getByText('Visto en albapilates.example.com hace 3 h', { exact: true })).toBeVisible();
    await expect(portada(page).getByText(
      'La última vez que lo vimos (hace 3 h, en albapilates.example.com), tu web tenía una versión anterior. Pega el código de ahora en lugar del que hay; cuando alguien lo abra, cambiará aquí.',
    )).toBeVisible();

    respuesta = { status: 200, cuerpo: [fila(FIRMA_A_MANO, 3)] };
    let antes = lecturas();
    await recargar(page);
    await expect.poll(lecturas).toBeGreaterThan(antes);
    await expect(portada(page).getByText(/tu web tenía una versión distinta de la de aquí\. Si nadie la cambió a mano/)).toBeVisible();
    await expect(portada(page).getByText(/versión anterior/)).toHaveCount(0);

    // Las dos: la de ahora, la más reciente; la otra, vista después de pegar la de ahora.
    respuesta = { status: 200, cuerpo: [fila(FIRMA_AHORA, 3), fila(FIRMA_A_MANO, 5)] };
    antes = lecturas();
    await recargar(page);
    await expect.poll(lecturas).toBeGreaterThan(antes);
    await expect(portada(page).getByText('Visto en albapilates.example.com hace 3 h', { exact: true })).toBeVisible();
    await expect(portada(page).getByText(
      'Esta semana tu web ha enseñado dos versiones: la de ahora y otra distinta (la última vez hace 5 h, en albapilates.example.com). Si lo pegaste en varias páginas, cambia el código también en las demás.',
    )).toBeVisible();

    // «Copiar el código nuevo» lleva a copiarlo, con su widget abierto.
    await portada(page).getByRole('button', { name: 'Copiar el código nuevo', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Ponlo en tu web', exact: true }))
      .toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('button', { name: 'Copiar código', exact: true })).toBeVisible();
  });

  test('cambiar después de copiar: la fila dice QUÉ cambió, y desde la portada se llega a cada paso y se vuelve', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { horario: { ...CONFIG_SIN_PRECIO, copiado: COPIA_CON_FOTO } },
    });
    // La lectura se retiene: mientras no llega, lo que ve su web podría quitar
    // el ámbar (si ya pegó lo de ahora), así que no se pinta para quitarlo después.
    let lecturas = 0;
    let soltar = () => {};
    const retenida = new Promise<void>(r => { soltar = r; });
    await page.route('**/rest/v1/rpc/widget_vistos**', async route => { lecturas++; await retenida; return json(route, []); });
    await recargar(page);
    await expect.poll(() => lecturas).toBeGreaterThan(0);
    await expect(portada(page).getByText(/Lo cambiaste después de copiarlo/)).toHaveCount(0);
    soltar();
    await expect(portada(page).getByText('Lo cambiaste después de copiarlo (qué se ve de cada clase): tu web sigue con lo de antes.')).toBeVisible();
    // Con ámbar no se dice nada de su versión.
    await expect(portada(page).getByText(VERSIONES)).toHaveCount(0);

    // «Cambiar» abre su widget en «Qué y dónde», con los pasos.
    await page.getByRole('button', { name: 'Cambiar Horario y reservas', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Qué y dónde', exact: true }))
      .toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: /Tu horario/ }))
      .toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Has cambiado algo que va en el código después de copiarlo/)).toBeVisible();

    // La flecha vuelve a la portada, sin pasos.
    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await expect(portada(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pasos' })).toHaveCount(0);

    // «Cambiar el estilo», a «Cómo se ve».
    const tarjetaEstilo = page.getByRole('region', { name: 'Estilo de tus widgets' });
    await expect(tarjetaEstilo).toContainText('Igual que tu app · Crema');
    await expect(tarjetaEstilo).toContainText('Llega a lo que tienes dentro de una página o en una ventana encima, salvo a lo que lleva su propio diseño en el código.');
    await tarjetaEstilo.getByRole('button', { name: 'Cambiar el estilo', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Cómo se ve', exact: true }))
      .toHaveAttribute('aria-current', 'step');
    await expect(estilos(page)).toBeVisible();

    // «Poner otra cosa en tu web», a lo primero que aún no tiene (sus precios).
    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await page.getByRole('button', { name: 'Poner otra cosa en tu web' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: /Tus precios/ }))
      .toHaveAttribute('aria-checked', 'true');

    // «Cambiar» su web desde la portada y «Cancelar» vuelven a la portada.
    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await page.getByRole('button', { name: 'Cambiar con qué está hecha tu web' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(portada(page)).toBeVisible();

    // «Ver resultados», a «Cómo le va a tu página».
    await page.getByRole('button', { name: 'Ver resultados de Horario y reservas', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Qué ver' }).getByRole('button', { name: 'Cómo le va a tu página' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('copiar guarda la forma, la foto de la config y la versión, sin tocar el código; y ya hay portada', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    // Sin nada copiado, ni portada ni vuelta a ella.
    await expect(portada(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lo que tienes en tu web' })).toHaveCount(0);
    const codigo = await snippet(page).textContent();

    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect.poll(() => typeof ultimoBuilder(patches)?.horario?.copiado, { timeout: 10_000 }).toBe('object');
    const copiado = ultimoBuilder(patches)!.horario.copiado as Record<string, unknown>;
    expect(copiado.metodo).toBe('iframe');
    expect(copiado.contenido).toBe(FIRMA_AHORA);
    expect(copiado.config).toEqual(expect.objectContaining({ tipos: [], mostrarPrecio: true, etiqueta: null }));
    expect('anteriores' in copiado).toBe(false);
    // Nada de esto viaja en el código.
    expect(await snippet(page).textContent()).toBe(codigo);

    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await expect(portada(page).getByRole('listitem').filter({ hasText: 'Horario y reservas' })).toContainText(/Dentro de una página · copiado el/);
  });

  // Sin marco y con su web sin autorizar: el botón lleva a la LISTA, no solo al paso.
  const AVISO_SIN_AUTORIZAR = 'Tu web (albapilates.example.com) no está entre las webs autorizadas, y sin marco el widget solo carga en las que autorices.';
  const COPIA_SIN_MARCO = { firma: 'abc123', en: '2026-09-12T10:00:00.000Z', metodo: 'nativa', config: { metodo: 'nativa' } };
  const WEB_SIN_AUTORIZAR = { plataforma: 'otra', direccion: 'albapilates.example.com' };

  test('«Ir a las webs autorizadas» abre «Para quien te hace la web» y lleva a la lista, cada vez', async ({ page }) => {
    await montar(page, { widgetBuilder: { _web: WEB_SIN_AUTORIZAR, horario: { metodo: 'nativa', copiado: COPIA_SIN_MARCO } } });
    const fila1 = portada(page).getByRole('listitem').filter({ hasText: 'Horario y reservas' });
    await expect(fila1).toContainText(AVISO_SIN_AUTORIZAR);
    const lista = page.getByRole('list', { name: 'Webs autorizadas' });
    const focoEnLaLista = () => page.evaluate(() => !!document.activeElement?.querySelector('ul[aria-label="Webs autorizadas"]'));

    await fila1.getByRole('button', { name: 'Ir a las webs autorizadas', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Ponlo en tu web', exact: true }))
      .toHaveAttribute('aria-current', 'step');
    await expect(lista).toBeVisible();
    await expect(lista).toBeInViewport();
    await expect.poll(focoEnLaLista).toBe(true);

    // Si lo cierra y vuelve a pedirlo desde la portada, se vuelve a abrir.
    await page.locator('summary', { hasText: 'Para quien te hace la web' }).click();
    await expect(lista).toBeHidden();
    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await portada(page).getByRole('button', { name: 'Ir a las webs autorizadas', exact: true }).click();
    await expect(lista).toBeVisible();
    await expect.poll(focoEnLaLista).toBe(true);
  });

  test('si ahora ya no va sin marco, el aviso sigue (es cierto) pero sin un botón que no lleva a ninguna lista', async ({ page }) => {
    await montar(page, { widgetBuilder: { _web: WEB_SIN_AUTORIZAR, horario: { metodo: 'iframe', copiado: COPIA_SIN_MARCO } } });
    const fila1 = portada(page).getByRole('listitem').filter({ hasText: 'Horario y reservas' });
    await expect(fila1).toContainText(AVISO_SIN_AUTORIZAR);
    await expect(fila1.getByRole('button', { name: 'Ir a las webs autorizadas' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase D (29-sep): el botón que abre la ventana sigue el estilo de sus widgets
// (el código lleva cada color dos veces: el literal y la variable con el mismo
// respaldo), copiar a mano el código entero cuenta como copiado, y «Ver
// resultados» abre «Cómo le va a tu página» centrada en su widget.
//
// Mismas reglas que arriba: las rutas propias se registran DESPUÉS de montar()
// y se recarga, y antes de cualquier «no pasó nada» va un CONTADOR que prueba
// que se llegó a intentar. La copia a mano se simula con una selección y un
// `copy` despachado (determinista en headless); la copia nativa de verdad, con
// el portapapeles del sistema, se mira a mano en Safari y en el iPad.
// ─────────────────────────────────────────────────────────────────────────────

const HORARIO_W = WIDGETS.find((x): x is WidgetDisponible => x.id === 'horario' && esDisponible(x))!;
/**
 * La huella REAL del popup del horario tal como lo lee el panel (`firmaCodigo`
 * quita el origen, así que no depende de dónde corra el test).
 */
const FIRMA_POPUP = firmaCodigo({
  widget: HORARIO_W, config: leerConfigs({ horario: { metodo: 'popup' } }).horario,
  origen: 'http://tentare.example.com', slug: SLUG, colorEstudio: '#343825',
}, 'popup');
/** Un popup copiado ANTES de la Fase D: la misma huella, sin la marca `botonVivo`. */
const COPIA_POPUP_ANTERIOR = { firma: FIRMA_POPUP, en: '2026-09-12T10:00:00.000Z' };

const NOTA_BOTON_ANTERIOR = 'El botón que abre la ventana es de un código anterior y no cambia con el estilo de tus widgets. Lo de dentro de la ventana, sí. Si copias el código de ahora y lo pegas en lugar del de antes, el botón también cambiará solo.';
const LINEA_BOTON_ANTERIOR = 'El botón que ya tienes pegado es de un código anterior y no cambia con el estilo de tus widgets. Si copias este y lo pegas en lugar del de antes, cambiará solo.';
const CONFIRMA_CONGELADO = 'El botón que abre la ventana de Horario y reservas es de un código anterior y se queda como está. Si quieres que también cambie solo, copia su código otra vez y pégalo en lugar del de antes.';
const CONFIRMA_VIVO = 'El botón que abre la ventana de Horario y reservas también cambia, aunque puede tardar unos minutos más.';

/** Lo último guardado como copiado del horario. */
const copiadoDe = (patches: Record<string, unknown>[]) =>
  ultimoBuilder(patches)?.horario?.copiado as Record<string, unknown> | undefined;
/** Los PATCH que guardan una copia (el constructor manda `widget_builder` entero). */
const guardadosConCopia = (patches: Record<string, unknown>[]) =>
  patches.filter(p => JSON.stringify(p.widget_builder ?? {}).includes('"copiado"')).length;

/** Cuenta cada `copy` que llega al documento: el control de que la copia a mano se llegó a hacer. */
async function contarCopias(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __copias: number };
    w.__copias = 0;
    document.addEventListener('copy', () => { w.__copias += 1; });
  });
  return () => page.evaluate(() => (window as unknown as { __copias: number }).__copias);
}
const seleccion = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

test.describe('Fase D: el botón del popup sigue el estilo, la copia a mano cuenta y los resultados se centran en su widget', () => {

  test('D1 · el código del popup lleva cada color dos veces (literal y variable); con diseño propio o dentro de una página, ninguna variable; copiarlo marca `botonVivo`', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    await donde(page, /Un botón/);
    await expect(snippet(page)).toContainText('data-tentare-popup=');
    // Tema mockeado: su color #343825, nada elegido en el estilo de sus widgets.
    await expect(snippet(page)).toContainText(
      'background:#343825;background:var(--tentare-boton,#343825);color:#FFFFFF;color:var(--tentare-boton-texto,#FFFFFF)',
    );
    await expect(snippet(page)).toContainText('border-radius:999px;border-radius:var(--tentare-boton-radio,999px);');

    await paso(page, 'Ponlo en tu web');
    await expect(page.getByText('Tus clases, precios y plazas, y el estilo de tus widgets: dentro de la ventana y en el botón que la abre (su color y sus esquinas).')).toBeVisible();
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect.poll(() => copiadoDe(patches)?.botonVivo, { timeout: 10_000 }).toBe(true);
    expect(copiadoDe(patches)?.metodo).toBe('popup');

    // Dentro de una página no hay botón que pintar: la copia va sin la marca.
    await paso(page, 'Qué y dónde');
    await donde(page, /Dentro de una página/);
    await expect(snippet(page)).toContainText('<iframe');
    await expect(snippet(page)).not.toContainText('var(--tentare');
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar el código nuevo' }).click();
    await expect.poll(() => copiadoDe(patches)?.metodo, { timeout: 10_000 }).toBe('iframe');
    expect('botonVivo' in copiadoDe(patches)!).toBe(false);

    // Con un diseño propio el botón lleva su color a propósito: literal, sin variables.
    await paso(page, 'Qué y dónde');
    await donde(page, /Un botón/);
    await expect(snippet(page)).toContainText('var(--tentare-boton,');
    await paso(page, 'Cómo se ve');
    await abrir(page, 'Un diseño distinto');
    await page.getByRole('switch', { name: /Usar un diseño propio/ }).click();
    await page.getByLabel('Color principal').fill('#112233');
    await expect(snippet(page)).toContainText('marca=%23112233');
    await expect(snippet(page)).toContainText('data-tentare-popup=');
    await expect(snippet(page)).not.toContainText('var(--tentare');
  });

  test('D1 · el respaldo del código es lo PUBLICADO; la vista previa pinta el estilo que está probando', async ({ page }) => {
    await montar(page, { plataforma: 'otra', widgetBuilder: { horario: { metodo: 'popup' } } });
    // En su web, «Esquinas: rectas» ya aplicado.
    let lecturas = 0;
    await page.route('**/api/theme**', route => {
      lecturas++;
      return json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12, widgetWeb: { ...ARENA, estilo: null, forma: 'recto' } });
    });
    await page.reload();
    await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
    await expect(snippet(page)).toContainText('border-radius:6px;border-radius:var(--tentare-boton-radio,6px);', { timeout: 15_000 });
    expect(lecturas).toBeGreaterThan(0);
    const botonPrevia = page.getByRole('button', { name: 'Reservar clase' });
    await expect(botonPrevia).toHaveCSS('border-radius', '6px');

    // Prueba «Suaves» sin aplicarla: la previa la enseña, el código no.
    await paso(page, 'Cómo se ve');
    await abrir(page, 'Ajustes finos');
    await page.getByRole('radiogroup', { name: 'Esquinas de tus widgets' }).getByRole('radio', { name: 'Suaves' }).click();
    await expect(estadoEstilo(page)).toContainText('Cambios sin aplicar');
    await expect(botonPrevia).toHaveCSS('border-radius', '13px');
    await expect(snippet(page)).toContainText('border-radius:6px;border-radius:var(--tentare-boton-radio,6px);');
    await expect(snippet(page)).not.toContainText('13px');
  });

  test('D1 · un popup copiado antes: la portada lo dice, la confirmación lo nombra aparte, y copiarlo otra vez lo pasa a los que cambian', async ({ page }) => {
    const { patches } = await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { horario: { metodo: 'popup', copiado: COPIA_POPUP_ANTERIOR } },
    });
    const cuerpos = await servidorDelEstilo(page, escribe);
    const fila1 = portada(page).getByRole('listitem').filter({ hasText: 'Horario y reservas' });
    await expect(fila1).toContainText('Un botón que se abre encima · copiado el 12 sep');
    await expect(fila1).toContainText(NOTA_BOTON_ANTERIOR);
    // Es lo de ahora (misma huella): ni ámbar ni «Copiar el código nuevo».
    await expect(fila1).not.toContainText('Lo cambiaste después de copiarlo');

    await fila1.getByRole('button', { name: 'Ir a copiarlo', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: 'Ponlo en tu web', exact: true }))
      .toHaveAttribute('aria-current', 'step');
    await expect(page.getByText(/Lo copiaste aquí el 12 sept?\./)).toBeVisible();
    await expect(page.getByText(LINEA_BOTON_ANTERIOR)).toBeVisible();

    // La confirmación: su botón, aparte y con lo que lo arregla. Abrirla no manda nada.
    await paso(page, 'Cómo se ve');
    await arena(page).click();
    await botonAplicar(page).click();
    await expect(dialogoAplicar(page)).toContainText('Entre ellos, los que copiaste desde aquí: Horario y reservas.');
    await expect(dialogoAplicar(page)).toContainText(CONFIRMA_CONGELADO);
    await expect(dialogoAplicar(page)).not.toContainText(CONFIRMA_VIVO);
    expect(cuerpos).toHaveLength(0);
    await dialogoAplicar(page).getByRole('button', { name: 'Cancelar' }).click();

    // Copia el código de ahora: su botón ya lee las variables.
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect.poll(() => copiadoDe(patches)?.botonVivo, { timeout: 10_000 }).toBe(true);
    await expect(page.getByText(LINEA_BOTON_ANTERIOR)).toHaveCount(0);

    await paso(page, 'Cómo se ve');
    await botonAplicar(page).click();
    await expect(dialogoAplicar(page)).toContainText(CONFIRMA_VIVO);
    await expect(dialogoAplicar(page)).not.toContainText('es de un código anterior');
    await dialogoAplicar(page).getByRole('button', { name: 'Aplicar en mi web' }).click();
    await expect(estadoEstilo(page)).toHaveText('Aplicado en tu web · hace un momento');
    expect(cuerpos).toHaveLength(1);

    // Y la portada deja de decirlo.
    await page.getByRole('button', { name: 'Lo que tienes en tu web' }).click();
    await expect(fila1).toBeVisible();
    await expect(fila1).not.toContainText(NOTA_BOTON_ANTERIOR);
  });

  test('D2 · copiar a mano el código ENTERO lo guarda como copiado, sin decir «Copiado»; un trozo no cuenta', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    await paso(page, 'Ponlo en tu web');
    await expect(page.getByText('Aún no lo has copiado desde aquí.')).toBeVisible();
    await abrir(page, 'Ver el código');
    const codigo = (await snippet(page).textContent())!;
    const copias = await contarCopias(page);

    // Un trozo: el `copy` llega (contador), pero no es el código y no se guarda nada.
    await snippet(page).evaluate(pre => {
      const r = document.createRange();
      r.selectNodeContents(pre.querySelector('span')!);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    const trozo = await seleccion(page);
    expect(trozo.trim().length).toBeGreaterThan(0);
    expect(esCopiaCompleta(trozo, codigo)).toBe(false);
    await snippet(page).dispatchEvent('copy');
    await expect.poll(copias, { message: 'el copy del trozo ni llegó' }).toBe(1);
    await page.waitForTimeout(1_500);
    expect(guardadosConCopia(patches)).toBe(0);
    await expect(page.getByText('Aún no lo has copiado desde aquí.')).toBeVisible();

    // El código entero: se guarda una vez, y solo cambia la línea de «Lo copiaste aquí».
    await snippet(page).selectText();
    expect(esCopiaCompleta(await seleccion(page), codigo)).toBe(true);
    await snippet(page).dispatchEvent('copy');
    await expect.poll(copias).toBe(2);
    await expect.poll(() => guardadosConCopia(patches), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/Lo copiaste aquí el/)).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(guardadosConCopia(patches)).toBe(1);
    expect(copiadoDe(patches)?.metodo).toBe('iframe');
    expect(copiadoDe(patches)?.contenido).toBe(FIRMA_AHORA);
    // #994: la copia es del navegador, no nuestra; nunca «Copiado».
    await expect(page.getByRole('button', { name: 'Copiado' })).toHaveCount(0);
    await expect(page.getByText('Copiado al portapapeles')).toHaveCount(0);
  });

  test('D2 · el botón «Copiar código» y la copia a mano en menos de un minuto son UNA copia', async ({ page }) => {
    const { patches } = await montar(page, { plataforma: 'otra' });
    await paso(page, 'Ponlo en tu web');
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    await expect.poll(() => guardadosConCopia(patches), { timeout: 10_000 }).toBe(1);

    await abrir(page, 'Ver el código');
    const codigo = (await snippet(page).textContent())!;
    const copias = await contarCopias(page);
    await snippet(page).selectText();
    // Control: es el código entero, así que por sí sola SÍ se guardaría.
    expect(esCopiaCompleta(await seleccion(page), codigo)).toBe(true);
    await snippet(page).dispatchEvent('copy');
    await expect.poll(copias, { message: 'el copy a mano ni llegó' }).toBe(1);
    await page.waitForTimeout(1_500);
    expect(guardadosConCopia(patches)).toBe(1);
  });

  test('D3 · «Ver resultados» de un widget abre «Cómo le va a tu página» centrada en su fila; el chip, sin centrar', async ({ page }) => {
    await montar(page, { plataforma: 'otra', widgetBuilder: { horario: { copiado: COPIA_CON_FOTO } } });
    let lecturas = 0;
    await page.route('**/rest/v1/rpc/embudo_widget_por_origen', route => {
      lecturas++;
      return json(route, [
        { origen: 'web-horario', tipo: 'widget_loaded', n: 200 },
        { origen: 'web-horario', tipo: 'booking_completed', n: 9 },
        { origen: 'web-planes', tipo: 'widget_loaded', n: 50 },
        { origen: null, tipo: 'widget_loaded', n: 300 },
      ]);
    });
    await recargar(page);

    await portada(page).getByRole('button', { name: 'Ver resultados de Horario y reservas', exact: true }).click();
    const chips = page.getByRole('group', { name: 'Qué ver' });
    await expect(chips.getByRole('button', { name: 'Cómo le va a tu página' })).toHaveAttribute('aria-pressed', 'true');
    const tabla = page.getByRole('region', { name: 'Por widget' });
    await expect(tabla.getByRole('row')).toHaveCount(4);
    expect(lecturas).toBeGreaterThan(0);
    const suya = tabla.getByRole('row').filter({ hasText: 'Horario y reservas' });
    await expect(suya).toHaveAttribute('aria-current', 'true');
    await expect(suya).toBeFocused();
    await expect(suya).toBeInViewport();
    await expect(tabla.locator('[aria-current]')).toHaveCount(1);
    await expect(tabla.getByText(/aún no ha llegado nadie en este periodo/)).toHaveCount(0);

    // Por el chip se abre sin centrar en ninguna.
    await chips.getByRole('button', { name: 'Widgets' }).click();
    await expect(portada(page)).toBeVisible();
    const antes = lecturas;
    await chips.getByRole('button', { name: 'Cómo le va a tu página' }).click();
    await expect(tabla.getByRole('row')).toHaveCount(4);
    await expect.poll(() => lecturas).toBeGreaterThan(antes);
    await expect(tabla.locator('[aria-current]')).toHaveCount(0);
  });

  test('D3 · sin fila suya en el periodo, se dice en una línea (y sigue al cambiar de periodo)', async ({ page }) => {
    await montar(page, { plataforma: 'otra', widgetBuilder: { horario: { copiado: COPIA_CON_FOTO } } });
    let filas: unknown[] = [];
    let lecturas = 0;
    await page.route('**/rest/v1/rpc/embudo_widget_por_origen', route => { lecturas++; return json(route, filas); });
    await recargar(page);

    await portada(page).getByRole('button', { name: 'Ver resultados de Horario y reservas', exact: true }).click();
    const tabla = page.getByRole('region', { name: 'Por widget' });
    const linea = tabla.getByText('Horario y reservas: aún no ha llegado nadie en este periodo.', { exact: true });
    await expect(linea).toBeVisible();
    expect(lecturas).toBeGreaterThan(0);
    await expect(linea).toBeFocused();
    await expect(tabla.getByRole('table')).toHaveCount(0);

    // Otro periodo con visitas de OTRO widget: la tabla sale, y la línea sigue.
    filas = [{ origen: 'web-planes', tipo: 'widget_loaded', n: 50 }];
    const antes = lecturas;
    await page.getByRole('button', { name: 'Últimos 3 meses' }).click();
    await expect.poll(() => lecturas).toBeGreaterThan(antes);
    await expect(tabla.getByRole('row').filter({ hasText: 'Planes y precios' })).toBeVisible();
    await expect(linea).toBeVisible();
    await expect(tabla.locator('[aria-current]')).toHaveCount(0);
  });
});

