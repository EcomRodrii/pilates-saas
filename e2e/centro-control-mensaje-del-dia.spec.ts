import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El mensaje del día recuerda que lo aplazaste y deja de decir «todo bien».
//
//   · «Recuérdamelo» quitaba el mensaje de la pantalla y, al recargar, volvía
//     con sus botones como si nadie lo hubiera tocado. Ahora el servidor sabe
//     que se aplazó (`pospuesta_en`) y el veredicto lo dice; la recomendación
//     sigue en el detalle, con sus botones.
//   · Los días sin mensaje decían «Todo bajo control» o «Ya te ocupaste de lo
//     de hoy» sumando como resueltas las que el piloto no consiguió hacer.
//     Ahora: «Hoy no te interrumpo con nada.» y, aparte, lo que no salió.
//   · El «hoy» de la pantalla es el de Madrid: a las 01:30 de Madrid (todavía
//     ayer en UTC) la fecha y lo «nuevo de hoy» no pueden ser los de ayer.
//
// Lo que elige la recomendación del mensaje por su `dedupe_key` vive en el
// servidor y se prueba en lib/decision/mensaje-del-dia.test.ts (aquí la
// respuesta de GET /api/decisiones va mockeada).
//
// Andamiaje: `panel-sembrado.ts`, y DESPUÉS de montarlo los mocks de esta suite
// (gana la última ruta registrada). Toda escritura lleva su contador.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const PROHIBIDAS = /bajo control|nada necesita|ninguna necesita|Ya te ocupaste|Vuelve en un rato/i;

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

const DEL_DIA = rec({ id: 'rec-del-dia', titulo: 'El Mat de los viernes a las 19:00 va medio vacío' });
const OTRA = rec({ id: 'rec-otra', titulo: 'La clase del martes a las 9:00 se llena cada semana', prioridad: 'MEDIA' });

type Veredicto = Record<string, unknown>;

/** GET /api/decisiones con `veredicto`; `cuerpo` permite cambiar la respuesta entre cargas. */
async function centro(page: Page, cuerpo: () => { veredicto: Veredicto; prioridades?: unknown[]; masSituaciones?: unknown[]; nAutonomasHoy?: number; nAutonomasFallidasHoy?: number }) {
  await montar(page);
  const lecturas: string[] = [];
  await page.route((u) => u.pathname === '/api/decisiones', (r) => {
    lecturas.push(r.request().method());
    const c = cuerpo();
    return json(r, {
      resumen: { saludo: 'Buenas tardes', mientrasDormias: [], nDecisiones: 1, tiempoEstimadoMin: 5, impactoTotal: null, generadoEn: new Date().toISOString() },
      seguimiento: [], porEspecialista: [], actividad: [],
      prioridades: [], masSituaciones: [], nAutonomasHoy: 0, nAutonomasFallidasHoy: 0,
      ...c,
      veredicto: { recomendacion: null, fraseConfianza: null, semanaTranquila: false, ...c.veredicto },
    });
  });
  return lecturas;
}

async function contar(page: Page, accion: string, responder: (r: Route) => Promise<void> | void = (r) => json(r, { ok: true })) {
  const llamadas: string[] = [];
  await page.route((u) => new RegExp(`^/api/decisiones/[^/]+/${accion}$`).test(u.pathname), async (r) => {
    llamadas.push(new URL(r.request().url()).pathname);
    await responder(r);
  });
  return llamadas;
}

const veredictoDe = (page: Page, titulo: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { level: 2, name: titulo }) });

