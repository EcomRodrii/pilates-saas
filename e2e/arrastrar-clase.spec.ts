import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del calendario — "Arrastrar y soltar": mover una clase arrastrando
// el bloque en la vista de Día, con Pointer Events (no HTML5 draggable
// nativo — no dispara por touch en iOS Safari). Chromium traduce el mouse
// simulado de Playwright a pointer events reales, así que esto ejercita el
// mismo camino que un ratón de escritorio; el camino táctil de un iPad real
// NO lo puede confirmar esta suite (documentado en el PR, verificar aparte).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-05';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };

function sesionRow(id: string, horaInicio: string, horaFin: string, cancelada = false) {
  return {
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: `${HOY}T${horaInicio}:00+00:00`, fin: `${HOY}T${horaFin}:00+00:00`,
    aforo_maximo: 10, cancelada, notas: null,
  };
}
const SESION = sesionRow('ses-1', '10:00', '10:50');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
function sesionApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: r.notas ?? null, precioPuntual: null, serieId: null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
  };
}
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email ?? null, telefono: r.telefono ?? null,
    color: r.color, activo: r.activo, avatar: r.avatar ?? null, fotoUrl: r.foto_url ?? null,
    rol: r.rol ?? 'INSTRUCTOR', authUserId: r.auth_user_id ?? null,
  };
}
function reservaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado };
}

async function montar(page: Page, opts: { sesiones?: any[]; reservas?: any[] } = {}) {
  const sesiones = opts.sesiones ?? [SESION];
  const reservas = opts.reservas ?? [];

  // La rejilla de Día clipa su contenido en un `overflow-y-auto` propio (8:00
  // a 22:00 = 1344px) — con el viewport por defecto (720px de alto) buena
  // parte del día queda fuera de la ventana visible aunque scrollTop sea 0,
  // así que un punto "de más abajo" no está realmente pintado ahí y
  // `elementFromPoint` no encuentra nada. Un viewport generoso evita tener
  // que simular scroll dentro del drag.
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.clock.setFixedTime(new Date(`${HOY}T09:00:00`));
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

  const patchBody: { valor: any } = { valor: null };

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/reservas**', route => json(route, reservas));
  await page.route('**/rest/v1/sesiones**', route => {
    if (route.request().method() === 'PATCH') {
      patchBody.valor = route.request().postDataJSON();
      return json(route, [], 200);
    }
    return json(route, sesiones);
  });
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: sesiones.map(sesionApi), reservas: reservas.map(reservaApi), sustituciones: [],
    salas: [SALA].map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));

  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: /Reformer/i, disabled: false }).first().waitFor({ timeout: 30_000 });
  // Scroll fijo al principio de la rejilla (8:00): el auto-scroll a "ahora"
  // (punto 10) haría que la posición en pantalla de cada hora dependiera del
  // reloj congelado — con scrollTop=0 el top de la columna SIEMPRE es 8:00.
  await page.getByTestId('grid-dia-scroll').evaluate(el => { el.scrollTop = 0; });

  return { patchBody };
}

async function arrastrarA(page: Page, targetOffsetMin: number) {
  const bloque = page.getByRole('button', { name: /Reformer/i, disabled: false }).first();
  const columna = page.locator('[data-sala-id="sala-1"]');
  const bBox = await bloque.boundingBox();
  const cBox = await columna.boundingBox();
  if (!bBox || !cBox) throw new Error('No se pudo medir el bloque o la columna');

  const pxPorHora = 96; // Día view, mismo valor hardcodeado que page.tsx
  const horaAperturaMin = 8 * 60;
  const targetY = cBox.y + ((targetOffsetMin - horaAperturaMin) / 60) * pxPorHora;

  await page.mouse.move(bBox.x + bBox.width / 2, bBox.y + bBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cBox.x + cBox.width / 2, targetY, { steps: 12 });
  await page.mouse.up();
}

test.describe('Arrastrar y soltar una clase', () => {
  test('arrastra a otra hora, sin gente apuntada: mueve directo, sin confirmar', async ({ page }) => {
    const { patchBody } = await montar(page, { reservas: [] });

    await arrastrarA(page, 13 * 60); // 13:00

    await expect(page.getByText('Clase movida')).toBeVisible({ timeout: 30_000 });
    expect(patchBody.valor).toBeTruthy();
    expect(new Date(patchBody.valor.inicio).getUTCHours()).toBe(13);
  });

  test('con clientas apuntadas, pide confirmación antes de mover y avisar', async ({ page }) => {
    const reservas = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00` }];
    const { patchBody } = await montar(page, { reservas });

    await arrastrarA(page, 14 * 60); // 14:00

    await expect(page.getByText('¿Mover a las 14:00 y avisar a la clienta?')).toBeVisible({ timeout: 30_000 });
    expect(patchBody.valor).toBeNull(); // todavía no se ha movido nada

    await page.getByRole('button', { name: 'Mover y avisar' }).click();
    await expect(page.getByText('Clase movida')).toBeVisible({ timeout: 30_000 });
    expect(new Date(patchBody.valor.inicio).getUTCHours()).toBe(14);
  });

  test('un click normal (sin arrastrar) sigue abriendo el panel de la clase', async ({ page }) => {
    await montar(page);
    await page.getByRole('button', { name: /Reformer/i, disabled: false }).first().click();
    await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible({ timeout: 30_000 });
  });

  test('arrastrar a un hueco ya ocupado por otra clase: avisa del conflicto y no mueve nada', async ({ page }) => {
    // Segunda clase de la misma sala a las 13:00 — el destino del arrastre choca con ella.
    const otra = sesionRow('ses-2', '13:00', '13:50');
    const { patchBody } = await montar(page, { sesiones: [SESION, otra] });

    await arrastrarA(page, 13 * 60);

    await expect(page.getByText(/ya tienen clase a esa hora/)).toBeVisible({ timeout: 30_000 });
    expect(patchBody.valor).toBeNull();
  });
});
