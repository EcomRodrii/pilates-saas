import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Guardar esta y las siguientes»: qué va a pasar, ANTES de que pase.
//
// Cambiar la hora de una serie avisa a cada alumna apuntada, mueve las plazas
// fijas y toca la lista de espera, y el botón lo ejecutaba al instante: el
// efecto solo se veía después, en un toast — o en el buzón de las alumnas. Ahora
// enseña el impacto y guarda solo al confirmar.
//
// Los contadores no son decoración: «no guardó» tiene que ser distinguible de
// «ni lo intentó». Y las horas van en el formato en que las devuelve la base de
// datos (`+00:00`), no en el que produce `toISOString()`: ahí se escondía un
// aviso espurio (ver el segundo bloque).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-05'; // miércoles

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Lucía Prieto', activo: true, rol: 'INSTRUCTOR', color: '#7FB2E5' },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALAS = [
  { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 12, color: '#F7A6C4' },
  { id: 'sala-2', studio_id: STUDIO_ID, nombre: 'Sala Mat', capacidad: 12, color: '#7FB2E5' },
];

// Serie semanal de jueves, 10:00–10:50 en Madrid (08:00 UTC en agosto), tal como la devuelve la base.
const FECHAS = ['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27'];
const SESIONES = FECHAS.map((f, i) => ({
  id: `ses-${i + 1}`, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: `${f}T08:00:00+00:00`, fin: `${f}T08:50:00+00:00`, aforo_maximo: 12, cancelada: false,
  notas: null, serie_id: 'serie-1',
}));

