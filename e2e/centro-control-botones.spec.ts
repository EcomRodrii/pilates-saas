import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Los botones del Centro de Control dicen lo que hacen.
//
// El veredicto del día tenía un «Hecho» para todo que, según la recomendación,
// cobraba la tarjeta de una socia o le mandaba un mensaje: quien lo pulsaba creía
// estar marcando algo. Ahora el botón principal lo decide
// `lib/decision/efecto-aprobar.ts` (el servidor lo manda como `efecto`):
//   · COBRAR          → «Cobrar ahora»
//   · ENVIAR_EMAIL    → «Enviar email»
//   · ENVIAR_MENSAJE  → «Enviarle el mensaje», y además «Ya la he contactado»
//   · MARCAR          → «Hecho»
//
// Y ninguna acción quita la tarjeta antes de que el servidor diga que sí. Con un
// cobro importa de verdad: «Cobrar ahora» desaparecía al pulsar, y el titular
// pasaba a «Todo bajo control» aunque el servidor dijera que no. Y el sí del
// servidor solo dice que el cobro está encolado: la tarjeta pregunta cada 5 s
// cómo ha ido (GET /api/decisiones/<id>/estado, tope de 90 s) y dice lo que
// pasó de verdad — cobrado, rechazado y por qué, o que está tardando.
//
// Andamiaje: `panel-sembrado.ts`, y DESPUÉS de montarlo los mocks de esta suite
// (gana la última ruta registrada). Toda escritura lleva su contador: un test de
// fallo que pasa sin que la petición salga no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const EN_MARCHA = 'Cobro en marcha. En cuanto termine, verás aquí cómo ha ido.';
const TARDANDO = 'El cobro está tardando más de lo normal. Cuando termine, verás cómo ha ido en Actividad.';
const ERROR_SERVIDOR = 'No se ha podido poner en marcha. Vuelve a intentarlo en un momento.';
const ERROR_RED = 'No se ha podido conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

/** Forma de `Recomendacion` (lib/decision/tipos.ts) más el `efecto` que añade GET /api/decisiones. */
const rec = (o: Record<string, unknown> & { id: string; titulo: string }) => ({
  studioId: STUDIO_ID, decisionSessionId: 'ds-1', algorithmVersion: 'v1', dedupeKey: `k:${o.id}`,
  especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', motivo: 'Lo que ha visto Tentare.',
  datosUsados: {}, riesgo: 'PERDIDA', impacto: null,
  confianza: { nivel: 'ALTA', evidencia: ['Una evidencia'], autonomiaMaxima: 0 },
  score: 80, prioridad: 'ALTA', nivelAutonomia: 0,
  accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: null, sesionId: null, reciboId: null,
  tiempoEstimadoMin: 5, estado: 'PENDIENTE', vistaEn: null,
  expiraEn: '2099-01-01T00:00:00Z', creadoEn: new Date().toISOString(), resueltoEn: null, resueltoPor: null,
  ...o,
});

const COBRO = rec({
  id: 'rec-cobro', especialista: 'INGRESOS', tipo: 'RECUPERAR_PAGOS', efecto: 'COBRAR',
  titulo: 'Laura tiene un recibo que se puede cobrar ya',
  accion: { tipo: 'COBRAR_RECIBOS', reciboIds: ['rec-2'] }, socioId: 'soc-2', datosUsados: { n: 1, total: 89 },
});
const EMAIL = rec({
  id: 'rec-email', tipo: 'ENVIAR_REACTIVACION', efecto: 'ENVIAR_EMAIL',
  titulo: 'Carmen no ha vuelto desde su clase de prueba',
  accion: { tipo: 'ENVIAR_EMAIL', plantilla: 'REACTIVACION' }, socioId: 'soc-3', datosUsados: { nombre: 'Carmen' },
});
const MENSAJE = rec({
  id: 'rec-mensaje', tipo: 'RECUPERAR_SOCIA', efecto: 'ENVIAR_MENSAJE',
  titulo: 'Bea Ortega lleva 6 semanas sin venir',
  accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' }, socioId: 'soc-4', datosUsados: { nombre: 'Bea' },
});
const MARCAR = rec({
  id: 'rec-marcar', especialista: 'AGENDA', tipo: 'FUSIONAR_SESIONES', efecto: 'MARCAR',
  titulo: 'El Mat de los viernes a las 19:00 va medio vacío',
});
// Un contacto con mensaje para ella pero sin por dónde mandárselo (sin email y
// sin WhatsApp del estudio): el servidor dice MARCAR, y la pantalla no promete
// enviarle nada.
const SIN_CANAL = rec({
  id: 'rec-sin-canal', tipo: 'RECUPERAR_SOCIA', efecto: 'MARCAR',
  titulo: 'Lucía lleva 5 semanas sin venir',
  accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' }, socioId: 'soc-5', datosUsados: { nombre: 'Lucía' },
});

