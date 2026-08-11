// Captura las pantallas REALES del panel para las páginas de /funcionalidades.
//
//   npm run build && npx next start -p 3100 &
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

const reservas = SEMANA.flatMap(([, , , , , , ocup], n) =>
  Array.from({ length: ocup }, (_, k) => ({
    id: `r-${n}-${k}`, studio_id: STUDIO_ID, sesion_id: `ses-${n}`,
    socio_id: `soc-${k}`, estado: 'CONFIRMADA',
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
];

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const navegador = await chromium.launch();
  const hechas = [];

  for (const cap of CAPTURAS) {
    const ctx = await navegador.newContext({
      viewport: { width: 1440, height: cap.alto },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
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
