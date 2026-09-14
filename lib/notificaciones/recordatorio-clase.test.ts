import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  barrerRecordatoriosClase, canalesRecordatorio, claveIdempotenciaRecordatorio, datosClaseRecordatorio,
  enviarEmailRecordatorio, enviarRecordatorioClase, franjaRecordatorio, ventanaFranja,
  type EntradaCanalesRecordatorio, type EnviarEmail, type PuertosRecordatorio, type ReservaParaRecordar,
} from './recordatorio-clase.ts';
import { EVENTOS } from '../notifications/catalog.ts';
import type { NotificationEvent } from '../notifications/types.ts';

const H = 3_600_000;
const AHORA = Date.parse('2026-09-15T08:00:00.000Z');

// ─── Franjas ────────────────────────────────────────────────────────────────

test('franja de 24 h: [23,5 h, 24,5 h] con los dos extremos dentro', () => {
  assert.equal(franjaRecordatorio(new Date(AHORA + 23.5 * H), AHORA), '24h');
  assert.equal(franjaRecordatorio(new Date(AHORA + 24 * H), AHORA), '24h');
  assert.equal(franjaRecordatorio(new Date(AHORA + 24.5 * H), AHORA), '24h');
  assert.equal(franjaRecordatorio(new Date(AHORA + 23.5 * H - 1), AHORA), null);
  assert.equal(franjaRecordatorio(new Date(AHORA + 24.5 * H + 1), AHORA), null);
});

test('franja de 1 h: [45 min, 75 min]; fuera de las dos, nada', () => {
  assert.equal(franjaRecordatorio(new Date(AHORA + 0.75 * H), AHORA), '1h');
  assert.equal(franjaRecordatorio(new Date(AHORA + 1.25 * H), AHORA), '1h');
  assert.equal(franjaRecordatorio(new Date(AHORA + 0.75 * H - 1), AHORA), null);
  assert.equal(franjaRecordatorio(new Date(AHORA + 1.25 * H + 1), AHORA), null);
  assert.equal(franjaRecordatorio(new Date(AHORA + 12 * H), AHORA), null);
  assert.equal(franjaRecordatorio(new Date(AHORA - 1 * H), AHORA), null);
  assert.equal(franjaRecordatorio('no es una fecha', AHORA), null);
});

test('la ventana que se consulta es la misma que decide la franja', () => {
  const v = ventanaFranja('24h', AHORA);
  assert.equal(franjaRecordatorio(v.desdeISO, AHORA), '24h');
  assert.equal(franjaRecordatorio(v.hastaISO, AHORA), '24h');
  assert.deepEqual(ventanaFranja('1h', AHORA), { desdeISO: '2026-09-15T08:45:00.000Z', hastaISO: '2026-09-15T09:15:00.000Z' });
});

test('la víspera del cambio de hora: la franja va en horas absolutas y el texto en hora del estudio', () => {
  // Domingo 25-oct-2026 a las 10:00 en Madrid = 09:00Z (ya en horario de invierno).
  const clase = '2026-10-25T09:00:00.000Z';
  // 24 h absolutas antes: sábado 09:00Z, que en el reloj del estudio son las 11:00.
  assert.equal(franjaRecordatorio(clase, Date.parse('2026-10-24T09:00:00.000Z')), '24h');
  // «La misma hora local del día anterior» (sábado 10:00 en Madrid = 08:00Z) son 25 h: fuera.
  assert.equal(franjaRecordatorio(clase, Date.parse('2026-10-24T08:00:00.000Z')), null);
  const d = datosClaseRecordatorio({ inicioISO: clase, nombre: 'Reformer', sala: null, instructor: null, estudioNombre: null, zoomJoinUrl: null });
  assert.equal(d.hora, '10:00');
  assert.match(d.fecha, /domingo, 25 de octubre/);
});

test('verano: una clase de las 16:30Z se anuncia a las 18:30 (hora del estudio, no UTC)', () => {
  const d = datosClaseRecordatorio({ inicioISO: '2026-07-15T16:30:00.000Z', nombre: null, sala: null, instructor: null, estudioNombre: null, zoomJoinUrl: null });
  assert.equal(d.hora, '18:30');
  assert.equal(d.claseNombre, 'Clase');
  assert.equal(d.estudioNombre, 'Tentare');
  assert.equal(d.sala, '');
});

test('la clave de Resend es estable por (sesión, socia) y es la de siempre', () => {
  assert.equal(claveIdempotenciaRecordatorio('ses-1', 'soc-1'), 'recordatorio-ses-1-soc-1');
});