type Rec = ReturnType<typeof rec>;

/** El desglose que guarda el ejecutor de un cobro (lib/decision/resultado-ejecucion.ts). */
const resumenCobro = (o: Record<string, unknown>) => ({
  recibos: 1, cobrados: 0, importeCobradoEur: 0, enCurso: 0, importeEnCursoEur: 0,
  sinRegistrar: 0, importeSinRegistrarEur: 0, motivosSinRegistrar: [], yaNoPendientes: 0,
  sinConfirmar: 0, motivosSinConfirmar: [], noCobrados: 0, motivosNoCobrados: [], ...o,
});
const COBRADO = { estado: 'EJECUTADA', resultado: { detalle: 'Cobrado: 89 €.', cobro: resumenCobro({ cobrados: 1, importeCobradoEur: 89 }) } };
const RECHAZADO = {
  estado: 'FALLIDA',
  resultado: {
    detalle: 'No se ha podido cobrar. La socia no tiene método de pago guardado.',
    cobro: resumenCobro({ noCobrados: 1, motivosNoCobrados: ['La socia no tiene método de pago guardado'] }),
  },
};
// Stripe cobró y el recibo no quedó cobrado (`aviso: 'COBRADO_SIN_PERSISTIR'`):
// el ejecutor la cierra FALLIDA, y no es ni un éxito ni un fallo.
const A_REVISAR = 'Cobrado en Stripe (89 €), pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.';
const SIN_PERSISTIR = {
  estado: 'FALLIDA',
  resultado: {
    detalle: A_REVISAR,
    cobro: resumenCobro({
      sinRegistrar: 1, importeSinRegistrarEur: 89,
      motivosSinRegistrar: ['El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.'],
    }),
  },
};
// La tarjeta en `processing`: el cargo puede haber entrado.
const SIN_CONFIRMAR_TEXTO = 'Sin confirmar todavía: el banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.';
const SIN_CONFIRMAR = {
  estado: 'FALLIDA',
  resultado: {
    detalle: SIN_CONFIRMAR_TEXTO,
    cobro: resumenCobro({ sinConfirmar: 1, motivosSinConfirmar: ['El banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.'] }),
  },
};
const SIGUE_EN_MARCHA = { estado: 'APROBADA', resultado: null };

/**
 * El Centro de Control con `veredicto` como mensaje del día y `filas` como
 * filas. Todo va en `prioridades` (siempre filas completas, sin la partición
 * por fecha de «Más situaciones»); la del veredicto la quita la página.
 */
async function centro(page: Page, veredicto: Rec, filas: Rec[] = [COBRO, EMAIL, MENSAJE, MARCAR, SIN_CANAL]) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/decisiones', (r) => json(r, {
    resumen: {
      saludo: 'Buenas tardes', mientrasDormias: [], nDecisiones: 4,
      tiempoEstimadoMin: 20, impactoTotal: null, generadoEn: new Date().toISOString(),
    },
    veredicto: { tipo: 'MENSAJE', recomendacion: veredicto, fraseConfianza: null, semanaTranquila: false },
    seguimiento: [],
    prioridades: filas,
    masSituaciones: [],
    porEspecialista: [],
    actividad: [],
    nAutonomasHoy: 0,
  }));
}

/**
 * Cuenta los POST a `/api/decisiones/<id>/<accion>` (sus rutas, y en `cuerpos`
 * lo que llevaban) y contesta con `responder`.
 */
async function contar(page: Page, accion: string, responder: (r: Route) => Promise<void> | void = (r) => json(r, { ok: true })) {
  const llamadas = { rutas: [] as string[], cuerpos: [] as unknown[] };
  await page.route((u) => new RegExp(`^/api/decisiones/[^/]+/${accion}$`).test(u.pathname), async (r) => {
    llamadas.rutas.push(new URL(r.request().url()).pathname);
    llamadas.cuerpos.push(r.request().postDataJSON());
    await responder(r);
  });
  return llamadas;
}

