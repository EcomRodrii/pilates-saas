import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// RES-2 (auditoría 23-sep): el calendario colocaba cada clase con la hora del
// NAVEGADOR (`new Date(iso).getHours()`) y la rotulaba con la del ESTUDIO
// (`horaEstudio`, Europe/Madrid). Con un navegador fuera de Madrid, la tarjeta
// de las 10:00 caía en la fila de la 01:00 (o de otro día) con el rótulo
// «10:00», y soltarla donde estaba la movía el desfase de zona completo.
//
// El CI corre en UTC y los de aquí en Madrid: ninguno de los dos veía esto. Este
// spec fuerza el huso del NAVEGADOR (no el del runner) a uno bien lejos de
// Madrid y comprueba que la tarjeta cae sobre SU línea de hora, la de la
// columna de horas de la izquierda — sin fiarse de ningún cálculo del propio
// componente.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// 2026-08-06 a las 10:00 en Madrid (CEST, +2) = 08:00 UTC = 01:00 en Los
// Ángeles (PDT, −7) = 17:00 en Tokio (+9). En LA cae, además, el MISMO día
// natural; en otros husos y horas cruzaría de día — aquí se prueba la hora.
const INICIO = '2026-08-06T08:00:00.000Z';
const FIN = '2026-08-06T08:50:00.000Z';
// «Ahora»: miércoles 5-ago, 12:00 Madrid. La semana visible incluye el día 6
// tanto con el día de Madrid como con el del navegador.
const AHORA = '2026-08-05T10:00:00.000Z';

const TIPOS = [
  { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 50, descripcion: null, nivel: 'TODOS', foto_url: null },
];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];
const SESION = {
  id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: INICIO, fin: FIN, aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  await page.clock.setFixedTime(new Date(AHORA));
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
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [{
      id: SESION.id, studioId: STUDIO_ID, tipoClaseId: SESION.tipo_clase_id, salaId: SESION.sala_id,
      instructorId: SESION.instructor_id, inicio: INICIO, fin: FIN, aforoMaximo: 10, cancelada: false,
      notas: null, precioPuntual: null, serieId: null, incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
    }],
    reservas: [], sustituciones: [],
    salas: SALAS.map(r => ({ id: r.id, studioId: STUDIO_ID, nombre: r.nombre, capacidad: r.capacidad, color: r.color })),
    instructores: INSTRUCTORES.map(r => ({
      id: r.id, studioId: STUDIO_ID, nombre: r.nombre, email: null, telefono: null, color: r.color, activo: true,
      avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null,
    })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => json(route, route.request().method() === 'GET' ? [SESION] : []));
  await page.goto('/calendario');
}

// Los husos van uno por describe porque `timezoneId` es una opción de
// CONTEXTO: no se puede cambiar dentro de un test.
for (const huso of ['America/Los_Angeles', 'Asia/Tokyo']) {
  test.describe(`Calendario en un navegador de ${huso}`, () => {
    test.use({ timezoneId: huso });

    test('la clase de las 10:00 del estudio cae sobre la línea de las 10:00', async ({ page }) => {
      await montar(page);

      const tarjeta = page.getByRole('button', { name: /Reformer/ }).first();
      await expect(tarjeta).toBeVisible({ timeout: 30_000 });
      // La etiqueta de la propia tarjeta ya iba en hora del estudio: si esto
      // fallara, el problema sería otro.
      await expect(tarjeta).toContainText('10:00');

      // La línea de hora de la columna izquierda. Es lo único que fija dónde
      // está «las 10:00» en pantalla sin usar ningún cálculo del componente.
      const linea = page.locator('span.tabular-nums.font-semibold').filter({ hasText: /^10:00$/ }).first();
      await expect(linea).toBeVisible();

      const t = await tarjeta.boundingBox();
      const l = await linea.boundingBox();
      expect(t, 'la tarjeta tiene que estar pintada').not.toBeNull();
      expect(l, 'la línea de las 10:00 tiene que estar pintada').not.toBeNull();

      // Cada hora mide `data-px-por-hora` px. Con el fallo de antes la tarjeta
      // quedaba a 9 horas (LA) u 7 (Tokio) de su línea: cientos de píxeles.
      const pxPorHora = Number(await page.getByTestId('grid-semana-scroll').getAttribute('data-px-por-hora'));
      expect(pxPorHora).toBeGreaterThan(0);
      expect(Math.abs(t!.y - l!.y), `la tarjeta está a ${Math.abs(t!.y - l!.y)} px de su línea de hora (una hora = ${pxPorHora} px)`)
        .toBeLessThan(pxPorHora / 2);
    });
  });
}
