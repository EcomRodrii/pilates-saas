// Captura las pantallas REALES del panel para las páginas de /funcionalidades.
//
//   npm run build && E2E_TEST=1 npx next start -p 3100 &
//   node scripts/capturar-producto.mjs
//
// Por qué existe: las páginas de funcionalidades enseñaban diagramas dibujados
// a mano en vez del producto. Un diagrama de cajas lo puede dibujar cualquiera
// —y se nota—; una captura del calendario con nueve clases y su ocupación real
// no. Lo que sale de aquí es la aplicación de verdad, renderizada por el mismo
// código que usa un estudio.
//
// ⚠️ NO hacen falta credenciales, y durante un tiempo se creyó que sí. La suite
// e2e ya resolvía esto: token falso en `localStorage` + `page.route` mockeando
// la API, y el panel monta entero. Este script es esa misma técnica
// (e2e/arrastrar-clase.spec.ts) apuntando a un build de producción.
//
// Los datos son de un estudio INVENTADO —Estudio Aura, nombres que no existen—
// pero la FORMA es la de un estudio real: mañana cargada de reformer, valle a
// media mañana, tarde llena. Nada aquí sale de un estudio de un cliente.
//
// ⚠️ El servidor se levanta con E2E_TEST=1 porque la captura del portal usa la
// página pública /reservar/<slug>, y su estudio se resuelve en el SERVIDOR
// (lib/studio-seo.ts) — sin esa variable devuelve "estudio no encontrado" y la
// captura sale con un cartel de error en vez de con el horario.
//
// Si la UI del panel cambia, se vuelve a correr esto. Si no, las páginas de
// marketing enseñan una versión del producto que ya no existe.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CAPTURA_BASE ?? 'http://localhost:3100';
const DESTINO = path.join(process.cwd(), 'public', 'producto');

const AUTH_UID = 'auth-captura';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// Miércoles. Un día entre semana con el estudio a pleno rendimiento.
const HOY = '2026-09-16';
const LUNES = '2026-09-14';

const STUDIO = {
  id: STUDIO_ID, nombre: 'Estudio Aura', slug: 'aura',
  owner_auth_user_id: AUTH_UID, email: 'hola@estudioaura.es', moneda: 'EUR',
};

const INSTRUCTORAS = [
  { id: 'i1', nombre: 'Marta Sanz', color: '#5A6142' },
  { id: 'i2', nombre: 'Lucía Ferrer', color: '#3E7C86' },
  { id: 'i3', nombre: 'Nora Vidal', color: '#C79A2E' },
].map((i) => ({ ...i, studio_id: STUDIO_ID, activo: true, rol: 'INSTRUCTOR' }));

const TIPOS = [
  { id: 't1', nombre: 'Reformer', duracion_min: 50, color: '#5A6142' },
  { id: 't2', nombre: 'Mat', duracion_min: 55, color: '#3E7C86' },
  { id: 't3', nombre: 'Prenatal', duracion_min: 50, color: '#C79A2E' },
].map((t) => ({ ...t, studio_id: STUDIO_ID }));

const SALAS = [
  { id: 's1', nombre: 'Sala Reformer', capacidad: 8, color: '#5A6142' },
  { id: 's2', nombre: 'Sala Mat', capacidad: 14, color: '#3E7C86' },
].map((s) => ({ ...s, studio_id: STUDIO_ID }));