// ─── Canales ────────────────────────────────────────────────────────────────

const BASE: EntradaCanalesRecordatorio = {
  franja: '24h', estado: 'CONFIRMADA', exenta: false, preferencias: null,
  plantillaEmailEncendida: true, whatsappConectado: true, tieneEmail: true, tieneTelefono: true,
};
const TODOS = { push: true, email: true, whatsapp: true };
const NADA = { push: false, email: false, whatsapp: false };
const SOLO_PUSH = { push: true, email: false, whatsapp: false };

test('24 h: app + email + WhatsApp; 1 h: solo app', () => {
  assert.deepEqual(canalesRecordatorio(BASE), TODOS);
  assert.deepEqual(canalesRecordatorio({ ...BASE, franja: '1h' }), SOLO_PUSH);
});

test('nunca a una reserva que no esté CONFIRMADA (ASISTIDA incluida), en ninguna franja', () => {
  for (const estado of ['ASISTIDA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION', 'CANCELADA', 'NO_ASISTIO']) {
    assert.deepEqual(canalesRecordatorio({ ...BASE, estado }), NADA, estado);
    assert.deepEqual(canalesRecordatorio({ ...BASE, estado, franja: '1h' }), NADA, `${estado} 1h`);
  }
});

test('exenta de recordatorios: nada, ni el push', () => {
  assert.deepEqual(canalesRecordatorio({ ...BASE, exenta: true }), NADA);
  assert.deepEqual(canalesRecordatorio({ ...BASE, exenta: true, franja: '1h' }), NADA);
});

test('plantilla de email apagada: calla SOLO el email', () => {
  assert.deepEqual(canalesRecordatorio({ ...BASE, plantillaEmailEncendida: false }), { push: true, email: false, whatsapp: true });
  assert.deepEqual(canalesRecordatorio({ ...BASE, plantillaEmailEncendida: false, franja: '1h' }), SOLO_PUSH);
});

test('preferencias de la alumna: cada canal por su lado; sin fila o a null, quiere', () => {
  assert.deepEqual(canalesRecordatorio({ ...BASE, preferencias: { email: false, whatsapp: true } }), { push: true, email: false, whatsapp: true });
  assert.deepEqual(canalesRecordatorio({ ...BASE, preferencias: { email: true, whatsapp: false } }), { push: true, email: true, whatsapp: false });
  assert.deepEqual(canalesRecordatorio({ ...BASE, preferencias: { email: null, whatsapp: null } }), TODOS);
  assert.deepEqual(canalesRecordatorio({ ...BASE, preferencias: undefined }), TODOS);
});

test('WhatsApp solo con integración y teléfono; email solo con dirección', () => {
  assert.deepEqual(canalesRecordatorio({ ...BASE, whatsappConectado: false }), { push: true, email: true, whatsapp: false });
  assert.deepEqual(canalesRecordatorio({ ...BASE, tieneTelefono: false }), { push: true, email: true, whatsapp: false });
  assert.deepEqual(canalesRecordatorio({ ...BASE, tieneEmail: false }), { push: true, email: false, whatsapp: true });
});

// ─── Barrido con supabase-js REAL y fetch falso ─────────────────────────────
//
// Lo que se comprueba es lo que viaja por HTTP: las lecturas a PostgREST (con
// sus filtros), el reclamo en `recordatorio_envios` (409/23505 de verdad) y la
// llamada a Resend (con su cabecera Idempotency-Key). El email sale con el SDK
// real de Resend; lo que en producción añade `enviarEmailTransaccional`
// (plantilla, marca, interruptor) tiene sus propios tests.

type Fila = Record<string, unknown>;
type Peticion = { metodo: string; url: URL; cuerpo: unknown };

const CLASE_24H = new Date(AHORA + 24 * H + 10 * 60_000).toISOString();

function tablasBase(): Record<string, Fila[]> {
  return {
    studios: [{ id: 'studio-1', slug: 'pilates-luz', nombre: 'Pilates Luz', suspendido_en: null }],
    sesiones: [{ id: 'ses-1', studio_id: 'studio-1', inicio: CLASE_24H, tipo_clase_id: 'tipo-1', sala_id: 'sala-1', instructor_id: 'ins-1', zoom_join_url: null, cancelada: false }],
    tipos_clase: [{ id: 'tipo-1', nombre: 'Reformer' }],
    salas: [{ id: 'sala-1', nombre: 'Sala grande' }],
    instructores: [{ id: 'ins-1', nombre: 'Instructora' }],
    reservas: [{ id: 'res-1', studio_id: 'studio-1', socio_id: 'soc-1', sesion_id: 'ses-1', estado: 'CONFIRMADA' }],
    socio_excepciones: [],
    socios: [{ id: 'soc-1', nombre: 'Alumna', email: 'alumna@example.com', telefono: '600000000', auth_user_id: 'auth-1' }],
    notification_preference: [],
    integraciones: [],
    plantillas_email: [],
    recordatorio_envios: [],
  };
}

