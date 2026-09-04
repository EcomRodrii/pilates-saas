import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Plaza fija: editar el slot desde la ficha de la socia.
//
// Una plaza fija se ancla por (día, hora, sala). Cuando el estudio mueve la
// clase, la plaza se queda apuntando a un horario sin clase y el cron deja de
// materializar en silencio. Antes solo se podía quitar y volver a crear a mano.
//
// De paso fija dos cosas que se habían roto sin que ningún test lo viera:
//   1. La ficha LISTA las plazas que ya existen. Desde #1375 el panel no
//      cargaba `plazas_fijas` en absoluto: la ficha decía "Sin plaza fija"
//      para todo el mundo.
//   2. Un fallo del servidor (409 por el sitio ya cogido) se enseña y el
//      diálogo NO se cierra. Con contador de peticiones: un test de camino de
//      fallo sin él es hueco (ver .claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// Miércoles. Las sesiones de la ficha son los martes siguientes.
const AHORA = '2026-08-05T09:00:00';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {},
};
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];
// Martes 10:00 en Madrid (agosto = CEST, UTC+2 → 08:00Z).
const PLAZA_ROW = {
  id: 'pf-1', studio_id: STUDIO_ID, socio_id: 'soc-1', dia_semana: 2, hora_inicio: '10:00:00',
  sala_id: 'sala-1', tipo_clase_id: null, spot_id: null,
  vigencia_desde: '2026-01-01', vigencia_hasta: null, estado: 'ACTIVA', creada_en: '2026-01-01T00:00:00+00:00',
};

/** 8 martes seguidos a la hora UTC dada, desde el 2026-08-11. */
function martesSemanales(horaUtc: string) {
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(Date.parse(`2026-08-11T${horaUtc}:00Z`) + i * 7 * 86_400_000);
    const fin = new Date(d.getTime() + 50 * 60_000);
    return {
      id: `ses-${i}`, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
      inicio: d.toISOString(), fin: fin.toISOString(), aforo_maximo: 10, cancelada: false, notas: null,
    };
  });
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: { sesiones: unknown[]; patchStatus?: number; patchBody?: unknown }) {
  await page.clock.setFixedTime(new Date(AHORA));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  const patches: Record<string, unknown>[] = [];

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/sesiones**', route => json(route, opts.sesiones));
  await page.route('**/rest/v1/plazas_fijas**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON());
      return json(route, opts.patchBody ?? [], opts.patchStatus ?? 200);
    }
    return json(route, [PLAZA_ROW]);
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  // Las plazas llegan en la 2ª ola de carga (fetchDeferredStudioData): hay un
  // instante de "Sin plaza fija" antes. Se espera la plaza, nunca se aserta
  // la ausencia del vacío.
  await expect(page.getByText('Martes · 10:00')).toBeVisible({ timeout: 15_000 });
  return { patches };
}

test.describe('Plaza fija: editar el slot desde la ficha', () => {
  test('la ficha lista la plaza fija que ya existe (regresión: el panel no las cargaba)', async ({ page }) => {
    await montar(page, { sesiones: martesSemanales('08:00') });
    await expect(page.getByText('Martes · 10:00')).toBeVisible();
    // Con clase en su horario no hay aviso de huérfana.
    await expect(page.getByText('Sin clase en este horario')).toHaveCount(0);
  });

  test('editar la hora envía UN PATCH con la hora nueva y la lista se actualiza', async ({ page }) => {
    const { patches } = await montar(page, { sesiones: martesSemanales('08:00') });
    await page.getByRole('button', { name: 'Editar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Editar plaza fija' })).toBeVisible();
    await expect(dialogo.getByLabel('Hora')).toHaveValue('10:00');
    await dialogo.getByLabel('Hora').fill('11:00');
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(dialogo).toBeHidden();
    expect(patches.length).toBe(1);
    // Sin `estado` en el PATCH: editar el hueco no reactiva una plaza en pausa.
    expect(patches[0]).toMatchObject({ hora_inicio: '11:00:00', dia_semana: 2, sala_id: 'sala-1' });
    expect(patches[0]).not.toHaveProperty('estado');
    await expect(page.getByText('Martes · 11:00')).toBeVisible();
    await expect(page.getByText('Martes · 10:00')).toHaveCount(0);
  });

  test('si el servidor dice que no (sitio ya cogido), se enseña y el diálogo sigue abierto', async ({ page }) => {
    const { patches } = await montar(page, {
      sesiones: martesSemanales('08:00'),
      patchStatus: 409,
      patchBody: {
        code: '23P01', details: null, hint: null,
        message: 'conflicting key value violates exclusion constraint "plazas_fijas_spot_sin_solape"',
      },
    });
    await page.getByRole('button', { name: 'Editar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Hora').fill('11:00');
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(dialogo.getByText('Ese sitio ya está asignado a otra socia en ese día y hora')).toBeVisible();
    await expect(dialogo).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(patches.length).toBeGreaterThan(0);
    // Y la lista no se actualizó en falso.
    await expect(page.getByText('Martes · 10:00')).toBeVisible();
  });

  test('cuando la clase se movió, la fila avisa y el diálogo repite el aviso hasta que el horario coincide', async ({ page }) => {
    // Las clases están ahora a las 12:00 locales (10:00Z); la plaza sigue a las 10:00.
    await montar(page, { sesiones: martesSemanales('10:00') });
    await expect(page.getByText('Sin clase en este horario')).toBeVisible();

    await page.getByRole('button', { name: 'Editar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('No hay ninguna clase programada ese día a esa hora')).toBeVisible();
    await dialogo.getByLabel('Hora').fill('12:00');
    await expect(dialogo.getByText('No hay ninguna clase programada ese día a esa hora')).toHaveCount(0);
  });
});
