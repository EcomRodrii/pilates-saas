import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tres momentos del calendario que la dueña señaló en la prueba de usabilidad.
// Los tres tienen la misma forma: el programa sabe algo y no lo usa.
//
//   1. "Que la duración que configuro se use. Pongo 55 minutos y luego me
//      propones 09:00 a 09:00."  → `duracionMinutos` no se leía en ningún sitio
//      del calendario.
//   2. 🔴 "Que al cambiar la instructora me preguntes: ¿aviso a las 8 alumnas de
//      que hoy da Laura? Ese es el momento y no lo aprovechas."  → sí avisaba,
//      pero en silencio y sin decírselo.
//   3. "Que los números de arriba del calendario me hablen de la semana que
//      estoy mirando, no de hoy."  → filtraban por el día de hoy siempre.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// 55 minutos: el número exacto que ella puso de ejemplo.
const TIPOS = [
  { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null },
];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Laura', email: null, telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Sesión de prueba en el futuro cercano, no a las 09:00 fijas de "hoy": estos
// tests abren el formulario de Editar, y sesionYaEmpezada() (calendario-estado.ts)
// deshabilita ese botón para cualquier clase cuyo inicio ya haya pasado — un
// runner de CI que ejecute después de las 09:00 UTC volvía "ya empezada" una
// clase que el test necesitaba poder editar.
function sesionFutura(offsetMinutos = 180, duracionMinutos = 55) {
  // Redondeado al minuto exacto: el formulario de editar reconstruye la hora
  // como `${fecha}T${hora}:00` (toISO(), app/(dashboard)/calendario/page.tsx)
  // — sin esto, `Date.now()` deja segundos sueltos y el guardado sin tocar la
  // hora se detectaba como "cambioHora" (mismoInstante comparando getTime()
  // exacto), desviando el test al diálogo equivocado.
  let inicio = new Date(Date.now() + offsetMinutos * 60_000);
  inicio.setSeconds(0, 0);
  let fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  // NUNCA puede cruzar medianoche (UTC, que es lo que iso() extrae más abajo):
  // el formulario de editar solo tiene UN campo `fecha` compartido por
  // horaInicio/horaFin (openEdit(), app/(dashboard)/calendario/page.tsx) — no
  // puede representar una clase que empieza un día y termina al siguiente.
  // `horaInvalida` (mismo fichero) compara las horas como strings HH:MM
  // asumiendo el mismo día, así que una franja como 23:39–00:34 se marca
  // (correctamente, dado ese modelo) como "la hora de fin debe ser posterior
  // a la de inicio" y deja "Guardar cambios" deshabilitado para siempre — no
  // es un bug de la app, es que `Date.now() + offsetMinutos` cruzaba
  // medianoche cuando el runner de CI corría tarde en el día UTC, y ROMPÍA
  // ESTE TEST AL AZAR según la hora real de ejecución. Si el hueco propuesto
  // no cabe en el día UTC de hoy, se prueba MAÑANA a una hora fija (10:00
  // UTC, de sobra lejos de cualquier medianoche) en vez de sumar minutos —
  // desacopla el fixture de "ahora mismo".
  if (inicio.getUTCDate() !== fin.getUTCDate()) {
    inicio = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 1, 10, 0, 0));
    fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
  }
  const iso = (d: Date) => d.toISOString().slice(0, 19); // sin milisegundos ni 'Z'
  return { inicio: iso(inicio), fin: iso(fin) };
}

// Rediseño del Calendario: la rejilla ya no pinta desde `sesiones`/`reservas`
// del contexto (over-fetch admin), sino desde /api/calendario (payload por
// rol). Mapeo mínimo fila cruda → forma de esa respuesta, mismo shape que
// mapSesion/mapReserva/mapSala/mapInstructor (lib/supabase-data.ts).
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
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
    color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id,
  };
}

/** `avisos` recoge las llamadas al endpoint que escribe a las alumnas. */
async function montarCalendario(page: Page, extra: {
  sesiones?: unknown[]; reservas?: unknown[]; sesionUpdateError?: boolean;
  avisoInstructoraRespuesta?: { enviados: number; sinEmail: number; enApp: number };
} = {}) {
  const avisos: string[] = [];
  const avisosInstructora: string[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/clases/avisar-modificada**', route => {
    avisos.push(route.request().postData() ?? '');
    return json(route, { ok: true });
  });
  // Endpoint que resuelve email + in-app de un cambio de instructora y/o de
  // hora/sala EN SERVIDOR. Se responde con números fijos (independientes de
  // `extra.reservas`) para demostrar que el toast pinta lo que dice el
  // servidor, no lo que el panel cree ver en su propio snapshot de
  // `reservas`/`socios`.
  await page.route('**/api/clases/avisar-cambio-clase**', route => {
    avisosInstructora.push(route.request().postData() ?? '');
    return json(route, { ok: true, ...(extra.avisoInstructoraRespuesta ?? { enviados: 0, sinEmail: 0, enApp: 0 }) });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  // Rediseño del Calendario: la rejilla pinta desde este endpoint, no desde
  // sesiones/reservas del contexto — sin este mock no aparece ningún bloque.
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: (extra.sesiones ?? []).map(sesionApi),
    reservas: (extra.reservas ?? []).map(reservaApi),
    sustituciones: [],
    salas: SALAS.map(salaApi),
    instructores: INSTRUCTORES.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => {
    const m = route.request().method();
    if (m === 'GET') return json(route, extra.sesiones ?? []);
    // Simula que la BD rechaza la escritura (p.ej. solape GiST, 23P01).
    if (extra.sesionUpdateError) return json(route, { code: '23P01', message: 'conflicting key value violates exclusion constraint' }, 400);
    return json(route, []);
  });
  await page.route('**/rest/v1/reservas**', route =>
    json(route, route.request().method() === 'GET' ? (extra.reservas ?? []) : []));

  await page.goto('/calendario');
  return { avisos, avisosInstructora };
}