/** La tarjeta del veredicto: la que lleva el título de la recomendación del día como h2. */
/**
 * GET /api/decisiones/<id>/estado: cuenta las preguntas y contesta a la n-ésima
 * con `respuestas[n]` (la última se repite).
 */
async function contarEstado(page: Page, id: string, respuestas: unknown[]) {
  const preguntas: string[] = [];
  await page.route((u) => u.pathname === `/api/decisiones/${id}/estado`, async (r) => {
    preguntas.push(r.request().method());
    await json(r, respuestas[Math.min(preguntas.length - 1, respuestas.length - 1)]);
  });
  return preguntas;
}

/** Adelanta el reloj de la página (instalado con `page.clock.install()`) hasta que se cumpla `listo`. */
async function adelantarHasta(page: Page, listo: () => boolean) {
  await expect.poll(async () => {
    if (!listo()) await page.clock.fastForward(1_000);
    return listo();
  }, { timeout: 20_000 }).toBe(true);
}

const veredictoDe = (page: Page, titulo: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { level: 2, name: titulo }) });

const fila = (page: Page, id: string) => page.locator(`[data-recomendacion="${id}"]`);

async function abrirDetalle(page: Page) {
  await page.getByRole('button', { name: 'Ver todo el detalle' }).click();
  await expect(fila(page, 'rec-marcar')).toBeVisible({ timeout: 30_000 });
}

test('cada botón principal dice lo que hace, en el veredicto y en las filas', async ({ page }) => {
  await centro(page, MENSAJE);
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, MENSAJE.titulo);
  await expect(v).toBeVisible({ timeout: 30_000 });
  await expect(v.getByRole('button', { name: 'Enviarle el mensaje' })).toBeVisible();
  await expect(v.getByRole('button', { name: 'Ya la he contactado' })).toBeVisible();
  await expect(v.getByRole('button', { name: 'Ya lo sé' })).toBeVisible();
  await expect(v.getByRole('button', { name: 'Recuérdamelo' })).toBeVisible();
  // El «Hecho» genérico ya no está: aprobar esta le manda un mensaje a Bea.
  await expect(v.getByRole('button', { name: 'Hecho', exact: true })).toHaveCount(0);

  await abrirDetalle(page);
  await expect(fila(page, 'rec-cobro').getByRole('button', { name: 'Cobrar ahora' })).toBeVisible();
  await expect(fila(page, 'rec-email').getByRole('button', { name: 'Enviar email' })).toBeVisible();
  await expect(fila(page, 'rec-marcar').getByRole('button', { name: 'Hecho', exact: true })).toBeVisible();
  // «Ya la he contactado» solo donde aprobar le escribiría a la socia.
  await expect(fila(page, 'rec-email').getByRole('button', { name: 'Ya la he contactado' })).toBeVisible();
  await expect(fila(page, 'rec-cobro').getByRole('button', { name: 'Ya la he contactado' })).toHaveCount(0);
  await expect(fila(page, 'rec-marcar').getByRole('button', { name: 'Ya la he contactado' })).toHaveCount(0);
  // Sin por dónde llegarle, ni «Enviarle el mensaje» ni «Ya la he contactado»: «Hecho».
  await expect(fila(page, 'rec-sin-canal').getByRole('button', { name: 'Hecho', exact: true })).toBeVisible();
  await expect(fila(page, 'rec-sin-canal').getByRole('button', { name: 'Enviarle el mensaje' })).toHaveCount(0);
  await expect(fila(page, 'rec-sin-canal').getByRole('button', { name: 'Ya la he contactado' })).toHaveCount(0);
  // La del veredicto no se repite como fila.
  await expect(fila(page, 'rec-mensaje')).toHaveCount(0);
});

test('«Ya la he contactado» la marca por /gestionada y NUNCA pasa por /aprobar', async ({ page }) => {
  await centro(page, MENSAJE);
  const aprobaciones = await contar(page, 'aprobar');
  const gestionadas = await contar(page, 'gestionada', (r) => json(r, { estado: 'EJECUTADA' }));
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, MENSAJE.titulo);
  await v.getByRole('button', { name: 'Ya la he contactado' }).click();
  await expect.poll(() => gestionadas.rutas).toEqual(['/api/decisiones/rec-mensaje/gestionada']);
  // Con el sí del servidor deja de pedir nada: ya no hay botones que pulsar.
  await expect(page.getByRole('button', { name: 'Enviarle el mensaje' })).toHaveCount(0);

  // Igual desde una fila.
  await abrirDetalle(page);
  await fila(page, 'rec-email').getByRole('button', { name: 'Ya la he contactado' }).click();
  await expect.poll(() => gestionadas.rutas.length).toBe(2);
  await expect(fila(page, 'rec-email')).toHaveCount(0);

  expect(gestionadas.rutas[1]).toBe('/api/decisiones/rec-email/gestionada');
  expect(aprobaciones.rutas).toHaveLength(0);
});

