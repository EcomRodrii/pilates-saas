import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Las clases que se repiten, a la vista en el Calendario.
//
// La vista «Horario» enseña una tarjeta por clase recurrente y día de la semana:
// hasta cuándo va, si se renueva sola y cuántas vienen fijas. La agrupación la
// hace el servidor (`/api/calendario/horario`, aquí mockeado): la pantalla
// repite lo que dice. En Semana, una clase de una serie lleva la marca ↻ y su
// panel dice hasta cuándo se repite. El camino de fallo lleva contador.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const TZ = 'Europe/Madrid';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const enDias = (n: number) => ymdMadrid(new Date(Date.now() + n * 86_400_000));
const dmy = (ymd: string) => ymd.split('-').reverse().join('/');
const dowMadrid = (d: Date) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(d));

/** Hoy a la hora `h` en Madrid, como ISO (con el desfase del día, verano o invierno). */
function hoyALas(h: number): string {
  const ahora = new Date();
  const desfase = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(ahora).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const horas = Number(desfase.replace('GMT', '') || '0');
  const signo = horas >= 0 ? '+' : '-';
  return new Date(`${ymdMadrid(ahora)}T${String(h).padStart(2, '0')}:00:00${signo}${String(Math.abs(horas)).padStart(2, '0')}:00`).toISOString();
}

// Sala y tipos de clase del panel sembrado.
const NOMBRE = 'Reformer · Martes 18:00 · Sala Reformer';
const tarjeta = (o: Record<string, unknown> = {}) => ({
  serieId: 'serie-e2e', diaSemana: 2, hora: '18:00', duracionMin: 50, salaId: 'sala-1', tipoClaseId: 'tc-reformer',
  instructorId: 'ins-marta', aforo: 6, proximaSesionId: 'ses-lejana', proximaInicio: new Date(Date.now() + 86_400_000).toISOString(),
  ultimaFecha: enDias(12), clasesFuturas: 2, renovacionAutomatica: false, noRenovar: false,
  plazasFijas: [{ id: 'pf-1', socioId: 'soc-x', enPausa: false }, { id: 'pf-2', socioId: 'soc-y', enPausa: true }],
  ...o,
});
const HORARIO = {
  ok: true,
  dias: [
    { diaSemana: 1, tarjetas: [tarjeta({ serieId: 'serie-lunes', diaSemana: 1, hora: '09:30', tipoClaseId: 'tc-mat', ultimaFecha: enDias(200), renovacionAutomatica: true, plazasFijas: [] })] },
    { diaSemana: 2, tarjetas: [tarjeta()] },
  ],
  huerfanas: [],
};
const SIMULACION = {
  estado: 'simulacion', periodo: 2, periodoActual: 1, semanas: 52, desde: '2026-10-13', hasta: '2027-10-05',
  creadas: 51, omitidas: [], sinInstructora: [], instructoraInactiva: false, plazasFijas: 1, renovacionAutomatica: false,
};

type Respuesta = { status?: number; body: unknown };

async function abrirCalendario(page: Page, horario: () => Respuesta) {
  await montar(page);
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  const pedidosHorario = { n: 0 };
  await page.route('**/api/calendario/horario', r => {
    pedidosHorario.n++;
    const x = horario();
    return json(r, x.body, x.status ?? 200);
  });
  const envios: Record<string, unknown>[] = [];
  await page.route('**/api/series/renovar', r => {
    if (r.request().method() === 'GET') return json(r, { ok: true, series: [] });
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    envios.push(cuerpo);
    return cuerpo.accion === 'simular'
      ? json(r, { ok: true, resultado: SIMULACION })
      : json(r, { error: 'Acción no esperada en el test' }, 500);
  });
  return { pedidosHorario, envios };
}

async function irAHorario(page: Page) {
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
}

