import { test, expect, type Page, type Route } from '@playwright/test';

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
  const principal = page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' }).getByRole('radio', { name: nombre });
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
    await expect(page.getByRole('status').filter({ hasText: 'Tus ajustes están guardados. Tu web cambia cuando pegues el código.' })).toBeVisible();

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

    // Otra visita, sin tocar nada: lo copiado sigue siendo lo de ahora.
    await page.reload();
    await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
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
  });

  test('código antiguo: una copia de otra visita con otra huella avisa desde el principio, con su fecha', async ({ page }) => {
    await montar(page, {
      plataforma: 'otra',
      widgetBuilder: { horario: { copiado: { firma: 'huellavieja', en: '2026-09-12T10:00:00.000Z' } } },
    });
    await expect(page.getByText(/Has cambiado algo que va en el código después de copiarlo el 12 sept?\./)).toBeVisible();
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
    // Con el estilo de su página de reservas no hay letra que elegir.
    await expect(page.getByRole('button', { name: 'Letra', exact: true })).toHaveCount(0);
    await expect(page.getByText('El estilo de tu página de reservas')).toBeVisible();
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

    await page.getByRole('group', { name: 'Qué hace el botón' }).getByRole('button', { name: 'Lleva a tu página de reservas' }).click();
    await expect(snippet(page)).toContainText(`<a href="`);
    await expect(snippet(page)).not.toContainText('<script');

    await donde(page, /Un enlace/);
    await expect(snippet(page)).toHaveText(new RegExp(`/reservar/${SLUG}\\?ref=web-horario$`));
    // Con un enlace no se ofrece ningún filtro: el enlace no se lo lleva.
    await expect(page.getByRole('group', { name: 'Qué clases salen' })).toHaveCount(0);
    await paso(page, 'Ponlo en tu web');
    await expect(page.getByRole('button', { name: 'Copiar enlace' })).toBeVisible();
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
    await expect(page.getByText('Elige la clase para tener el código.')).toBeVisible();
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

