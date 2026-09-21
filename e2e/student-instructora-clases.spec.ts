import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Control horario de las clases en «Hoy» de la instructora: empezar la clase,
// «Terminé antes», y confirmar las que acabaron sin empezarlas.
//
// Servidor simulado con estado. Lo que decide (ventana para empezar, cierre a la
// hora programada, qué queda sin confirmar) lo cubre
// lib/fichaje/clases-impartidas.test.ts; aquí, lo que ve y envía la pantalla.
// Cada camino de fallo lleva contador de intentos.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Estado = {
  relacion: 'CONTRATADA' | 'AUTONOMA' | null;
  actual: { id: string; nombre: string; inicio: string; fin: string; estado: 'EMPEZABLE' | 'EN_CURSO'; inicioReal: string | null } | null;
  pendientes: { id: string; nombre: string; inicio: string; fin: string }[];
};

/** La clase de la agenda: empieza dentro de `enMin` minutos (negativo = ya empezó) y dura 55. */
function claseAgenda(enMin: number) {
  const inicio = new Date(Math.floor((Date.now() + enMin * 60_000) / 60_000) * 60_000);
  const fin = new Date(inicio.getTime() + 55 * 60_000);
  return {
    id: 'ses-ahora', inicio: inicio.toISOString(), fin: fin.toISOString(), fecha: fmtDia.format(inicio),
    hora: fmtHora.format(inicio), horaFin: fmtHora.format(fin),
    tipo: 'Reformer Flow', color: '#2C352C', sala: 'Sala Norte', aforo: 8, confirmadas: 5, enEspera: 0,
    cancelada: false, baja: null,
  };
}

function pendiente(id: string, haceDias: number) {
  const inicio = new Date(Date.now() - haceDias * 24 * 3600_000);
  inicio.setUTCHours(17, 0, 0, 0);
  return { id, nombre: 'Mat Pilates', inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 55 * 60_000).toISOString() };
}

async function montar(page: Page, opciones: {
  enMin?: number; estado?: Partial<Estado>; empezarFalla?: boolean; jornadaAbierta?: boolean; fichajeAbierta?: boolean;
} = {}) {
  const clase = claseAgenda(opciones.enMin ?? 5);
  const cuerpos: Record<string, unknown>[] = [];
  const contador = { estado: 0, empezar: 0, terminar: 0, confirmar: 0, fichaje: 0 };
  let estado: Estado = {
    relacion: null,
    actual: { id: clase.id, nombre: clase.tipo, inicio: clase.inicio, fin: clase.fin, estado: 'EMPEZABLE', inicioReal: null },
    pendientes: [],
    ...opciones.estado,
  };

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [clase], bajas: [] }));
  await page.route('**/api/portal/instructora/fichaje', (route) => {
    contador.fichaje++;
    const abierta = opciones.fichajeAbierta ? { id: 'j1', checkInAt: new Date(Date.now() - 30 * 60_000).toISOString(), requiereRevision: false } : null;
    return json(route, { estado: { abierta, proxima: null, ventanaMinutos: 10, hoy: { minutosCerrados: 0, jornadasCerradas: 0 }, relacion: estado.relacion } });
  });
  await page.route('**/api/portal/instructora/clases', async (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; sesionId?: string; fin?: string; items?: { sesionId: string; modo: string }[] };
    cuerpos.push(cuerpo);
    if (cuerpo.accion === 'estado') { contador.estado++; return json(route, { estado }); }
    // Latencia real: sin ella un doble toque llegaría ya repintado.
    await new Promise((r) => setTimeout(r, 300));
    if (cuerpo.accion === 'empezar') {
      contador.empezar++;
      if (opciones.empezarFalla) return json(route, { error: 'Esta clase todavía no se puede empezar.' }, 409);
      estado = { ...estado, actual: estado.actual && { ...estado.actual, estado: 'EN_CURSO', inicioReal: new Date().toISOString() } };
      return json(route, { estado, jornadaAbierta: opciones.jornadaAbierta === true });
    }
    if (cuerpo.accion === 'terminar') {
      contador.terminar++;
      return json(route, { ok: true, estado });
    }
    contador.confirmar++;
    const hechas = new Set((cuerpo.items ?? []).map((i) => i.sesionId));
    estado = { ...estado, pendientes: estado.pendientes.filter((p) => !hechas.has(p.id)) };
    return json(route, { confirmadas: hechas.size, errores: [], estado });
  });
  return { clase, cuerpos, contador };
}

const HOY = `/portal/${SLUG}/equipo`;

