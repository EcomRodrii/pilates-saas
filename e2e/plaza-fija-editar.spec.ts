import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Plaza fija desde la ficha de la clienta: asignar, cambiar y quitar.
//
// Asignar y cambiar se hacen ELIGIENDO UNA CLASE del horario (antes se
// tecleaban día y hora, que tenían que coincidir al minuto con una clase) y van
// por el servidor (`/api/plazas-fijas`), que comprueba cuota y límite semanal y
// reserva ya las próximas semanas. Nada escribe en `plazas_fijas` desde el
// navegador: se cuenta cualquier escritura REST para demostrarlo.
//
// Cada camino de fallo lleva contador de peticiones: un test de fallo sin él es
// hueco (ver .claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// Miércoles 5 de agosto. Clases: martes 10:00 y jueves 18:00 (hora de Madrid).
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

/** 6 clases semanales desde `primeraUtc` (ISO en UTC). */
function semanales(prefijo: string, primeraUtc: string) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.parse(primeraUtc) + i * 7 * 86_400_000);
    return {
      id: `${prefijo}-${i}`, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
      inicio: d.toISOString(), fin: new Date(d.getTime() + 50 * 60_000).toISOString(),
      aforo_maximo: 10, cancelada: false, notas: null,
    };
  });
}
const MARTES_10 = semanales('mar', '2026-08-11T08:00:00Z');
const JUEVES_18 = semanales('jue', '2026-08-06T16:00:00Z');

