import { test, type Page } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// Capturas de producto para la landing. NO es un test: solo corre con
// CAPTURAS_LANDING=<carpeta> y deja allí los PNG crudos (los recorta y comprime
// scripts/capturas-landing.mjs). Datos 100 % de muestra, los de los andamiajes
// de e2e (nombres inventados, `@example.com`, estudio ficticio): NUNCA datos
// reales, el repo es público.
//
// El servidor de desarrollo se arranca con
//   E2E_COLOR_PRIMARIO=#55603F E2E_PORTADA_URL=/landing/fotos/sala-pilates-reformers-madera-cierre-1280.webp
// (el color y la portada del estudio de muestra; la foto es la de la home).
const DESTINO = process.env.CAPTURAS_LANDING;
test.skip(!DESTINO, 'solo con CAPTURAS_LANDING=<carpeta>');

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** El portal montado y con las fechas puestas en el presente (las del mock son de agosto). */
async function portalDeMuestra(page: Page) {
  await page.addInitScript(() => localStorage.setItem('tenti-traje', 'ninguno'));
  await page.clock.setFixedTime(new Date(new Date().setHours(15, 48, 0, 0)));
  await montarPortal(page, { conSesion: true, conTarjeta: true });
  // Se lee lo que el mock contesta, se ajusta y se vuelve a contestar.
  const lector = await page.context().newPage();
  await montarPortal(lector, { conSesion: true, conTarjeta: true });
  await lector.goto('/icon-192.png');
  const datos = await lector.evaluate(() => fetch('/api/public/studio-data').then((r) => r.json()));
  await lector.close();
  const socia = datos.socia;
  socia.suscripciones = [{ ...socia.suscripciones[0], fechaInicio: dia(-32), fechaFin: dia(58), sesionesRestantes: 6 }];
  socia.recibos = [
    { ...socia.recibos[0], fechaVencimiento: dia(-34), fechaCobro: dia(-34), estado: 'COBRADO', cobro: undefined },
    { ...socia.recibos[1], concepto: 'Bono 10', importe: 120, fechaVencimiento: dia(2), estado: 'PENDIENTE', cobro: { como: 'APP' } },
  ];
  socia.facturas = [];
  socia.cobroRecibos = { 'rec-2': { como: 'APP' } };
  datos.stripeAccountId = 'acct_muestra';
  // Las clases a horas de estudio: hoy a las 19:00 (el reloj, a las 15:48), mañana, pasado…
  const a = (n: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const lugar: Record<string, [number, number, number]> = { 'ses-1': [0, 19, 0], 'ses-2': [1, 9, 30], 'ses-3': [1, 18, 0], 'ses-4': [1, 10, 15] };
  for (const s of datos.sesiones) {
    const l = lugar[s.id];
    if (!l) continue;
    s.inicio = a(l[0], l[1], l[2]).toISOString();
    s.fin = new Date(a(l[0], l[1], l[2]).getTime() + 55 * 60_000).toISOString();
  }
  // Reformers ocupados en la clase de mañana (ses-4): la alumna ve el mapa de la sala.
  const ocupados = ['sp-2', 'sp-3', 'sp-6', 'sp-8', 'sp-9', 'sp-12'].map((spot, i) => ({ id: `res-ocu-${i}`, sesion_id: 'ses-4', estado: 'CONFIRMADA', spot_id: spot }));
  datos.aforoReservas = [...datos.aforoReservas, ...ocupados];
  await page.route('**/api/public/aforo**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sesionIds: datos.sesiones.map((x: { id: string }) => x.id), aforoReservas: datos.aforoReservas }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datos) }));
}

/** El nombre del estudio de muestra en la cabecera (el servidor de e2e lo siembra como «Tentare»). */
async function nombrar(page: Page) {
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.textContent?.trim() === 'Tentare') n.textContent = 'Estudio Alma';
      else if (n.textContent?.includes(' · Tentare')) n.textContent = n.textContent.replace(' · Tentare', ' · Estudio Alma');
      else if (n.textContent?.trim() === 'Calle Test 1') n.textContent = 'Calle Larios 12';
      else if (n.textContent?.trim() === 'T' && n.parentElement?.closest('header')) n.textContent = 'A';
    }
  });
}