function cumpleFiltro(fila: Fila, columna: string, expresion: string): boolean {
  const v = fila[columna];
  const [op, ...resto] = expresion.split('.');
  const valor = resto.join('.');
  switch (op) {
    case 'eq': return String(v) === valor;
    case 'is': return valor === 'null' ? v == null : String(v) === valor;
    case 'in': return valor.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
    case 'gte': return String(v) >= valor;
    case 'lte': return String(v) <= valor;
    default: throw new Error(`filtro no soportado en el falso: ${columna}=${expresion}`);
  }
}

const NO_FILTROS = new Set(['select', 'offset', 'limit', 'order']);

function montar(opciones: {
  tablas?: Record<string, Fila[]>;
  /** Respuestas de Resend en orden; al acabarse, 200. */
  resend?: number[];
  /** Tablas cuya lectura devuelve 500. */
  caidas?: Set<string>;
} = {}) {
  const tablas = opciones.tablas ?? tablasBase();
  const peticiones: Peticion[] = [];
  const llamadasResend: { clave: string | null; para: unknown }[] = [];
  const llamadasMeta: unknown[] = [];
  const respuestasResend = [...(opciones.resend ?? [])];
  const json = (body: unknown, status = 200) =>
    new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchFalso = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.hostname === 'api.resend.com') {
      llamadasResend.push({ clave: new Headers(init?.headers).get('idempotency-key'), para: (cuerpo as { to: unknown }).to });
      const status = respuestasResend.shift() ?? 200;
      return status === 200 ? json({ id: `email-${llamadasResend.length}` }) : json({ name: 'internal_server_error', message: 'caído', statusCode: status }, status);
    }
    if (url.hostname === 'graph.facebook.com') {
      llamadasMeta.push(cuerpo);
      return json({ messages: [{ id: 'wamid.1' }] });
    }

    peticiones.push({ metodo, url, cuerpo });
    const tabla = url.pathname.split('/').pop() as string;
    const filas = tablas[tabla];
    if (!filas) return json({ message: `tabla inesperada ${tabla}` }, 500);
    const filtros = [...url.searchParams].filter(([k]) => !NO_FILTROS.has(k));
    const casan = (f: Fila) => filtros.every(([k, e]) => cumpleFiltro(f, k, e));

    if (metodo === 'GET') {
      if (opciones.caidas?.has(tabla)) return json({ message: `${tabla} caída` }, 500);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1e9);
      return json(filas.filter(casan).slice(offset, offset + limit));
    }
    if (tabla === 'recordatorio_envios' && metodo === 'POST') {
      const n = cuerpo as Fila;
      if (filas.some((f) => f.sesion_id === n.sesion_id && f.socio_id === n.socio_id && f.canal === n.canal)) {
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "recordatorio_envios_pkey"', details: null, hint: null }, 409);
      }
      filas.push(n);
      return json(null, 201);
    }
    if (tabla === 'recordatorio_envios' && metodo === 'DELETE') {
      tablas[tabla] = filas.filter((f) => !casan(f));
      return json(null, 204);
    }
    if (tabla === 'integraciones' && metodo === 'PATCH') return json(null, 204);
    return json({ message: `petición inesperada ${metodo} ${url.pathname}` }, 500);
  };

  const admin = createClient('http://supabase.test', 'service-role-falsa', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFalso as typeof fetch },
  });

  const eventos: NotificationEvent[] = [];
  const salud: { studioId: string; resultado: unknown }[] = [];

  async function leerTodas<T>(
    _studioId: string, _tabla: string,
    pagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ) {
    const filas: T[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await pagina(desde, desde + 999);
      if (error) return { data: filas, error };
      filas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return { data: filas, error: null };
  }

  const enviarEmail: EnviarEmail = async (p) => {
    const { data, error } = await new Resend('re_test_falsa').emails.send(
      { from: 'Estudio <hola@example.com>', to: [p.to], subject: `Recordatorio — ${p.data.claseNombre}`, html: `<p>${p.data.fecha} ${p.data.hora}</p>` },
      { idempotencyKey: p.idempotencyKey },
    );
    return error ? { ok: false, error: error.message } : { ok: true, id: data?.id };
  };

  const puertos: PuertosRecordatorio = {
    publicar: async (e) => { eventos.push(e); },
    enviarEmail,
    leerTodas,
    registrarSalud: async (_admin, studioId, _tipo, resultado) => { salud.push({ studioId, resultado }); },
  };

  // Resend y Meta usan el `fetch` global; PostgREST, el del cliente.
  const original = globalThis.fetch;
  globalThis.fetch = fetchFalso as typeof fetch;
  const desmontar = () => { globalThis.fetch = original; };

  return { admin, puertos, tablas, peticiones, llamadasResend, llamadasMeta, eventos, salud, desmontar, enviarEmail };
}

