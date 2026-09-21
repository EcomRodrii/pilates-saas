import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Clases fijas del estudio, en el panel: se crean y se cuidan desde «Horario» y
// las peticiones de las clientas se deciden en la bandeja de Inicio.
//
// Lo que se defiende: que la oferta se arma eligiendo clases que YA se repiten (el
// cuerpo que sale lleva serie y día, nunca una hora tecleada), que un «no» del
// servidor no se lee como guardado, y que aprobar una petición de una clase fija
// pasa por la misma decisión que las demás. Cada camino que escribe lleva contador
// de intentos: un test de fallo sin contador pasa aunque no intente nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 180_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const TZ = 'Europe/Madrid';
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const enDias = (n: number) => ymdMadrid(new Date(Date.now() + n * 86_400_000));

const tarjeta = (o: Record<string, unknown> = {}) => ({
  serieId: 'serie-e2e', diaSemana: 2, hora: '18:00', duracionMin: 50, salaId: 'sala-1', tipoClaseId: 'tc-reformer',
  instructorId: 'ins-marta', aforo: 6, proximaSesionId: 'ses-lejana', proximaInicio: new Date(Date.now() + 86_400_000).toISOString(),
  ultimaFecha: enDias(90), clasesFuturas: 12, renovacionAutomatica: true, noRenovar: false, plazasFijas: [], ...o,
});
const HORARIO = {
  ok: true,
  dias: [
    { diaSemana: 1, tarjetas: [tarjeta({ serieId: 'serie-lunes', diaSemana: 1, hora: '09:30', tipoClaseId: 'tc-mat' })] },
    { diaSemana: 2, tarjetas: [tarjeta()] },
  ],
  huerfanas: [],
};

const OFERTA = {
  id: 'cf-1', nombre: 'Reformer · martes', descripcion: null, activa: true, duracionesMeses: [1, 3, 6], plazas: null,
  franjas: [{ serieId: 'serie-e2e', diaSemana: 2, resuelta: true }],
  estado: 'DISPONIBLE', plazasLibres: 6, programadaHasta: enDias(90), pendientes: 0,
};

interface Servidor {
  ofertas: typeof OFERTA[];
  escrituras: { metodo: string; cuerpo: Record<string, unknown> }[];
  lecturas: number;
  /** Lo que contesta a una escritura; por defecto, guardado. */
  respuestaEscritura: { status: number; body: unknown };
}

async function abrirHorario(page: Page, inicial: typeof OFERTA[] = []): Promise<Servidor> {
  await montar(page);
  const s: Servidor = { ofertas: inicial, escrituras: [], lecturas: 0, respuestaEscritura: { status: 200, body: { ok: true, id: 'cf-nueva' } } };
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  await page.route('**/api/calendario/horario', r => json(r, HORARIO));
  await page.route('**/api/clases-fijas', r => {
    const metodo = r.request().method();
    if (metodo === 'GET') { s.lecturas++; return json(r, { ok: true, clases: s.ofertas }); }
    s.escrituras.push({ metodo, cuerpo: r.request().postDataJSON() as Record<string, unknown> });
    return json(r, s.respuestaEscritura.body, s.respuestaEscritura.status);
  });
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
  return s;
}

