import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { ampliarPruebaEstudio } from './ampliar-prueba.ts';

// Con el cliente REAL de supabase-js y un `fetch` falso: lo que se comprueba es
// la petición HTTP que llegaría a PostgREST (filtros, codificación, cuerpo,
// cabeceras), no una imitación del constructor de consultas.

const DIA = 86_400_000;
const AHORA = new Date('2026-09-14T12:00:00.000Z');
/** Formato EXACTO en que PostgREST devuelve un timestamptz (visto en producción el 14-sep). */
const FIN_AYER = '2026-09-13T10:15:31.596794+00:00';

type Peticion = { metodo: string; url: URL; cuerpo: unknown; prefer: string | null };

function montar(opciones: {
  estudio: Record<string, unknown> | null;
  ciclo?: unknown[];
  falloCiclo?: boolean;
  escritas?: unknown[];
}) {
  const peticiones: Peticion[] = [];
  const responder = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchFalso = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const metodo = (init?.method ?? 'GET').toUpperCase();
    peticiones.push({
      metodo, url,
      cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
      prefer: new Headers(init?.headers).get('prefer'),
    });
    const tabla = url.pathname.split('/').pop();
    if (tabla === 'studios' && metodo === 'GET') return responder(opciones.estudio ? [opciones.estudio] : []);
    if (tabla === 'ciclo_estudios_vencidos' && metodo === 'GET') {
      return opciones.falloCiclo ? responder({ message: 'caído' }, 500) : responder(opciones.ciclo ?? []);
    }
    if (tabla === 'studios' && metodo === 'PATCH') return responder(opciones.escritas ?? [{ id: 'studio-1' }]);
    return responder({ message: `petición inesperada ${metodo} ${url.pathname}` }, 500);
  };

  const db = createClient('http://supabase.test', 'service-role-falsa', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFalso as typeof fetch },
  });
  const escrituras = () => peticiones.filter(p => p.metodo !== 'GET');
  return { db, peticiones, escrituras };
}

const VENCIDO = {
  id: 'studio-1', slug: 'pilates-luz', nombre: 'Pilates Luz', cadena_id: null,
  trial_ends_at: FIN_AYER, subscription_status: 'trial_expirado', subscription_id: null,
};

test('amplía una prueba vencida: 7 días desde AHORA, con compare-and-set exacto', async () => {
  const { db, peticiones, escrituras } = montar({ estudio: VENCIDO });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });

  assert.deepEqual(r, {
    ok: true, nombre: 'Pilates Luz', trialAntes: FIN_AYER, estadoAntes: 'trial_expirado',
    hasta: '2026-09-21T12:00:00.000Z',
  });

  assert.equal(escrituras().length, 1);
  const patch = escrituras()[0];
  assert.equal(patch.metodo, 'PATCH');
  const q = patch.url.searchParams;
  assert.equal(q.get('id'), 'eq.studio-1');
  assert.equal(q.get('subscription_id'), 'is.null');
  // El «+» de la zona horaria tiene que llegar como «+»: sin codificar, el
  // servidor lo leería como espacio y el compare-and-set no casaría nunca.
  assert.equal(q.get('trial_ends_at'), `eq.${FIN_AYER}`);
  assert.equal(q.get('subscription_status'), 'eq.trial_expirado');
  assert.deepEqual(patch.cuerpo, {
    trial_ends_at: '2026-09-21T12:00:00.000Z',
    current_period_end: '2026-09-21T12:00:00.000Z',
    subscription_status: 'trialing',
  });
  // Sin «return=representation» no vuelven filas y el 409 saltaría siempre.
  assert.match(patch.prefer ?? '', /return=representation/);

  const ciclo = peticiones.find(p => p.url.pathname.endsWith('/ciclo_estudios_vencidos'));
  assert.ok(ciclo, 'no se comprobó el ciclo de vencidos');
  assert.equal(ciclo.url.searchParams.get('studio_id'), 'eq.studio-1');
});

test('una prueba en curso suma a su fecha de fin, no a hoy', async () => {
  const { db, escrituras } = montar({
    estudio: { ...VENCIDO, trial_ends_at: '2026-09-16T08:00:00+00:00', subscription_status: 'trialing' },
  });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(r.ok && r.hasta, '2026-09-23T08:00:00.000Z');
  assert.equal(escrituras()[0]?.url.searchParams.get('subscription_status'), 'eq.trialing');
});

