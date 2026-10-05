import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Analizar ahora» sabe cuándo termina.
//
// Antes, tras el 202 la pantalla recargaba a ciegas a los 4 s, cuando un
// análisis tarda de media un minuto: recargaba sobre el análisis anterior y
// nunca se enteraba de cuándo terminaba el nuevo. Ahora POST /analizar crea la
// sesión antes de enviar el evento, GET /api/decisiones dice `analisisEnCurso`
// y la pantalla pregunta cada 5 s (GET /api/decisiones/analisis-en-curso, tope
// de 90 s) y recarga cuando termina. El 429 distingue «ya hay uno en marcha»
// (se sigue ese) de «acabo de analizar» (no hay nada que seguir).
//
// Que una sesión FALLIDA deje de contar como en curso lo decide el servidor
// (`finalizado_en`, lib/decision/analisis-en-curso.test.ts); aquí el sondeo
// contesta `false` y la pantalla recarga igual que con una que terminó bien.
//
// Andamiaje: `panel-sembrado.ts`, y DESPUÉS de montarlo los mocks de esta suite.
// El reloj de la página va con `page.clock.install()` y se adelanta a mano.
// ─────────────────────────────────────────────────────────────────────────────

const TARDANDO = 'Está tardando más de lo normal; te lo enseño cuando termine.';
const YA_EN_MARCHA = 'Ya hay un análisis en marcha: te lo enseño cuando termine.';
const ACABO = 'Acabo de analizar tu estudio. Podrás pedirme otro en unos minutos.';
const NO_SE_PUDO = 'No he podido poner en marcha el análisis. Vuelve a intentarlo en un momento.';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

interface Escenario {
  /** Lo que dice GET /api/decisiones en cada carga (la última se repite). */
  enCursoAlCargar: boolean[];
  /** Lo que dice el sondeo en cada pregunta (la última se repite). */
  sondeo: boolean[];
  /** Respuesta de POST /analizar. */
  analizar?: { status: number; body: unknown };
}

async function centro(page: Page, e: Escenario) {
  await page.clock.install();
  await montar(page);
  const cuenta = { cargas: 0, sondeos: 0, analizar: 0 };
  await page.route((u) => u.pathname === '/api/decisiones', (r) => {
    const enCurso = e.enCursoAlCargar[Math.min(cuenta.cargas, e.enCursoAlCargar.length - 1)];
    cuenta.cargas++;
    return json(r, {
      resumen: { saludo: 'Buenas tardes', mientrasDormias: [], nDecisiones: 0, tiempoEstimadoMin: 0, impactoTotal: null, generadoEn: new Date().toISOString() },
      veredicto: { tipo: 'SILENCIO', recomendacion: null, fraseConfianza: null, semanaTranquila: false },
      seguimiento: [], prioridades: [], masSituaciones: [], porEspecialista: [], actividad: [],
      nAutonomasHoy: 0, nAutonomasFallidasHoy: 0, analisisEnCurso: enCurso,
    });
  });
  await page.route((u) => u.pathname === '/api/decisiones/analisis-en-curso', (r) => {
    const enCurso = e.sondeo[Math.min(cuenta.sondeos, e.sondeo.length - 1)];
    cuenta.sondeos++;
    return json(r, { analisisEnCurso: enCurso });
  });
  await page.route((u) => u.pathname === '/api/decisiones/analizar', (r) => {
    cuenta.analizar++;
    const resp = e.analizar ?? { status: 202, body: { ok: true, sessionId: 'ds-manual' } };
    return json(r, resp.body, resp.status);
  });
  return cuenta;
}

/** Adelanta el reloj de la página de 5 en 5 s (lo que espera el sondeo) hasta que se cumpla `listo`. */
async function adelantarHasta(page: Page, listo: () => boolean | Promise<boolean>) {
  await expect.poll(async () => {
    if (!(await listo())) await page.clock.fastForward(5_000);
    return listo();
  }, { timeout: 60_000, intervals: [250] }).toBe(true);
}

const boton = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });

