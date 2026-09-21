import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Las clases del mes en «Equipo → Tiempo trabajado», y lo que cambian en
// Liquidaciones:
//   · sin confirmar, «dijo no darla» y fuera de jornada se ven de un vistazo;
//   · dar por dadas en bloque, corregir y marcar revisada piden motivo y solo
//     pintan lo que el servidor confirma (con contador de intentos en el fallo);
//   · una liquidación con clases sin confirmar no se puede confirmar.
// API simulada: qué se guarda y quién puede lo cubren lib/fichaje/clases-equipo
// y lib/equipo/liquidacion-horas-fichadas (tests de node).
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// Horas de Madrid (UTC+2 en septiembre).
const clase = (id: string, dia: number, estado: string, extra: Record<string, unknown> = {}) => ({
  sesionId: id, instructorId: 'ins-marta', nombre: 'Mat Pilates',
  inicio: `2026-09-${dia}T16:00:00.000Z`, fin: `2026-09-${dia}T16:55:00.000Z`, estado,
  origen: null, inicioReal: null, finReal: null, retrasoMin: 0, porJornada: false, fueraDeJornada: false, revisada: false, ...extra,
});

function inicial() {
  return [
    clase('c-tarde', 23, 'DADA', { origen: 'BOTON', inicioReal: '2026-09-23T16:12:00.000Z', retrasoMin: 12 }),
    clase('c-fuera', 24, 'DADA', { origen: 'LISTA', inicioReal: '2026-09-24T16:00:00.000Z', fueraDeJornada: true }),
    clase('c-nodada', 25, 'NO_DADA', { origen: 'CONFIRMACION' }),
    clase('c-olv1', 26, 'SIN_CONFIRMAR'),
    clase('c-olv2', 27, 'SIN_CONFIRMAR'),
  ];
}

function resumen(clases: ReturnType<typeof inicial>) {
  return [{
    instructorId: 'ins-marta',
    dadas: clases.filter((c) => c.estado === 'DADA').length,
    minutosDados: 55 * clases.filter((c) => c.estado === 'DADA').length,
    sinConfirmar: clases.filter((c) => c.estado === 'SIN_CONFIRMAR').length,
    noDadasPorRevisar: clases.filter((c) => c.estado === 'NO_DADA' && !c.revisada).length,
    fueraDeJornada: clases.filter((c) => c.fueraDeJornada).length,
  }];
}

async function abrir(page: Page, opts: { relacion?: string | null; patchFalla?: boolean } = {}) {
  const patches: Record<string, unknown>[] = [];
  let clases = inicial();
  await montar(page);
  await page.route((u) => u.pathname === '/api/equipo/tarifas', (r) => json(r, {
    items: [{ instructorId: 'ins-marta', tarifaHora: 20, baseMensualEur: null, recargoSustitucionPct: null, horasSemanalesContrato: null, relacionLaboral: opts.relacion ?? 'CONTRATADA' }],
  }));
  await page.route((u) => u.pathname === '/api/equipo/jornadas', (r) => json(r, { jornadas: [], cambios: {}, resumen: [] }));
  await page.route((u) => u.pathname === '/api/equipo/clases', (r) => {
    if (r.request().method() === 'PATCH') {
      const cuerpo = r.request().postDataJSON() as { accion: string; items?: { sesionId: string; estado: string }[]; sesionId?: string };
      patches.push(cuerpo);
      if (opts.patchFalla) return json(r, { error: 'Ese horario está demasiado lejos del de la clase.' }, 400);
      if (cuerpo.accion === 'revisar') clases = clases.map((c) => (c.sesionId === cuerpo.sesionId ? { ...c, revisada: true } : c));
      for (const it of cuerpo.items ?? []) {
        clases = clases.map((c) => (c.sesionId === it.sesionId ? { ...c, estado: it.estado, origen: 'PROPIETARIA', revisada: true } : c));
      }
      return json(r, { ok: true, corregidas: 1 });
    }
    return json(r, {
      clases,
      cambios: { 'c-tarde': [{ accion: 'EMPEZADA', campo: null, antes: null, despues: null, motivo: null, en: '2026-09-23T16:12:00.000Z', por: 'Marta Ruiz' }] },
      resumen: resumen(clases),
    });
  });
  await ir(page, 'equipo/tiempo-trabajado');
  return { patches };
}

const tarjeta = (page: Page) => page.getByTestId('tiempo-instructora').filter({ hasText: 'Marta Ruiz' });