test('si otro escribió entre medias (0 filas), 409 y NO dice que amplió', async () => {
  const { db } = montar({ estudio: VENCIDO, escritas: [] });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.deepEqual(r, { ok: false, status: 409, error: 'El estudio ha cambiado mientras tanto. Recarga y vuelve a intentarlo.' });
});

test('con suscripción de Stripe (aunque esté cancelada) no escribe NADA', async () => {
  const { db, escrituras } = montar({ estudio: { ...VENCIDO, subscription_id: 'sub_1', subscription_status: 'canceled' } });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(!r.ok && r.status, 409);
  assert.equal(escrituras().length, 0);
});

test('sede de cadena, estudio sin prueba local o con plan activo: no escribe nada', async () => {
  for (const estudio of [
    { ...VENCIDO, cadena_id: 'cad-1' },
    { ...VENCIDO, trial_ends_at: null, subscription_status: null },
    { ...VENCIDO, subscription_status: 'active' },
  ]) {
    const { db, escrituras } = montar({ estudio });
    const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
    assert.equal(!r.ok && r.status, 409, JSON.stringify(estudio));
    assert.equal(escrituras().length, 0);
  }
});

test('estudio que no existe: 404 sin escribir', async () => {
  const { db, escrituras } = montar({ estudio: null });
  const r = await ampliarPruebaEstudio(db, 'studio-x', { ahora: AHORA, purgaActiva: false });
  assert.equal(!r.ok && r.status, 404);
  assert.equal(escrituras().length, 0);
});

// ── Sus datos: purga hecha, a medias o en curso ─────────────────────────────

test('con una purga apuntada como hecha no amplía (aunque el borrado esté apagado)', async () => {
  const { db, escrituras } = montar({
    estudio: VENCIDO,
    ciclo: [{ fase: 'purga', trial_ends_at: FIN_AYER, ejecutada_en: '2026-09-10T00:00:00+00:00', cancelada_en: null }],
  });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(!r.ok && r.status, 409);
  assert.equal(escrituras().length, 0);
});

test('una purga en MODO INFORME (sin ejecutar) no bloquea: los datos siguen ahí', async () => {
  const { db, escrituras } = montar({
    estudio: VENCIDO,
    ciclo: [{ fase: 'purga', trial_ends_at: FIN_AYER, ejecutada_en: null, cancelada_en: null }],
  });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(r.ok, true);
  assert.equal(escrituras().length, 1);
});

// Vencido hace 95 días con los dos avisos enviados: le toca la purga.
const FIN_95 = new Date(AHORA.getTime() - 95 * DIA).toISOString();
const AVISOS_HECHOS = [
  { fase: 'aviso_30', trial_ends_at: FIN_95, ejecutada_en: new Date(Date.parse(FIN_95) + 30 * DIA).toISOString(), cancelada_en: null },
  { fase: 'aviso_final', trial_ends_at: FIN_95, ejecutada_en: new Date(Date.parse(FIN_95) + 83 * DIA).toISOString(), cancelada_en: null },
];

test('borrado real ENCENDIDO y fecha de purga llegada: no amplía, aunque no haya fila de purga', async () => {
  // El cron borra ficheros y copias antes de apuntar la fila: puede estar a
  // medias sin dejar rastro. La fecha es lo único que lo delata.
  const { db, escrituras } = montar({ estudio: { ...VENCIDO, trial_ends_at: FIN_95 }, ciclo: AVISOS_HECHOS });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: true });
  assert.equal(!r.ok && r.status, 409);
  assert.equal(escrituras().length, 0);
});

test('el mismo estudio con el borrado APAGADO sí se amplía: no se ha borrado nada', async () => {
  const { db, escrituras } = montar({ estudio: { ...VENCIDO, trial_ends_at: FIN_95 }, ciclo: AVISOS_HECHOS });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(r.ok, true);
  assert.equal(escrituras().length, 1);
});

test('borrado encendido pero sin el último aviso enviado: no toca purga, sí se amplía', async () => {
  const { db, escrituras } = montar({ estudio: { ...VENCIDO, trial_ends_at: FIN_95 }, ciclo: [AVISOS_HECHOS[0]] });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: true });
  assert.equal(r.ok, true);
  assert.equal(escrituras().length, 1);
});

test('si no se puede leer el ciclo de vencidos, falla CERRADO: no amplía', async () => {
  const { db, escrituras } = montar({ estudio: VENCIDO, falloCiclo: true });
  const r = await ampliarPruebaEstudio(db, 'studio-1', { ahora: AHORA, purgaActiva: false });
  assert.equal(!r.ok && r.status, 500);
  assert.equal(escrituras().length, 0);
});
