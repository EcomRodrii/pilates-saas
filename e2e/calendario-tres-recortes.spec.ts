import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tres recortes del calendario, señalados con capturas.
//
// Los tres son el mismo tipo de fallo: algo mide más de lo que le dejan y nadie
// se entera, porque el contenedor lo tapa en vez de desbordarse a la vista.
//
//   1. El desplegable de "Buscar clase" se salía 20 px por la izquierda de la
//      tarjeta del calendario (`overflow: hidden` por sus esquinas redondeadas)
//      y la primera letra del placeholder aparecía cortada.
//   2. La primera etiqueta de hora llevaba `-translate-y-1.5` como todas, pero
//      arriba del todo esos 6 px la sacaban de la rejilla, montándola sobre la
//      cabecera de días.
//   3. 🔴 El peor: la barra de acciones del panel de sesión pedía 555 px en un
//      panel de 420 sin envolver. Se comía "Cancelar" —dejando a la vista solo
//      la ✕ de su icono, que parecía un botón de cerrar suelto— y "Eliminar"
//      entero. No era un recorte estético: eran DOS ACCIONES INALCANZABLES.
//
// Por eso las comprobaciones son geométricas y no de "se ve el texto": el bug
// era precisamente que el elemento existía, era visible para el DOM, y estaba
// fuera de su caja.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const USUARIO = { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Laura', email: null, telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function sesionFutura(offsetMinutos = 180, duracionMinutos = 55) {
  let inicio = new Date(Date.now() + offsetMinutos * 60_000);
  inicio.setSeconds(0, 0);
  let fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  if (inicio.getUTCDate() !== fin.getUTCDate()) {
    inicio = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 1, 10, 0, 0));
    fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  return { inicio: iso(inicio), fin: iso(fin) };
}

const S = sesionFutura();
const SESIONES = [{ id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1', inicio: S.inicio, fin: S.fin, aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null }];

const sesionApi = (r: any) => ({ id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id, instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo, cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: r.serie_id ?? null, incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null });
const salaApi = (r: any) => ({ id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color });
const instructorApi = (r: any) => ({ id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono, color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol, authUserId: r.auth_user_id });

async function montar(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // El cliente de auth refresca el token por su cuenta. Contra un host que no
  // existe la llamada falla, la librería da la sesión por muerta y la app se va
  // a /login a media prueba — el bloque del calendario llegaba a pintarse y
  // luego "element was detached from the DOM".
  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: USUARIO,
  }));

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: SESIONES.map(sesionApi), reservas: [], sustituciones: [],
    salas: SALAS.map(salaApi), instructores: INSTRUCTORES.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => json(route, route.request().method() === 'GET' ? SESIONES : []));
  await page.goto('/calendario');
}

for (const v of [{ n: 'escritorio', w: 1440, h: 900 }, { n: 'portatil', w: 1024, h: 768 }, { n: 'movil', w: 390, h: 844 }]) {
  test(`1 · el desplegable de buscar no se sale de la tarjeta (${v.n})`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await montar(page);
    await page.getByRole('button', { name: 'Buscar clase en todo el estudio' }).click({ timeout: 30_000 });
    const panel = page.getByPlaceholder('Instructora, sala o tipo de clase…');
    await expect(panel).toBeVisible();

    const m = await panel.evaluate((el: HTMLElement) => {
      const caja = el.closest('div.absolute') as HTMLElement;
      let recorte: HTMLElement | null = caja.parentElement;
      while (recorte && getComputedStyle(recorte).overflow === 'visible') recorte = recorte.parentElement;
      const p = caja.getBoundingClientRect();
      const r = recorte ? recorte.getBoundingClientRect() : { left: 0, right: window.innerWidth };
      return { panelIzq: p.left, panelDer: p.right, recorteIzq: r.left, recorteDer: r.right };
    });
    expect(m.panelIzq, 'se sale por la izquierda').toBeGreaterThanOrEqual(m.recorteIzq - 0.5);
    expect(m.panelDer, 'se sale por la derecha').toBeLessThanOrEqual(m.recorteDer + 0.5);
  });
}

test('2 · la primera etiqueta de hora cae dentro de la rejilla', async ({ page }) => {
  await montar(page);
  await page.getByRole('button', { name: /Reformer/i }).first().waitFor({ timeout: 30_000 });

  const m = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.absolute.right-2'))
      .filter(s => /^\d{1,2}:\d{2}$/.test((s.textContent ?? '').trim())) as HTMLElement[];
    if (!spans.length) return null;
    const primera = spans[0];
    const cont = primera.offsetParent as HTMLElement;
    return {
      texto: primera.textContent?.trim(),
      arribaEtiqueta: primera.getBoundingClientRect().top,
      arribaContenedor: cont.getBoundingClientRect().top,
      transform: getComputedStyle(primera).transform,
      cuantas: spans.length,
    };
  });
  // La rejilla arranca desplazada a la hora actual: para VER la primera
  // etiqueta (la del bug) hay que subirla al tope.
  await page.evaluate(() => {
    const sp = Array.from(document.querySelectorAll('span.absolute.right-2'))
      .filter(s => /^\d{1,2}:\d{2}$/.test((s.textContent ?? '').trim()))[0] as HTMLElement;
    let c: HTMLElement | null = sp?.parentElement ?? null;
    while (c && c.scrollHeight <= c.clientHeight) c = c.parentElement;
    c?.scrollTo({ top: 0 });
  });
  expect(m).not.toBeNull();
  expect(m!.arribaEtiqueta).toBeGreaterThanOrEqual(m!.arribaContenedor - 0.5);
  expect(m!.transform).toBe('none');
});

test('3 · ninguna acción del panel queda fuera de la barra', async ({ page }) => {
  await montar(page);
  await page.getByRole('button', { name: /Reformer/i }).first().click({ timeout: 30_000 });
  const eliminar = page.getByRole('button', { name: 'Eliminar sesión' });
  await expect(eliminar).toBeVisible({ timeout: 15_000 });

  const m = await eliminar.evaluate((el: HTMLElement) => {
    const barra = el.parentElement as HTMLElement;
    const botones = Array.from(barra.querySelectorAll('button')) as HTMLElement[];
    const b = barra.getBoundingClientRect();
    return {
      barraVisible: barra.clientWidth, barraPedida: barra.scrollWidth,
      wrap: getComputedStyle(barra).flexWrap,
      fuera: botones
        .map(x => ({ n: (x.getAttribute('aria-label') ?? x.textContent ?? '').trim(), r: x.getBoundingClientRect() }))
        .filter(x => x.r.right > b.right + 0.5 || x.r.left < b.left - 0.5)
        .map(x => x.n),
      todos: botones.map(x => (x.getAttribute('aria-label') ?? x.textContent ?? '').trim()),
    };
  });
  expect(m.wrap).toBe('wrap');
  expect(m.fuera, 'hay acciones fuera de la barra').toEqual([]);
  expect(m.barraPedida).toBeLessThanOrEqual(m.barraVisible + 1);
  // Las dos que se perdían. Van aparte para que "no se sale nada" no se pueda
  // cumplir quitando botones en vez de haciéndoles sitio.
  expect(m.todos).toContain('Cancelar');
  expect(m.todos).toContain('Eliminar sesión');
});