test('tras «Recuérdamelo» y recargar, el veredicto dice que lo has dejado para más adelante, sin sus botones', async ({ page }) => {
  let pospuesta = false;
  await centro(page, () => ({
    veredicto: { tipo: 'MENSAJE', recomendacion: DEL_DIA, pospuesta },
    prioridades: [DEL_DIA, OTRA],
  }));
  const posponer = await contar(page, 'posponer', (r) => { pospuesta = true; return json(r, { ok: true }); });
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, DEL_DIA.titulo);
  await expect(v).toBeVisible({ timeout: 30_000 });
  await v.getByRole('button', { name: 'Recuérdamelo' }).click();

  const aplazado = veredictoDe(page, 'Lo has dejado para más adelante.');
  await expect(aplazado).toBeVisible();
  expect(posponer).toEqual(['/api/decisiones/rec-del-dia/posponer']);

  await page.reload();
  await expect(aplazado).toBeVisible({ timeout: 30_000 });
  await expect(aplazado).toContainText(DEL_DIA.titulo);
  await expect(aplazado).toContainText('Sigue en el detalle.');
  for (const boton of ['Hecho', 'Ya lo sé', 'Recuérdamelo']) {
    await expect(aplazado.getByRole('button', { name: boton, exact: true })).toHaveCount(0);
  }
  // Y de verdad sigue en el detalle, con sus botones.
  await aplazado.getByRole('button', { name: 'Sigue en el detalle.' }).click();
  const enDetalle = page.locator('[data-recomendacion="rec-del-dia"]');
  await expect(enDetalle).toBeVisible({ timeout: 30_000 });
  await expect(enDetalle.getByRole('button', { name: 'Hecho', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(PROHIBIDAS);
  // Recargar no vuelve a aplazarla.
  expect(posponer).toHaveLength(1);
});

test('si aplazarla falla, el mensaje sigue con sus botones y se dice por qué', async ({ page }) => {
  await centro(page, () => ({ veredicto: { tipo: 'MENSAJE', recomendacion: DEL_DIA }, prioridades: [DEL_DIA] }));
  const posponer = await contar(page, 'posponer', (r) => json(r, { error: 'No se pudo posponer (¿ya no está pendiente?)' }, 409));
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, DEL_DIA.titulo);
  await expect(v).toBeVisible({ timeout: 30_000 });
  await v.getByRole('button', { name: 'Recuérdamelo' }).click();
  await expect(page.getByText('No se pudo posponer (¿ya no está pendiente?)')).toBeVisible();
  expect(posponer.length).toBeGreaterThan(0);
  await expect(v.getByRole('button', { name: 'Recuérdamelo' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Lo has dejado para más adelante.' })).toHaveCount(0);
});

test('un día de SILENCIO con una acción del piloto que no salió lo dice aparte', async ({ page }) => {
  await centro(page, () => ({ veredicto: { tipo: 'SILENCIO' }, nAutonomasHoy: 2, nAutonomasFallidasHoy: 1 }));
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, 'Hoy no te interrumpo con nada.');
  await expect(v).toBeVisible({ timeout: 30_000 });
  await expect(v).toContainText('Tentare ha resuelto 2 acciones por su cuenta. 1 no salió: lo ves en Actividad.');
  await expect(page.locator('body')).not.toContainText(PROHIBIDAS);
});

test('ninguna rama del veredicto dice que todo está bien', async ({ page }) => {
  const ramas: { nombre: string; veredicto: Veredicto; prioridades?: unknown[]; titulo: RegExp | string }[] = [
    { nombre: 'sin analizar', veredicto: { tipo: 'SIN_ANALIZAR' }, titulo: /Analizo tu estudio cada tarde y el de hoy aún no está/ },
    { nombre: 'silencio', veredicto: { tipo: 'SILENCIO' }, titulo: 'Hoy no te interrumpo con nada.' },
    { nombre: 'silencio con pendientes', veredicto: { tipo: 'SILENCIO' }, prioridades: [OTRA], titulo: 'Tienes 1 sugerencia en seguimiento; la ves en el detalle.' },
    { nombre: 'mensaje sin recomendación', veredicto: { tipo: 'MENSAJE', recomendacion: null }, titulo: 'El mensaje de hoy ya no está pendiente.' },
    { nombre: 'aplazado', veredicto: { tipo: 'MENSAJE', recomendacion: DEL_DIA, pospuesta: true }, prioridades: [DEL_DIA], titulo: 'Lo has dejado para más adelante.' },
  ];
  let actual = ramas[0];
  const lecturas = await centro(page, () => ({ veredicto: actual.veredicto, prioridades: actual.prioridades ?? [] }));
  for (const rama of ramas) {
    actual = rama;
    await ir(page, 'centro-de-control');
    await expect(page.getByText(rama.titulo).first(), rama.nombre).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body'), rama.nombre).not.toContainText(PROHIBIDAS);
  }
  expect(lecturas.length).toBeGreaterThanOrEqual(ramas.length);
});

test('responder al mensaje del día: «Ya respondiste al mensaje de hoy.», solo con el sí del servidor', async ({ page }) => {
  await centro(page, () => ({ veredicto: { tipo: 'MENSAJE', recomendacion: DEL_DIA }, prioridades: [DEL_DIA] }));
  const aprobar = await contar(page, 'aprobar');
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, DEL_DIA.titulo);
  await expect(v).toBeVisible({ timeout: 30_000 });
  await v.getByRole('button', { name: 'Hecho', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Ya respondiste al mensaje de hoy.' })).toBeVisible();
  expect(aprobar).toEqual(['/api/decisiones/rec-del-dia/aprobar']);
  await expect(page.locator('body')).not.toContainText(PROHIBIDAS);
});

test.describe('a las 01:30 de Madrid, con el navegador en UTC', () => {
  test.use({ timezoneId: 'UTC' });

  test('la fecha y lo «nuevo de hoy» son los de Madrid, no los de ayer', async ({ page }) => {
    // 5-oct-2026 01:30 de Madrid = 4-oct 23:30 UTC.
    await page.clock.setFixedTime(new Date('2026-10-04T23:30:00.000Z'));
    // Detectada con «Analizar ahora» a las 00:45 de Madrid (22:45 UTC del 4):
    // es de HOY, así que va como nueva (con botones), no como seguimiento.
    const deEstaNoche = rec({ id: 'rec-noche', titulo: 'La clase del jueves a las 20:00 va medio vacía', prioridad: 'MEDIA', creadoEn: '2026-10-04T22:45:00.000Z' });
    // Y una de verdad de ayer (14:30 UTC del 4), que sí es seguimiento.
    const deAyer = rec({ id: 'rec-ayer', titulo: 'La clase del sábado a las 10:00 va medio vacía', prioridad: 'MEDIA', creadoEn: '2026-10-04T14:30:00.000Z' });
    const lecturas = await centro(page, () => ({ veredicto: { tipo: 'SILENCIO' }, masSituaciones: [deEstaNoche, deAyer] }));
    await ir(page, 'centro-de-control');

    await expect(page.getByText(/lunes, 5 de octubre/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/domingo, 4 de octubre/i)).toHaveCount(0);
    expect(lecturas.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Ver todo el detalle' }).click();
    const noche = page.locator('[data-recomendacion="rec-noche"]');
    await expect(noche).toBeVisible({ timeout: 30_000 });
    await expect(noche.getByRole('button', { name: 'Hecho', exact: true })).toBeVisible();
    await expect(page.locator('[data-recomendacion="rec-ayer"]')).toContainText('abierto hace 1 día');
  });
});
