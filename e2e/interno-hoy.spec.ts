import { test, expect, type Page, type Route } from '@playwright/test';
import {
  cifrasDelNegocio, estadosGratisPorEstudio, estudiosAMirar, pendientesPorSeccion, tareasDeHoy, type Hoy,
} from '../lib/interno/hoy';

// ─────────────────────────────────────────────────────────────────────────────
// /interno → «Hoy» y el menú lateral (rediseño aprobado el 16-oct-2026).
//
// No hay sesión de prueba con TOTP, así que la vista se monta con datos
// simulados: la respuesta de /api/interno/hoy se construye con las MISMAS
// funciones puras que usa el servidor (lib/interno/hoy.ts), para que lo que se
// mira aquí sea el texto real. Lo que se comprueba es lo que ve el equipo:
//   · qué te espera, en orden y con un botón a donde se resuelve;
//   · ninguna cifra sin fuente, y «—» con el motivo cuando una fuente falla;
//   · el menú agrupado, con sus contadores y filtrado por permisos;
//   · el móvil: «Menú» desplegable y nada de scroll horizontal.
// Datos inventados; ningún estudio real.
// ─────────────────────────────────────────────────────────────────────────────

const AHORA = new Date();
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function hoyLleno(): Hoy {
  const tareas = tareasDeHoy({
    facturacion: { impagos: [{ nombre: 'Estudio Aurora' }], descuadres: [] },
    denuncias: { n: 1, masAntigua: hace(9) },
    llamadas: { n: 2, masAntigua: hace(20) },
    apps: [{ estudio: 'Pilates Mar', estado: 'EN_PRUEBAS', sinHueco: false }],
    altas: { n: 3, fallidas: 0, masAntigua: hace(50) },
    sinReservas: [{ id: 'est-norte', nombre: 'Pilates Norte', semanaAnterior: 41 }],
  }, AHORA);
  const gratis = estadosGratisPorEstudio([
    { studioId: 'est-core', ownerId: 'o1', alumnasActivas: 98, reservas30Dias: 231, excedidoDesde: null, medidoEn: hace(2) },
  ], '2026-10-16');
  return {
    tareas,
    pendientes: pendientesPorSeccion(tareas),
    cifras: cifrasDelNegocio({
      dinero: { mrrEuros: 1247, pagando: 31, movimiento: { altas: 3, bajas: 1, eurosAltas: 147, eurosBajas: 29 } },
      actividad: { ahora: 58, antes: 52 },
      // Una fuente que falla: tiene que salir «—» con el motivo, nunca un 0.
      reservas: { motivo: 'No se han podido contar las reservas.' },
    }),
    estudios: estudiosAMirar(
      [
        { id: 'est-aurora', nombre: 'Estudio Aurora', plan: 'ESTUDIO', impago: true, reservas7d: 52, semanaAnterior: 49, nivel: 'riesgo', primerAviso: 'Su pago a Tentare ha fallado' },
        { id: 'est-flow', nombre: 'Flow Barcelona', plan: 'CADENA', impago: false, reservas7d: 120, semanaAnterior: 111, nivel: 'bien', primerAviso: null },
        { id: 'est-norte', nombre: 'Pilates Norte', plan: 'BASE', impago: false, reservas7d: 0, semanaAnterior: 41, nivel: 'atencion', primerAviso: 'Ninguna reserva en los últimos 7 días' },
      ],
      [{ id: 'est-core', nombre: 'Core & Barre', estado: gratis.get('est-core')! }],
    ),
    noLeidos: ['reservas'],
    sinPermiso: [],
  };
}

async function montar(page: Page, o: { permisos?: string[]; hoy?: Hoy } = {}) {
  const permisos = o.permisos ?? ['admin.full'];
  const peticionesHoy: string[] = [];
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/api/interno/sesion**', r => json(r, {
    nombre: 'Equipo Prueba', cargo: 'Fundador', email: 'equipo@example.com', permisos, nivel: 'aal2',
  }));
  await page.route('**/api/interno/hoy**', r => { peticionesHoy.push(r.request().url()); return json(r, o.hoy ?? hoyLleno()); });
  await page.route('**/api/interno/estudios**', r => json(r, {
    estudios: [
      { id: 'est-aurora', slug: 'estudio-aurora', nombre: 'Estudio Aurora', plan: 'ESTUDIO', email: null, telefono: null, creadoEn: hace(2000), tieneClienteStripe: true, socias: 80, clases: 300, equipo: 4, ultimaClase: hace(5), vacio: false, dePago: true, estadoSuscripcion: 'past_due', salud: null },
      { id: 'est-flow', slug: 'flow-barcelona', nombre: 'Flow Barcelona', plan: 'CADENA', email: null, telefono: null, creadoEn: hace(3000), tieneClienteStripe: true, socias: 210, clases: 900, equipo: 9, ultimaClase: hace(1), vacio: false, dePago: true, estadoSuscripcion: 'active', salud: null },
    ],
  }));
  await page.addInitScript(() => localStorage.setItem('sb-example-auth-token', JSON.stringify({
    access_token: 'e2e-fake-token', refresh_token: 'r', expires_at: 4102444800,
    expires_in: 999999999, token_type: 'bearer',
    user: {
      id: 'u-equipo', email: 'equipo@example.com', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    },
  })));
  return { peticionesHoy };
}

