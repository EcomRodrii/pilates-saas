import { test, expect, type Route } from '@playwright/test';

// Regresión de #970: el cliente mandaba { tipoClase, resumen } y route.ts
// (app/api/ai/ficha-clinica-clase/route.ts) casteaba el body ENTERO como
// ResumenClaseSalud, comprobando `totalAlumnas` sobre un objeto que no lo
// tenía en la raíz — el endpoint devolvía 400 en cada llamada real. Este test
// no mockea la respuesta del endpoint como un éxito genérico (eso es
// precisamente lo que dejó pasar el bug sin verlo, ver page.route en
// calendario-momentos.spec.ts): captura el body real que sale del botón y
// comprueba su forma.

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];
const SOCIOS = [{ id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Pérez', activo: true }];
const CONDICIONES = [{
  id: 'cond-1', studio_id: STUDIO_ID, socio_id: 's1', categoria: 'LESION', etiqueta: 'Hombro', zona: 'HOMBRO',
  restricciones: ['NO_SALTOS'], severidad: 'ALTA', estado: 'ACTIVA', inicio: '2026-01-01', fin: null,
  revisar_en: null, notas: null, creado_por: null, creado_en: '2026-01-01', actualizado_en: '2026-01-01',
}];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
function sesionApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: r.serie_id ?? null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
  };
}
function reservaApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
    spotId: r.spot_id ?? null, posicionEspera: r.posicion_espera ?? null, ofertaExpiraEn: null,
    checkInEn: null, creadoEn: r.creada_en,
  };
}
function salaApi(r: any) { return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color }; }
function instructorApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono, color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol ?? 'INSTRUCTOR', authUserId: r.auth_user_id };
}

// Clase en el futuro cercano (misma técnica que calendario-momentos.spec.ts):
// evita cruzar medianoche UTC y que sesionYaEmpezada() la marque como pasada.
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

test('Preparar clase con IA envía el resumen plano, no anidado bajo { tipoClase, resumen }', async ({ page }) => {
  const { inicio, fin } = sesionFutura();
  const sesiones = [{
    id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio, fin, aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
  }];
  const reservas = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: '2026-01-01T08:00:00' }];

  let bodyRecibido: unknown = null;

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  // El endpoint real: capturamos el body exacto que le llega.
  await page.route('**/api/ai/ficha-clinica-clase', route => {
    bodyRecibido = JSON.parse(route.request().postData() ?? '{}');
    return json(route, { resumen: 'ok', evitar: [], variantes: [] });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/condiciones_salud**', route => json(route, CONDICIONES));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: sesiones.map(sesionApi), reservas: reservas.map(reservaApi), sustituciones: [],
    salas: SALAS.map(salaApi), instructores: INSTRUCTORES.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => json(route, route.request().method() === 'GET' ? sesiones : []));
  await page.route('**/rest/v1/reservas**', route => json(route, route.request().method() === 'GET' ? reservas : []));

  await page.goto('/calendario');
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });

  const boton = page.getByRole('button', { name: 'Preparar clase con IA' });
  await expect(boton).toBeVisible({ timeout: 15_000 });
  await boton.click();

  await expect.poll(() => bodyRecibido, { timeout: 10_000 }).not.toBeNull();
  // La regresión de #970: el body NO puede tener una clave "resumen" anidada.
  expect(bodyRecibido).not.toHaveProperty('resumen');
  expect(bodyRecibido).not.toHaveProperty('tipoClase');
  expect(bodyRecibido).toMatchObject({ totalAlumnas: 1, conCondiciones: 1 });
});