test.describe('Clases del mes en Tiempo trabajado', () => {
  test('se ve de un vistazo qué falta revisar, y cada clase cuenta cómo fue', async ({ page }) => {
    await abrir(page);
    const t = tarjeta(page);
    await expect(t.getByTestId('chip-sin-confirmar')).toHaveText('2 clases sin confirmar', { timeout: 30_000 });
    await expect(t).toContainText('1 clase que dijo no dar');
    await expect(t).toContainText('1 clase fuera de jornada');
    await expect(t).toContainText('Contratada');
    await expect(t.getByTestId('aviso-sin-confirmar')).toContainText('no se puede cerrar su liquidación');
    await t.getByRole('button', { name: 'Ver 5 clases' }).click();
    const filas = t.getByTestId('clase-mes');
    await expect(filas).toHaveCount(5);
    await expect(filas.first()).toContainText('la empezó en la app · empezó 12 min tarde');
    await expect(filas.nth(1)).toContainText('Fuera de jornada');
    await expect(filas.nth(2)).toContainText('Dijo no darla');
    await expect(filas.nth(2)).toContainText('No se le paga');
    await filas.first().getByRole('button', { name: 'Historial' }).click();
    await expect(t.getByTestId('historial-clase')).toContainText('La empezó por Marta Ruiz');
  });

  test('dar por dadas las sin confirmar: pide motivo, envía las dos y el aviso se va', async ({ page }) => {
    const { patches } = await abrir(page);
    const t = tarjeta(page);
    page.once('dialog', (d) => void d.accept('Las dio, lo he visto'));
    await t.getByRole('button', { name: 'Dar por dadas las 2' }).click({ timeout: 30_000 });
    await expect(page.getByText('Clases dadas por buenas')).toBeVisible({ timeout: 30_000 });
    await expect(t.getByTestId('aviso-sin-confirmar')).toHaveCount(0);
    expect(patches).toEqual([{
      accion: 'corregir', motivo: 'Las dio, lo he visto',
      items: [{ sesionId: 'c-olv1', estado: 'DADA' }, { sesionId: 'c-olv2', estado: 'DADA' }],
    }]);
  });

  test('corregir con otro horario manda la hora del estudio; sin motivo ni se envía', async ({ page }) => {
    const { patches } = await abrir(page);
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 5 clases' }).click({ timeout: 30_000 });
    const fila = t.getByTestId('clase-mes').nth(3);
    await fila.getByRole('button', { name: 'Corregir' }).click();
    await fila.getByLabel('La dio con otro horario').check();
    await fila.getByLabel('Hora a la que empezó').fill('18:20');
    await fila.getByLabel('Hora a la que terminó').fill('19:00');
    await fila.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('Indica el motivo del cambio')).toBeVisible();
    expect(patches).toHaveLength(0);
    await fila.getByPlaceholder('Ej.: la dio, se le olvidó empezarla').fill('Empezó tarde por una alumna');
    await fila.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('Clase corregida')).toBeVisible({ timeout: 30_000 });
    expect(patches).toEqual([{
      accion: 'corregir', motivo: 'Empezó tarde por una alumna',
      items: [{ sesionId: 'c-olv1', estado: 'DADA', inicio: '2026-09-26T16:20:00.000Z', fin: '2026-09-26T17:00:00.000Z' }],
    }]);
  });

  test('«no la di» revisada: sale de los avisos', async ({ page }) => {
    const { patches } = await abrir(page);
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 5 clases' }).click({ timeout: 30_000 });
    await t.getByTestId('clase-mes').nth(2).getByRole('button', { name: 'Revisada' }).click();
    await expect(page.getByText('Marcada como revisada')).toBeVisible({ timeout: 30_000 });
    expect(patches).toEqual([{ accion: 'revisar', sesionId: 'c-nodada' }]);
    await expect(t).not.toContainText('1 clase que dijo no dar');
  });

  test('si el servidor dice que no, lo explica y no pinta nada como guardado', async ({ page }) => {
    const { patches } = await abrir(page, { patchFalla: true });
    const t = tarjeta(page);
    page.once('dialog', (d) => void d.accept('x'));
    await t.getByRole('button', { name: 'Dar por dadas las 2' }).click({ timeout: 30_000 });
    await expect(page.getByText('Ese horario está demasiado lejos del de la clase.')).toBeVisible({ timeout: 30_000 });
    expect(patches.length).toBeGreaterThan(0);
    await expect(t.getByTestId('chip-sin-confirmar')).toHaveText('2 clases sin confirmar');
  });

  test('autónoma: sus horas son las de las clases dadas', async ({ page }) => {
    await abrir(page, { relacion: 'AUTONOMA' });
    const t = tarjeta(page);
    await expect(t).toContainText('Horas de clase', { timeout: 30_000 });
    await expect(t.getByTestId('horas-mes')).toHaveText('1 h 50 min');
    await expect(t).toContainText('Autónoma');
  });

  test('CSV de clases, en hora de Madrid', async ({ page }) => {
    await abrir(page);
    await expect(tarjeta(page)).toBeVisible({ timeout: 30_000 });
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV clases' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^clases-impartidas-\d{4}-\d{2}\.csv$/);
    const texto = (await import('node:fs')).readFileSync((await descarga.path())!, 'utf8').replace(/^﻿/, '');
    const lineas = texto.trimEnd().split('\r\n');
    expect(lineas[0]).toBe('Instructora;Fecha;Clase;Horario;Estado;Empezó;Terminó;Retraso (min);Cómo se supo');
    expect(lineas).toContain('Marta Ruiz;2026-09-23;Mat Pilates;18:00-18:55;Dada;18:12;18:55;12;Empezada en la app');
    expect(lineas).toContain('Marta Ruiz;2026-09-26;Mat Pilates;18:00-18:55;Sin confirmar;;;;');
  });

  test('en el móvil, con las clases abiertas y corrigiendo, no se sale de lado', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page);
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 5 clases' }).click({ timeout: 30_000 });
    await t.getByTestId('clase-mes').nth(3).getByRole('button', { name: 'Corregir' }).click();
    await t.getByTestId('clase-mes').nth(3).getByLabel('La dio con otro horario').check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