test('«Ya la he contactado» con un no del servidor: la tarjeta sigue y se dice por qué', async ({ page }) => {
  const NO = 'Ya no estaba pendiente: se ha resuelto por otra vía. Recarga la página para ver cómo ha quedado.';
  await centro(page, MENSAJE);
  const gestionadas = await contar(page, 'gestionada', (r) => json(r, { error: NO }, 409));
  await ir(page, 'centro-de-control');

  const v = veredictoDe(page, MENSAJE.titulo);
  await v.getByRole('button', { name: 'Ya la he contactado' }).click();
  await expect(page.getByRole('alert').filter({ hasText: NO })).toBeVisible();
  expect(gestionadas.rutas.length).toBeGreaterThan(0);
  await expect(v.getByRole('button', { name: 'Enviarle el mensaje' })).toBeEnabled();
});

test.describe('cobrar no es optimista', () => {
  test('en el veredicto: mientras el servidor contesta, la tarjeta sigue con los botones apagados; con el sí, «Cobro en marcha»', async ({ page }) => {
    await centro(page, COBRO);
    let soltar!: () => void;
    const retenida = new Promise<void>((r) => { soltar = r; });
    const aprobaciones = await contar(page, 'aprobar', async (r) => { await retenida; await json(r, { estado: 'APROBADA' }); });
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect.poll(() => aprobaciones.rutas.length).toBe(1);
    await expect(v.getByRole('button', { name: 'Cobrar ahora' })).toBeDisabled();
    await expect(v.getByRole('button', { name: 'Ya lo sé' })).toBeDisabled();
    await expect(v.getByRole('button', { name: 'Recuérdamelo' })).toBeDisabled();

    soltar();
    // Sin prometer nada en Cobros todavía: un rechazo no deja rastro allí.
    const enMarcha = v.getByRole('status').filter({ hasText: EN_MARCHA });
    await expect(enMarcha).toBeVisible();
    await expect(enMarcha.getByRole('link')).toHaveCount(0);
    await expect(v.getByRole('button', { name: 'Cobrar ahora' })).toHaveCount(0);
    // Ni un titular de «todo resuelto»: el cobro lo hace el ejecutor después, y puede fallar.
    await expect(veredictoDe(page, COBRO.titulo)).toBeVisible();
    await expect(page.getByText('Todo bajo control.')).toHaveCount(0);
    await expect(page.getByText('Ya te ocupaste de lo de hoy.')).toHaveCount(0);
    expect(aprobaciones.rutas).toEqual(['/api/decisiones/rec-cobro/aprobar']);
    // Lleva lo que dijo el botón, y qué recibos: el servidor no cobra lo que la pantalla no enseñó.
    expect(aprobaciones.cuerpos).toEqual([{ efecto: 'COBRAR', reciboIds: ['rec-2'] }]);
  });

  test('en el veredicto, con un 500: la tarjeta sigue, sale el error del servidor y nada queda marcado', async ({ page }) => {
    await centro(page, COBRO);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { error: ERROR_SERVIDOR }, 500));
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(page.getByRole('alert').filter({ hasText: ERROR_SERVIDOR })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);
    await expect(v.getByRole('button', { name: 'Cobrar ahora' })).toBeEnabled();
    await expect(page.getByText('Cobro en marcha')).toHaveCount(0);
  });

  test('en el veredicto, con la red caída: la tarjeta sigue y se dice que no hubo conexión', async ({ page }) => {
    await centro(page, COBRO);
    const aprobaciones = await contar(page, 'aprobar', (r) => r.abort('internetdisconnected'));
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(page.getByRole('alert').filter({ hasText: ERROR_RED })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);
    await expect(v.getByRole('button', { name: 'Cobrar ahora' })).toBeEnabled();
    await expect(page.getByText('Cobro en marcha')).toHaveCount(0);
  });

  test('en una fila: apagada mientras espera, y con el sí se queda diciendo «Cobro en marcha»', async ({ page }) => {
    await centro(page, MENSAJE);
    let soltar!: () => void;
    const retenida = new Promise<void>((r) => { soltar = r; });
    const aprobaciones = await contar(page, 'aprobar', async (r) => { await retenida; await json(r, { estado: 'APROBADA' }); });
    await ir(page, 'centro-de-control');
    await abrirDetalle(page);

    const f = fila(page, 'rec-cobro');
    await f.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect.poll(() => aprobaciones.rutas.length).toBe(1);
    await expect(f.getByRole('button', { name: 'Cobrar ahora' })).toBeDisabled();
    await expect(f.getByRole('button', { name: 'Ya lo sé' })).toBeDisabled();

    soltar();
    await expect(f.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    await expect(f.getByRole('button', { name: 'Cobrar ahora' })).toHaveCount(0);
    await expect(f).toContainText(COBRO.titulo);
    expect(aprobaciones.rutas).toEqual(['/api/decisiones/rec-cobro/aprobar']);
    // Lleva lo que dijo el botón, y qué recibos: el servidor no cobra lo que la pantalla no enseñó.
    expect(aprobaciones.cuerpos).toEqual([{ efecto: 'COBRAR', reciboIds: ['rec-2'] }]);
  });

  test('en una fila, con un 500: la fila sigue con su botón y sale el error', async ({ page }) => {
    await centro(page, MENSAJE);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { error: ERROR_SERVIDOR }, 500));
    await ir(page, 'centro-de-control');
    await abrirDetalle(page);

    const f = fila(page, 'rec-cobro');
    await f.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(page.getByRole('alert').filter({ hasText: ERROR_SERVIDOR })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);
    await expect(f.getByRole('button', { name: 'Cobrar ahora' })).toBeEnabled();
    await expect(f.getByText('Cobro en marcha')).toHaveCount(0);
  });
});