test.describe('Calendario · las clases que se repiten', () => {
  test.describe.configure({ timeout: 180_000 });

  test('«Horario» enseña cada clase que se repite: hasta cuándo va, si se renueva sola y quién viene fija', async ({ page }) => {
    const { pedidosHorario } = await abrirCalendario(page, () => ({ body: HORARIO }));
    await irAHorario(page);

    const martes = page.getByRole('listitem', { name: NOMBRE });
    await expect(martes).toBeVisible({ timeout: 30_000 });
    await expect(martes.getByText('1/6 plazas fijas · 1 en pausa')).toBeVisible();
    await expect(martes.getByText(`Hasta el ${dmy(enDias(12))} · termina en 12 días`)).toBeVisible();

    const lunes = page.getByRole('listitem', { name: /^Mat · Lunes 09:30/ });
    await expect(lunes.getByText(`Hasta el ${dmy(enDias(200))} · se renueva sola`)).toBeVisible();
    // Lunes primero, como la semana del estudio.
    await expect(page.getByTestId('tarjeta-horario').first()).toHaveAccessibleName(/^Mat · Lunes/);
    expect(pedidosHorario.n).toBeGreaterThan(0);
  });

  // «¿Cómo se marcan ellas en una clase fija?» — los estudios no lo tenían claro.
  // De serie las alumnas YA pueden pedir su plaza fija desde la app (22-sep: el
  // ajuste apagado sin motivo era justo lo que impedía verse la opción), pero un
  // estudio lo puede seguir apagando, y esta vista es donde trabaja con ellas:
  // aquí se le dice cómo está y, si es la propietaria, se le lleva al ajuste.
  test('«Horario» dice que las alumnas no pueden pedir su plaza fija desde la app cuando el estudio lo ha apagado, y lleva al ajuste', async ({ page }) => {
    await abrirCalendario(page, () => ({ body: HORARIO }));
    // Después de `montar`, que registra su fila del estudio: gana esta.
    await page.route('**/rest/v1/studios**', r => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
      email: 'cloe@example.com', moneda: 'EUR', plaza_fija_solicitar_desde_app: false,
    }));
    await irAHorario(page);

    const aviso = page.getByTestId('aviso-peticiones-plaza-fija');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText('Tus alumnas no pueden pedir su plaza fija desde la app');
    const enlace = aviso.getByRole('link', { name: 'Dejar que la pidan ellas' });
    await expect(enlace).toHaveAttribute('href', '/configuracion?tab=reservas#plaza-fija-desde-la-app');
  });

  test('«Horario» dice que sí pueden pedirla cuando el ajuste está encendido, sin enlace', async ({ page }) => {
    await abrirCalendario(page, () => ({ body: HORARIO }));
    // Después de `montar`, que registra su fila del estudio: gana esta.
    await page.route('**/rest/v1/studios**', r => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
      email: 'cloe@example.com', moneda: 'EUR', plaza_fija_solicitar_desde_app: true,
    }));
    await irAHorario(page);

    const aviso = page.getByTestId('aviso-peticiones-plaza-fija');
    await expect(aviso).toContainText('Tus alumnas pueden pedir su plaza fija desde la app; lo decides en Resumen.', { timeout: 30_000 });
    await expect(aviso.getByRole('link')).toHaveCount(0);
  });

  test('«Renovar» desde la tarjeta abre el mismo diálogo que simula en el servidor', async ({ page }) => {
    const { envios } = await abrirCalendario(page, () => ({ body: HORARIO }));
    await irAHorario(page);

    await page.getByRole('button', { name: `Renovar ${NOMBRE}` }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Se crean 51 clases.')).toBeVisible();
    expect(envios.filter(e => e.accion === 'simular').every(e => e.serieId === 'serie-e2e')).toBe(true);
    expect(envios.some(e => e.accion === 'renovar')).toBe(false);
  });

  test('«+ Plaza fija» pide primero la clienta', async ({ page }) => {
    await abrirCalendario(page, () => ({ body: HORARIO }));
    await irAHorario(page);

    await page.getByRole('button', { name: `Añadir plaza fija en ${NOMBRE}` }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('heading', { name: 'Añadir plaza fija' })).toBeVisible();
    await expect(dialogo.getByText(NOMBRE)).toBeVisible();
    await expect(dialogo.getByLabel('Clienta')).toBeFocused();
  });

  test('si el horario no carga, lo dice y «Reintentar» lo vuelve a pedir', async ({ page }) => {
    // El fallo dura hasta que el test lo levanta: con StrictMode en dev el
    // efecto se monta dos veces, y un «solo la primera falla» no fallaría nunca.
    let falla = true;
    const { pedidosHorario } = await abrirCalendario(page, () => (falla ? { status: 500, body: { error: 'x' } } : { body: HORARIO }));
    await irAHorario(page);

    await expect(page.getByRole('alert').getByText('No se ha podido cargar el horario')).toBeVisible({ timeout: 30_000 });
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(pedidosHorario.n).toBeGreaterThan(0);
    await expect(page.getByTestId('tarjeta-horario')).toHaveCount(0);

    falla = false;
    const antes = pedidosHorario.n;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('listitem', { name: NOMBRE })).toBeVisible();
    expect(pedidosHorario.n).toBeGreaterThan(antes);
  });

  test('en Semana, la clase de una serie lleva ↻ y su panel dice hasta cuándo se repite', async ({ page }) => {
    const inicio = hoyALas(10);
    const fin = new Date(Date.parse(inicio) + 50 * 60_000).toISOString();
    const dow = dowMadrid(new Date(inicio));
    const hasta = enDias(20);
    await abrirCalendario(page, () => ({
      body: { ...HORARIO, dias: [{ diaSemana: dow, tarjetas: [tarjeta({ diaSemana: dow, hora: '10:00', ultimaFecha: hasta })] }] },
    }));

    // Una sola clase, de una serie, en las dos fuentes del calendario: la rejilla
    // (`/api/calendario`) y el contexto del panel (`sesiones`).
    const fila = {
      id: 'ses-serie', studio_id: 'studio-test', tipo_clase_id: 'tc-reformer', sala_id: 'sala-1', instructor_id: 'ins-marta',
      inicio, fin, aforo_maximo: 6, cancelada: false, notas: null, google_event_id: null, serie_id: 'serie-e2e',
      incidencia_texto: null, precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
    };
    await page.route('**/rest/v1/sesiones**', r => json(r, [fila]));
    await page.route(u => u.pathname === '/api/calendario', r => json(r, {
      sesiones: [{
        id: fila.id, studioId: fila.studio_id, tipoClaseId: fila.tipo_clase_id, salaId: fila.sala_id, instructorId: fila.instructor_id,
        inicio, fin, aforoMaximo: 6, cancelada: false, notas: null, precioPuntual: null, serieId: 'serie-e2e',
      }],
      reservas: [], sustituciones: [],
      salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala Reformer', capacidad: 6 }],
      instructores: [],
      horaApertura: '07:00', horaCierre: '21:00', horarioSemana: [], rol: 'PROPIETARIO',
    }));

    await ir(page, 'calendario');
    // Crear una serie ya no está escondido en un desplegable.
    await expect(page.getByRole('button', { name: 'Crear clase', exact: true })).toBeVisible({ timeout: 60_000 });

    const marca = page.getByRole('img', { name: 'Se repite cada semana' });
    await expect(marca).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole('button').filter({ has: marca }).first().click();
    await expect(page.getByTestId('repeticion-clase')).toHaveText(`Se repite cada ${DIAS[dow]} hasta el ${dmy(hasta)}`, { timeout: 30_000 });
  });
});
