import { expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// El andamiaje de «Pregúntale a Tentare» que comparten e2e/asistente.spec.ts
// (Chromium) y e2e/asistente-movil.spec.ts (WebKit/iPhone): el estudio
// sembrado con el asistente, POST /api/asistente mockeado como NDJSON (nunca se
// llama a Anthropic) y las respuestas de ejemplo. Los mocks van DESPUÉS de
// `montar()` (gana la última ruta registrada).

export const STUDIO_ID = 'studio-test';
export const UID = 'auth-e2e-duena';
export const CONVERSACION = '4f1d2c3b-7a8e-4b9c-9d0e-1f2a3b4c5d6e';
/** Un literal que solo está en components/asistente/vista-chat.tsx. */
export const HUELLA_DEL_CHAT = 'Tentare consulta tus datos y crea clases, salas, eventos y citas si tú confirmas.';

export const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
export const ndjson = (eventos: unknown[]) => eventos.map(e => JSON.stringify(e)).join('\n') + '\n';

export const CLASES = [
  { sesionId: 'ses-a', hora: '08:00', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_2', ocupadas: 6, aforo: 8, enEspera: 0, senal: 'OK', motivo: null },
  { sesionId: 'ses-b', hora: '10:00', tipoClase: 'Mat', sala: 'Sala Pequeña', instructora: 'EQUIPO_1', ocupadas: 4, aforo: 8, enEspera: 0, senal: 'ATENCION', motivo: 'Va floja: 4 huecos' },
  { sesionId: 'ses-c', hora: '13:30', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_2', ocupadas: 7, aforo: 8, enEspera: 0, senal: 'OK', motivo: null },
  { sesionId: 'ses-d', hora: '18:00', tipoClase: 'Barre', sala: 'Sala Pequeña', instructora: '', ocupadas: 5, aforo: 10, enEspera: 0, senal: 'PROBLEMA', motivo: 'Sin instructora' },
  { sesionId: 'ses-e', hora: '19:00', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_1', ocupadas: 8, aforo: 8, enEspera: 3, senal: 'ATENCION', motivo: 'Llena, con 3 en espera' },
];

/** Una conversación de ejemplo: métricas, la lista de clases y el texto con una persona. */
export const RESPUESTA = [
  { t: 'inicio', conversacionId: CONVERSACION, disponibles: 182 },
  { t: 'herramienta', id: 'tu_1', nombre: 'agenda_del_dia', etiqueta: 'Mirando la agenda del miércoles 7 de octubre…' },
  { t: 'referencias', refs: { EQUIPO_1: { nombre: 'Marta Ruiz', href: null }, EQUIPO_2: { nombre: 'Cloe', href: null } } },
  { t: 'bloque', id: 'tu_1-0', bloque: {
    tipo: 'metricas', titulo: 'Mañana, miércoles 7 de octubre',
    metricas: [
      { etiqueta: 'Clases', valor: '5', tipo: 'n', href: '/calendario' },
      { etiqueta: 'Alumnas apuntadas', valor: '30', tipo: 'n', comparacion: { texto: '+4', tono: 'sube', frente: 'el miércoles pasado' } },
      { etiqueta: 'Huecos libres', valor: '12', tipo: 'n' },
      { etiqueta: 'Cobrado este mes', valor: '4.215,00 €', tipo: 'eur', href: '/cobros', comparacion: { texto: '+12 %', tono: 'sube', frente: 'septiembre' } },
    ],
  } },
  { t: 'bloque', id: 'tu_1-1', bloque: { tipo: 'clases', titulo: 'Clases del miércoles 7 de octubre', href: '/calendario', total: 5, clases: CLASES } },
  ...['Mañana tienes 5 clases con 30 alumnas apuntadas. ', 'La que pide atención es la de las 19:00 con [EQUIPO_1]: ', 'está llena y tiene 3 en espera. ', 'A la de las 18:00 le falta instructora.'].map(delta => ({ t: 'texto', delta })),
  { t: 'fin', unidades: 1, disponibles: 181, motivo: 'OK' },
];

export const SALDO = { enPrueba: false, cuota: 200, usadas: 18, disponibles: 182, renuevaEl: '2026-11-01' };

/**
 * El panel sembrado con el asistente: plan con la feature, el servidor
 * encendido (o no) y POST /api/asistente con `responder`. Devuelve los
 * contadores de cada petición del asistente.
 */
export async function conAsistente(page: Page, o: {
  rol?: 'PROPIETARIO' | 'MANAGER' | 'RECEPCION';
  disponible?: boolean;
  responder?: (r: Route) => Promise<void> | void;
} = {}) {
  await montar(page);
  const rol = o.rol ?? 'PROPIETARIO';
  const n = { disponible: 0, saldo: 0, preguntas: 0, cuerpos: [] as unknown[] };
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', email: 'cloe@example.com', moneda: 'EUR',
    owner_auth_user_id: rol === 'PROPIETARIO' ? UID : 'auth-e2e-otra-duena',
    plan: 'ESTUDIO', subscription_status: 'active',
  }));
  if (rol !== 'PROPIETARIO') {
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-yo', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol, color: '#343825', auth_user_id: UID },
      { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#D9C29E', auth_user_id: 'auth-marta' },
    ]));
  }
  await page.route((u) => u.pathname === '/api/asistente/saldo', (r) => {
    if (new URL(r.request().url()).searchParams.get('solo') === 'disponible') {
      n.disponible++;
      return json(r, { disponible: o.disponible ?? true });
    }
    n.saldo++;
    return json(r, SALDO);
  });
  await page.route((u) => u.pathname === '/api/asistente/conversaciones', (r) => json(r, { conversaciones: [] }));
  await page.route((u) => u.pathname === '/api/asistente', async (r) => {
    n.preguntas++;
    n.cuerpos.push(r.request().postDataJSON());
    if (o.responder) return o.responder(r);
    return r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(RESPUESTA) });
  });
  return n;
}