const reclamos = (t: Record<string, Fila[]>, canal: string) => t.recordatorio_envios.filter((f) => f.canal === canal);

test('dos pasadas seguidas dentro de la franja: Resend recibe UNA llamada, con la clave de siempre', async () => {
  const m = montar();
  try {
    const r1 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    const r2 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA + 15 * 60_000);

    assert.equal(m.llamadasResend.length, 1);
    assert.equal(m.llamadasResend[0].clave, 'recordatorio-ses-1-soc-1');
    assert.deepEqual(m.llamadasResend[0].para, ['alumna@example.com']);
    assert.equal(r1.emails.enviados, 1);
    assert.equal(r2.emails.yaEnviados, 1);
    assert.equal(reclamos(m.tablas, 'EMAIL').length, 1);

    // El push se publica en cada pasada con la MISMA dedupKey: el motor deja una.
    assert.equal(m.eventos.length, 2);
    assert.equal(m.eventos[0].type, EVENTOS.RECORDATORIO_24H);
    assert.equal(m.eventos[0].dedupKey, 'recordatorio-24h:res-1');
    assert.equal(m.eventos[1].dedupKey, 'recordatorio-24h:res-1');
    assert.deepEqual(m.eventos[0].data, { clase: 'Reformer', hora: '10:10', slug: 'pilates-luz', sesionId: 'ses-1', socioId: 'soc-1' });
  } finally { m.desmontar(); }
});

test('todas las lecturas van paginadas y la de reservas pide solo CONFIRMADA', async () => {
  const m = montar();
  try {
    await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    const lecturas = m.peticiones.filter((p) => p.metodo === 'GET');
    assert.ok(lecturas.length >= 8);
    for (const p of lecturas) {
      assert.ok(p.url.searchParams.has('offset') && p.url.searchParams.has('limit'), `sin paginar: ${p.url.pathname}`);
    }
    const reservas = lecturas.find((p) => p.url.pathname.endsWith('/reservas'))!;
    assert.equal(reservas.url.searchParams.get('estado'), 'eq.CONFIRMADA');
    const plantillas = lecturas.find((p) => p.url.pathname.endsWith('/plantillas_email'))!;
    assert.equal(plantillas.url.searchParams.get('enviar'), 'eq.false');
    assert.equal(plantillas.url.searchParams.get('tipo'), 'eq.recordatorio');
    assert.equal(plantillas.url.searchParams.get('activa'), null, '`activa` no apaga el correo');
  } finally { m.desmontar(); }
});

test('camino viejo (Inngest) y barrido juntos, en cualquier orden: un solo email', async () => {
  const data = datosClaseRecordatorio({ inicioISO: CLASE_24H, nombre: 'Reformer', sala: 'Sala grande', instructor: 'Instructora', estudioNombre: 'Pilates Luz', zoomJoinUrl: null });
  const envio = { sesionId: 'ses-1', socioId: 'soc-1', studioId: 'studio-1', to: 'alumna@example.com', toName: 'Alumna', data };

  const viejoPrimero = montar();
  try {
    assert.equal(await enviarEmailRecordatorio(viejoPrimero.admin, envio, viejoPrimero.enviarEmail), 'enviado');
    const r = await barrerRecordatoriosClase(viejoPrimero.admin, viejoPrimero.puertos, AHORA);
    assert.equal(r.emails.yaEnviados, 1);
    assert.equal(viejoPrimero.llamadasResend.length, 1);
  } finally { viejoPrimero.desmontar(); }

  const nuevoPrimero = montar();
  try {
    await barrerRecordatoriosClase(nuevoPrimero.admin, nuevoPrimero.puertos, AHORA);
    // El de Inngest pasa a las 08:00 del día siguiente, fuera de las 24 h de Resend.
    assert.equal(await enviarEmailRecordatorio(nuevoPrimero.admin, envio, nuevoPrimero.enviarEmail), 'ya-enviado');
    assert.equal(nuevoPrimero.llamadasResend.length, 1);
  } finally { nuevoPrimero.desmontar(); }
});