const reserva = (id: string, sesion: number, socio: string, estado = 'CONFIRMADA') => ({
  id, studio_id: STUDIO_ID, sesion_id: `ses-${sesion}`, socio_id: socio, estado,
  spot_id: null, posicion_espera: estado === 'LISTA_ESPERA' ? 1 : null, creado_en: '2026-07-01T10:00:00Z',
});
// Ana en las 4 clases (y con plaza fija), Bea solo en la 2.ª, Dani en la 3.ª con una recuperación, Cris en espera de la 1.ª.
const RESERVAS = [
  reserva('r-a1', 1, 'soc-ana'), reserva('r-a2', 2, 'soc-ana'), reserva('r-a3', 3, 'soc-ana'), reserva('r-a4', 4, 'soc-ana'),
  reserva('r-b2', 2, 'soc-bea'), reserva('r-d3', 3, 'soc-dani'),
  reserva('r-c1', 1, 'soc-cris', 'LISTA_ESPERA'),
];
const PLAZA_FIJA = {
  id: 'pf-ana', studio_id: STUDIO_ID, socio_id: 'soc-ana', dia_semana: 4, hora_inicio: '10:00:00',
  sala_id: 'sala-1', tipo_clase_id: null, spot_id: null, vigencia_desde: '2026-01-01', vigencia_hasta: null,
  estado: 'ACTIVA', creada_en: '2026-01-01T00:00:00Z',
};
const RECUPERACION = {
  id: 'rec-1', studio_id: STUDIO_ID, socio_id: 'soc-dani', origen_reserva_id: null, motivo: null,
  caduca_el: '2026-12-31', estado: 'USADA', usada_en_reserva_id: 'r-d3', creada_en: '2026-07-01T10:00:00Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
const sesionApi = (r: typeof SESIONES[number]) => ({
  id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id, instructorId: r.instructor_id,
  inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo, cancelada: r.cancelada, notas: r.notas,
  precioPuntual: null, serieId: r.serie_id, incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
});

interface Contadores {
  rpc: Record<string, unknown>[];
  avisos: { cambios: { sesionId: string; cambioHora?: boolean; cambioSala?: boolean }[] }[];
}

async function montar(page: Page): Promise<Contadores> {
  const c: Contadores = { rpc: [], avisos: [] };
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // El catch-all va PRIMERO: Playwright resuelve en orden inverso al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/sesiones**', route => route.request().method() === 'GET' ? json(route, SESIONES) : json(route, [], 201));
  await page.route('**/rest/v1/reservas**', route => route.request().method() === 'GET' ? json(route, RESERVAS) : json(route, [], 201));
  await page.route('**/rest/v1/plazas_fijas**', route => json(route, [PLAZA_FIJA]));
  await page.route('**/rest/v1/recuperaciones**', route => json(route, [RECUPERACION]));
  await page.route('**/rest/v1/rpc/editar_serie_desde', route => {
    c.rpc.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, SESIONES.length);
  });
  await page.route('**/api/clases/avisar-cambio-serie', route => {
    c.avisos.push(route.request().postDataJSON() as Contadores['avisos'][number]);
    return json(route, { ok: true, alumnas: 3, enviados: 3, sinEmail: 0, enApp: 3 });
  });
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: SESIONES.map(sesionApi), reservas: [], sustituciones: [],
    salas: SALAS.map(s => ({ id: s.id, studioId: s.studio_id, nombre: s.nombre, capacidad: s.capacidad, color: s.color })),
    instructores: EQUIPO.map(i => ({ id: i.id, studioId: i.studio_id, nombre: i.nombre, email: null, telefono: null, color: i.color, activo: true, avatar: null, fotoUrl: null, rol: i.rol, authUserId: null })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  return c;
}

/**
 * Abre la PRIMERA clase de la serie (jueves 6) y su formulario de edición, por el
 * enlace directo `/calendario?sesion=<id>`: la rejilla no da un nombre accesible
 * distinto a cada clase, y elegir «la primera» por posición depende del orden de pintado.
 */
async function abrirEdicion(page: Page) {
  await page.goto('/calendario?sesion=ses-1');
  await page.getByRole('button', { name: 'Editar', exact: true }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Guardar esta y las siguientes' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Editar una serie: primero se ve qué va a pasar', () => {
  test.describe.configure({ timeout: 90_000 });

  test('cambiar la hora enseña el impacto y NO guarda hasta confirmar', async ({ page }) => {
    const c = await montar(page);
    await abrirEdicion(page);

    await page.getByRole('textbox', { name: 'Hora inicio' }).fill('11:00');
    await page.getByRole('textbox', { name: 'Hora fin' }).fill('11:50');
    await page.getByRole('button', { name: 'Guardar esta y las siguientes' }).click();

    const dialogo = page.getByTestId('dialogo-impacto-serie');
    await expect(dialogo.getByRole('heading', { name: '¿Guardar los cambios en 4 clases?' })).toBeVisible();
    await expect(dialogo).toContainText('6 de agosto');
    await expect(dialogo).toContainText('Hora:');
    await expect(dialogo).toContainText('10:00–10:50');
    await expect(dialogo).toContainText('11:00–11:50');
    // Ana ×4, Bea ×1 y Dani ×1 = 6 reservas confirmadas de 3 alumnas; Cris (en espera) no recibe aviso.
    await expect(dialogo).toContainText('6 reservas confirmadas cambian de hora.');
    await expect(dialogo).toContainText('Se avisará a 3 alumnas, una sola vez a cada una aunque cambien varias de sus clases.');
    await expect(dialogo).toContainText('1 alumna tiene plaza fija en estas clases: su plaza se mueve con la serie.');
    await expect(dialogo).toContainText('1 persona en lista de espera de estas clases (no reciben aviso).');
    await expect(dialogo).toContainText('1 reserva se hizo gastando una recuperación.');

    // Mirar no guarda: ni la escritura ni los avisos han salido.
    expect(c.rpc, 'la escritura no puede salir antes de confirmar').toHaveLength(0);
    expect(c.avisos, 'los avisos no pueden salir antes de confirmar').toHaveLength(0);

    await dialogo.getByTestId('confirmar-serie').click();

    await expect.poll(() => c.rpc.length, { timeout: 30_000 }).toBe(1);
    expect(c.rpc[0]).toMatchObject({ p_hora_inicio: '11:00', p_hora_fin: '11:50', p_sesion_origen_id: 'ses-1' });
    await expect.poll(() => c.avisos.length, { timeout: 30_000 }).toBe(1);
    // Se avisa de las 4 clases, todas por cambio de hora.
    expect(c.avisos[0].cambios).toHaveLength(4);
    expect(c.avisos[0].cambios.every(x => x.cambioHora === true)).toBe(true);
    await expect(page.getByText('Serie actualizada · 4 clases')).toBeVisible();
  });

  test('«Volver» no guarda ni avisa a nadie', async ({ page }) => {
    const c = await montar(page);
    await abrirEdicion(page);
    await page.getByRole('textbox', { name: 'Hora inicio' }).fill('11:00');
    await page.getByRole('textbox', { name: 'Hora fin' }).fill('11:50');
    await page.getByRole('button', { name: 'Guardar esta y las siguientes' }).click();
    const dialogo = page.getByTestId('dialogo-impacto-serie');
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole('button', { name: 'Volver' }).click();

    await expect(dialogo).toHaveCount(0);
    // Sigue el formulario, con lo que había escrito.
    await expect(page.getByRole('textbox', { name: 'Hora inicio' })).toHaveValue('11:00');
    expect(c.rpc).toHaveLength(0);
    expect(c.avisos).toHaveLength(0);
  });

  test('sin hora no se puede guardar, y se dice por qué', async ({ page }) => {
    const c = await montar(page);
    await abrirEdicion(page);
    await page.getByRole('textbox', { name: 'Hora inicio' }).fill('');

    await expect(page.getByText('Elige la hora de inicio y la de fin.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar esta y las siguientes' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar solo esta clase' })).toBeDisabled();
    expect(c.rpc).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El aviso espurio que se escondía detrás. `editarSerie` comparaba el inicio de
// cada clase como TEXTO: la base lo devuelve como `…T08:00:00+00:00` y el cálculo
// da `…T08:00:00.000Z`, así que TODAS las clases parecían haber cambiado de hora
// en cada edición de serie. Cambiar solo el aforo —o las notas— mandaba a cada
// alumna un «cambio de horario» que no existía.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Un cambio que las alumnas no ven no las avisa', () => {
  test.describe.configure({ timeout: 90_000 });

  test('cambiar solo el aforo: la vista previa dice que no se avisa, y no sale ningún aviso', async ({ page }) => {
    const c = await montar(page);
    await abrirEdicion(page);
    await page.getByRole('spinbutton', { name: /Aforo/i }).fill('10');
    await page.getByRole('button', { name: 'Guardar esta y las siguientes' }).click();

    const dialogo = page.getByTestId('dialogo-impacto-serie');
    await expect(dialogo).toContainText('Aforo:');
    await expect(dialogo).toContainText('Este cambio no genera avisos a las alumnas.');
    await expect(dialogo).not.toContainText('cambian de hora');

    await dialogo.getByTestId('confirmar-serie').click();

    await expect.poll(() => c.rpc.length, { timeout: 30_000 }).toBe(1);
    expect(c.rpc[0]).toMatchObject({ p_aforo_maximo: 10 });
    await expect(page.getByText('Serie actualizada · 4 clases')).toBeVisible();
    // Sin este margen el test pasaría aunque el aviso saliera un instante después.
    await page.waitForTimeout(1500);
    expect(c.avisos, 'un cambio de aforo no avisa a nadie').toHaveLength(0);
  });

  test('cambiar la instructora avisa, y el aviso dice instructora, no «cambio de horario»', async ({ page }) => {
    const c = await montar(page);
    await abrirEdicion(page);
    await page.getByRole('combobox', { name: 'Instructora' }).selectOption('ins-2');
    await page.getByRole('button', { name: 'Guardar esta y las siguientes' }).click();

    const dialogo = page.getByTestId('dialogo-impacto-serie');
    await expect(dialogo).toContainText('Instructora:');
    await expect(dialogo).toContainText('Marta Sanz');
    await expect(dialogo).toContainText('Lucía Prieto');
    await expect(dialogo).toContainText('6 reservas confirmadas cambian de instructora.');
    await dialogo.getByTestId('confirmar-serie').click();

    await expect.poll(() => c.avisos.length, { timeout: 30_000 }).toBe(1);
    expect(c.avisos[0].cambios).toHaveLength(4);
    // Antes salía cambioHora:true en las 4: el correo se titulaba «Cambio de horario».
    expect(c.avisos[0].cambios.some(x => x.cambioHora === true), 'la hora no ha cambiado').toBe(false);
    expect(c.avisos[0].cambios.some(x => x.cambioSala === true), 'la sala tampoco').toBe(false);
  });
});