// Horario semanal. `ocup` es cuántas plazas están cogidas: se nota a propósito
// que la franja de media mañana va floja y la tarde va llena — es la forma que
// reconoce cualquier propietaria, y es de lo que hablan las páginas.
const SEMANA = [
  // [díaOffset, inicio, fin, tipo, sala, instructora, ocupadas]
  [0, '07:00', '07:50', 't1', 's1', 'i1', 8], [0, '09:00', '09:50', 't1', 's1', 'i2', 7],
  [0, '10:30', '11:25', 't2', 's2', 'i3', 5], [0, '17:00', '17:50', 't1', 's1', 'i1', 8],
  [0, '18:00', '18:50', 't1', 's1', 'i3', 8], [0, '19:00', '19:55', 't2', 's2', 'i2', 12],
  [1, '07:00', '07:50', 't1', 's1', 'i2', 6], [1, '09:00', '09:50', 't1', 's1', 'i1', 8],
  [1, '11:00', '11:50', 't3', 's1', 'i3', 4], [1, '18:00', '18:50', 't1', 's1', 'i1', 8],
  [1, '19:00', '19:55', 't2', 's2', 'i2', 11],
  [2, '07:00', '07:50', 't1', 's1', 'i1', 8], [2, '09:00', '09:50', 't1', 's1', 'i2', 7],
  [2, '10:30', '11:25', 't2', 's2', 'i3', 4], [2, '17:00', '17:50', 't1', 's1', 'i1', 8],
  [2, '18:00', '18:50', 't1', 's1', 'i3', 8], [2, '19:00', '19:55', 't2', 's2', 'i2', 12],
  [2, '20:00', '20:50', 't1', 's1', 'i1', 6],
  [3, '07:00', '07:50', 't1', 's1', 'i2', 7], [3, '09:00', '09:50', 't1', 's1', 'i1', 8],
  [3, '11:00', '11:50', 't3', 's1', 'i3', 3], [3, '18:00', '18:50', 't1', 's1', 'i1', 8],
  [3, '19:00', '19:55', 't2', 's2', 'i2', 13],
  [4, '07:00', '07:50', 't1', 's1', 'i1', 6], [4, '09:00', '09:50', 't1', 's1', 'i2', 8],
  [4, '17:00', '17:50', 't1', 's1', 'i3', 7], [4, '18:00', '18:50', 't1', 's1', 'i1', 8],
  [5, '10:00', '10:50', 't1', 's1', 'i2', 8], [5, '11:00', '11:55', 't2', 's2', 'i3', 9],
];

// ── Clientas, cobros y planes ────────────────────────────────────────────────
// Nombres inventados. La MEZCLA sí es la de un estudio real: mayoría con bono,
// unas cuantas con mensualidad, y siempre alguna que lleva semanas sin venir.
const NOMBRES = [
  ['Nora Aguirre', 'BONO'], ['Marta Belmonte', 'MENSUAL'], ['Elena Sanjuán', 'BONO'],
  ['Lucía Prat', 'MENSUAL'], ['Ana Villar', 'BONO'], ['Sara Ferrán', 'BONO'],
  ['Irene Cabal', 'MENSUAL'], ['Paula Ortiz', 'BONO'], ['Clara Mendoza', 'BONO'],
  ['Rocío Serna', 'MENSUAL'], ['Alba Tirado', 'BONO'], ['Neus Ferrer', 'BONO'],
];

