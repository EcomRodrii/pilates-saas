import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { cambiosAlMostrar, debeMostrarModal } from './review-boost.ts';
import { marcarReviewBoostRespondido } from './review-boost-respondido.ts';

const DIA = 86_400_000;
const AHORA = new Date('2026-09-14T10:15:00.000Z');

// ── El bucle, en la máquina de estados ──────────────────────────────────────

// El estado real del 14-sep: visto el 25-ago, cerrado sin responder hace más de
// 14 días, una sola vez. Toca reaparecer — y responde.
const ANTES_DE_RESPONDER = {
  reviewBoostElegibleEn: '2026-08-21T11:43:53.964Z',
  reviewBoostMostradoEn: '2026-08-25T02:25:21.861Z',
  reviewBoostPospuestoEn: '2026-08-26T09:00:00.000Z',
  reviewBoostVecesMostrado: 1,
};

test('el bucle: con el pospuesto viejo sin borrar, el modal sigue saliendo tras responder', () => {
  assert.equal(debeMostrarModal(ANTES_DE_RESPONDER, AHORA), true);
  // Responder solo marcaba `mostrado`, que ya estaba: el estado no cambiaba.
  assert.equal(debeMostrarModal(ANTES_DE_RESPONDER, new Date(AHORA.getTime() + 60_000)), true);
});

test('tras marcar respondido (pospuesto a null), no vuelve a salir: ni ahora ni en meses', () => {
  const respondido = { ...ANTES_DE_RESPONDER, reviewBoostPospuestoEn: null };
  assert.equal(debeMostrarModal(respondido, AHORA), false);
  assert.equal(debeMostrarModal(respondido, new Date(AHORA.getTime() + 200 * DIA)), false);
});

// ── Lo que llega a PostgREST (cliente REAL de supabase-js, `fetch` falso) ──

type Peticion = { metodo: string; url: URL; cuerpo: unknown };

function montar(opciones: { falloPrimera?: boolean } = {}) {
  const peticiones: Peticion[] = [];
  const fetchFalso = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    peticiones.push({
      metodo: (init?.method ?? 'GET').toUpperCase(), url,
      cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const status = opciones.falloPrimera && peticiones.length === 1 ? 500 : 204;
    return new Response(status === 204 ? null : JSON.stringify({ message: 'caído' }), {
      status, headers: { 'content-type': 'application/json' },
    });
  };
  const db = createClient('http://supabase.test', 'service-role-falsa', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFalso as typeof fetch },
  });
  return { db, peticiones };
}

test('borra el pospuesto del estudio y marca `mostrado` SOLO si faltaba', async () => {
  const { db, peticiones } = montar();
  const r = await marcarReviewBoostRespondido(db, 'studio-1', AHORA);
  assert.deepEqual(r, { ok: true });
  assert.equal(peticiones.length, 2);

  const [pospuesto, mostrado] = peticiones;
  assert.equal(pospuesto.metodo, 'PATCH');
  assert.ok(pospuesto.url.pathname.endsWith('/studios'));
  assert.equal(pospuesto.url.searchParams.get('id'), 'eq.studio-1');
  assert.deepEqual(pospuesto.cuerpo, { review_boost_pospuesto_en: null });

  assert.equal(mostrado.metodo, 'PATCH');
  assert.equal(mostrado.url.searchParams.get('id'), 'eq.studio-1');
  // No pisa la fecha de la primera vez.
  assert.equal(mostrado.url.searchParams.get('review_boost_mostrado_en'), 'is.null');
  assert.deepEqual(mostrado.cuerpo, { review_boost_mostrado_en: AHORA.toISOString() });
});

test('si falla borrar el pospuesto, lo dice y no sigue', async () => {
  const { db, peticiones } = montar({ falloPrimera: true });
  const r = await marcarReviewBoostRespondido(db, 'studio-1', AHORA);
  assert.equal(r.ok, false);
  assert.equal(peticiones.length, 1);
});

// ── Guardia: la ruta de feedback marca respondido en los DOS caminos ────────
// La ruta no tiene test propio (el e2e mockea la API). Si alguien quita una de
// las dos llamadas, el bucle vuelve sin que nada más lo vea.

test('la ruta de feedback marca respondido al guardar Y al ver que ya había respondido (409)', () => {
  const src = readFileSync(new URL('../../app/api/growth/review-boost/feedback/route.ts', import.meta.url), 'utf8')
    // Sin comentarios: una llamada comentada no cuenta.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const llamadas = src.match(/await marcarRespondido\(admin, sesion\.studioId\)/g) ?? [];
  assert.equal(llamadas.length, 2, 'tiene que marcar respondido en el insert y en el 409');
  const ini = src.indexOf("error.code === '23505'");
  const fin = src.indexOf('status: 409', ini);
  assert.ok(ini > 0 && fin > ini, 'no se encuentra el camino del 409');
  assert.match(src.slice(ini, fin), /await marcarRespondido\(admin, sesion\.studioId\)/, 'el 409 no marca respondido');
});

// ── Al ENSEÑARLO: recargar o salir con el modal abierto también cuenta ──────

const NUEVO = {
  reviewBoostElegibleEn: '2026-09-13T01:44:45.528Z',
  reviewBoostMostradoEn: null as string | null,
  reviewBoostPospuestoEn: null as string | null,
  reviewBoostVecesMostrado: 0,
};

test('enseñarlo la 1ª vez lo apunta: no vuelve al recargar, sí a los 14 días, y nunca una 3ª', () => {
  assert.equal(debeMostrarModal(NUEVO, AHORA), true);

  const trasPrimera = { ...NUEVO, ...cambiosAlMostrar(NUEVO, AHORA) };
  assert.deepEqual(cambiosAlMostrar(NUEVO, AHORA), {
    reviewBoostMostradoEn: AHORA.toISOString(), reviewBoostPospuestoEn: AHORA.toISOString(), reviewBoostVecesMostrado: 1,
  });
  // Recargar un minuto después, o al día siguiente: no sale.
  assert.equal(debeMostrarModal(trasPrimera, new Date(AHORA.getTime() + 60_000)), false);
  assert.equal(debeMostrarModal(trasPrimera, new Date(AHORA.getTime() + 13 * DIA)), false);
  // A los 14 días, la única reaparición.
  const a14 = new Date(AHORA.getTime() + 14 * DIA);
  assert.equal(debeMostrarModal(trasPrimera, a14), true);

  const trasSegunda = { ...trasPrimera, ...cambiosAlMostrar(trasPrimera, a14) };
  assert.equal(trasSegunda.reviewBoostVecesMostrado, 2);
  // No pisa la fecha de la primera vez.
  assert.equal(trasSegunda.reviewBoostMostradoEn, AHORA.toISOString());
  assert.equal(debeMostrarModal(trasSegunda, new Date(a14.getTime() + 100 * DIA)), false);
});