test.describe('Horario · clases fijas', () => {
  test('sin ninguna, lo explica y deja crear la primera', async ({ page }) => {
    const s = await abrirHorario(page);
    const seccion = page.getByTestId('clases-fijas-seccion');
    await expect(seccion).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clases-fijas-vacio')).toContainText('Todavía no has creado ninguna');
    await expect(seccion.getByText(/Ofrece a tus clientas una clase fija/)).toBeVisible();
    await expect(seccion.getByRole('button', { name: 'Crear clase fija' })).toBeVisible();
    expect(s.lecturas).toBeGreaterThan(0);
  });

  test('se crea eligiendo clases que ya se repiten: el cuerpo lleva serie y día, y la lista se recarga', async ({ page }) => {
    const s = await abrirHorario(page);
    await page.getByTestId('clases-fijas-seccion').getByRole('button', { name: 'Crear clase fija' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Crear clase fija').first()).toBeVisible();

    // Sin nombre ni clases, no se puede guardar.
    const guardar = dialogo.getByRole('button', { name: 'Crear clase fija' });
    await expect(guardar).toBeDisabled();

    await dialogo.getByLabel('Nombre').fill('  Reformer · martes  ');
    await expect(guardar).toBeDisabled();
    await dialogo.getByRole('checkbox').nth(1).check(); // el martes 18:00 (lunes va primero)
    await dialogo.getByRole('button', { name: '1 año' }).click();
    await expect(guardar).toBeEnabled();

    // Al guardar, la lista que vuelve trae la nueva.
    s.ofertas = [OFERTA];
    await guardar.click();
    await expect(page.getByTestId('clase-fija')).toHaveCount(1, { timeout: 30_000 });
    // La lista que vuelve es la del servidor (el mock no la deriva del cuerpo): lo que se eligió se comprueba abajo, en lo que salió.
    await expect(page.getByTestId('clase-fija')).toContainText('se ofrece 1 mes, 3 meses, 6 meses');

    expect(s.escrituras.length, 'la escritura sale hacia el servidor').toBeGreaterThan(0);
    expect(s.escrituras[0].metodo).toBe('POST');
    expect(s.escrituras[0].cuerpo).toMatchObject({
      nombre: 'Reformer · martes', duracionesMeses: [1, 3, 6, 12], plazas: null,
      franjas: [{ serieId: 'serie-e2e', diaSemana: 2 }],
    });
    // Ninguna hora ni sala tecleadas: la oferta sale del horario vivo.
    expect(JSON.stringify(s.escrituras[0].cuerpo)).not.toMatch(/horaInicio|salaId/);
  });

  test('si el servidor dice que no, el diálogo sigue abierto con su motivo y la lista no cambia', async ({ page }) => {
    const s = await abrirHorario(page);
    s.respuestaEscritura = { status: 409, body: { error: 'Alguna de las clases elegidas ya no se repite en el horario. Recarga y elígelas de nuevo.' } };
    await page.getByTestId('clases-fijas-seccion').getByRole('button', { name: 'Crear clase fija' }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre').fill('Reformer · martes');
    await dialogo.getByRole('checkbox').nth(1).check();
    await dialogo.getByRole('button', { name: 'Crear clase fija' }).click();

    await expect(dialogo.getByRole('alert')).toContainText('ya no se repite en el horario', { timeout: 30_000 });
    expect(s.escrituras.length, 'el camino de fallo sí intentó guardar').toBeGreaterThan(0);
    await expect(page.getByTestId('clase-fija')).toHaveCount(0);
  });

  test('se puede cerrar y reabrir: solo cambia `activa`, y las plazas ya dadas no se tocan', async ({ page }) => {
    const s = await abrirHorario(page, [{ ...OFERTA, pendientes: 2 }]);
    const oferta = page.getByTestId('clase-fija');
    await expect(oferta).toBeVisible({ timeout: 30_000 });
    await expect(oferta).toContainText('2 peticiones por decidir');
    await expect(page.getByText(/las plazas que ya diste no se tocan/)).toBeVisible();

    s.ofertas = [{ ...OFERTA, activa: false, estado: 'CERRADA' }];
    await oferta.getByRole('button', { name: 'Cerrar Reformer · martes' }).click();
    await expect(oferta.getByText('Cerrada', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(s.escrituras.length).toBeGreaterThan(0);
    expect(s.escrituras[0]).toEqual({ metodo: 'PATCH', cuerpo: { id: 'cf-1', activa: false } });
    await expect(oferta.getByRole('button', { name: 'Reabrir Reformer · martes' })).toBeVisible();
  });

  test('una franja cuya serie ya no tiene clases se avisa, y las plazas libres no bajan de cero', async ({ page }) => {
    await abrirHorario(page, [{
      ...OFERTA, estado: 'SIN_CLASES', plazasLibres: -2,
      franjas: [{ serieId: 'serie-e2e', diaSemana: 2, resuelta: true }, { serieId: 'serie-vieja', diaSemana: 4, resuelta: false }],
    }]);
    const oferta = page.getByTestId('clase-fija');
    await expect(oferta).toContainText('ya no tiene clases programadas', { timeout: 30_000 });
    await expect(oferta).toContainText('0 plazas libres');
    await expect(oferta.getByText('Sin clases programadas')).toBeVisible();
  });
});

test.describe('Inicio · petición de una clase fija', () => {
  const PETICION = {
    id: 'spf-1', tipo: 'CREAR_CLASE_FIJA', socioId: 'soc-1', socia: 'María García', franja: 'Clase fija «Reformer · martes»',
    superaLimite: false, desde: null, hasta: null, motivoSistema: null, creadaEn: '2026-09-21T09:00:00Z',
    claseFija: { nombre: 'Reformer · martes', duracion: '3 meses', hasta: '21/12', aviso: null as string | null },
  };

  async function abrirInicio(page: Page, peticion: typeof PETICION, decision: { status: number; body: unknown }) {
    await montar(page);
    const decisiones: Record<string, unknown>[] = [];
    await page.route('**/api/plazas-fijas/solicitudes**', r => {
      if (r.request().method() === 'GET') return json(r, { peticiones: [peticion] });
      decisiones.push(r.request().postDataJSON() as Record<string, unknown>);
      return json(r, decision.body, decision.status);
    });
    await ir(page, 'dashboard');
    return decisiones;
  }

  test('sale con lo que pidió y, al aprobarla, pasa por la misma decisión que las demás', async ({ page }) => {
    const decisiones = await abrirInicio(page, PETICION, { status: 200, body: { ok: true, mensaje: 'Clase fija dada' } });
    const bandeja = page.getByTestId('plazas-fijas-por-decidir');
    await expect(bandeja).toBeVisible({ timeout: 30_000 });
    await expect(bandeja).toContainText('María García · Clase fija «Reformer · martes»');
    await expect(bandeja).toContainText('Pide una clase fija');
    await expect(bandeja).toContainText('Durante 3 meses, hasta el 21/12.');

    await bandeja.getByRole('button', { name: 'Dar la clase fija' }).click();
    await expect(bandeja).toBeHidden({ timeout: 30_000 });
    expect(decisiones.length, 'la decisión sale hacia el servidor').toBeGreaterThan(0);
    expect(decisiones[0]).toMatchObject({ id: 'spf-1', aprobar: true, confirmarLimite: false });
  });

  test('si la clase fija está completa se le avisa a la propietaria antes de aprobar', async ({ page }) => {
    await abrirInicio(page, { ...PETICION, claseFija: { ...PETICION.claseFija, aviso: 'La clase fija está completa: si la aprueba, pasa del tope de plazas.' } }, { status: 200, body: { ok: true, mensaje: 'x' } });
    await expect(page.getByTestId('plazas-fijas-por-decidir')).toContainText('La clase fija está completa: si la aprueba, pasa del tope de plazas.', { timeout: 30_000 });
  });

  test('si pasaría del límite semanal de su cuota, el servidor lo dice y hay que confirmarlo', async ({ page }) => {
    const decisiones = await abrirInicio(page, PETICION, { status: 409, body: { error: 'Su cuota es de 2 clases por semana y con esta clase fija pasaría.', codigo: 'SUPERA_LIMITE' } });
    const bandeja = page.getByTestId('plazas-fijas-por-decidir');
    await bandeja.getByRole('button', { name: 'Dar la clase fija' }).click({ timeout: 30_000 });
    await expect(bandeja.getByRole('button', { name: 'Dar la clase fija igualmente' })).toBeVisible({ timeout: 30_000 });
    await expect(bandeja).toContainText('Pasaría del límite de clases por semana de su cuota.');
    expect(decisiones.length).toBeGreaterThan(0);
  });

  test('rechazarla manda su motivo', async ({ page }) => {
    const decisiones = await abrirInicio(page, PETICION, { status: 200, body: { ok: true, mensaje: 'Petición rechazada' } });
    const bandeja = page.getByTestId('plazas-fijas-por-decidir');
    await bandeja.getByLabel(/Motivo si no la apruebas/).fill('Ahora mismo no hay sitio');
    await bandeja.getByRole('button', { name: 'No aprobar' }).click({ timeout: 30_000 });
    await expect(bandeja).toBeHidden({ timeout: 30_000 });
    expect(decisiones[0]).toMatchObject({ id: 'spf-1', aprobar: false, motivo: 'Ahora mismo no hay sitio' });
  });
});