test.describe('Instructora: control horario de sus clases', () => {
  test('empezar la clase: un toque, una petición solo con estudio y clase, y pasa a «en curso»', async ({ page }) => {
    const { clase, cuerpos, contador } = await montar(page);
    await page.goto(HOY);
    const boton = page.getByTestId('empezar-clase');
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clase-que-da')).toContainText('Al acabar no tienes que hacer nada');
    await boton.dblclick();
    await expect(page.getByTestId('clase-empezada')).toContainText(/Empezaste a las \d{2}:\d{2}\. Termina sola a las/, { timeout: 30_000 });
    await expect(page.getByTestId('clase-empezada')).toContainText(clase.horaFin);
    await expect(page.getByTestId('empezar-clase')).toHaveCount(0);
    expect(contador.empezar).toBe(1);
    const envio = cuerpos.find((c) => c.accion === 'empezar');
    expect(Object.keys(envio ?? {}).sort()).toEqual(['accion', 'sesionId', 'slug']);
    expect(envio?.sesionId).toBe(clase.id);
  });

  test('si no tenía la jornada abierta y es contratada, se lo dice al empezar', async ({ page }) => {
    await montar(page, { jornadaAbierta: true, estado: { relacion: 'CONTRATADA' } });
    await page.goto(HOY);
    await page.getByTestId('empezar-clase').click({ timeout: 30_000 });
    await expect(page.getByText('Clase empezada. También te hemos fichado la entrada.')).toBeVisible({ timeout: 30_000 });
  });

  test('si el servidor dice que no, la clase no se da por empezada', async ({ page }) => {
    const { contador } = await montar(page, { empezarFalla: true });
    await page.goto(HOY);
    await page.getByTestId('empezar-clase').click({ timeout: 30_000 });
    await expect(page.getByText('Esta clase todavía no se puede empezar.')).toBeVisible({ timeout: 30_000 });
    expect(contador.empezar).toBeGreaterThan(0);
    await expect(page.getByTestId('clase-empezada')).toHaveCount(0);
    await expect(page.getByTestId('empezar-clase')).toBeEnabled();
  });

  test('en curso: «Terminé antes» envía la hora de hoy en instante absoluto', async ({ page }) => {
    const { clase, cuerpos, contador } = await montar(page, {
      enMin: -20,
      estado: { actual: { id: 'ses-ahora', nombre: 'Reformer Flow', inicio: '', fin: '', estado: 'EN_CURSO', inicioReal: new Date(Date.now() - 20 * 60_000).toISOString() } },
    });
    await page.goto(HOY);
    await expect(page.getByTestId('clase-empezada')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Terminé antes' }).click();
    const hora = fmtHora.format(new Date(Date.now() - 60_000));
    await page.getByLabel('Hora a la que terminaste').fill(hora);
    await page.getByTestId('terminar-antes').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Hora de fin guardada.')).toBeVisible({ timeout: 30_000 });
    expect(contador.terminar).toBe(1);
    const envio = cuerpos.find((c) => c.accion === 'terminar') as { sesionId: string; fin: string };
    expect(envio.sesionId).toBe(clase.id);
    expect(fmtHora.format(new Date(envio.fin))).toBe(hora);
  });

  test('clases sin confirmar: todas a su hora de un toque, y la tarjeta se va', async ({ page }) => {
    const { cuerpos, contador } = await montar(page, {
      estado: { actual: null, pendientes: [pendiente('p1', 2), pendiente('p2', 1)] },
    });
    await page.goto(HOY);
    const tarjeta = page.getByTestId('clases-sin-confirmar');
    await expect(tarjeta).toContainText('¿Diste estas 2 clases?', { timeout: 30_000 });
    await expect(tarjeta.getByTestId('clase-pendiente')).toHaveCount(2);
    await tarjeta.getByRole('button', { name: 'Sí, las 2 a su hora' }).click();
    await expect(page.getByText('Clases confirmadas.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clases-sin-confirmar')).toHaveCount(0);
    expect(contador.confirmar).toBe(1);
    const envio = cuerpos.find((c) => c.accion === 'confirmar') as { items: { sesionId: string; modo: string }[] };
    expect(envio.items).toEqual([{ sesionId: 'p1', modo: 'A_SU_HORA' }, { sesionId: 'p2', modo: 'A_SU_HORA' }]);
  });

  test('«No la di» y «Otro horario» envían lo que ha dicho', async ({ page }) => {
    const p1 = pendiente('p1', 2);
    const { cuerpos } = await montar(page, { estado: { actual: null, pendientes: [p1, pendiente('p2', 1)] } });
    await page.goto(HOY);
    const tarjeta = page.getByTestId('clases-sin-confirmar');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('clase-pendiente').nth(1).getByRole('button', { name: 'No la di' }).click();
    await expect(page.getByText('Clase confirmada.')).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText('¿Diste esta clase?');
    await tarjeta.getByRole('button', { name: 'Otro horario' }).click();
    await page.getByLabel('Hora a la que empezaste').fill('19:10');
    await page.getByLabel('Hora a la que terminaste').fill('20:00');
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByTestId('clases-sin-confirmar')).toHaveCount(0, { timeout: 30_000 });
    const envios = cuerpos.filter((c) => c.accion === 'confirmar') as { items: { sesionId: string; modo: string; inicio?: string; fin?: string }[] }[];
    expect(envios[0].items).toEqual([{ sesionId: 'p2', modo: 'NO_DADA' }]);
    const otro = envios[1].items[0];
    expect(otro.modo).toBe('OTRO_HORARIO');
    expect(fmtHora.format(new Date(otro.inicio!))).toBe('19:10');
    expect(fmtHora.format(new Date(otro.fin!))).toBe('20:00');
    expect(fmtDia.format(new Date(otro.inicio!))).toBe(fmtDia.format(new Date(p1.inicio)));
  });

  test('autónoma: «Hoy» no le ofrece fichar jornada, y en Fichaje se le explica por qué', async ({ page }) => {
    const { contador } = await montar(page, { estado: { relacion: 'AUTONOMA' } });
    await page.goto(HOY);
    await expect(page.getByTestId('empezar-clase')).toBeVisible({ timeout: 30_000 });
    expect(contador.estado).toBeGreaterThan(0);
    await expect(page.getByTestId('fichaje-hoy')).toHaveCount(0);
    await page.goto(`${HOY}/fichaje`);
    await expect(page.getByTestId('fichaje-autonoma')).toBeVisible({ timeout: 30_000 });
  });

  test('en el móvil la tarjeta se ve entera y sin desbordar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await montar(page, { estado: { pendientes: [pendiente('p1', 1)] } });
    await page.goto(HOY);
    await expect(page.getByTestId("empezar-clase")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