test('Resend 500: se suelta el reclamo y la pasada siguiente lo manda una vez', async () => {
  const m = montar({ resend: [500] });
  try {
    const r1 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r1.emails.fallidos, 1);
    assert.equal(reclamos(m.tablas, 'EMAIL').length, 0, 'el reclamo tiene que soltarse');
    const borrado = m.peticiones.find((p) => p.metodo === 'DELETE')!;
    assert.equal(borrado.url.searchParams.get('canal'), 'eq.EMAIL');
    assert.equal(borrado.url.searchParams.get('sesion_id'), 'eq.ses-1');
    assert.equal(borrado.url.searchParams.get('socio_id'), 'eq.soc-1');

    const r2 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA + 15 * 60_000);
    assert.equal(r2.emails.enviados, 1);
    await barrerRecordatoriosClase(m.admin, m.puertos, AHORA + 30 * 60_000);

    assert.equal(m.llamadasResend.length, 2, 'un fallo + un envío bueno, y ninguno más');
    assert.equal(m.llamadasResend[1].clave, 'recordatorio-ses-1-soc-1');
    assert.equal(reclamos(m.tablas, 'EMAIL').length, 1);
  } finally { m.desmontar(); }
});

test('reserva ASISTIDA: nada por ningún canal', async () => {
  const tablas = tablasBase();
  tablas.reservas[0].estado = 'ASISTIDA';
  tablas.integraciones.push({ studio_id: 'studio-1', tipo: 'WHATSAPP', activo: true, config: { token: 't', phoneId: '1' } });
  const m = montar({ tablas });
  try {
    const r = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r.publicados, 0);
    assert.equal(m.eventos.length, 0);
    assert.equal(m.llamadasResend.length, 0);
    assert.equal(m.llamadasMeta.length, 0);
    assert.equal(m.tablas.recordatorio_envios.length, 0);

    // Y aunque se la pasaran al dueño directamente, tampoco.
    const reserva: ReservaParaRecordar = {
      id: 'res-1', estado: 'ASISTIDA', sesionId: 'ses-1', studioId: 'studio-1', socioId: 'soc-1', slug: 'pilates-luz',
      clase: { inicioISO: CLASE_24H, nombre: 'Reformer', sala: null, instructor: null, estudioNombre: null, zoomJoinUrl: null },
      socia: { nombre: 'Alumna', email: 'alumna@example.com', telefono: '600000000' },
      exenta: false, preferencias: null, plantillaEmailEncendida: true, whatsapp: { token: 't', phoneId: '1', plantillaRecordatorio: false, plantillaHueco: false, plantillaSustitucion: false },
    };
    const res = await enviarRecordatorioClase(m.admin, reserva, '24h', m.puertos);
    assert.deepEqual({ push: res.push, email: res.email, whatsapp: res.whatsapp }, { push: false, email: 'no', whatsapp: 'no' });
    assert.equal(m.eventos.length + m.llamadasResend.length + m.llamadasMeta.length, 0);
  } finally { m.desmontar(); }
});

test('plantilla de recordatorio apagada (enviar=false): push sí, email no; `activa=false` no apaga nada', async () => {
  const tablas = tablasBase();
  tablas.studios.push({ id: 'studio-2', slug: 'otro', nombre: 'Otro', suspendido_en: null });
  tablas.sesiones.push({ ...tablas.sesiones[0], id: 'ses-2', studio_id: 'studio-2' });
  tablas.reservas.push({ id: 'res-2', studio_id: 'studio-2', socio_id: 'soc-2', sesion_id: 'ses-2', estado: 'CONFIRMADA' });
  tablas.socios.push({ id: 'soc-2', nombre: 'Otra', email: 'otra@example.com', telefono: null, auth_user_id: null });
  tablas.plantillas_email.push(
    { studio_id: 'studio-1', tipo: 'recordatorio', enviar: false, activa: true },
    { studio_id: 'studio-2', tipo: 'recordatorio', enviar: true, activa: false },
  );
  const m = montar({ tablas });
  try {
    await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.deepEqual(m.eventos.map((e) => e.dedupKey).sort(), ['recordatorio-24h:res-1', 'recordatorio-24h:res-2']);
    assert.deepEqual(m.llamadasResend.map((l) => l.para), [['otra@example.com']]);
    assert.deepEqual(reclamos(m.tablas, 'EMAIL').map((f) => f.socio_id), ['soc-2']);
  } finally { m.desmontar(); }
});