const PLANES = [
  { id: 'p1', studio_id: STUDIO_ID, nombre: 'Bono 10 sesiones', tipo: 'BONO', precio: 120, sesiones: 10, activo: true },
  { id: 'p2', studio_id: STUDIO_ID, nombre: 'Bono 20 sesiones', tipo: 'BONO', precio: 200, sesiones: 20, activo: true },
  { id: 'p3', studio_id: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', precio: 79, sesiones: null, activo: true },
  { id: 'p4', studio_id: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 22, sesiones: 1, activo: true },
];

// ⚠️ Las filas llevan TODAS las columnas del `select` del arranque del panel,
// no las cuatro obvias. Con filas a medias la pantalla no se queda coja: monta
// el error boundary entero ("Algo se ha roto") sin dejar ni un error en
// consola, porque React se lo traga. Costó una bisección averiguarlo.
const socios = NOMBRES.map(([nombre, tipo], i) => ({
  id: `soc-${i}`, studio_id: STUDIO_ID,
  nombre: nombre.split(' ')[0], apellidos: nombre.split(' ').slice(1).join(' '),
  email: `${nombre.split(' ')[0].toLowerCase()}@ejemplo.es`,
  telefono: `6${String(10000000 + i * 137).slice(0, 8)}`,
  nif: null, fecha_alta: `2026-0${(i % 8) + 1}-1${i % 9}`, activo: true,
  lead_stage: 'ACTIVA', tags: [], avatar: null,
  stripe_customer_id: null, stripe_payment_method_id: null,
  tarjeta_exp_mes: null, tarjeta_exp_anio: null, tarjeta_marca: null, tarjeta_ultimos4: null,
  metodo_pago_preferido: null, sepa_mandate_id: null, sepa_payment_method_id: null,
  fecha_nacimiento: null, direccion: null, foto_url: null, referido_por: null,
  campos_extra: {}, aceptacion_fecha: '2026-03-01', aceptacion_firma: '',
  aceptacion_origen: 'MOSTRADOR', aceptacion_por: null,
  consentimiento_salud_fecha: null, consentimiento_salud_registrado_por: null,
  consentimiento_salud_revocado_en: null,
  tipo_plan: tipo,
}));

const suscripciones = socios.map((s, i) => ({
  id: `sus-${i}`, studio_id: STUDIO_ID, socio_id: s.id,
  plan_id: s.tipo_plan === 'MENSUAL' ? 'p3' : (i % 3 === 0 ? 'p2' : 'p1'),
  estado: 'ACTIVA', fecha_inicio: '2026-09-01', fecha_fin: '2026-10-01',
  sesiones_restantes: s.tipo_plan === 'MENSUAL' ? null : (i % 7) + 1,
  stripe_subscription_id: null,
}));

// La mayoría cobrados, dos pendientes y uno fallido: lo que hace útil la
// pantalla de cobros es justo lo que NO está en verde.
const recibos = socios.slice(0, 9).map((s, i) => ({
  id: `rec-${i}`, studio_id: STUDIO_ID, socio_id: s.id, suscripcion_id: `sus-${i}`,
  concepto: i % 3 === 0 ? 'Mensual ilimitado' : 'Bono 10 sesiones',
  importe: i % 3 === 0 ? 79 : 120,
  estado: i === 2 ? 'FALLIDO' : (i < 2 ? 'PENDIENTE' : 'COBRADO'),
  fecha_vencimiento: '2026-09-01', fecha_cobro: i > 1 ? '2026-09-01' : null,
  fecha_devolucion: null, intentos_reintento: i === 2 ? 2 : 0,
  metodo_cobro: 'TARJETA', sepa_estado: null, disputa_estado: null,
  proximo_reintento: i === 2 ? '2026-09-19' : null,
}));

function fecha(offset) {
  const d = new Date(`${LUNES}T00:00:00+02:00`);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const sesiones = SEMANA.map(([off, hi, hf, tc, sa], n) => ({
  id: `ses-${n}`, studio_id: STUDIO_ID, tipo_clase_id: tc, sala_id: sa,
  instructor_id: SEMANA[n][5],
  inicio: `${fecha(off)}T${hi}:00+02:00`, fin: `${fecha(off)}T${hf}:00+02:00`,
  aforo_maximo: sa === 's1' ? 8 : 14, cancelada: false, notas: null,
}));

// Las clases de lunes y martes ya pasaron respecto a HOY (miércoles), así que
// sus reservas van ASISTIDA: sin eso la columna "última asistencia" de Clientas
// sale vacía en todas las filas y la captura enseña una pantalla a medias.
const reservas = SEMANA.flatMap(([off, , , , , , ocup], n) =>
  Array.from({ length: ocup }, (_, k) => ({
    id: `r-${n}-${k}`, studio_id: STUDIO_ID, sesion_id: `ses-${n}`,
    socio_id: `soc-${k}`, estado: off < 2 ? 'ASISTIDA' : 'CONFIRMADA',
    spot_id: null, posicion_espera: null, oferta_expira_en: null,
    check_in_en: off < 2 ? `${fecha(off)}T07:05:00+02:00` : null,
    creado_en: '2026-09-10T10:00:00Z',
  })));

const sesionApi = (r) => ({
  id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
  instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
  cancelada: false, notas: null, precioPuntual: null, serieId: null,
  incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
});
const salaApi = (s) => ({ id: s.id, studioId: s.studio_id, nombre: s.nombre, capacidad: s.capacidad, color: s.color });
const insApi = (i) => ({
  id: i.id, studioId: i.studio_id, nombre: i.nombre, email: null, telefono: null,
  color: i.color, activo: true, avatar: null, fotoUrl: null, rol: i.rol, authUserId: null,
});

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

// Cosas que no deben salir en una captura de marketing: el botón flotante de
// WhatsApp (tapa la esquina), el widget de ayuda y cualquier tooltip abierto.
const OCULTAR = `
  [class*="whatsapp"], [aria-label*="WhatsApp"], [aria-label*="Ayuda"],
  [data-testid="help-widget"] { display: none !important; }
`;

async function montarPanel(page) {
  await page.clock.setFixedTime(new Date(`${HOY}T09:30:00+02:00`));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'captura', refresh_token: 'captura', expires_at: 4102444800,
      expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'hola@estudioaura.es', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID]);

  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/api/layout**', (r) =>
    json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/rest/v1/studios**', (r) => json(r, STUDIO));
  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', (r) => json(r, INSTRUCTORAS));
  await page.route('**/rest/v1/tipos_clase**', (r) => json(r, TIPOS));
  await page.route('**/rest/v1/salas**', (r) => json(r, SALAS));
  await page.route('**/rest/v1/sesiones**', (r) => json(r, sesiones));
  await page.route('**/rest/v1/reservas**', (r) => json(r, reservas));
  await page.route('**/rest/v1/socios**', (r) => json(r, socios));
  await page.route('**/rest/v1/suscripciones**', (r) => json(r, suscripciones));
  await page.route('**/rest/v1/planes_tarifa**', (r) => json(r, PLANES));
  await page.route('**/rest/v1/recibos**', (r) => json(r, recibos));
  await page.route('**/rest/v1/rpc/stats_clientas', (r) => json(r, [{ total: 128, activas: 96, con_bono: 74, inactivas_30d: 12 }]));
  await page.route('**/rest/v1/rpc/informe_ingresos', (r) => json(r, [{ total_ingresos: 7480, n_cobrados: 63, n_socias_unicas: 51 }]));
  await page.route('**/rest/v1/rpc/ingresos_por_dia', (r) => json(r,
    Array.from({ length: 30 }, (_, i) => ({ dia: `2026-09-${String(i + 1).padStart(2, '0')}`, total: [120, 200, 79, 340, 0, 22, 160][i % 7] * (1 + (i % 3) * 0.4) }))));
  await page.route('**/rest/v1/rpc/ocupacion_por_tipo', (r) => json(r, [
    { tipo_clase_id: 't1', n_sesiones: 19, aforo: 152, ocupadas: 138 },
    { tipo_clase_id: 't2', n_sesiones: 7, aforo: 98, ocupadas: 61 },
    { tipo_clase_id: 't3', n_sesiones: 3, aforo: 24, ocupadas: 11 },
  ]));
  await page.route('**/rest/v1/rpc/ventas_por_tipo', (r) => json(r, [
    { tipo: 'BONO', n_ventas: 34, total: 4080 },
    { tipo: 'MENSUAL', n_ventas: 21, total: 1659 },
    { tipo: 'PUNTUAL', n_ventas: 8, total: 176 },
  ]));
  await page.route('**/api/equipo**', (r) => json(r, { instructores: INSTRUCTORAS.map(insApi), tarifas: [
    { instructorId: 'i1', tarifaHora: 38 }, { instructorId: 'i2', tarifaHora: 34 }, { instructorId: 'i3', tarifaHora: 32 },
  ] }));
  // La página pública NO usa las tablas: pide todo a /api/public/studio-data,
  // que el catch-all de arriba dejaba en {} — de ahí el "sin clases este día".
  await page.route('**/api/public/studio-data**', (r) => json(r, {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Aura', slug: 'aura', ciudad: 'Barcelona',
      direccion: 'Carrer de Verdi 12', telefono: '+34 931 000 000', moneda: 'EUR',
      colorPrimario: '#343825', logoUrl: null, horaApertura: '07:00:00', horaCierre: '21:00:00',
    },
    sesiones: sesiones.map(sesionApi),
    tiposClase: TIPOS.map((t) => ({ id: t.id, studioId: t.studio_id, nombre: t.nombre, duracionMin: t.duracion_min, color: t.color, descripcion: null, nivel: null })),
    salas: SALAS.map(salaApi),
    instructores: INSTRUCTORAS.map(insApi),
    spots: [], planesTarifa: PLANES.map((x) => ({ id: x.id, studioId: x.studio_id, nombre: x.nombre, tipo: x.tipo, precio: x.precio, sesiones: x.sesiones, activo: true, tiposClaseIds: null })),
    ocupacion: reservas.reduce((acc, r) => { acc[r.sesion_id] = (acc[r.sesion_id] ?? 0) + 1; return acc; }, {}),
    citasServicios: [], citasDisponibilidad: [], sustituciones: [],
  }));
  await page.route('**/api/calendario**', (r) => json(r, {
    sesiones: sesiones.map(sesionApi),
    reservas: reservas.map((x) => ({ id: x.id, studioId: x.studio_id, sesionId: x.sesion_id, socioId: x.socio_id, estado: x.estado })),
    sustituciones: [],
    salas: SALAS.map(salaApi),
    instructores: INSTRUCTORAS.map(insApi),
    horaApertura: '07:00:00', horaCierre: '21:00:00', rol: 'PROPIETARIO',
  }));
}