export const chat = (page: Page) => page.getByTestId('chat-asistente');
export const barra = (page: Page) => page.getByTestId('barra-preguntar');
export const tenti = (page: Page) => chat(page).locator('[data-tenti-asistente]').last();
export const sugerencia = (page: Page, texto: string) => chat(page).getByLabel('Preguntas de ejemplo').getByRole('button', { name: texto });
export const campoChat = (page: Page) => chat(page).getByLabel('Pregunta sobre tu estudio');

export async function abrirDesdeLaBarra(page: Page) {
  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 30_000 });
  await barra(page).click();
  await expect(page).toHaveURL(/\/asistente$/, { timeout: 30_000 });
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
}

export const SEGUNDA = [
  { t: 'inicio', conversacionId: CONVERSACION, disponibles: 181 },
  { t: 'herramienta', id: 'tu_2', nombre: 'pagos_pendientes', etiqueta: 'Mirando los pagos pendientes…' },
  { t: 'referencias', refs: { ALUMNA_1: { nombre: 'Laura Martín', href: '/clientas/soc-2' }, ALUMNA_2: { nombre: 'Bea Ortega', href: '/clientas/soc-4' }, ALUMNA_3: { nombre: 'María García', href: '/clientas/soc-1' } } },
  { t: 'bloque', id: 'tu_2-0', bloque: { tipo: 'recibos', titulo: 'Sin cobrar', href: '/cobros', total: 3, importeTotal: '168,00 €', recibos: [
    { reciboId: 'r1', alumna: 'ALUMNA_1', importe: '89,00 €', situacion: 'IMPAGADO', vence: 'jueves 1 de octubre' },
    { reciboId: 'r2', alumna: 'ALUMNA_2', importe: '79,00 €', situacion: 'POR_COBRAR', vence: 'lunes 5 de octubre' },
    { reciboId: 'r3', alumna: 'ALUMNA_3', importe: '79,00 €', situacion: 'EN_CURSO', vence: 'martes 6 de octubre' },
  ] } },
  ...['Tienes 168,00 € pendientes de cobro entre 2 alumnas. ', 'El que más urge es el de [ALUMNA_1]: **89,00 €** impagados desde el jueves 1 de octubre. ', 'El de [ALUMNA_3] ya está en el banco y todavía no es deuda.'].map(delta => ({ t: 'texto', delta })),
  { t: 'fin', unidades: 1, disponibles: 180, motivo: 'OK' },
];

export const LISTA = [
  { id: CONVERSACION, titulo: '¿Qué clases hay mañana?', ultimaEn: new Date().toISOString() },
  { id: '0b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Quién lleva más de 30 días sin venir?', ultimaEn: new Date().toISOString() },
  { id: '1b0c0d0e-1111-4222-8333-944445555666', titulo: 'Hazme un resumen del estudio', ultimaEn: new Date(Date.now() - 86_400_000).toISOString() },
  { id: '2b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Qué bonos caducan esta semana?', ultimaEn: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: '3b0c0d0e-1111-4222-8333-944445555666', titulo: 'Quiero hacer un taller: ¿qué día me conviene?', ultimaEn: new Date(Date.now() - 12 * 86_400_000).toISOString() },
  { id: '4b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Cuánto cobré con Laura Martín el mes pasado?', ultimaEn: new Date(Date.now() - 40 * 86_400_000).toISOString() },
];

// ── Fase 2: acciones con confirmación ───────────────────────────────────────

export const ACCION_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const EN_15_MIN = () => new Date(Date.now() + 15 * 60_000).toISOString();