test('franja de 1 h: solo el push, sin leer fichas ni reclamar nada', async () => {
  const tablas = tablasBase();
  tablas.sesiones[0].inicio = new Date(AHORA + 1 * H).toISOString();
  tablas.integraciones.push({ studio_id: 'studio-1', tipo: 'WHATSAPP', activo: true, config: { token: 't', phoneId: '1' } });
  const m = montar({ tablas });
  try {
    const r = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r.publicados, 1);
    assert.equal(m.eventos[0].type, EVENTOS.RECORDATORIO_1H);
    assert.equal(m.eventos[0].dedupKey, 'recordatorio-1h:res-1');
    assert.equal(m.llamadasResend.length + m.llamadasMeta.length, 0);
    assert.equal(m.tablas.recordatorio_envios.length, 0);
    assert.ok(!m.peticiones.some((p) => p.url.pathname.endsWith('/socios')));
  } finally { m.desmontar(); }
});

test('WhatsApp conectado: un mensaje en dos pasadas, y la salud se anota una vez por pasada con envío', async () => {
  const tablas = tablasBase();
  tablas.integraciones.push({ studio_id: 'studio-1', tipo: 'WHATSAPP', activo: true, config: { token: 't', phoneId: '1' } });
  const m = montar({ tablas });
  try {
    const r1 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    await barrerRecordatoriosClase(m.admin, m.puertos, AHORA + 15 * 60_000);
    assert.equal(r1.whatsapp.enviados, 1);
    assert.equal(m.llamadasMeta.length, 1);
    assert.equal(reclamos(m.tablas, 'WHATSAPP').length, 1);
    assert.deepEqual(m.salud, [{ studioId: 'studio-1', resultado: { ok: true } }]);
  } finally { m.desmontar(); }
});

test('preferencias de la alumna: sin email ni WhatsApp si los quitó; el push sale igual', async () => {
  const tablas = tablasBase();
  tablas.integraciones.push({ studio_id: 'studio-1', tipo: 'WHATSAPP', activo: true, config: { token: 't', phoneId: '1' } });
  tablas.notification_preference.push({ user_id: 'auth-1', category: 'reservas', email: false, whatsapp: false });
  const m = montar({ tablas });
  try {
    const r = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r.publicados, 1);
    assert.equal(m.llamadasResend.length + m.llamadasMeta.length, 0);
    assert.equal(m.tablas.recordatorio_envios.length, 0);
  } finally { m.desmontar(); }
});

test('exenta de recordatorios: ni push ni email', async () => {
  const tablas = tablasBase();
  tablas.socio_excepciones.push({ socio_id: 'soc-1', tipo: 'SIN_RECORDATORIO' });
  const m = montar({ tablas });
  try {
    const r = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r.publicados, 0);
    assert.equal(m.llamadasResend.length, 0);
  } finally { m.desmontar(); }
});

test('si no se pueden leer las fichas: sale el push, no se reclama el email y la pasada siguiente lo manda', async () => {
  const caidas = new Set(['socios']);
  const m = montar({ caidas });
  try {
    const r1 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA);
    assert.equal(r1.publicados, 1);
    assert.deepEqual(r1.lecturasDegradadas, ['socias']);
    assert.equal(m.llamadasResend.length, 0);
    assert.equal(m.tablas.recordatorio_envios.length, 0);

    caidas.clear();
    const r2 = await barrerRecordatoriosClase(m.admin, m.puertos, AHORA + 15 * 60_000);
    assert.equal(r2.emails.enviados, 1);
    assert.equal(m.llamadasResend.length, 1);
  } finally { m.desmontar(); }
});

test('si no se pueden leer las exenciones, el barrido lanza (no avisa a quien pidió que no)', async () => {
  const m = montar({ caidas: new Set(['socio_excepciones']) });
  try {
    await assert.rejects(barrerRecordatoriosClase(m.admin, m.puertos, AHORA), /excepciones de recordatorio/);
    assert.equal(m.eventos.length + m.llamadasResend.length, 0);
  } finally { m.desmontar(); }
});