test.describe('Momentos del calendario', () => {
  test('la duración configurada se usa: 55 min → 09:00 a 09:55', async ({ page }) => {
    await montarCalendario(page);

    await page.getByRole('button', { name: 'Nueva clase' }).first().click({ timeout: 30_000 });

    // El formulario abre ya con la duración del tipo aplicada, no con 09:00–09:00.
    const fin = page.locator('input[type="time"]').nth(1);
    await expect(page.locator('input[type="time"]').first()).toHaveValue('09:00');
    await expect(fin).toHaveValue('09:55');

    // Y al mover la hora de inicio, el fin la sigue manteniendo los 55 minutos.
    await page.locator('input[type="time"]').first().fill('18:30');
    await expect(fin).toHaveValue('19:25');
  });

  test('al cambiar solo la instructora, pregunta antes de avisar', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const { inicio, fin } = sesionFutura();
    const { avisos } = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio, fin, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      reservas: [
        { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00` },
        { id: 'r2', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's2', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00` },
      ],
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    // Marta → Laura, sin tocar hora ni sala.
    await page.getByLabel('Instructora').selectOption({ label: 'Laura' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Pregunta, y nombra a quién afecta y quién da ahora la clase. (El panel de
    // detalle de la clase también es role="dialog": se filtra por el título.)
    const dialogo = page.getByRole('dialog').filter({ hasText: '¿Aviso a' });
    await expect(dialogo).toContainText('¿Aviso a las 2 clientas?');
    await expect(dialogo).toContainText('Laura');

    // Nada se ha mandado todavía.
    expect(avisos).toHaveLength(0);

    // Y decir que no, no manda nada.
    await dialogo.getByRole('button', { name: 'No hace falta' }).click();
    await expect(dialogo).toHaveCount(0);
    expect(avisos).toHaveLength(0);
  });

  test('el aviso de cambio de instructora avisa a quien reservó fuera del snapshot del panel', async ({ page }) => {
    // El panel solo ve 1 reserva en su snapshot (lo que abre el diálogo con
    // "¿Aviso a la alumna?"), pero para cuando la dueña confirma, el servidor
    // resuelve 3 socias reales contra la BD — p.ej. dos reservaron desde el
    // portal justo después de que el panel cargara su snapshot. El toast debe
    // reflejar lo que dice el SERVIDOR (3), no lo que el panel creía ver (1):
    // antes, el filtrado en cliente de `reservas`/`socios` habría avisado solo
    // a 1 y dejado a las otras 2 sin email.
    const hoy = new Date().toISOString().slice(0, 10);
    const { inicio, fin } = sesionFutura();
    const { avisosInstructora } = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio, fin, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      reservas: [
        { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00` },
      ],
      avisoInstructoraRespuesta: { enviados: 3, sinEmail: 1, enApp: 3 },
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByLabel('Instructora').selectOption({ label: 'Laura' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    const dialogo = page.getByRole('dialog').filter({ hasText: '¿Aviso a' });
    await expect(dialogo).toContainText('¿Aviso a la clienta?');
    await dialogo.getByRole('button', { name: 'Sí, avisar' }).click();

    // El endpoint recibe el sesionId; las destinatarias las resuelve él, no el
    // body de la petición (el panel ya no manda una lista de emails).
    await expect.poll(() => avisosInstructora.length, { timeout: 10_000 }).toBe(1);
    expect(JSON.parse(avisosInstructora[0])).toMatchObject({ sesionId: 'ses-1' });

    // El toast cuenta las 3 avisadas de verdad, no la 1 que el panel veía.
    await expect(page.getByText('Avisadas 3 clientas por email · 1 sin email guardado')).toBeVisible();
  });

  test('cambiar solo la instructora pregunta aunque el panel no vea NINGUNA apuntada', async ({ page }) => {
    // Antes, el diálogo solo se abría si `cuantasApuntadas() > 0` en el snapshot
    // del panel. Si una socia reservaba desde el portal justo después de cargar
    // el calendario, el panel veía 0, el diálogo ni se abría, y el email de
    // cambio de instructora no se mandaba nunca — aunque hubiera una alumna real
    // apuntada. El diálogo debe abrirse SIEMPRE ante un cambio de instructora;
    // el servidor es quien decide si hay o no destinatarias al avisar.
    const { inicio, fin } = sesionFutura();
    const { avisosInstructora } = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio, fin, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      // reservas: [] a propósito — el snapshot del panel no ve ninguna.
      avisoInstructoraRespuesta: { enviados: 1, sinEmail: 0, enApp: 1 },
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByLabel('Instructora').selectOption({ label: 'Laura' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // El diálogo se abre igualmente, con texto genérico (no "las 0 alumnas").
    const dialogo = page.getByRole('dialog').filter({ hasText: '¿Aviso a' });
    await expect(dialogo).toContainText('¿Aviso a las clientas apuntadas?');
    await dialogo.getByRole('button', { name: 'Sí, avisar' }).click();

    // Y el aviso sale de verdad: el servidor resolvió 1 destinataria real.
    await expect.poll(() => avisosInstructora.length, { timeout: 10_000 }).toBe(1);
    await expect(page.getByText('Avisada 1 clienta por email')).toBeVisible();
  });

  test('mover la hora avisa aunque el panel no viera la reserva (bug del aplazamiento)', async ({ page }) => {
    const { inicio, fin } = sesionFutura();
    // El panel NO trae la reserva en su snapshot (se hizo desde el portal después
    // de cargar). Antes, el guard de cliente `apuntadas > 0` vetaba el aviso y el
    // aplazamiento salía en silencio. Ahora se avisa siempre en cambios de hora
    // (email + in-app en una sola llamada a avisar-cambio-clase) y el servidor
    // resuelve las destinatarias desde la BD.
    const { avisosInstructora } = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio, fin, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      // reservas: [] a propósito — el snapshot del panel no las ve.
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    // Aplazar: mover la hora de inicio.
    await page.locator('input[type="time"]').first().fill('18:30');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Se manda el aviso pese a que el panel no veía apuntadas.
    await expect.poll(() => avisosInstructora.length, { timeout: 10_000 }).toBe(1);
    const body = JSON.parse(avisosInstructora[0]);
    expect(body).toMatchObject({ sesionId: 'ses-1', cambioHora: true, cambioSala: false });
  });

  test('un aplazamiento que la BD rechaza no avisa a nadie y muestra el motivo', async ({ page }) => {
    const { inicio, fin } = sesionFutura();
    // La escritura de la sesión falla (23P01, solape). El aplazamiento NO debe
    // fingir éxito: sin aviso, y se enseña el motivo. Antes se avisaba y el panel
    // mostraba la hora nueva aunque la BD la hubiera rechazado.
    const { avisos } = await montarCalendario(page, {
      sesionUpdateError: true,
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio, fin, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.locator('input[type="time"]').first().fill('18:30');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // Se muestra el motivo del rechazo y NO se avisa de un movimiento que no ocurrió.
    await expect(page.getByText(/ya tiene una clase a esa hora/i).first()).toBeVisible({ timeout: 10_000 });
    expect(avisos).toHaveLength(0);
  });

  test('los números de arriba hablan de la semana que se está mirando', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio: `${hoy}T09:00:00`, fin: `${hoy}T09:55:00`, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
    });

    // En la semana actual: 1 clase, y lo dice.
    await expect(page.getByText('esta semana', { exact: true })).toBeVisible({ timeout: 30_000 });

    // Al pasar a otra semana la etiqueta cambia y el número deja de ser el de hoy.
    await page.getByRole('button', { name: /Semana siguiente|Siguiente/ }).first().click();
    await expect(page.getByText('esa semana', { exact: true })).toBeVisible();
  });

  test('cambiar solo el aforo NO avisa a nadie', async ({ page }) => {
    // Regresión: `cambioHora` comparaba `sesionActual.inicio` (Postgres:
    // "…T09:00:00+00:00") con `toISO(...)` ("…T09:00:00.000Z") como CADENAS.
    // Era siempre distinto, así que cualquier edición —una nota, el aforo—
    // mandaba a todas las apuntadas un aviso de que su clase había cambiado.
    const hoy = new Date().toISOString().slice(0, 10);
    const { inicio, fin } = sesionFutura();
    const { avisos } = await montarCalendario(page, {
      sesiones: [{
        id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
        inicio: `${inicio}+00:00`, fin: `${fin}+00:00`, aforo_maximo: 10, cancelada: false,
        notas: null, serie_id: null, precio_puntual: null,
      }],
      reservas: [
        { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00+00:00` },
      ],
    });

    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    await page.getByLabel('Aforo máximo').fill('12');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText('Clase actualizada')).toBeVisible();
    // Ni aviso automático ni pregunta: no ha cambiado nada que le importe a la alumna.
    await expect(page.getByRole('dialog').filter({ hasText: '¿Aviso a' })).toHaveCount(0);
    expect(avisos).toHaveLength(0);
  });
});