test.describe('tras «Cobrar ahora», la tarjeta dice cómo ha ido de verdad', () => {
  // El reloj de la página se adelanta a mano para no esperar 5 s reales por
  // pregunta (`page.clock.install` NO lo congela: sigue corriendo, y además se
  // puede adelantar).
  test('pregunta hasta que se cobra, y entonces dice lo que entró y que se ve en Cobros', async ({ page }) => {
    await page.clock.install();
    await centro(page, COBRO);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { estado: 'APROBADA' }));
    const preguntas = await contarEstado(page, 'rec-cobro', [SIGUE_EN_MARCHA, COBRADO]);
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(v.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    expect(aprobaciones.rutas).toEqual(['/api/decisiones/rec-cobro/aprobar']);

    // 1ª pregunta: sigue en marcha, y la tarjeta lo sigue diciendo.
    await adelantarHasta(page, () => preguntas.length >= 1);
    await expect(v.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();

    // 2ª: cobrado. Lo que entró, y dónde verlo.
    await adelantarHasta(page, () => preguntas.length >= 2);
    const cobrado = v.getByRole('status').filter({ hasText: 'Cobrado: 89 €. Lo ves en Cobros.' });
    await expect(cobrado).toBeVisible();
    await expect(cobrado.getByRole('link', { name: 'Cobros', exact: true })).toHaveAttribute('href', '/cobros');
    await expect(page.getByText(EN_MARCHA)).toHaveCount(0);

    // Cerrado: deja de preguntar.
    await page.clock.fastForward('00:30');
    await page.waitForTimeout(500);
    expect(preguntas.length).toBe(2);
  });

  test('en una fila, si la tarjeta de la socia se rechaza, lo dice con el motivo — y nada de «cobrado»', async ({ page }) => {
    await page.clock.install();
    await centro(page, MENSAJE);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { estado: 'APROBADA' }));
    const preguntas = await contarEstado(page, 'rec-cobro', [RECHAZADO]);
    await ir(page, 'centro-de-control');
    await abrirDetalle(page);

    const f = fila(page, 'rec-cobro');
    await f.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(f.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);

    await adelantarHasta(page, () => preguntas.length >= 1);
    const rechazo = f.getByRole('status').filter({ hasText: 'No se ha podido cobrar. La socia no tiene método de pago guardado.' });
    await expect(rechazo).toBeVisible();
    await expect(rechazo).toHaveAttribute('data-tono', 'fallo');
    // Ni «Lo ves en Cobros»: un rechazo no deja nada allí.
    await expect(rechazo.getByRole('link')).toHaveCount(0);
    await expect(f.getByText(/Cobrado/)).toHaveCount(0);
    await expect(f.getByRole('button', { name: 'Cobrar ahora' })).toHaveCount(0);
  });

  test('en una fila, cobrado en Stripe sin quedar cobrado el recibo: lo dice para revisarlo, sin rojo y sin mandarla a Cobros', async ({ page }) => {
    await page.clock.install();
    await centro(page, MENSAJE);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { estado: 'APROBADA' }));
    const preguntas = await contarEstado(page, 'rec-cobro', [SIN_PERSISTIR]);
    await ir(page, 'centro-de-control');
    await abrirDetalle(page);

    const f = fila(page, 'rec-cobro');
    await f.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(f.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);

    await adelantarHasta(page, () => preguntas.length >= 1);
    const aviso = f.getByRole('status').filter({ hasText: A_REVISAR });
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveAttribute('data-tono', 'aviso');
    await expect(aviso.getByRole('link')).toHaveCount(0);
    // Ni el «Cobrado: 89 €.» de un cobro limpio, ni el «No se ha podido cobrar» de un fallo.
    await expect(f.getByText('Cobrado: 89 €.')).toHaveCount(0);
    await expect(f.getByText(/No se ha podido cobrar/)).toHaveCount(0);
    await expect(f.getByRole('button', { name: 'Cobrar ahora' })).toHaveCount(0);
  });

  test('en el veredicto, un cobro sin confirmar: «Sin confirmar todavía», sin el rojo de un fallo ni invitación a cobrarlo en Cobros', async ({ page }) => {
    await page.clock.install();
    await centro(page, COBRO);
    const aprobaciones = await contar(page, 'aprobar', (r) => json(r, { estado: 'APROBADA' }));
    const preguntas = await contarEstado(page, 'rec-cobro', [SIN_CONFIRMAR]);
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(v.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    expect(aprobaciones.rutas.length).toBeGreaterThan(0);

    await adelantarHasta(page, () => preguntas.length >= 1);
    const sinConfirmar = v.getByRole('status').filter({ hasText: SIN_CONFIRMAR_TEXTO });
    await expect(sinConfirmar).toBeVisible();
    await expect(sinConfirmar).toHaveAttribute('data-tono', 'normal');
    await expect(sinConfirmar.getByRole('link')).toHaveCount(0);
    await expect(v.getByText(/No se ha podido/)).toHaveCount(0);
  });

  test('si al cargar el cobro del día sigue en marcha, pregunta sin que nadie pulse nada', async ({ page }) => {
    await page.clock.install();
    // Recargada mientras el ejecutor cobra: el veredicto llega APROBADO (las filas, solo PENDIENTE).
    await centro(page, { ...COBRO, estado: 'APROBADA' }, [EMAIL, MENSAJE, MARCAR]);
    const aprobaciones = await contar(page, 'aprobar');
    const preguntas = await contarEstado(page, 'rec-cobro', [COBRADO]);
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await expect(v.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible({ timeout: 30_000 });
    await expect(v.getByRole('button', { name: 'Cobrar ahora' })).toHaveCount(0);

    await adelantarHasta(page, () => preguntas.length >= 1);
    await expect(v.getByRole('status').filter({ hasText: 'Cobrado: 89 €.' })).toBeVisible();
    expect(aprobaciones.rutas).toHaveLength(0);
  });

  test('si en 90 s no ha terminado, dice que está tardando —no que fue bien— y deja de preguntar', async ({ page }) => {
    await page.clock.install();
    await centro(page, COBRO);
    await contar(page, 'aprobar', (r) => json(r, { estado: 'APROBADA' }));
    const preguntas = await contarEstado(page, 'rec-cobro', [SIGUE_EN_MARCHA]);
    await ir(page, 'centro-de-control');

    const v = veredictoDe(page, COBRO.titulo);
    await v.getByRole('button', { name: 'Cobrar ahora' }).click();
    await expect(v.getByRole('status').filter({ hasText: EN_MARCHA })).toBeVisible();
    await adelantarHasta(page, () => preguntas.length >= 1);

    // Pasado el tope de 90 s.
    await page.clock.fastForward('01:30');
    await expect(v.getByRole('status').filter({ hasText: TARDANDO })).toBeVisible();
    await expect(page.getByText(/Cobrado/)).toHaveCount(0);
    expect(preguntas.length).toBeGreaterThan(1);

    const hechas = preguntas.length;
    await page.clock.fastForward('00:30');
    await page.waitForTimeout(500);
    expect(preguntas.length).toBe(hechas);
  });
});