test.describe('/interno → Hoy', () => {
  test('dice cuántas cosas te esperan, en orden, cada una con su porqué y un botón a donde se resuelve', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { peticionesHoy } = await montar(page);
    await page.goto('/interno');
    await expect(page.getByRole('heading', { name: '6 cosas te esperan hoy', level: 1 })).toBeVisible({ timeout: 40_000 });
    // Una sola petición: la portada y el menú comparten la misma respuesta.
    expect(peticionesHoy.length).toBe(1);

    const filas = page.locator('[data-tarea]');
    await expect(filas).toHaveCount(6);
    expect(await filas.evaluateAll(els => els.map(e => e.getAttribute('data-tarea'))))
      .toEqual(['impago', 'denuncias', 'apps', 'llamadas', 'altas', 'sin-reservas']);

    const impago = filas.first();
    await expect(impago).toContainText('Estudio Aurora no ha pagado su plan');
    await expect(impago).toContainText('Stripe tiene su suscripción como impagada');
    await expect(impago.getByRole('link', { name: 'Ver su cobro' })).toHaveAttribute('href', '/interno/facturacion');
    await expect(page.locator('[data-tarea="denuncias"]').getByRole('link', { name: 'Revisarla' })).toHaveAttribute('href', '/interno/denuncias');
    await expect(page.locator('[data-tarea="sin-reservas"]')).toContainText('La semana anterior tuvo 41');
    await expect(page.locator('[data-tarea="sin-reservas"]').getByRole('link', { name: 'Ver su ficha' })).toHaveAttribute('href', '/interno/estudios/est-norte');

    // Una fuente que no se pudo leer se dice, no se disimula.
    await expect(page.getByText('Faltan datos, no son ceros.')).toBeVisible();
  });

  test('ninguna cifra sin fuente; la que falla sale «—» con el motivo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page);
    await page.goto('/interno');
    const mrr = page.locator('[data-cifra="mrr"]');
    await expect(mrr).toContainText('Lo que cobramos al mes', { timeout: 40_000 });
    await expect(mrr).toContainText('+118 € en 30 días');
    for (const id of ['mrr', 'pagan', 'actividad', 'reservas']) {
      await expect(page.locator(`[data-cifra="${id}"]`)).toContainText('Fuente:');
    }
    const reservas = page.locator('[data-cifra="reservas"]');
    await expect(reservas).toContainText('—');
    await expect(reservas).toContainText('No se han podido contar las reservas.');
    await expect(reservas).not.toContainText(/\b0\b/);
  });

  test('estudios que miraría: los peores primero, y cada uno lleva a su ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page);
    await page.goto('/interno');
    const lista = page.getByRole('region', { name: 'Estudios que miraría hoy' }).getByRole('listitem');
    await expect(lista.first()).toContainText('Estudio Aurora', { timeout: 40_000 });
    expect(await lista.allInnerTexts()).toEqual([
      expect.stringContaining('Estudio Aurora'),
      expect.stringContaining('Pilates Norte'),
      expect.stringContaining('Core & Barre'),
      expect.stringContaining('Flow Barcelona'),
    ]);
    await expect(lista.nth(2)).toContainText('231 de 250 reservas');
    await expect(lista.nth(2)).toContainText('Cerca del límite');
    await expect(lista.first().getByRole('link')).toHaveAttribute('href', '/interno/estudios/est-aurora');
  });

  test('si no hay nada, lo dice sin inventar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page, { hoy: {
      tareas: [], pendientes: {}, estudios: [], noLeidos: [], sinPermiso: [],
      cifras: cifrasDelNegocio({
        dinero: { mrrEuros: 0, pagando: 0, movimiento: { altas: 0, bajas: 0, eurosAltas: 0, eurosBajas: 0 } },
        actividad: { ahora: 4, antes: 4 }, reservas: { ultimos7: 12, anteriores7: 10 },
      }),
    } });
    await page.goto('/interno');
    await expect(page.getByRole('heading', { name: 'Nada te espera hoy', level: 1 })).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('[data-tarea]')).toHaveCount(0);
    await expect(page.getByText('Faltan datos, no son ceros.')).toHaveCount(0);
  });
});

