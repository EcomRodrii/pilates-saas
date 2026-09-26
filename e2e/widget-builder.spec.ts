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
const pestana = (page: Page, nombre: string) => page.getByRole('tab', { name: nombre, exact: true }).click();
const metodo = (page: Page, nombre: string) => page.getByRole('radiogroup', { name: 'Método de integración' }).getByRole('radio', { name: new RegExp(nombre) }).click();
const widget = (page: Page, nombre: RegExp) => page.getByRole('navigation', { name: 'Biblioteca de widgets' }).getByRole('button', { name: nombre }).click();

test.describe('Tentare Widgets — cada control conectado al código y a la vista previa', () => {

  test('⚠️ sin tocar nada, el código solo lleva la pestaña y la etiqueta del widget', async ({ page }) => {
    await montar(page);
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain(`/reservar/${SLUG}?embed=1&tab=clases&ref=web-horario`);
    for (const nunca of ['tipos=', 'instructoras=', 'salas=', 'vista=', 'ocultar-', 'diseno=', 'marca=', 'fondo=', 'tinta=', 'fuente=', 'fuente-display=', 'vista-previa']) {
      expect(codigo, `un default emitido (${nunca}) rompe el contrato del constructor`).not.toContain(nunca);
    }
  });

  test('la biblioteca: lo que no existe todavía se lee, pero no se pulsa', async ({ page }) => {
    await montar(page);
    const biblio = page.getByRole('navigation', { name: 'Biblioteca de widgets' });
    await expect(biblio.getByRole('button', { name: /Horario y reservas/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(biblio.getByText('Tarjetas regalo', { exact: true })).toBeVisible();
    await expect(biblio.getByRole('button', { name: /Tarjetas regalo/ })).toHaveCount(0);
    // El «Calendario embebido» ya no es un widget: es un método del horario.
    await expect(biblio.getByText(/Calendario embebido/)).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Método de integración' }).getByRole('radio', { name: /Integración nativa/ })).toBeVisible();
    // Y la videoteca (congelada) ni aparece.
    await expect(biblio.getByText('Videoteca')).toHaveCount(0);
  });

  test('elegir un tipo de clase mete tipos=<id> en el código, y se persiste en widget_builder', async ({ page }) => {
    const { patches } = await montar(page);
    await page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Reformer' }).click();
    await expect(snippet(page)).toContainText('tipos=tc-r');
    await page.getByRole('group', { name: 'Instructoras' }).getByRole('button', { name: 'Ana Ruiz' }).click();
    await expect(snippet(page)).toContainText('instructoras=ins-1');
    // La inactiva no se ofrece: un filtro por alguien que ya no da clases
    // dejaría el calendario vacío.
    await expect(page.getByRole('group', { name: 'Instructoras' }).getByRole('button', { name: 'Bea Gil' })).toHaveCount(0);
    await expect.poll(
      () => patches.some(p => typeof p.widget_builder === 'object' && p.widget_builder !== null
        && JSON.stringify(p.widget_builder).includes('tc-r')),
      { timeout: 10_000 },
    ).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  });

  test('⚠️ integración nativa: apagar «Precio» cambia el código Y la vista previa real', async ({ page }) => {
    await montar(page);
    await metodo(page, 'Integración nativa');
    await expect(snippet(page)).toContainText('data-tentare-booking');
    await expect(snippet(page)).toContainText('data-identidad="estudio"');

    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja = page.locator('.paso-anim');
    await expect(hoja.locator('.reserva-cta-btn')).toHaveText(/Reservar por 15 €/);
    await hoja.getByRole('button', { name: 'Volver a las clases' }).click();
    await expect(hoja).toHaveCount(0);

    await page.getByRole('switch', { name: 'Precio' }).click();
    await expect(snippet(page)).toContainText('data-ocultar-precio');

    await page.getByRole('button', { name: '10:00 Reformer' }).click();
    const hoja2 = page.locator('.paso-anim');
    await expect(hoja2.locator('.reserva-cta-btn')).toHaveText('Reservar');
    await expect(hoja2).not.toContainText('€');
  });

  test('⚠️ copiar entrega el string EXACTO del código, nunca los tokens coloreados', async ({ page }) => {
    await montar(page);
    await page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Mat' }).click();
    const codigo = await snippet(page).textContent();
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    const copiado = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
    expect(copiado).toBe(codigo);
    expect(copiado).toContain('tipos=tc-m');
  });

  test('al volver a entrar, lo guardado con el constructor anterior se restaura en el widget nuevo', async ({ page }) => {
    await montar(page, {
      widgetBuilder: { clases: { vista: 'hoy', tipos: ['tc-r'], ocultarPrecio: true, marca: '#112233' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('vista=hoy');
    expect(codigo).toContain('tipos=tc-r');
    expect(codigo).toContain('ocultar-precio=1');
    expect(codigo).toContain('marca=%23112233');
    await expect(page.getByRole('switch', { name: 'Precio' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('group', { name: 'Tipos de clase' }).getByRole('button', { name: 'Reformer' })).toHaveAttribute('aria-pressed', 'true');
    // Tocó un color: su identidad era propia, no se le apaga en silencio.
    await pestana(page, 'Diseño');
    await expect(page.getByRole('radio', { name: /Personalizar este widget/ })).toHaveAttribute('aria-checked', 'true');
  });

  async function elegirFuente(page: Page, campo: string, familia: string) {
    await page.getByRole('button', { name: campo, exact: true }).click();
    await page.getByRole('option', { name: new RegExp(familia) }).click();
  }

  test('⚠️ tipografía: con identidad propia entra en el código (iframe y nativa) y pinta la previa real', async ({ page }) => {
    const { patches } = await montar(page);
    await pestana(page, 'Diseño');
    // Con la identidad del estudio no hay tipografía que elegir: manda la del portal.
    await expect(page.getByRole('button', { name: 'Tipografía', exact: true })).toHaveCount(0);
    await page.getByRole('radio', { name: /Personalizar este widget/ }).click();
    await elegirFuente(page, 'Tipografía', 'Poppins');
    await elegirFuente(page, 'Tipografía de titulares', 'Playfair Display');
    await expect(snippet(page)).toContainText('fuente=Poppins');
    await expect(snippet(page)).toContainText('fuente-display=Playfair%20Display');

    await page.getByRole('button', { name: 'Tipografía', exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(11); // 10 + «la de por defecto»
    await page.keyboard.press('Escape');

    await expect.poll(
      () => patches.some(p => typeof p.widget_builder === 'object' && p.widget_builder !== null
        && JSON.stringify(p.widget_builder).includes('Poppins')),
      { timeout: 10_000 },
    ).toBe(true);

    // El mismo widget con integración nativa lleva la misma letra.
    await metodo(page, 'Integración nativa');
    await expect(snippet(page)).toContainText('data-fuente="Poppins"');
    await expect(snippet(page)).toContainText('data-fuente-display="Playfair Display"');
    const boton = page.getByRole('button', { name: '10:00 Reformer' });
    await boton.waitFor();
    const fam = await boton.evaluate(el => getComputedStyle(el.closest('div[style*="--font-ui"]')!).fontFamily);
    expect(fam).toContain('Poppins');
  });

  test('al volver a entrar, una tipografía escrita a mano con el constructor viejo se conserva', async ({ page }) => {
    await montar(page, {
      widgetBuilder: { clases: { fuente: 'Space Grotesk', fuenteDisplay: 'Lobster' } },
    });
    const codigo = await snippet(page).textContent();
    expect(codigo).toContain('fuente=Space%20Grotesk');
    expect(codigo).toContain('fuente-display=Lobster');
    await pestana(page, 'Diseño');
    await expect(page.getByRole('button', { name: 'Tipografía', exact: true })).toContainText('Space Grotesk');
    await expect(page.getByRole('button', { name: 'Tipografía de titulares', exact: true })).toContainText('Lobster');
  });

  test('⚠️ guardar un dominio dispara el registro de wallets (contador real, no fe)', async ({ page }) => {
    const { patches } = await montar(page);
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

    await metodo(page, 'Integración nativa');
    await pestana(page, 'Avanzado');
    await page.getByPlaceholder('midominio.com').fill('otrodominio.com');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect.poll(() => envios.some(d => d.includes('https://otrodominio.com')), { timeout: 10_000 }).toBe(true);
    expect(patches.some(p => 'widget_dominios_autorizados' in p)).toBe(false);
    await expect.poll(() => intentosWallet, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('los widgets que no honran filtros no los ofrecen (nada de UI fake)', async ({ page }) => {
    await montar(page);
    await widget(page, /Citas/);
    await expect(page.getByRole('group', { name: 'Tipos de clase' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Precio' })).toHaveCount(0);
    await expect(snippet(page)).toContainText('tab=citas');
    await pestana(page, 'Diseño');
    await page.getByRole('radio', { name: /Personalizar este widget/ }).click();
    await expect(page.getByText('Color principal')).toBeVisible();
  });

  test('popup, botón y enlace generan el código real de cada método', async ({ page }) => {
    await montar(page);
    await metodo(page, 'Popup');
    await expect(snippet(page)).toContainText('data-tentare-popup=');
    await expect(snippet(page)).toContainText('/widget-popup.js');
    await expect(page.getByRole('button', { name: 'Reservar clase' })).toHaveAttribute('data-tentare-popup', /vista-previa=1/);
    await pestana(page, 'Comportamiento');
    await page.getByRole('textbox', { name: 'Texto del botón' }).fill('Ven a probar');
    await expect(snippet(page)).toContainText('>Ven a probar</button>');

    await metodo(page, 'Botón');
    await expect(snippet(page)).toContainText(`<a href="`);
    await expect(snippet(page)).not.toContainText('<script');

    await metodo(page, 'Enlace');
    await expect(snippet(page)).toHaveText(new RegExp(`/reservar/${SLUG}\\?ref=web-horario$`));
    await expect(page.getByRole('button', { name: 'Copiar enlace' })).toBeVisible();
  });

  test('React: el mismo widget como componente', async ({ page }) => {
    await montar(page);
    await page.getByRole('tablist', { name: 'Plataforma' }).getByRole('tab', { name: 'React' }).click();
    await expect(snippet(page)).toContainText('export function TentareHorarioYReservas()');
    await expect(snippet(page)).toContainText('tentareEmbedAltura');
  });

  test('«Reserva una clase» no da código hasta elegir la clase, y entonces es un enlace directo', async ({ page }) => {
    await montar(page);
    await widget(page, /Reserva una clase/);
    await expect(snippet(page)).toHaveCount(0);
    await expect(page.getByText('Elige la clase en «Contenido» para generar el código.').first()).toBeVisible();
    const select = page.getByRole('combobox', { name: 'Qué clase' });
    await select.selectOption({ index: 1 });
    await expect(snippet(page)).toContainText(`/reservar/${SLUG}?sesion=`);
  });

  test('el embudo por widget: el mes del widget activo en el constructor y la tabla «Por widget»', async ({ page }) => {
    await montar(page);
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
    await page.getByRole('navigation', { name: 'Biblioteca de widgets' }).getByRole('button', { name: /Citas/ }).click();
    await expect(page.getByText('Este mes, sin visitas con su etiqueta todavía')).toBeVisible();

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
});
