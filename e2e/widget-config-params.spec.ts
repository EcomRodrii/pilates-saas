import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El motor de parámetros del snippet embebido (lib/reservar/config-widget.ts),
// verificado en Modo A (`/reservar/[slug]?embed=1&...`). Cada parámetro tiene
// que hacer lo que dice DE VERDAD — cero decorativo — y, sin parámetros, el
// widget tiene que seguir EXACTAMENTE igual que hoy (regresión).
//
// Mismo andamiaje de mocks que e2e/reservar-acoplar-widget.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare'; const S = 'studio-test';
function fx() {
  const mk = (d: string, h: string, id: string, tipo = 'tc-r', ins = 'ins-1') => ({ id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: ins, inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false });
  return { studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [
      { id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' },
      { id: 'ins-2', studioId: S, nombre: 'Bea', rol: 'INSTRUCTOR' },
    ],
    spots: [],
    // PUNTUAL activo: sin socia, cada clase enseña «Reservar por 15 €» — la
    // materia prima de `ocultar-precio`.
    planesTarifa: [{ id: 'p1', studioId: S, tipo: 'PUNTUAL', activo: true, precio: 15, nombre: 'Clase suelta' }],
    // s1 (Reformer hoy 10:00) la da Ana sustituyendo a Bea — la materia prima
    // de `ocultar-sustituta`.
    sustitucionesConfirmadas: [{ sesionId: 's1', instructorOriginalId: 'ins-2' }],
    sesiones: [mk('12', '10', 's1', 'tc-r'), mk('12', '12', 's2', 'tc-m'), mk('13', '10', 's3', 'tc-r')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null };
}
async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function abrir(page: Page, q: string) {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?embed=1&tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  // La primera fila de clase del día — señal de que los datos ya pintaron.
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
}

const tabsDia = (page: Page) => page.getByRole('tablist', { name: 'Elegir día' }).getByRole('tab');

test('⚠️ regresión: sin parámetros nuevos, todo sigue exactamente igual', async ({ page }) => {
  await abrir(page, '');
  // Tira de 10 días, los dos tipos visibles, y la propia tarjeta con precio —
  // el estado de partida que los toggles apagan.
  await expect(tabsDia(page)).toHaveCount(10);
  const fila = page.locator('.reserva-slot-row', { hasText: 'Reformer' });
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2); // Reformer 10:00 + Mat 12:00 (hoy)
  // El precio ya se ve en la propia tarjeta, sin abrir nada (TarjetaClaseImpl,
  // reserva-calendario.tsx) — no hace falta la ficha para verificarlo.
  await expect(fila.locator('.reserva-cta-btn')).toHaveText('Reservar');
  await expect(fila).toContainText('15 €');
  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): esta fixture (sin `reservaExigirPlan`/
  // `stripeAccountId`) no cumple el gate de checkout-sin-login, así que un
  // tap en la tarjeta salta la ficha DIRECTO a 'login' — nivel/sustituta
  // (contenido exclusivo de la ficha) quedan fuera del alcance de una
  // invitada aquí; el toggle que sí los sigue protegiendo está más abajo con
  // una fixture autenticada.
  await fila.click();
  await expect(page.getByRole('heading', { name: 'Entra para reservar' })).toBeVisible({ timeout: 30_000 });
});

test('un filtro de tipo enseña SOLO ese tipo (listado y chips)', async ({ page }) => {
  await abrir(page, '&tipos=tc-m');
  const filas = page.locator('.reserva-slot-row');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Mat');
  // El chip del tipo excluido desaparece: un chip que siempre da cero
  // resultados es un control roto.
  const chips = page.getByRole('group', { name: 'Filtrar por tipo de clase' });
  await expect(chips.getByRole('button', { name: 'Mat' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Reformer' })).toHaveCount(0);
});

test('filtro por instructora, por id', async ({ page }) => {
  // Solo Ana da clases en el fixture; filtrar por Bea (que únicamente aparece
  // como sustituida) tiene que dejar el día sin clases de ella.
  await abrir(page, '&instructoras=ins-1');
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
});

test('⚠️ ocultar-precio quita el precio DE VERDAD, no solo del botón', async ({ page }) => {
  await abrir(page, '&ocultar-precio=1');
  // El precio (o su ausencia) ya se ve en la propia tarjeta, sin necesitar
  // abrir la ficha — ver el docblock del test de regresión de arriba.
  const fila = page.locator('.reserva-slot-row', { hasText: 'Reformer' });
  await expect(fila.locator('.reserva-cta-btn')).toHaveText('Reservar');
  // Acotado a la propia tarjeta: la página SIGUE teniendo su sección de
  // "Bonos y membresías" con precio (le compete a otra cosa, no a
  // `ocultar-precio`, que solo tapa el precio de LA CLASE) — antes, con la
  // ficha abierta, esa sección quedaba oculta detrás y un `body` a secas
  // colaba. Ahora que la invitada ya no abre la ficha (petición explícita
  // del fundador, 2026-08-30), esa sección sigue en pantalla y el `body`
  // entero SÍ lleva un «€» legítimo — acotar a la tarjeta es lo que de
  // verdad prueba lo que este test protege.
  await expect(fila).not.toContainText('€');
});

test('ocultar-nivel y ocultar-sustituta apagan cada uno lo suyo', async ({ page }) => {
  // Nivel y sustituta son contenido EXCLUSIVO de la ficha (BookingSheet) — no
  // aparecen en la tarjeta del listado. Desde que una invitada sin sesión
  // salta la ficha (petición explícita del fundador, 2026-08-30: "no quiero
  // que se coma 3 pantallas seguidas"), verificar estos dos toggles necesita
  // una socia YA autenticada, que sigue viendo la ficha sin cambios (ver
  // `saltarFichaSiInvitada` en reserva-calendario.tsx) — mismo patrón de
  // sesión simulada que el test de Modo B más abajo en este fichero.
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: 'e2e@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  // ⚠️ DESPUÉS de `mocks()`: Playwright resuelve el `page.route` registrado
  // MÁS RECIENTE primero — si esta ruta fuera anterior, el 404 genérico de
  // `mocks()` la taparía y la sesión nunca se reconocería.
  await page.route('**/api/public/session', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e', nombre: 'Alumna E2E', email: 'e2e@test.com' }),
  }));
  await page.goto(`/reservar/${SLUG}?embed=1&tab=clases&ocultar-nivel=1&ocultar-sustituta=1`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  await page.locator('.reserva-slot-row', { hasText: 'Reformer' }).click();
  await expect(page.getByRole('heading', { name: 'Reformer' })).toBeVisible();
  await expect(page.getByText('Todos los niveles')).toHaveCount(0);
  await expect(page.getByText('Sustituye a Bea hoy')).toHaveCount(0);
  // Sin el aviso queda el rótulo de rol de siempre, no un hueco.
  await expect(page.getByText('Instructora')).toBeVisible();
  // Y el precio sigue: los toggles son independientes.
  await expect(page.locator('.reserva-cta-btn')).toHaveText(/15 €/);
});

test('vista=hoy abre en hoy y SOLO hoy', async ({ page }) => {
  await abrir(page, '&vista=hoy');
  await expect(tabsDia(page)).toHaveCount(1);
  await expect(page.getByText('hoy', { exact: false }).first()).toBeVisible();
  // Las dos de hoy sí; la de mañana no tiene ningún día al que pertenecer.
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
});

test('marca= pisa el color primario del widget', async ({ page }) => {
  await abrir(page, '&marca=%23112233');
  const todas = page.getByRole('group', { name: 'Filtrar por tipo de clase' }).getByRole('button', { name: 'Todas' });
  await expect(todas).toHaveCSS('background-color', 'rgb(17, 34, 51)');
});

test('fuente= y fuente-display= cambian la letra REAL (computada), cuerpo y titulares por separado', async ({ page }) => {
  await abrir(page, '&fuente=Space%20Grotesk&fuente-display=Lobster');
  const r = await page.evaluate(() => {
    const raiz = document.querySelector('#horario')!.closest('div[style*="min-height"]') as HTMLElement;
    // Los titulares llevan la pila `serif` (portal-design.ts), que empieza por
    // var(--portal-heading-font) — ese literal en el style en línea es la
    // firma inequívoca de un titular, sin atar el test a un selector concreto.
    // Con `var(` incluido: la RAÍZ del widget también nombra la custom
    // property (la DEFINE, sin var), y es la primera en orden de documento.
    const titular = document.querySelector('[style*="var(--portal-heading-font"]') as HTMLElement;
    return {
      cuerpo: getComputedStyle(raiz).fontFamily,
      titular: titular ? getComputedStyle(titular).fontFamily : null,
      linksCuerpo: document.querySelectorAll('link[href*="Space+Grotesk"]').length,
      linksTitular: document.querySelectorAll('link[href*="family=Lobster"]').length,
    };
  });
  expect(r.cuerpo).toContain('Space Grotesk');
  expect(r.titular).toContain('Lobster');
  expect(r.linksCuerpo).toBe(1);
  expect(r.linksTitular).toBe(1);
});

test('solo fuente=: los titulares la heredan (contrato «display null = la misma que fuente»)', async ({ page }) => {
  await abrir(page, '&fuente=Lobster');
  const r = await page.evaluate(() => {
    const titular = document.querySelector('[style*="var(--portal-heading-font"]') as HTMLElement | null;
    return {
      titular: titular ? getComputedStyle(titular).fontFamily : null,
      // Misma familia → UN solo <link>, no dos.
      links: document.querySelectorAll('link[href*="family=Lobster"]').length,
    };
  });
  expect(r.titular).toContain('Lobster');
  expect(r.links).toBe(1);
});

test('⚠️ Modo B (bundle real): data-fuente/data-fuente-display pintan el shadow y el <link> va al HOST con dedupe', async ({ page }) => {
  // El bundle compilado de verdad (public/widget.js — `npm run build` lo
  // genera antes que Next), montado en una "web del estudio" servida por
  // route(): DOS widgets con la misma fuente de cuerpo, para vigilar el
  // dedupe del <link> en el <head> del anfitrión.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.route('**/api/public/studio-data**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  // ⚠️ Este test comprueba TIPOGRAFÍA dentro de la ficha, no el flujo de
  // acceso — pero desde que Modo B redirige a la página real de Tentare
  // cuando NO hay sesión (petición del fundador: nunca dos toques para
  // llegar a "Reservar"), sin sesión la ficha ya no llega a abrirse aquí.
  // Se simula una socia YA autenticada (mismo patrón que
  // e2e/booking.spec.ts para loginConPassword) para poder seguir mirando el
  // h2 de la ficha, que es lo que este test necesita de verdad.
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: 'e2e@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.route('**/api/public/session', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e', nombre: 'Alumna E2E', email: 'e2e@test.com' }),
  }));
  await page.route('**/host-widget-e2e', r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <div data-tentare-booking data-studio="${SLUG}" data-fuente="Space Grotesk" data-fuente-display="Lobster"></div>
      <div data-tentare-booking data-studio="${SLUG}" data-fuente="Space Grotesk"></div>
      <script src="/widget.js" async></script>
    </body></html>`,
  }));
  await page.goto('/host-widget-e2e');
  // La rejilla del primer widget, ya con datos (los locators de Playwright
  // atraviesan el shadow root solos).
  await page.getByRole('button', { name: '10:00 Reformer' }).first().waitFor({ timeout: 30_000 });
  const r = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-tentare-booking]'));
    const raices = hosts.map(h => h.shadowRoot!.querySelector('div')!);
    return {
      cuerpo: getComputedStyle(raices[0]).fontFamily,
      display: getComputedStyle(raices[0]).getPropertyValue('--font-display'),
      // El segundo widget no pide `fuente-display` → sus titulares heredan la
      // de cuerpo (mismo contrato que Modo A).
      displaySegundo: getComputedStyle(raices[1]).getPropertyValue('--font-display'),
      // Dedupe: DOS widgets nombrando Space Grotesk = UN solo <link>.
      linksCuerpo: document.querySelectorAll('link[href*="Space+Grotesk"]').length,
      linksTitular: document.querySelectorAll('link[href*="family=Lobster"]').length,
    };
  });
  expect(r.cuerpo).toContain('Space Grotesk');
  expect(r.display).toContain('Lobster');
  expect(r.displaySegundo).toContain('Space Grotesk');
  expect(r.linksCuerpo).toBe(1);
  expect(r.linksTitular).toBe(1);
  // Y un titular de carne y hueso dentro del shadow: cualquier elemento de la
  // hoja cuya pila EMPIEZA por var(--portal-heading-font) — la firma de
  // `serif` (portal-design.ts), sin atar el test a un tag concreto. El título
  // de la clase (h2) es el candidato estable: a diferencia de la foto de
  // cabecera (que puede ser la SUBIDA por el estudio, una <img> de catálogo
  // por defecto, o el bloque de color — ninguna de las tres es un "titular"),
  // el nombre de la clase siempre se pinta con la tipografía de titulares.
  await page.getByRole('button', { name: '10:00 Reformer' }).first().click();
  // ⚠️ Ya no va scopeada a `getByRole('dialog')`: Modo B monta la ficha con
  // `estiloFicha="inline"` (quitó el popup, ver e2e/reservar-pagar-sin-cuenta.spec.ts) —
  // es `.paso-anim`, no un `role="dialog"`.
  const hoja = page.locator('.paso-anim').first();
  await expect(hoja.locator('.reserva-cta-btn')).toBeVisible();
  const famTitular = await hoja.locator('[style*="var(--portal-heading-font"]').first()
    .evaluate(el => getComputedStyle(el).fontFamily);
  expect(famTitular).toContain('Lobster');
});

test('⚠️ Modo B sin fuentes: el shadow tiene pilas REALES, no una var inválida que cae a system-ui', async ({ page }) => {
  // El bug de partida: --font-ui no existía en el shadow → `var(--font-ui)`
  // invalidaba la declaración entera y TODO (titulares incluidos) salía en
  // system-ui. La base honesta no carga ninguna webfont (decisión de
  // rendimiento), pero las pilas quedan definidas: sans del sistema para el
  // cuerpo y Georgia (la serif de reserva del diseño) para titulares.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.route('**/api/public/studio-data**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/host-widget-e2e', r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <div data-tentare-booking data-studio="${SLUG}"></div>
      <script src="/widget.js" async></script>
    </body></html>`,
  }));
  await page.goto('/host-widget-e2e');
  await page.getByRole('button', { name: '10:00 Reformer' }).first().waitFor({ timeout: 30_000 });
  const r = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-tentare-booking]')!;
    const raiz = host.shadowRoot!.querySelector('div')!;
    return {
      ui: getComputedStyle(raiz).getPropertyValue('--font-ui'),
      display: getComputedStyle(raiz).getPropertyValue('--font-display'),
      links: document.querySelectorAll('link[href*="fonts.googleapis"]').length,
    };
  });
  expect(r.ui).toContain('system-ui');
  expect(r.display).toContain('Georgia');
  // Sin fuente pedida, NI UNA petición a Google Fonts.
  expect(r.links).toBe(0);
});

test('⚠️ la página SUELTA ignora los parámetros del snippet', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?tipos=tc-m&ocultar-precio=1&vista=hoy&marca=%23112233`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  // Sin embed=1 nada de esto aplica: los dos tipos, la tira completa, y el
  // precio visible en la propia tarjeta (ver el docblock del test de
  // regresión de arriba — no hace falta abrir la ficha para comprobarlo).
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
  await expect(tabsDia(page)).toHaveCount(10);
  const fila = page.locator('.reserva-slot-row', { hasText: 'Reformer' });
  await expect(fila.locator('.reserva-cta-btn')).toHaveText('Reservar');
  await expect(fila).toContainText('15 €');
});