const plazaCamel = (o: Record<string, unknown>) => ({
  id: 'pf-2', studioId: STUDIO_ID, socioId: 'soc-1', diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1',
  tipoClaseId: 'tc-1', spotId: null, vigenciaDesde: '2026-08-05', vigenciaHasta: null, estado: 'ACTIVA',
  creadaEn: '2026-08-05T07:00:00Z', ...o,
});
const guardadaOk = (o: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  ok: true, plaza: plazaCamel(o), creadas: 6, primeraFecha: '2026-08-06', hayClaseProgramada: true, canceladas: [], ...extra,
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Respuesta = { status?: number; body: unknown };

async function montar(page: Page, opts: {
  sesiones: unknown[];
  /** Respuestas de `/api/plazas-fijas`, en orden; la última se repite. */
  guardar?: Respuesta[];
  /** Respuesta de `POST /api/plazas-fijas/estado` (quitar). */
  estadoStatus?: number; estadoBody?: unknown;
  /** Columnas de la plaza fija que se pisan (p. ej. una pausa). */
  plaza?: Record<string, unknown>;
}) {
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

  const escriturasRest: string[] = [];

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
    if (route.request().method() !== 'GET') {
      escriturasRest.push(route.request().method());
      return json(route, []);
    }
    return json(route, [{ ...PLAZA_ROW, ...opts.plaza }]);
  });

  // Registradas después del catch-all `**/api/**`: ganan éstas.
  const guardados: { metodo: string; cuerpo: Record<string, unknown> }[] = [];
  const respuestas = opts.guardar ?? [{ body: guardadaOk() }];
  await page.route('**/api/plazas-fijas', route => {
    const r = respuestas[Math.min(guardados.length, respuestas.length - 1)];
    guardados.push({ metodo: route.request().method(), cuerpo: route.request().postDataJSON() });
    return json(route, r.body, r.status ?? 200);
  });
  const cambiosEstado: Record<string, unknown>[] = [];
  await page.route('**/api/plazas-fijas/estado', route => {
    cambiosEstado.push(route.request().postDataJSON());
    return json(route, opts.estadoBody ?? { ok: true, canceladas: [], mantenidas: [], fallidas: 0 }, opts.estadoStatus ?? 200);
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  // Las plazas llegan en la 2ª ola de carga (fetchDeferredStudioData): hay un
  // instante de "Sin plaza fija" antes. Se espera la plaza, nunca se aserta
  // la ausencia del vacío.
  await expect(page.getByText('Martes · 10:00')).toBeVisible({ timeout: 15_000 });
  return { guardados, cambiosEstado, escriturasRest };
}

test.describe('Plaza fija: asignar y cambiar eligiendo la clase', () => {
  test('la ficha lista la plaza fija que ya existe, sin aviso si su clase está en el horario', async ({ page }) => {
    await montar(page, { sesiones: [...MARTES_10, ...JUEVES_18] });
    await expect(page.getByText('Sin clase en este horario')).toHaveCount(0);
  });

  test('asignar: se elige una clase del horario y UNA petición al servidor la guarda', async ({ page }) => {
    const { guardados, escriturasRest } = await montar(page, { sesiones: [...MARTES_10, ...JUEVES_18] });
    await page.getByRole('button', { name: 'Añadir plaza fija' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Asignar plaza fija' })).toBeVisible();

    // La clase en la que ya tiene plaza no se puede volver a elegir.
    await expect(dialogo.getByRole('radio', { name: 'Martes 10:00 · Reformer · Sala Reformer' })).toBeDisabled();
    const jueves = dialogo.getByRole('radio', { name: 'Jueves 18:00 · Reformer · Sala Reformer' });
    await jueves.click();
    await expect(jueves).toHaveAttribute('aria-checked', 'true');
    expect(guardados.length).toBe(0);

    await dialogo.getByRole('button', { name: 'Asignar plaza fija' }).click();
    await expect(dialogo).toBeHidden();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].metodo).toBe('POST');
    // Viaja la CLASE, no día/hora/sala tecleados.
    expect(guardados[0].cuerpo).toEqual({
      socioId: 'soc-1', sesionId: 'jue-0', spotId: null,
      vigenciaDesde: '2026-08-05', vigenciaHasta: null, confirmarLimite: false,
    });
    await expect(page.getByText('Plaza fija guardada · ya tiene reservada la clase del 6 de agosto')).toBeVisible();
    await expect(page.getByText('Jueves · 18:00')).toBeVisible();
    expect(escriturasRest).toEqual([]);
  });

  test('si supera el límite semanal de su cuota, avisa y deja asignarla igualmente', async ({ page }) => {
    const { guardados } = await montar(page, {
      sesiones: [...MARTES_10, ...JUEVES_18],
      guardar: [
        { status: 409, body: { ok: false, codigo: 'SUPERA_LIMITE', limite: 1, error: 'Su cuota es de 1 clase por semana y ya tiene 1 plaza fija.' } },
        { body: guardadaOk() },
      ],
    });
    await page.getByRole('button', { name: 'Añadir plaza fija' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('radio', { name: 'Jueves 18:00 · Reformer · Sala Reformer' }).click();
    await dialogo.getByRole('button', { name: 'Asignar plaza fija' }).click();

    await expect(dialogo.getByText('Su cuota es de 1 clase por semana y ya tiene 1 plaza fija.')).toBeVisible();
    await expect(dialogo).toBeVisible();
    expect(guardados).toHaveLength(1);

    await dialogo.getByRole('button', { name: 'Asignar igualmente' }).click();
    await expect(dialogo).toBeHidden();
    expect(guardados).toHaveLength(2);
    expect(guardados[1].cuerpo).toMatchObject({ sesionId: 'jue-0', confirmarLimite: true });
  });

  test('si el servidor dice que no (sin cuota), se enseña, el diálogo sigue abierto y la lista no cambia', async ({ page }) => {
    const { guardados } = await montar(page, {
      sesiones: [...MARTES_10, ...JUEVES_18],
      guardar: [{ status: 400, body: { ok: false, error: 'Para tener plaza fija necesita una cuota activa que incluya esta clase. Con bono se reserva clase a clase.' } }],
    });
    await page.getByRole('button', { name: 'Añadir plaza fija' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('radio', { name: 'Jueves 18:00 · Reformer · Sala Reformer' }).click();
    await dialogo.getByRole('button', { name: 'Asignar plaza fija' }).click();

    await expect(dialogo.getByText(/necesita una cuota activa que incluya esta clase/)).toBeVisible();
    await expect(dialogo).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(guardados.length).toBeGreaterThan(0);
    await expect(page.getByText('Jueves · 18:00')).toHaveCount(0);
  });

  test('cambiar de clase conserva la plaza (PATCH) y dice cuántas del horario anterior se han cancelado', async ({ page }) => {
    const { guardados, escriturasRest } = await montar(page, {
      sesiones: [...MARTES_10, ...JUEVES_18],
      guardar: [{ body: guardadaOk({ id: 'pf-1', vigenciaDesde: '2026-01-01' }, { canceladas: ['r-1', 'r-2'] }) }],
    });
    await page.getByRole('button', { name: 'Editar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Cambiar plaza fija' })).toBeVisible();
    await expect(dialogo.getByRole('radio', { name: 'Martes 10:00 · Reformer · Sala Reformer' })).toHaveAttribute('aria-checked', 'true');

    await dialogo.getByRole('radio', { name: 'Jueves 18:00 · Reformer · Sala Reformer' }).click();
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(dialogo).toBeHidden();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].metodo).toBe('PATCH');
    expect(guardados[0].cuerpo).toMatchObject({ plazaId: 'pf-1', sesionId: 'jue-0', vigenciaDesde: '2026-01-01' });
    await expect(page.getByText(/Plaza fija cambiada · .* · 2 clases del horario anterior canceladas/)).toBeVisible();
    await expect(page.getByText('Jueves · 18:00')).toBeVisible();
    await expect(page.getByText('Martes · 10:00')).toHaveCount(0);
    expect(escriturasRest).toEqual([]);
  });

  test('cuando la clase se movió, la fila avisa y el diálogo ofrece la clase nueva sin ninguna marcada', async ({ page }) => {
    // Las clases del martes están ahora a las 12:00 locales (10:00Z); la plaza sigue a las 10:00.
    await montar(page, { sesiones: semanales('mar', '2026-08-11T10:00:00Z') });
    await expect(page.getByText('Sin clase en este horario')).toBeVisible();

    await page.getByRole('button', { name: 'Editar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    const nueva = dialogo.getByRole('radio', { name: 'Martes 12:00 · Reformer · Sala Reformer' });
    await expect(nueva).toHaveAttribute('aria-checked', 'false');
    await expect(dialogo.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await nueva.click();
    await expect(dialogo.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });
});

test.describe('Plaza fija: quitarla suelta las clases que ya tenía reservadas', () => {
  test('quitar va por el servidor y dice qué clases ha cancelado y cuáles se mantienen', async ({ page }) => {
    const { cambiosEstado, escriturasRest } = await montar(page, {
      sesiones: MARTES_10,
      estadoBody: { ok: true, canceladas: ['r-1', 'r-2'], mantenidas: ['r-3'], fallidas: 0 },
    });
    await page.getByRole('button', { name: 'Quitar la plaza fija del Martes 10:00' }).click();
    await expect(page.getByText(/cancela las que ya tenía apuntadas en ese horario/)).toBeVisible();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();

    await expect(page.getByText('Plaza fija quitada · 2 clases canceladas · 1 se mantiene por estar dentro del plazo de cancelación')).toBeVisible();
    expect(cambiosEstado).toEqual([{ plazaId: 'pf-1', estado: 'BAJA' }]);
    expect(escriturasRest).toEqual([]);
  });

  test('si el servidor dice que no, se enseña el motivo y la plaza sigue en la lista', async ({ page }) => {
    const { cambiosEstado } = await montar(page, {
      sesiones: MARTES_10,
      estadoStatus: 403,
      estadoBody: { error: 'No tienes permiso para cambiar plazas fijas' },
    });
    await page.getByRole('button', { name: 'Quitar la plaza fija del Martes 10:00' }).click();
    await page.getByRole('button', { name: 'Quitar', exact: true }).click();

    await expect(page.getByText('No tienes permiso para cambiar plazas fijas')).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(cambiosEstado.length).toBeGreaterThan(0);
    await expect(page.getByText('Martes · 10:00')).toBeVisible();
  });
});

test.describe('Plaza fija: pausarla unas fechas sin perderla', () => {
  const conPausa = (o: Record<string, unknown>) => ({
    ok: true, canceladas: [], mantenidas: [], fallidas: 0, creadas: 0,
    plaza: plazaCamel({ id: 'pf-1', diaSemana: 2, horaInicio: '10:00:00', tipoClaseId: null, vigenciaDesde: '2026-01-01', ...o }),
  });

  test('pausar va por el servidor con las fechas, dice qué ha cancelado y la fila dice cuándo', async ({ page }) => {
    const { cambiosEstado, escriturasRest } = await montar(page, {
      sesiones: MARTES_10,
      estadoBody: { ...conPausa({ pausaDesde: '2026-08-10', pausaHasta: '2026-08-23' }), canceladas: ['r-1', 'r-2'] },
    });
    await page.getByRole('button', { name: 'Pausar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Pausar plaza fija' })).toBeVisible();
    // Sin «hasta» no se puede guardar.
    await expect(dialogo.getByRole('button', { name: 'Pausar', exact: true })).toBeDisabled();
    await dialogo.getByLabel('Desde').fill('2026-08-10');
    await dialogo.getByLabel('Hasta').fill('2026-08-23');
    await dialogo.getByRole('button', { name: 'Pausar', exact: true }).click();

    await expect(dialogo).toBeHidden();
    expect(cambiosEstado).toEqual([{ plazaId: 'pf-1', pausa: { desde: '2026-08-10', hasta: '2026-08-23' } }]);
    await expect(page.getByText('Plaza fija en pausa del 10/08/2026 al 23/08/2026 · 2 clases canceladas')).toBeVisible();
    await expect(page.getByText('Pausa programada del 10/08/2026 al 23/08/2026')).toBeVisible();
    expect(escriturasRest).toEqual([]);
  });

  test('si el servidor dice que no, el diálogo enseña el motivo y la plaza no queda en pausa', async ({ page }) => {
    const { cambiosEstado } = await montar(page, {
      sesiones: MARTES_10,
      estadoStatus: 400,
      estadoBody: { error: 'Una pausa no puede pasar de un año. Si no va a volver, quita la plaza fija.' },
    });
    await page.getByRole('button', { name: 'Pausar la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Hasta').fill('2026-08-23');
    await dialogo.getByRole('button', { name: 'Pausar', exact: true }).click();

    await expect(dialogo.getByText('Una pausa no puede pasar de un año. Si no va a volver, quita la plaza fija.')).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(cambiosEstado.length).toBeGreaterThan(0);
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(page.getByText(/Pausa programada|En pausa hasta/)).toHaveCount(0);
  });

  test('una plaza en pausa lo dice, y quitar la pausa le vuelve a reservar las clases', async ({ page }) => {
    const { cambiosEstado } = await montar(page, {
      sesiones: MARTES_10,
      plaza: { pausa_desde: '2026-08-03', pausa_hasta: '2026-08-20' },
      estadoBody: { ...conPausa({ pausaDesde: null, pausaHasta: null }), creadas: 2 },
    });
    await expect(page.getByText('En pausa hasta el 20/08/2026')).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar la pausa de la plaza fija del Martes 10:00' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Cambiar la pausa' })).toBeVisible();
    await expect(dialogo.getByLabel('Hasta')).toHaveValue('2026-08-20');
    await dialogo.getByRole('button', { name: 'Quitar pausa' }).click();

    await expect(dialogo).toBeHidden();
    expect(cambiosEstado).toEqual([{ plazaId: 'pf-1', pausa: null }]);
    await expect(page.getByText('Pausa quitada · 2 clases reservadas de nuevo')).toBeVisible();
    await expect(page.getByText('En pausa hasta el 20/08/2026')).toHaveCount(0);
  });
});