export const PROPUESTAS = {
  CREAR_CLASE: {
    texto: 'Propongo un Reformer el miércoles 7 de octubre, de 18:00 a 18:55, en Sala Grande con [EQUIPO_1], con 8 plazas. Pulsa Confirmar para crearlo.',
    titulo: 'Crear una clase', href: '/calendario', ver: 'Ver en Calendario',
    lineas: [['Clase', 'Reformer'], ['Día', 'miércoles 7 de octubre'], ['Hora', '18:00–18:55'], ['Sala', 'Sala Grande'], ['Instructora', '[EQUIPO_1]'], ['Plazas', '8']],
    avisos: [], efecto: null,
  },
  CREAR_SALA: {
    texto: 'Propongo una sala nueva, Terraza, con 6 plazas. Pulsa Confirmar para crearla.',
    titulo: 'Crear una sala', href: '/configuracion?tab=estudio&abrir=salas', ver: 'Ver en Configuración',
    lineas: [['Sala', 'Terraza'], ['Aforo', '6 plazas']], avisos: [], efecto: null,
  },
  CREAR_EVENTO: {
    texto: 'Propongo publicar el taller de respiración el sábado 10 de octubre a las 11:00, con 12 plazas. Pulsa Confirmar para publicarlo.',
    titulo: 'Publicar un evento', href: '/comunidad', ver: 'Ver en Comunidad',
    lineas: [['Anuncio', 'Taller de respiración con Marta'], ['Día', 'sábado 10 de octubre'], ['Hora', '11:00'], ['Lugar', 'Terraza'], ['Plazas', '12']],
    avisos: [], efecto: 'Se publica en la Comunidad de la app y se avisa a todas las alumnas con una notificación.',
  },
  CREAR_CITA: {
    texto: 'Propongo una valoración de [ALUMNA_1] con [EQUIPO_1] el jueves 8 de octubre de 10:00 a 11:00. Pulsa Confirmar para crearla.',
    titulo: 'Crear una cita', href: '/citas', ver: 'Ver en Citas',
    lineas: [['Alumna', '[ALUMNA_1]'], ['Con', '[EQUIPO_1]'], ['Tipo', 'Valoración'], ['Día', 'jueves 8 de octubre'], ['Hora', '10:00–11:00']],
    avisos: ['La cita se crea sin precio ni cobro.'], efecto: null,
  },
} as const;
export type TipoPropuesta = keyof typeof PROPUESTAS;

export function respuestaPropuesta(tipo: TipoPropuesta, o: { expiraEn?: string; id?: string } = {}) {
  const p = PROPUESTAS[tipo];
  return [
    { t: 'inicio', conversacionId: CONVERSACION, disponibles: 182 },
    { t: 'herramienta', id: 'tu_a', nombre: 'proponer_clase', etiqueta: 'Preparando la clase…' },
    { t: 'referencias', refs: { EQUIPO_1: { nombre: 'Marta Ruiz', href: null }, ALUMNA_1: { nombre: 'Laura Martín', href: '/clientas/soc-2' } } },
    { t: 'bloque', id: 'tu_a-0', bloque: {
      tipo: 'propuesta',
      propuesta: {
        id: o.id ?? ACCION_ID, accion: tipo, titulo: p.titulo, lineas: p.lineas.map(([etiqueta, valor]) => ({ etiqueta, valor })),
        avisos: p.avisos, efecto: p.efecto, expiraEn: o.expiraEn ?? EN_15_MIN(), destino: { href: p.href, texto: p.ver },
      },
    } },
    { t: 'texto', delta: p.texto },
    { t: 'fin', unidades: 1, disponibles: 181, motivo: 'OK' },
  ];
}

/**
 * El asistente con acciones: el chat devuelve una propuesta y confirmar/cancelar
 * van mockeados con CONTADORES (un camino de fallo sin contador es hueco).
 * `confirmar` decide la respuesta de cada intento.
 */
export async function conAcciones(page: Page, o: {
  tipo?: TipoPropuesta;
  rol?: 'PROPIETARIO' | 'MANAGER' | 'RECEPCION';
  expiraEn?: string;
  confirmar?: (r: Route, intento: number) => Promise<void> | void;
} = {}) {
  const tipo = o.tipo ?? 'CREAR_CLASE';
  const n = await conAsistente(page, {
    rol: o.rol,
    responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(respuestaPropuesta(tipo, { expiraEn: o.expiraEn })) }),
  });
  const acc = { confirmar: 0, cancelar: 0, cuerposConfirmar: [] as unknown[], cuerposCancelar: [] as unknown[] };
  await page.route((u) => u.pathname === '/api/asistente/acciones/confirmar', async (r) => {
    acc.confirmar++;
    acc.cuerposConfirmar.push(r.request().postDataJSON());
    if (o.confirmar) return o.confirmar(r, acc.confirmar);
    return json(r, { estado: 'EJECUTADA', resultado: { href: PROPUESTAS[tipo].href, texto: PROPUESTAS[tipo].ver }, yaCreada: false });
  });
  await page.route((u) => u.pathname === '/api/asistente/acciones/cancelar', (r) => {
    acc.cancelar++;
    acc.cuerposCancelar.push(r.request().postDataJSON());
    return json(r, { estado: 'CANCELADA' });
  });
  return { ...n, acc, tipo };
}

/** Abre el chat y pide algo: la propuesta llega como tarjeta dentro de la respuesta. */
export async function pedirAlAsistente(page: Page, texto = 'Crea una clase de Reformer el miércoles a las 18:00') {
  await ir(page, 'asistente');
  await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
  await campoChat(page).fill(texto);
  await campoChat(page).press('Enter');
  const tarjeta = chat(page).locator('[data-bloque="propuesta"]');
  await expect(tarjeta).toBeVisible({ timeout: 30_000 });
  return tarjeta;
}