/** Capturas: cada una dice qué pantalla monta y qué recorte se queda. */
const CAPTURAS = [
  {
    nombre: 'calendario-semana',
    alto: 1000,
    recorte: { x: 0, y: 0, width: 1440, height: 812 },
    async abrir(page) {
      await page.goto(`${BASE}/calendario`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Semana', exact: true }).click().catch(() => {});
      await page.waitForTimeout(1200);
      // Arranca la rejilla a las 07:00 (primera clase) en vez de en "ahora":
      // así el recorte enseña el día lleno y no una franja vacía.
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="grid-dia-scroll"], .overflow-y-auto');
        if (el) el.scrollTop = 0;
      });
      await page.waitForTimeout(400);
    },
  },
  {
    nombre: 'calendario-dia',
    alto: 1000,
    recorte: { x: 0, y: 0, width: 1440, height: 812 },
    async abrir(page) {
      await page.goto(`${BASE}/calendario`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Día', exact: true }).click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="grid-dia-scroll"], .overflow-y-auto');
        if (el) el.scrollTop = 0;
      });
      await page.waitForTimeout(400);
    },
  },
  // Pantallas de lista/panel: no hay que tocar nada, solo esperar a que monten.
  // `/informes` ESTUVO fuera de esta lista varias sesiones: con este mismo
  // juego de mocks montaba el error boundary ("Algo se ha roto") sin dejar
  // `pageerror` ni traza, y no se pudo aislar aunque cada pieza por separado
  // (RPC, socios, suscripciones, planes, recibos, sesiones/reservas)
  // renderizaba bien. Se depuró añadiendo un `console.error` temporal dentro
  // de `app/global-error.tsx` (revertido después) para leer el error real que
  // Sentry sí recibía pero la consola del navegador no mostraba — con eso, la
  // página monta limpia con el juego de mocks de RPC que ya se había ido
  // completando para otras capturas (`informe_ingresos`, `ingresos_por_dia`,
  // `ocupacion_por_tipo`, `ventas_por_tipo`, `stats_clientas`): el fallo real
  // ya no era reproducible, probablemente cerrado por esos mocks al ir
  // creciendo con el tiempo. Verificado tanto en `next dev` como en el build
  // de producción real (`next build && E2E_TEST=1 next start`).
  ...[
    ['clientas', '/clientas'],
    ['cobros', '/cobros'],
    ['equipo', '/equipo'],
    ['sustituciones', '/sustituciones'],
    ['informes', '/informes'],
  ].map(([nombre, ruta]) => ({
    nombre,
    alto: 1000,
    recorte: { x: 0, y: 0, width: 1440, height: 812 },
    async abrir(page) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2200);
    },
  })),
  {
    // Lo que ve la ALUMNA, no la propietaria: la página pública del estudio,
    // con su marca. En móvil, que es como se usa de verdad.
    nombre: 'portal-alumna',
    ancho: 460,
    alto: 1000,
    async abrir(page) {
      await page.goto(`${BASE}/reservar/aura`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2200);
      // El cartel de bienvenida del quiz tapa el horario, que es lo que
      // interesa enseñar.
      await page.getByRole('button', { name: /No, gracias/i }).click().catch(() => {});
      await page.waitForTimeout(900);
    },
  },
];

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const navegador = await chromium.launch();
  const hechas = [];

  for (const cap of CAPTURAS) {
    const ctx = await navegador.newContext({
      viewport: { width: cap.ancho ?? 1440, height: cap.alto },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    if (process.env.CAPTURA_DEBUG) {
      page.on('pageerror', (e) => console.log('  ⚠️', cap.nombre, String(e).split('\n')[0].slice(0, 140)));
    }
    await montarPanel(page);
    await cap.abrir(page);
    await page.addStyleTag({ content: OCULTAR });
    await page.waitForTimeout(250);
    const destino = path.join(DESTINO, `${cap.nombre}.png`);
    await page.screenshot({ path: destino, ...(cap.recorte ? { clip: cap.recorte } : {}) });
    hechas.push(`${cap.nombre}.png`);
    await ctx.close();
  }

  await navegador.close();
  console.log(`${hechas.length} capturas en public/producto/`);
  hechas.forEach((h) => console.log('  ·', h));
}

main().catch((e) => { console.error(e); process.exit(1); });
