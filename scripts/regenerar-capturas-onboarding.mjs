// Genera las capturas REALES del producto que se ven en las pantallas de valor
// del onboarding (components/onboarding/pantallas-valor.tsx).
//
// Se ejecuta contra el build local con la red mockeada, igual que los e2e: los
// datos son de mentira pero la INTERFAZ es la de verdad, así que la captura no
// puede enseñar una pantalla que ya no existe.
//
//   npm run build && npx next start -p 3000
//   node scripts/regenerar-capturas-onboarding.mjs
//
// Mismo trato que scripts/regenerar-marca.mjs: un solo comando regenera todos
// los derivados, para que no acaben conviviendo dos versiones del producto.
//
// ⚠️ Hay que volver a correrlo cuando el calendario o la página de reservas
// cambien de aspecto. Es el mismo trato que scripts/regenerar-marca.mjs: la
// alternativa es que la propietaria vea en el onboarding una interfaz que no
// se parece a la que encuentra al entrar.
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const BASE = 'http://localhost:3000';
const SALIDA = 'public/onboarding';
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

// ⚠️ La vista de semana del calendario abre una ventana de SIETE DÍAS DESDE
// HOY, no de lunes a domingo. Sembrando desde el lunes, la mitad de las clases
// caía fuera de la ventana y la captura salía casi vacía. Se siembra desde hoy.
const hoy = new Date();
const LUNES = hoy.toISOString().slice(0, 10);
const dia = (n) => { const d = new Date(`${LUNES}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const en = (n, hhmm, mins) => {
  const ini = new Date(`${dia(n)}T${hhmm}:00`);
  const fin = new Date(ini.getTime() + mins * 60000);
  return { inicio: ini.toISOString(), fin: fin.toISOString() };
};

const SALAS = [
  { id: 'sala-1', studioId: 's', nombre: 'Sala Reformer', capacidad: 8, color: '#7FB2E5' },
  { id: 'sala-2', studioId: 's', nombre: 'Sala Mat', capacidad: 12, color: '#8FC98A' },
];
const TIPOS = [
  { id: 'tc-1', studioId: 's', nombre: 'Reformer', color: '#7FB2E5', duracionMinutos: 50, nivel: 'TODOS', activo: true },
  { id: 'tc-2', studioId: 's', nombre: 'Mat', color: '#8FC98A', duracionMinutos: 50, nivel: 'TODOS', activo: true },
  { id: 'tc-3', studioId: 's', nombre: 'Prenatal', color: '#E8B45C', duracionMinutos: 50, nivel: 'TODOS', activo: true },
];
const INSTRUCTORES = [
  { id: 'i-1', studioId: 's', nombre: 'Carmen', email: null, telefono: null, activo: true, rol: 'INSTRUCTOR', color: '#B79BE0' },
  { id: 'i-2', studioId: 's', nombre: 'Ana', email: null, telefono: null, activo: true, rol: 'INSTRUCTOR', color: '#5FC2C2' },
];

// Una semana con pinta de estudio en marcha: mañanas y tardes, dos salas.
const PLAN = [
  [0, '09:00', 'tc-1', 'sala-1', 'i-1'], [0, '10:00', 'tc-1', 'sala-1', 'i-1'], [0, '18:00', 'tc-2', 'sala-2', 'i-2'], [0, '19:00', 'tc-1', 'sala-1', 'i-2'],
  [1, '09:00', 'tc-2', 'sala-2', 'i-2'], [1, '10:00', 'tc-1', 'sala-1', 'i-1'], [1, '17:00', 'tc-3', 'sala-2', 'i-1'], [1, '19:00', 'tc-1', 'sala-1', 'i-2'],
  [2, '09:00', 'tc-1', 'sala-1', 'i-1'], [2, '11:00', 'tc-2', 'sala-2', 'i-2'], [2, '18:00', 'tc-1', 'sala-1', 'i-1'], [2, '19:00', 'tc-2', 'sala-2', 'i-2'],
  [3, '09:00', 'tc-1', 'sala-1', 'i-2'], [3, '10:00', 'tc-3', 'sala-2', 'i-1'], [3, '18:00', 'tc-1', 'sala-1', 'i-1'], [3, '19:00', 'tc-2', 'sala-2', 'i-2'],
  [4, '09:00', 'tc-1', 'sala-1', 'i-1'], [4, '10:00', 'tc-2', 'sala-2', 'i-2'], [4, '18:00', 'tc-1', 'sala-1', 'i-2'],
  [5, '10:00', 'tc-2', 'sala-2', 'i-1'],
];
const SESIONES = PLAN.map(([d, h, tc, sala, ins], i) => ({
  id: `ses-${i}`, studioId: 's', tipoClaseId: tc, salaId: sala, instructorId: ins,
  ...en(d, h, 50), aforoMaximo: sala === 'sala-1' ? 8 : 12,
  cancelada: false, notas: null, precioPuntual: null, serieId: null,
}));
// Ocupación variada: algunas llenas, otras a medias. Una semana perfecta no se
// cree; una vacía no vende.
const OCUPACION = [8, 8, 9, 6, 7, 8, 5, 8, 8, 10, 7, 6, 6, 4, 8, 9, 8, 7, 6, 3];
const RESERVAS = SESIONES.flatMap((s, i) =>
  Array.from({ length: Math.min(OCUPACION[i] ?? 5, s.aforoMaximo) }, (_, n) => ({
    id: `r-${i}-${n}`, studioId: 's', socioId: `soc-${n}`, sesionId: s.id,
    estado: 'CONFIRMADA', creadoEn: s.inicio, spotId: null,
  })),
);

async function nuevaPagina(browser, { width, height }) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
    user: { id: u, email: 'carmen@studiocarmen.es', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  })), ['sb-example-auth-token', 'auth-e2e-duena']);
  return p;
}

const browser = await chromium.launch();

// ── 1. El calendario del panel ──────────────────────────────────────────────
{
  const p = await nuevaPagina(browser, { width: 1380, height: 880 });
  // ⚠️ El catch-all va PRIMERO: Playwright resuelve las rutas en orden INVERSO
  // al de registro, así que la última gana. Al revés, `**/api/**` se tragaba
  // `/api/calendario` y la rejilla se quedaba en «Cargando…» para siempre.
  await p.route('**/api/**', r => json(r, {}));
  await p.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await p.route('**/api/billing/**', r => json(r, { bloqueado: false, activo: true, plan: 'ESTUDIO', configurado: true }));
  await p.route('**/api/theme**', r => json(r, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await p.route('**/api/calendario**', r => json(r, {
    sesiones: SESIONES, reservas: RESERVAS, sustituciones: [],
    salas: SALAS, instructores: INSTRUCTORES,
    horaApertura: '08:00:00', horaCierre: '21:00:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await p.route('**/rest/v1/**', r => json(r, []));
  await p.route('**/rest/v1/tipos_clase**', r => json(r, TIPOS));
  await p.route('**/rest/v1/salas**', r => json(r, SALAS));
  await p.route('**/rest/v1/instructores**', r => json(r, INSTRUCTORES));
  await p.route('**/rest/v1/rpc/current_studio_id', r => json(r, 's'));
  await p.route('**/rest/v1/studios**', r => json(r, {
    id: 's', nombre: 'Studio Carmen', slug: 'studio-carmen',
    owner_auth_user_id: 'auth-e2e-duena', bienvenida_vista_en: '2026-01-01T00:00:00Z',
    hora_apertura: '08:00:00', hora_cierre: '21:00:00',
  }));
  await p.goto(`${BASE}/calendario`, { waitUntil: 'networkidle' });
  // Se espera a que la rejilla tenga clases de verdad, no a un temporizador:
  // una captura tomada a ciegas puede salir con «Cargando…» y nadie se entera
  // hasta verla en producción.
  // Se espera a una clase REAL en la rejilla, no a un temporizador: una captura
  // tomada a ciegas puede salir con «Cargando…» y nadie se entera hasta verla
  // en producción.
  await p.getByText('141 de 196 plazas', { exact: false }).first()
    .waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2000);
  // Solo la TARJETA del calendario: dentro de un panel de 420 px el sidebar, la
  // barra superior y la burbuja de ayuda no se leen y roban sitio a lo que sí
  // importa. Se recorta por la caja real del elemento y no por coordenadas a
  // ojo, que se desajustan al primer cambio de maquetación.
  // ⚠️ Se oculta el aviso «N clases necesitan una decisión». NO es maquillaje
  // de una pantalla real: aparece porque las clases sembradas empiezan hoy y,
  // según la hora a la que se genere la captura, algunas quedan en el pasado
  // sin lista pasada. Es un artefacto de los datos de mentira, no algo que la
  // propietaria vaya a ver por tener su estudio en marcha.
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      if (/clases? necesitan? una decisión/i.test(el.textContent ?? '')
          && (el.textContent ?? '').length < 200) { el.remove(); break; }
    }
  });

  // La rejilla abre desplazada a la hora actual, así que a media tarde la
  // captura salía con cuatro filas vacías y las clases cortadas abajo. Se sube
  // a primera hora, que es donde está la mañana llena.
  await p.evaluate(() => {
    const desplazables = [...document.querySelectorAll('div')].filter(
      (d) => d.scrollHeight > d.clientHeight + 80 && d.clientHeight > 200,
    );
    for (const d of desplazables) d.scrollTop = 0;
  });
  await p.waitForTimeout(400);

  const caja = await p.evaluate(() => {
    const h = [...document.querySelectorAll('h1')].find(e => e.textContent?.trim() === 'Calendario');
    // Se sube hasta el contenedor que abarca cabecera Y rejilla: parar en el
    // primero ancho recortaba solo la barra de título.
    let el = h ?? null;
    while (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 700 && r.height > 500) break;
      el = el.parentElement;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!caja) throw new Error('no se ha encontrado la tarjeta del calendario');
  const png = await p.screenshot({
    clip: { x: caja.x, y: caja.y, width: caja.width, height: Math.min(caja.height, 620) },
  });
  // A WebP y a la mitad de ancho: el panel donde se pinta mide 420 px, así que
  // 1100 de ancho ya es el doble de lo necesario para una pantalla retina. El
  // PNG crudo pesaba ~180 KB para algo que ve alguien que aún no sabe si se
  // queda.
  await sharp(png).resize({ width: 1100 }).webp({ quality: 82 })
    .toFile(`${SALIDA}/calendario.webp`);
  console.log('· calendario listo');
  await p.close();
}