test('con un análisis en marcha al entrar, sin pulsar nada: pregunta, y al terminar recarga', async ({ page }) => {
  const cuenta = await centro(page, { enCursoAlCargar: [true, false], sondeo: [true, false] });
  await ir(page, 'centro-de-control');

  await expect(boton(page, 'Analizando…')).toBeDisabled({ timeout: 30_000 });
  expect(cuenta.analizar).toBe(0);
  const cargas = cuenta.cargas;
  await adelantarHasta(page, () => cuenta.sondeos >= 2 && cuenta.cargas > cargas);
  await expect(boton(page, 'Analizar ahora')).toBeEnabled();
  // Terminado: deja de preguntar.
  const sondeos = cuenta.sondeos;
  await page.clock.fastForward(20_000);
  expect(cuenta.sondeos).toBe(sondeos);
});

test('si se agota el tope sin terminar, dice que está tardando (y no que ha terminado)', async ({ page }) => {
  const cuenta = await centro(page, { enCursoAlCargar: [true], sondeo: [true] });
  await ir(page, 'centro-de-control');

  await expect(boton(page, 'Analizando…')).toBeVisible({ timeout: 30_000 });
  const cargas = cuenta.cargas;
  await adelantarHasta(page, async () => (await page.getByText(TARDANDO).count()) > 0);
  expect(cuenta.sondeos).toBeGreaterThan(10);
  await expect(boton(page, 'Analizar ahora')).toBeEnabled();
  // Ninguna recarga: no ha terminado.
  expect(cuenta.cargas).toBe(cargas);
});

test('«Analizar ahora»: el botón dice «Analizando…» mientras dura, y al terminar recarga', async ({ page }) => {
  const cuenta = await centro(page, { enCursoAlCargar: [false], sondeo: [true, false] });
  await ir(page, 'centro-de-control');

  await boton(page, 'Analizar ahora').click({ timeout: 30_000 });
  await expect(boton(page, 'Analizando…')).toBeDisabled();
  expect(cuenta.analizar).toBe(1);
  const cargas = cuenta.cargas;
  await adelantarHasta(page, () => cuenta.cargas > cargas);
  expect(cuenta.sondeos).toBeGreaterThanOrEqual(2);
  await expect(boton(page, 'Analizar ahora')).toBeEnabled();
});

test('429 sin ninguno en marcha: «acabo de analizar», y no se queda preguntando', async ({ page }) => {
  const cuenta = await centro(page, {
    enCursoAlCargar: [false], sondeo: [false],
    analizar: { status: 429, body: { error: ACABO, enCurso: false } },
  });
  await ir(page, 'centro-de-control');

  await boton(page, 'Analizar ahora').click({ timeout: 30_000 });
  await expect(page.getByText(ACABO)).toBeVisible();
  expect(cuenta.analizar).toBe(1);
  // Una pregunta para distinguir el 429, y ninguna más.
  expect(cuenta.sondeos).toBe(1);
  await page.clock.fastForward(20_000);
  expect(cuenta.sondeos).toBe(1);
  await expect(boton(page, 'Analizar ahora')).toBeEnabled();
  await expect(page.getByText(YA_EN_MARCHA)).toHaveCount(0);
});

test('429 con uno en marcha: «ya hay uno en marcha», y se sigue ese', async ({ page }) => {
  const cuenta = await centro(page, {
    enCursoAlCargar: [false], sondeo: [true, true, false],
    analizar: { status: 429, body: { error: YA_EN_MARCHA, enCurso: true } },
  });
  await ir(page, 'centro-de-control');

  await boton(page, 'Analizar ahora').click({ timeout: 30_000 });
  await expect(page.getByText(YA_EN_MARCHA)).toBeVisible();
  await expect(boton(page, 'Analizando…')).toBeDisabled();
  expect(cuenta.analizar).toBe(1);
  const cargas = cuenta.cargas;
  await adelantarHasta(page, () => cuenta.cargas > cargas);
  expect(cuenta.sondeos).toBeGreaterThanOrEqual(3);
  await expect(page.getByText(ACABO)).toHaveCount(0);
});

test('si el análisis no se puede poner en marcha (502), lo dice y no pregunta por nada', async ({ page }) => {
  const cuenta = await centro(page, {
    enCursoAlCargar: [false], sondeo: [true],
    analizar: { status: 502, body: { error: NO_SE_PUDO } },
  });
  await ir(page, 'centro-de-control');

  await boton(page, 'Analizar ahora').click({ timeout: 30_000 });
  await expect(page.getByText(NO_SE_PUDO)).toBeVisible();
  expect(cuenta.analizar).toBeGreaterThan(0);
  await page.clock.fastForward(20_000);
  expect(cuenta.sondeos).toBe(0);
  await expect(boton(page, 'Analizar ahora')).toBeEnabled();
});
