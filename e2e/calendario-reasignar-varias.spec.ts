import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Reasignar varias clases sueltas de una vez.
//
// Antes eran N vueltas de abrir clase → editar → guardar → decidir si avisar. Y
// esa última decisión, repetida, es la que acaba en «ya les aviso yo» o en N
// correos separados a la misma alumna.
//
// Lo que se fija aquí:
//   · El modo selección cambia lo que significa un clic (marca en vez de abrir).
//   · El recuento de alumnas es de PERSONAS distintas, no de reservas: quien
//     está en dos de las clases del lote cuenta una vez.
//   · No se cuentan como movidas las que ya da esa instructora.
//   · Se puede cambiar SIN avisar, y entonces no sale ni un correo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#B9C7A6', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Laura', email: null, telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Tres clases futuras el mismo día, sin solaparse. */
function sesiones() {
  const base = new Date(Date.now() + 3 * 3600_000);
  base.setSeconds(0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const hacer = (i: number, instructor: string) => {
    const ini = new Date(base.getTime() + i * 90 * 60_000);
    const fin = new Date(ini.getTime() + 55 * 60_000);
    return {
      id: `ses-${i}`, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
      instructor_id: instructor, inicio: iso(ini), fin: iso(fin),
      aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
    };
  };
  // La tercera YA la da Laura: no debe contar como movida.
  return [hacer(0, 'ins-1'), hacer(1, 'ins-1'), hacer(2, 'ins-2')];
}

const SESIONES = sesiones();

// Ana está en las DOS clases que se mueven: tiene que contar UNA vez.
const RESERVAS = [
  { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-0', socio_id: 'ana', estado: 'CONFIRMADA' },
  { id: 'r2', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'ana', estado: 'CONFIRMADA' },
  { id: 'r3', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'bea', estado: 'CONFIRMADA' },
];

const sesionApi = (r: Record<string, unknown>) => ({
  id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
  instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
  cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: null,
  incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
});
const reservaApi = (r: Record<string, unknown>) => ({
  id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id,
  estado: r.estado, spotId: null, posicionEspera: null, ofertaExpiraEn: null,
  checkInEn: null, creadoEn: '2026-01-01T00:00:00',
});

async function montar(page: Page, avisos: string[], patches: string[]) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/clases/avisar-cambio-clase**', route => {
    avisos.push(route.request().postData() ?? '');
    return json(route, { ok: true, enviados: 1, sinEmail: 0, enApp: 1 });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: SESIONES.map(sesionApi), reservas: RESERVAS.map(reservaApi), sustituciones: [],
    salas: SALAS.map(s => ({ id: s.id, studioId: s.studio_id, nombre: s.nombre, capacidad: s.capacidad, color: s.color })),
    instructores: INSTRUCTORES.map(i => ({ id: i.id, studioId: i.studio_id, nombre: i.nombre, email: i.email, telefono: i.telefono, color: i.color, activo: i.activo, avatar: i.avatar, fotoUrl: i.foto_url, rol: i.rol, authUserId: i.auth_user_id })),
    horaApertura: '00:00:00', horaCierre: '23:59:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().url() + ' ' + (route.request().postData() ?? ''));
      return json(route, [], 200);
    }
    return json(route, SESIONES);
  });
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));

  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Seleccionar varias' }).click({ timeout: 30_000 });
}

async function marcarLasTres(page: Page) {
  const bloques = page.getByRole('button', { name: /Reformer/ });
  await expect.poll(() => bloques.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < 3; i++) await bloques.nth(i).click();
}

test('marcar clases no abre el panel: cambia lo que significa el clic', async ({ page }) => {
  await montar(page, [], []);
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 20_000 });
  // Si hubiera abierto la clase saldría su panel con las pestañas.
  await expect(page.getByRole('button', { name: 'Eliminar sesión' })).toBeHidden();
  await expect(page.getByText('1 clase marcada')).toBeVisible();
});

test('cuenta alumnas distintas, no reservas, y descarta la que ya da esa instructora', async ({ page }) => {
  await montar(page, [], []);
  await marcarLasTres(page);
  await expect(page.getByText('3 clases marcadas')).toBeVisible();

  await page.getByLabel('Pasar las clases marcadas a').selectOption({ label: 'Laura' });

  // Se mueven 2 de las 3: la tercera ya la da Laura.
  await expect(page.getByText('¿Pasar 2 clases a Laura?')).toBeVisible();
  // Ana está en las dos clases y Bea en una → 2 personas, no 3 reservas.
  await expect(page.getByText(/2 alumnas/)).toBeVisible();
  // Y el texto NO promete deduplicar: Ana recibirá un aviso por cada clase suya.
  await expect(page.getByText(/un correo por cada clase suya que cambie/)).toBeVisible();
  await expect(page.getByText(/1 de las marcadas no se mueve/)).toBeVisible();
});

test('«Cambiar sin avisar» no manda ni un correo', async ({ page }) => {
  const avisos: string[] = [];
  const patches: string[] = [];
  await montar(page, avisos, patches);
  await marcarLasTres(page);
  await page.getByLabel('Pasar las clases marcadas a').selectOption({ label: 'Laura' });
  await page.getByRole('button', { name: 'Cambiar sin avisar' }).click();

  await expect.poll(() => patches.length, { timeout: 20_000 }).toBe(2);
  expect(avisos, 'avisó sin que se lo pidieran').toEqual([]);
});

test('«Cambiar y avisar» avisa una vez por clase movida, no por reserva', async ({ page }) => {
  const avisos: string[] = [];
  const patches: string[] = [];
  await montar(page, avisos, patches);
  await marcarLasTres(page);
  await page.getByLabel('Pasar las clases marcadas a').selectOption({ label: 'Laura' });
  await page.getByRole('button', { name: 'Cambiar y avisar' }).click();

  await expect.poll(() => patches.length, { timeout: 20_000 }).toBe(2);
  await expect.poll(() => avisos.length, { timeout: 20_000 }).toBe(2);
  // Y el aviso dice quién la da AHORA y quién la daba antes.
  const cuerpo = JSON.parse(avisos[0]);
  expect(cuerpo.instructorActual).toBe('Laura');
  expect(cuerpo.instructorAnterior).toBe('Marta');
});