test.describe('app de la alumna', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('pantallas', async ({ page }) => {
    test.setTimeout(240_000);
    await portalDeMuestra(page);
    for (const [nombre, ruta] of [['inicio', ''], ['bonos', '/bonos'], ['pagos', '/pagos'], ['reservar', '/reservar']] as const) {
      await page.goto(`/portal/${SLUG}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
      await nombrar(page);
      await page.screenshot({ path: `${DESTINO}/app-${nombre}.png` });
    }
    // La hoja de la clase: elegir reformer.
    await page.goto(`/portal/${SLUG}/reservar`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.locator('button', { hasText: 'MIÉ' }).first().click();
    await page.waitForTimeout(800);
    await nombrar(page);
    await page.screenshot({ path: `${DESTINO}/app-horario-manana.png` });
    await page.getByText('10:15 · 55 min').click();
    await page.waitForURL(/reservar\/ses-4/, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.waitForTimeout(1500);
    await nombrar(page);
    await page.screenshot({ path: `${DESTINO}/app-hoja-reserva.png` });
    await page.getByRole('button', { name: /^Reservar$/ }).last().click();
    await page.waitForTimeout(2000);
    await nombrar(page);
    await page.screenshot({ path: `${DESTINO}/app-elegir-reformer.png` });
    await page.getByText('4', { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DESTINO}/app-elegir-reformer-4.png` });
  });
});

// ── Panel (escritorio) ──────────────────────────────────────────────────────
import { montar, ir } from './panel-sembrado';
import { conAcciones, pedirAlAsistente } from './asistente-andamiaje';

const sinFab = (page: Page) => page.addStyleTag({ content: 'a[href*="wa.me"], [aria-label*="WhatsApp"] { display: none !important }' });

const STUDIO = 'studio-test';
const lunes = (() => { const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); d.setHours(0, 0, 0, 0); return d; })();
const en = (dSem: number, h: number, m = 0) => { const d = new Date(lunes); d.setDate(d.getDate() + dSem); d.setHours(h, m, 0, 0); return d; };

const TIPOS_M = [
  { id: 'tc-r', studio_id: STUDIO, nombre: 'Reformer', color: '#B9BFA3', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null },
  { id: 'tc-m', studio_id: STUDIO, nombre: 'Mat', color: '#E7D3AC', duracion_minutos: 50, descripcion: null, nivel: 'TODOS', foto_url: null },
  { id: 'tc-b', studio_id: STUDIO, nombre: 'Barre', color: '#D8C4B2', duracion_minutos: 50, descripcion: null, nivel: 'TODOS', foto_url: null },
];
const SALAS_M = [
  { id: 'sala-1', studio_id: STUDIO, nombre: 'Sala Reformer', capacidad: 8, color: '#55603F' },
  { id: 'sala-2', studio_id: STUDIO, nombre: 'Sala Mat', capacidad: 12, color: '#E7D3AC' },
];
const INS_M = [
  { id: 'ins-cloe', studio_id: STUDIO, nombre: 'Cloe Pons', email: 'cloe@example.com', telefono: null, color: '#55603F', activo: true, rol: 'PROPIETARIO', avatar: null, foto_url: null, auth_user_id: 'auth-e2e-duena' },
  { id: 'ins-marta', studio_id: STUDIO, nombre: 'Marta Ruiz', email: 'marta@example.com', telefono: null, color: '#B9BFA3', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: 'auth-marta' },
  { id: 'ins-irene', studio_id: STUDIO, nombre: 'Irene Sanz', email: 'irene@example.com', telefono: null, color: '#E7D3AC', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: 'auth-irene' },
  { id: 'ins-lucia', studio_id: STUDIO, nombre: 'Lucía Vega', email: 'lucia@example.com', telefono: null, color: '#D8C4B2', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: 'auth-lucia' },
];

// (día de la semana 0=lun, hora, min, tipo, sala, instructora, aforo, apuntadas)
const PLAN: [number, number, number, string, string, string | null, number, number][] = [
  [0, 9, 0, 'tc-r', 'sala-1', 'ins-marta', 8, 7], [0, 10, 15, 'tc-m', 'sala-2', 'ins-irene', 12, 9], [0, 18, 30, 'tc-r', 'sala-1', 'ins-cloe', 8, 8],
  [1, 9, 0, 'tc-r', 'sala-1', 'ins-cloe', 8, 8], [1, 10, 15, 'tc-b', 'sala-2', 'ins-lucia', 12, 6], [1, 19, 0, 'tc-r', 'sala-1', 'ins-marta', 8, 8],
  [2, 9, 0, 'tc-m', 'sala-2', 'ins-irene', 12, 10], [2, 10, 15, 'tc-r', 'sala-1', 'ins-cloe', 8, 7], [2, 18, 0, 'tc-r', 'sala-1', 'ins-irene', 8, 6], [2, 19, 15, 'tc-b', 'sala-2', 'ins-lucia', 12, 9],
  [3, 9, 0, 'tc-r', 'sala-1', 'ins-marta', 8, 8], [3, 10, 15, 'tc-m', 'sala-2', 'ins-irene', 12, 8], [3, 18, 30, 'tc-r', 'sala-1', 'ins-cloe', 8, 7],
  [4, 9, 0, 'tc-r', 'sala-1', 'ins-cloe', 8, 6], [4, 10, 15, 'tc-b', 'sala-2', 'ins-lucia', 12, 7], [4, 17, 30, 'tc-m', 'sala-2', 'ins-irene', 12, 5],
];