test.describe('/interno → el menú', () => {
  test('agrupado por para qué sirve, con contadores donde hay algo pendiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page);
    await page.goto('/interno');
    const menu = page.getByRole('navigation', { name: 'Zona interna' });
    await expect(menu.getByRole('link', { name: /^Hoy/ })).toHaveAttribute('aria-current', 'page', { timeout: 40_000 });
    for (const grupo of ['Clientes', 'Captar', 'Moderar', 'Contenido', 'Seguridad']) {
      await expect(menu.getByText(grupo, { exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('link', { name: 'Hoy 6 pendientes' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Cobros a estudios 1 pendiente' })).toHaveAttribute('href', '/interno/facturacion');
    await expect(menu.getByRole('link', { name: 'Llamadas pedidas 2 pendientes' })).toBeVisible();
    // Sin nada pendiente, sin contador.
    await expect(menu.getByRole('link', { name: 'Tenti', exact: true })).toBeVisible();
    await expect(page.getByText('Fundador · todos los permisos')).toBeVisible();
  });

  test('cada uno ve solo lo que sus permisos le dejan, como antes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page, { permisos: ['content.write'], hoy: {
      tareas: [], pendientes: {}, estudios: null, noLeidos: [],
      sinPermiso: ['cobros', 'denuncias', 'llamadas', 'apps', 'altas', 'estudios'],
      cifras: cifrasDelNegocio({
        dinero: { motivo: 'No tienes permiso para ver la facturación.' },
        actividad: { motivo: 'No tienes permiso para ver los estudios.' },
        reservas: { motivo: 'No tienes permiso para ver los estudios.' },
      }),
    } });
    await page.goto('/interno');
    const menu = page.getByRole('navigation', { name: 'Zona interna' });
    await expect(menu.getByRole('link', { name: 'Novedades' })).toBeVisible({ timeout: 40_000 });
    await expect(menu.getByRole('link')).toHaveCount(4); // Hoy + Novedades, Ayuda, Tenti
    for (const fuera of ['Clientes', 'Captar', 'Moderar', 'Seguridad']) await expect(menu.getByText(fuera, { exact: true })).toHaveCount(0);
    // Sin `studios.read`, ni buscador ni lista de estudios.
    await expect(page.getByRole('button', { name: /Buscar un estudio/ })).toHaveCount(0);
    await expect(page.getByText('Estudios que miraría hoy')).toHaveCount(0);
    await expect(page.getByText(/Con tus permisos no se mira/)).toBeVisible();
  });

  test('⌘K busca un estudio y lleva a su ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await montar(page);
    await page.goto('/interno');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 40_000 });
    await page.keyboard.press('ControlOrMeta+k');
    const dialogo = page.getByRole('dialog', { name: 'Buscar un estudio' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('textbox').fill('flow');
    await expect(dialogo.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/interno\/estudios\/est-flow$/, { timeout: 30_000 });
  });

  test('en el móvil: barra oscura con «Menú», sin scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await montar(page);
    await page.goto('/interno');
    await expect(page.getByRole('heading', { name: '6 cosas te esperan hoy' })).toBeVisible({ timeout: 40_000 });
    // El lateral no se ve; el menú, cerrado.
    await expect(page.getByRole('navigation', { name: 'Zona interna' })).toHaveCount(0);
    const { documento, ventana } = await page.evaluate(() => ({ documento: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    expect(documento, 'la portada obliga a hacer scroll lateral').toBeLessThanOrEqual(ventana);

    await page.getByRole('button', { name: /Menú/ }).click();
    const menu = page.getByRole('navigation', { name: 'Zona interna' });
    await expect(menu.getByRole('link', { name: /Registro de cambios/ })).toBeVisible();
    await menu.getByRole('link', { name: /Denuncias/ }).click();
    await expect(page).toHaveURL(/\/interno\/denuncias$/, { timeout: 30_000 });
    // Al navegar, el menú se cierra solo.
    await expect(page.getByRole('navigation', { name: 'Zona interna' })).toHaveCount(0);
  });
});
