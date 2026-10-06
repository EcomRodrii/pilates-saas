import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti en el veredicto del día, en lugar del anillo (decisión del fundador,
// 5-oct). Lo decide `estadoDelVeredicto` (lib/tenti/momentos.ts), y aquí se
// mira que el dato llega a la cara:
//   · día sin mensaje → la firma ('reposo'), y el anillo ya no está;
//   · el piloto intentó algo hoy y no salió → 'error';
//   · «Analizar ahora» en marcha → 'pensando'; al terminar, 'hecho' breve y
//     vuelta a la firma;
//   · el mensaje del día te pregunta ('pregunta')… salvo si aprobarlo cobra:
//     ahí NO hay Tenti (una cara junto a «Cobrar ahora» se lee como manipulación).
// Andamiaje: `panel-sembrado.ts`, y DESPUÉS de montarlo los mocks de esta suite.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const rec = (o: Record<string, unknown> & { id: string; titulo: string }) => ({
  studioId: STUDIO_ID, decisionSessionId: 'ds-1', algorithmVersion: 'v1', dedupeKey: `k:${o.id}`,
  especialista: 'AGENDA', tipo: 'FUSIONAR_SESIONES', motivo: 'Lo que ha visto Tentare.',
  datosUsados: {}, riesgo: 'OPORTUNIDAD', impacto: null,
  confianza: { nivel: 'ALTA', evidencia: ['Una evidencia'], autonomiaMaxima: 0 },
  score: 80, prioridad: 'ALTA', nivelAutonomia: 0,
  accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: null, sesionId: null, reciboId: null,
  tiempoEstimadoMin: 5, estado: 'PENDIENTE', vistaEn: null, efecto: 'MARCAR',
  expiraEn: '2099-01-01T00:00:00Z', creadoEn: new Date().toISOString(), resueltoEn: null, resueltoPor: null,
  ...o,
});

const CON_EMAIL = rec({
  id: 'rec-email', titulo: 'Marta lleva tres semanas sin venir', tipo: 'REACTIVAR_SOCIA',
  accion: { tipo: 'ENVIAR_EMAIL' }, socioId: 'soc-1', efecto: 'ENVIAR_EMAIL',
});
const CON_COBRO = rec({
  id: 'rec-cobro', titulo: 'Dos recibos de septiembre siguen sin cobrar', tipo: 'COBRAR_RECIBOS',
  accion: { tipo: 'COBRAR_RECIBOS', reciboIds: ['rec-1', 'rec-2'] }, efecto: 'COBRAR',
});

interface Escenario {
  veredicto: Record<string, unknown>;
  nAutonomasHoy?: number;
  nAutonomasFallidasHoy?: number;
  /** Lo que dice GET /api/decisiones en cada carga (la última se repite). */
  enCursoAlCargar?: boolean[];
  /** Lo que dice el sondeo en cada pregunta (la última se repite). */
  sondeo?: boolean[];
}

async function centro(page: Page, e: Escenario) {
  await montar(page);
  const cuenta = { cargas: 0, sondeos: 0 };
  await page.route((u) => u.pathname === '/api/decisiones', (r) => {
    const en = e.enCursoAlCargar ?? [false];
    const enCurso = en[Math.min(cuenta.cargas, en.length - 1)];
    cuenta.cargas++;
    return json(r, {
      resumen: { saludo: 'Buenas tardes', mientrasDormias: [], nDecisiones: 1, tiempoEstimadoMin: 5, impactoTotal: null, generadoEn: new Date().toISOString() },
      seguimiento: [], porEspecialista: [], actividad: [], prioridades: [], masSituaciones: [],
      nAutonomasHoy: e.nAutonomasHoy ?? 0, nAutonomasFallidasHoy: e.nAutonomasFallidasHoy ?? 0, analisisEnCurso: enCurso,
      veredicto: { recomendacion: null, fraseConfianza: null, semanaTranquila: false, ...e.veredicto },
    });
  });
  await page.route((u) => u.pathname === '/api/decisiones/analisis-en-curso', (r) => {
    const s = e.sondeo ?? [false];
    const enCurso = s[Math.min(cuenta.sondeos, s.length - 1)];
    cuenta.sondeos++;
    return json(r, { analisisEnCurso: enCurso });
  });
  return cuenta;
}

const veredicto = (page: Page, titulo: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { level: 2, name: titulo }) });

test('día sin mensaje: la firma, y el anillo ya no está', async ({ page }) => {
  const cuenta = await centro(page, { veredicto: { tipo: 'SILENCIO' }, nAutonomasHoy: 2 });
  await ir(page, 'centro-de-control');
  const v = veredicto(page, 'Hoy no te interrumpo con nada.');
  await expect(v).toBeVisible({ timeout: 60_000 });
  expect(cuenta.cargas).toBeGreaterThan(0);
  await expect(v.locator('[data-tenti-icono]')).toHaveCount(1);
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
  await expect(v.locator('[data-tenti-icono] canvas[data-tenti]')).toHaveAttribute('data-estado', 'reposo', { timeout: 30_000 });
  // El anillo de 32 px con borde de color, fuera.
  await expect(v.locator('div.rounded-full[style*="border"]')).toHaveCount(0);
});

test('el piloto no pudo con algo hoy: error (y el texto dice dónde verlo)', async ({ page }) => {
  await centro(page, { veredicto: { tipo: 'SILENCIO' }, nAutonomasHoy: 2, nAutonomasFallidasHoy: 1 });
  await ir(page, 'centro-de-control');
  const v = veredicto(page, 'Hoy no te interrumpo con nada.');
  await expect(v).toBeVisible({ timeout: 60_000 });
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'error');
});

test('el mensaje del día te pregunta (se puede no contestar: nada se para)', async ({ page }) => {
  await centro(page, { veredicto: { tipo: 'MENSAJE', recomendacion: CON_EMAIL } });
  await ir(page, 'centro-de-control');
  const v = veredicto(page, CON_EMAIL.titulo);
  await expect(v).toBeVisible({ timeout: 60_000 });
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'pregunta');
});

test('con «Cobrar ahora», el veredicto va sin cara', async ({ page }) => {
  await centro(page, { veredicto: { tipo: 'MENSAJE', recomendacion: CON_COBRO } });
  await ir(page, 'centro-de-control');
  const v = veredicto(page, CON_COBRO.titulo);
  await expect(v).toBeVisible({ timeout: 60_000 });
  await expect(v.getByRole('button', { name: /Cobrar/ }).first()).toBeVisible();
  await expect(v.locator('[data-tenti-icono]')).toHaveCount(0);
});

test('con un análisis en marcha, piensa; al terminar, hecho breve, y vuelve a la firma', async ({ page }) => {
  await page.clock.install();
  const cuenta = await centro(page, { veredicto: { tipo: 'SILENCIO' }, enCursoAlCargar: [true, false], sondeo: [true, false] });
  await ir(page, 'centro-de-control');
  const v = veredicto(page, 'Hoy no te interrumpo con nada.');
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'pensando', { timeout: 60_000 });

  const cargas = cuenta.cargas;
  await expect.poll(async () => {
    if (cuenta.cargas <= cargas) await page.clock.fastForward(5_000);
    return cuenta.cargas > cargas;
  }, { timeout: 60_000, intervals: [250] }).toBe(true);
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'hecho');
  await page.clock.fastForward(2_000);
  await expect(v.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
});