const json = (r: import('@playwright/test').Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function panelDeMuestra(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('tenti-traje', 'ninguno'); });
  await montar(page);
  await page.route('**/api/theme**', (r) => json(r, { primary: '#55603F', secondary: '#E7D3AC', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', (r) => json(r, { id: STUDIO, nombre: 'Estudio Alma', slug: 'tentare', email: 'hola@example.com', moneda: 'EUR', owner_auth_user_id: 'auth-e2e-duena', plan: 'ESTUDIO', subscription_status: 'active' }));
  await page.route('**/rest/v1/tipos_clase**', (r) => json(r, TIPOS_M));
  await page.route('**/rest/v1/studios**', (r) => json(r, { id: STUDIO, nombre: 'Estudio Alma', slug: 'tentare', email: 'hola@example.com', moneda: 'EUR', owner_auth_user_id: 'auth-e2e-duena', plan: 'ESTUDIO', subscription_status: 'active', decision_contrato_visto_en: '2026-09-01T00:00:00Z', bienvenida_vista_en: '2026-01-01T00:00:00Z' }));
  await page.route('**/rest/v1/salas**', (r) => json(r, SALAS_M));
  await page.route('**/rest/v1/instructores**', (r) => json(r, INS_M));
  const sesiones = PLAN.map(([d, h, m, tc, sala, ins, aforo], i) => ({
    id: `ses-m-${i}`, studioId: STUDIO, tipoClaseId: tc, salaId: sala, instructorId: ins,
    inicio: en(d, h, m).toISOString(), fin: en(d, h, m + 55).toISOString(), aforoMaximo: aforo, cancelada: false, notas: null, precioPuntual: null, serieId: null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
    sustitucionEstado: null, ausencia: null, instructoraInactiva: false, floja: null,
  }));
  const reservas = PLAN.flatMap(([, , , , , , , n], i) => Array.from({ length: n }, (_, j) => ({
    id: `res-m-${i}-${j}`, studioId: STUDIO, sesionId: `ses-m-${i}`, socioId: `soc-m-${j}`, estado: 'CONFIRMADA',
    spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: new Date().toISOString(),
  })));
  // La clase llena del martes (ses-m-3) con dos alumnas en lista de espera.
  reservas.push(...[1, 2].map((n) => ({ id: `res-m-espera-${n}`, studioId: STUDIO, sesionId: 'ses-m-3', socioId: `soc-m-e${n}`, estado: 'LISTA_ESPERA', spotId: null, posicionEspera: n, ofertaExpiraEn: null, checkInEn: null, creadoEn: new Date().toISOString() })));
  await page.route('**/rest/v1/sesiones**', (r) => json(r, sesiones.map((x) => ({
    id: x.id, studio_id: STUDIO, tipo_clase_id: x.tipoClaseId, sala_id: x.salaId, instructor_id: x.instructorId, inicio: x.inicio, fin: x.fin,
    aforo_maximo: x.aforoMaximo, cancelada: false, notas: null, google_event_id: null, serie_id: null, incidencia_texto: null, precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
  }))));
  await page.route('**/rest/v1/reservas**', (r) => json(r, reservas.map((x) => ({
    id: x.id, studio_id: STUDIO, sesion_id: x.sesionId, socio_id: x.socioId, estado: x.estado, spot_id: null, posicion_espera: x.posicionEspera, oferta_expira_en: null,
    check_in_en: null, creado_en: x.creadoEn, confirmacion_pedida_en: null, confirmado_en: null, recordatorio_confirmacion_en: null, valoracion_experiencia: null, cancelada_tardia: false,
  }))));
  await page.route(/\/api\/calendario/, (r) => json(r, {
    sesiones, reservas, sustituciones: [],
    salas: SALAS_M.map((s) => ({ id: s.id, studioId: STUDIO, nombre: s.nombre, capacidad: s.capacidad, color: s.color })),
    instructores: INS_M.map((r) => ({ id: r.id, studioId: STUDIO, nombre: r.nombre, email: r.email, telefono: r.telefono, color: r.color, activo: true, avatar: null, fotoUrl: null, rol: r.rol, authUserId: r.auth_user_id })),
    horaApertura: '08:00:00', horaCierre: '21:00:00', ausenciasCargadas: true, rol: 'PROPIETARIO',
  }));
  await page.route('**/api/sustituciones/clase**', (r) => json(r, {
    modo: 'asistido', sustitucion: { id: 'sust-1', estado: 'pendiente_aprobacion', instructorOriginalId: 'ins-marta' },
    cola: [
      { instructorId: 'ins-irene', nombre: 'Irene Sanz', motivo: 'ha dado esta clase 12 veces', sinEmail: false, avisada: false },
      { instructorId: 'ins-lucia', nombre: 'Lucía Vega', motivo: 'este mes va holgada de horas', sinEmail: false, avisada: false },
    ],
    siguienteId: 'ins-irene', contactos: [],
  }));
}

test.describe('panel', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  test('calendario', async ({ page }) => {
    test.setTimeout(240_000);
    await panelDeMuestra(page);
    await ir(page, 'calendario');
    await page.waitForTimeout(2500);
    await sinFab(page);
    await page.screenshot({ path: `${DESTINO}/panel-calendario.png` });
  });
});

test.describe('panel · resto', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  for (const [nombre, ruta] of [['cobros', 'cobros'], ['centro-de-control', 'centro-de-control']] as const) {
    test(nombre, async ({ page }) => {
      test.setTimeout(240_000);
      await panelDeMuestra(page);
      await ir(page, ruta);
      await page.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3500);
      await sinFab(page);
      await page.screenshot({ path: `${DESTINO}/panel-${nombre}.png` });
    });
  }
  test('migracion', async ({ page }) => {
    test.setTimeout(240_000);
    await panelDeMuestra(page);
    await page.route('**/rest/v1/planes_tarifa**', (r) => json(r, [
      { id: 'pt-ref', studio_id: STUDIO, nombre: 'Bono 10 Reformer', precio: 130, tipo: 'BONO', sesiones: 10, activo: true },
      { id: 'pt-mes', studio_id: STUDIO, nombre: 'Mensual ilimitado', precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true },
    ]));
    const filas = ['email,membershipName,creditsRemaining'];
    for (let i = 1; i <= 38; i++) filas.push(`alumna${String(i).padStart(2, '0')}@example.com,${i % 3 ? 'Bono 10 Reformer' : 'Mensual ilimitado'},${i % 3 ? (i % 9) + 1 : ''}`);
    await page.route('**/api/migracion/analizar**', (r) => json(r, {
      orden: ['membresias'], avisos: [],
      archivos: [{ nombre: 'bonos-y-membresias.csv', entidad: 'membresias', entidadEtiqueta: 'Bonos y membresías', origen: 'auto', confianza: 1,
        columnas: ['email', 'membershipName', 'creditsRemaining'], mapeo: { email: 0, plan: 1, sesiones: 2, fecha_inicio: -1, fecha_fin: -1, estado: -1 },
        total: 38, ok: 38, duplicadas: 0, errores: 0, muestra: [{ email: 'alumna01@example.com', plan: 'Bono 10 Reformer', sesiones: 2 }], cuarentena: [], avisos: [] }],
    }));
    await page.route('**/api/suscripciones/import**', (r) => json(r, { total: 38, importadas: 38, duplicadas: 0, errores: [] }));
    await ir(page, 'migracion');
    await page.locator('input[type=file]').setInputFiles({ name: 'bonos-y-membresias.csv', mimeType: 'text/csv', buffer: Buffer.from(filas.join('\n'), 'utf8') });
    await page.getByRole('button', { name: /^Analizar 1 archivo$/ }).click();
    await page.getByText(/Bonos y membresías/i).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await sinFab(page);
    await page.screenshot({ path: `${DESTINO}/panel-migracion-revision.png` });
    await page.getByRole('button', { name: /^Importar \d+ registros?/ }).click();
    await page.getByText('Acta de migración').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DESTINO}/panel-migracion.png` });
  });

  test('asistente', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => { localStorage.setItem('tenti-traje', 'ninguno'); });
    await conAcciones(page, { tipo: 'CREAR_CLASE' });
    await pedirAlAsistente(page);
    await page.waitForTimeout(1500);
    await sinFab(page);
    await page.screenshot({ path: `${DESTINO}/panel-asistente.png` });
  });
});

test.describe('asistente · móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('chat con la confirmación', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => { localStorage.setItem('tenti-traje', 'ninguno'); });
    await conAcciones(page, { tipo: 'CREAR_CLASE' });
    await pedirAlAsistente(page);
    await page.waitForTimeout(2000);
    await sinFab(page);
    await page.screenshot({ path: `${DESTINO}/app-asistente-movil.png` });
  });
});
