import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Clases fijas con nombre, en el panel. Se retiraron el 4-oct-2026: el Horario ya
// no las crea. Lo que queda es la bandeja de Inicio, por si quedaba alguna petición
// pendiente de antes: aprobarla pasa por la misma decisión que las demás. Cada camino que escribe lleva contador
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

/** Abre el Horario contando si alguien sigue pidiendo las ofertas a su API (retirada). */
async function abrirHorario(page: Page): Promise<{ lecturas: number }> {
  await montar(page);
  const s = { lecturas: 0 };
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  await page.route('**/api/calendario/horario', r => json(r, HORARIO));
  await page.route('**/api/clases-fijas', r => { s.lecturas++; return json(r, { ok: true, clases: [] }); });
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
  return s;
}

// Las clases fijas con nombre se retiraron el 4-oct-2026: el Horario ya no las crea ni las lista, y no se pide nada a su API.
test.describe('Horario · sin clases fijas con nombre', () => {
  test('el Horario enseña las clases que se repiten, sin la sección de clases fijas con nombre ni su API', async ({ page }) => {
    const s = await abrirHorario(page);
    await expect(page.getByText('18:00').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('clases-fijas-seccion')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Agrupar con nombre/ })).toHaveCount(0);
    expect(s.lecturas, 'ya no se piden las ofertas').toBe(0);
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

  // Ampliar (Fase 2): hermana de CREAR_CLASE_FIJA — no compite por cupo, así que su
  // aviso habla de «Ampliarla», nunca de «Durante», y el botón dice «Ampliarla».
  const PETICION_AMPLIAR = {
    ...PETICION, id: 'spf-2', tipo: 'AMPLIAR_CLASE_FIJA', franja: 'Clase fija «Reformer · martes»',
    claseFija: { nombre: 'Reformer · martes', duracion: '3 meses', hasta: '21/12', aviso: null as string | null },
  };

  test('pide ampliar su clase fija, y aprobarla pasa por la misma decisión que las demás', async ({ page }) => {
    const decisiones = await abrirInicio(page, PETICION_AMPLIAR, { status: 200, body: { ok: true, mensaje: 'Clase fija ampliada' } });
    const bandeja = page.getByTestId('plazas-fijas-por-decidir');
    await expect(bandeja).toContainText('Pide ampliar su clase fija', { timeout: 30_000 });
    await expect(bandeja).toContainText('Ampliarla 3 meses más, hasta el 21/12.');

    await bandeja.getByRole('button', { name: 'Ampliarla' }).click();
    await expect(bandeja).toBeHidden({ timeout: 30_000 });
    expect(decisiones.length).toBeGreaterThan(0);
    expect(decisiones[0]).toMatchObject({ id: 'spf-2', aprobar: true, confirmarLimite: false });
  });

  test('si ampliarla pasaría del límite semanal de su cuota, hay que confirmarlo', async ({ page }) => {
    const decisiones = await abrirInicio(page, PETICION_AMPLIAR, {
      status: 409, body: { error: 'Su cuota es de 2 clases por semana y con esta ampliación pasaría.', codigo: 'SUPERA_LIMITE' },
    });
    const bandeja = page.getByTestId('plazas-fijas-por-decidir');
    await bandeja.getByRole('button', { name: 'Ampliarla' }).click({ timeout: 30_000 });
    await expect(bandeja.getByRole('button', { name: 'Ampliarla igualmente' })).toBeVisible({ timeout: 30_000 });
    await expect(bandeja).toContainText('Pasaría del límite de clases por semana de su cuota.');
    expect(decisiones.length).toBeGreaterThan(0);
  });
});