// ── 2. Su página pública de reservas ────────────────────────────────────────
// La que ve su alumna. Es lo que promete la primera pantalla del onboarding, y
// la más fácil de capturar de verdad: se sirve de un solo endpoint público.
{
  const p = await nuevaPagina(browser, { width: 1180, height: 900 });
  await p.route('**/rest/v1/**', r => json(r, { id: 's' }));
  await p.route('**/api/**', r => json(r, {}));
  await p.route('**/api/theme**', r => json(r, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 14 }));
  await p.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await p.route('**/api/public/studio-data', r => json(r, {
    studio: {
      id: 's', nombre: 'Studio Carmen', slug: 'studio-carmen', ciudad: 'Valencia',
      direccion: 'Calle del Mar, 21', email: 'hola@studiocarmen.es', telefono: '+34 600 111 222',
      colorPrimario: '#343825', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio de Pilates en grupos de ocho. Reformer, Mat y prenatal.',
      anioFundacion: 2019,
    },
    tiposClase: TIPOS, salas: SALAS, instructores: INSTRUCTORES, sesiones: SESIONES,
    aforoReservas: RESERVAS.map(r => ({ sesionId: r.sesionId })),
    spots: [], planesTarifa: [], videosOnDemand: [], rewardRules: [], rewardCatalog: [],
    levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [], socia: null,
  }));

  await p.goto(`${BASE}/reservar/studio-carmen`, { waitUntil: 'networkidle' });
  await p.getByText('Reformer').first().waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: 1180, height: 720 } });
  await sharp(png).resize({ width: 1100 }).webp({ quality: 82 })
    .toFile(`${SALIDA}/reservar.webp`);
  console.log('· página de reservas lista');
  await p.close();
}

await browser.close();