const LIQ = {
  id: 'liq-1', instructorId: 'ins-marta', periodoAnio: 2026, periodoMes: 9, baseEur: 0,
  nClasesPropias: 4, variablePropiasEur: 73.33, nClasesSustitucion: 0, variableSustitucionEur: 0,
  nPenalizaciones: 0, repartoPenalizacionesEur: 0, nClasesSinTarifa: 0, totalEur: 73.33,
  estado: 'BORRADOR', confirmadaEn: null, pagadaEn: null, referenciaPago: null, generadaEn: '2026-09-30T10:00:00.000Z',
  requiereRevision: false, revisionMotivo: null, modo: 'CLASES', minutosFichados: null, jornadasSinCerrar: 0,
  relacionLaboral: 'CONTRATADA', clasesSinConfirmar: 2, clasesNoDadas: 1, minutosRetraso: 12, minutosContrato: 5143, minutosExtra: 90,
};

async function abrirLiquidaciones(page: Page, liq: Record<string, unknown>, opts: { pagarDuracionReal?: boolean } = {}) {
  const puts: unknown[] = [];
  await montar(page);
  await page.route((u) => u.pathname === '/api/equipo/tarifas', (r) => json(r, { items: [] }));
  await page.route((u) => u.pathname === '/api/equipo/jornadas', (r) => json(r, { jornadas: [], cambios: {}, resumen: [] }));
  await page.route((u) => u.pathname === '/api/equipo/liquidaciones', (r) => json(r, { items: [liq] }));
  await page.route((u) => u.pathname === '/api/equipo/liquidacion-modo', (r) => {
    if (r.request().method() === 'PUT') { puts.push(r.request().postDataJSON()); return json(r, { ok: true }); }
    return json(r, { modo: 'CLASES', pagarDuracionReal: opts.pagarDuracionReal ?? false, puedeCambiar: true });
  });
  await ir(page, 'equipo/liquidaciones');
  return { puts };
}

test.describe('Clases en la liquidación', () => {
  test('con clases sin confirmar avisa y no deja confirmar; enseña las no dadas, el retraso y las horas extra', async ({ page }) => {
    await abrirLiquidaciones(page, LIQ);
    await expect(page.getByTestId('clases-sin-confirmar-liq')).toContainText('2 clases de este mes terminaron sin saberse si las dio', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await expect(page.getByTestId('clases-no-dadas-liq')).toHaveText('Una clase que dijo no dar no se paga.');
    await expect(page.getByTestId('retraso-liq')).toContainText('12 min en total este mes (no se descuentan');
    await expect(page.getByTestId('extra-liq')).toContainText('Contrato: 86 h este mes. Ha fichado 1 h 30 min de más: se enseñan, no se pagan aparte.');
  });

  test('sin nada pendiente se confirma', async ({ page }) => {
    await abrirLiquidaciones(page, { ...LIQ, clasesSinConfirmar: 0 });
    await expect(page.getByTestId('clases-no-dadas-liq')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clases-sin-confirmar-liq')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  test('la propietaria elige pagar lo que duró cada clase, tras un aviso', async ({ page }) => {
    const { puts } = await abrirLiquidaciones(page, LIQ);
    const sel = page.getByLabel('Pagar cada clase por');
    await expect(sel).toHaveValue('horario', { timeout: 30_000 });
    await expect(page.getByTestId('criterio-duracion')).toContainText('no se descuenta');
    page.once('dialog', (d) => { expect(d.message()).toContain('se paga menos'); void d.accept(); });
    await sel.selectOption('real');
    await expect(sel).toHaveValue('real');
    await expect(page.getByTestId('criterio-duracion')).toContainText('Un retraso se descuenta');
    await expect(page.getByTestId('retraso-liq')).toContainText('(descontados)');
    expect(puts).toEqual([{ pagarDuracionReal: true }]);
  });
});
