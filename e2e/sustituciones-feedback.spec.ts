import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Si tarda, dilo. Y no lo hagas dos veces."
//
// Estas acciones llaman al servidor y luego RECARGAN la lista entera: tardan
// varios segundos. Los botones se limitaban a apagarse (`disabled` + opacidad)
// sin decir nada, así que en la prueba con una dueña de cadena parecían rotos y
// se pulsaban otra vez. Peor: `crear()` soltaba el flag ANTES de esperar a la
// recarga, así que el botón volvía a estar vivo con la baja ya creada — segundo
// clic, baja duplicada.
//
// Esta suite fija las dos mitades:
//   1. mientras la acción está en curso el botón DICE qué está haciendo;
//   2. un segundo clic durante ese rato NO dispara una segunda escritura.
//
// Mismo enfoque que guardar-salas.spec.ts: env dummy y backend interceptado,
// determinista y sin tocar datos reales.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Pilates Centro',
  slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID,
  email: 'cloe@example.com',
  moneda: 'EUR',
};

// Una sustitución esperando el visto bueno de la dueña: es la tarjeta que trae
// los botones Aprobar / Rechazar.
const SUSTITUCION_PENDIENTE = {
  id: 'sust-1',
  studio_id: STUDIO_ID,
  estado: 'pendiente_aprobacion',
  instructor_original_id: 'inst-laura',
  sesion_id: 'ses-1',
  sesiones: { id: 'ses-1', inicio: '2099-08-03T08:00:00+00:00', tipo_clase_id: 'tc-1' },
  ranking: [{ instructor_id: 'inst-marta', nombre: 'Marta Sanz', compatibilidad: 65, veces: 0, motivos: ['está disponible'] }],
  sustitucion_contactos: [],
  creado_en: '2026-07-26T00:00:00+00:00',
  resuelto_en: null,
};

const TIPO_CLASE_ROW = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer Iniciación', duracion_min: 50, color: '#F7A6C4' };
const INSTRUCTORES_ROWS = [
  { id: 'inst-laura', studio_id: STUDIO_ID, nombre: 'Laura Gil', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
  { id: 'inst-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];

// Fechas lejanas: el diálogo solo lista clases FUTURAS, y este test no debe
// caducar con el paso del tiempo.
function sesionRow(id: string, inicio: string) {
  return {
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
    instructor_id: 'inst-laura', inicio, fin: inicio, aforo_maximo: 10, cancelada: false,
  };
}
const SESION_CON_BAJA = sesionRow('ses-1', '2099-08-03T08:00:00+00:00');
const SESION_LIBRE = sesionRow('ses-2', '2099-08-04T08:00:00+00:00');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token',
      refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800,
      expires_in: 999999999,
      token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/**
 * Intercepta el backend. `/api/sustituciones` se atiende a mano para poder
 * CONTAR las escrituras y RETRASARLAS: sin un retraso la acción termina antes
 * de que dé tiempo a mirar el botón, que es justo lo que hay que comprobar.
 */
async function mockBackend(page: Page, opts: { retrasoMs?: number } = {}) {
  const retraso = opts.retrasoMs ?? 1500;
  const escrituras: { metodo: string; body: unknown }[] = [];

  // OJO con el orden: Playwright resuelve las rutas en orden INVERSO al de
  // registro, así que los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE_ROW]));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES_ROWS));
  // ses-2 es la clase LIBRE que el diálogo "Marcar una baja" puede elegir: ses-1
  // ya tiene sustitución abierta y el propio diálogo la descarta.
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION_CON_BAJA, SESION_LIBRE]));

  await page.route('**/api/sustituciones**', async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      // La RECARGA posterior a una escritura es lo lento de verdad (la escritura
      // vuelve enseguida). Ahí vivía el bug: se soltaba el botón antes de
      // esperarla. Solo se retrasan los GET que siguen a una escritura.
      if (escrituras.length > 0) await new Promise(r => setTimeout(r, retraso));
      return json(route, {
        sustituciones: [SUSTITUCION_PENDIENTE],
        avisarAlumnas: true,
        modoAutonomia: 'asistido',
        autonomiaDisponible: true,
        equipo: { total: 2, sinDisponibilidad: [] },
      });
    }
    escrituras.push({ metodo: req.method(), body: JSON.parse(req.postData() || '{}') });
    // La escritura en sí es rápida: lo que tarda es la recarga de arriba.
    return json(route, { ok: true, candidata: 'Marta Sanz', emailEnviado: true, emailSkipped: false });
  });

  return { escrituras };
}

async function abrirSustituciones(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByRole('button', { name: 'Aprobar' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Feedback de carga en sustituciones', () => {
  test('al aprobar, el botón dice qué está haciendo en vez de quedarse mudo', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Aprobar' }).click();

    // Lo que la dueña necesita ver: el nombre de a quién se está avisando.
    await expect(page.getByRole('button', { name: /Avisando a Marta…/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Avisando a Marta…/ })).toBeDisabled();
    // Y la tarjeta entera bloqueada mientras tanto: las acciones se pisan.
    await expect(page.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
  });

  test('un segundo clic mientras carga no manda el aviso dos veces', async ({ page }) => {
    const { escrituras } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    const aprobar = page.getByRole('button', { name: 'Aprobar' });
    await aprobar.click();
    // Con el botón ya bloqueado, forzamos el clic igualmente: cubre también el
    // caso de que alguien lo dispare por teclado o el navegador lo reintente.
    await page.getByRole('button', { name: /Avisando a Marta…/ }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(2200);

    expect(escrituras.filter(e => e.metodo === 'PATCH')).toHaveLength(1);
  });

  test('"Buscar sustituta" sigue bloqueado hasta que termina de recargar', async ({ page }) => {
    const { escrituras } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Marcar una baja' }).first().click();
    // ses-2: la única clase futura sin baja abierta.
    await page.getByRole('button').filter({ hasText: 'Reformer Iniciación' }).first().click();

    const buscar = page.getByRole('button', { name: 'Buscar sustituta' });
    await expect(buscar).toBeEnabled();

    // Esperar a que la ESCRITURA termine es la clave: el fallo original soltaba
    // el botón justo aquí, con la baja ya creada y la recarga aún en marcha.
    const escrituraHecha = page.waitForResponse(
      r => r.request().method() === 'POST' && r.url().includes('/api/sustituciones'),
    );
    await buscar.click();
    await escrituraHecha;
    // Margen para que React pinte el estado erróneo si lo hubiera, muy por
    // debajo de lo que tarda la recarga simulada.
    await page.waitForTimeout(300);

    // Sin el arreglo, aquí el botón ya decía otra vez "Buscar sustituta".
    // Conteo sin reintentos: nos interesa este instante, no el desenlace.
    expect(await page.getByRole('button', { name: 'Buscar sustituta' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Buscando…' }).count()).toBe(1);

    await page.waitForTimeout(2500);
    expect(escrituras.filter(e => e.metodo === 'POST')).toHaveLength(1);
  });
});
