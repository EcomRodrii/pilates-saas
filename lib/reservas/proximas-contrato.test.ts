import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// «Reservar las próximas N clases» (autoreservable, con bono): guardias sobre el fuente (estas funciones importan `@/`).
// Lo que NO puede pasar: que el lote toque el saldo del bono por su cuenta, que use el prefijo de las plazas fijas, que reserve
// sin derecho, que se salte las reglas de la reserva suelta o que un reintento duplique reservas.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');
const SERVIDOR = leer('lib/db/supabase-data-admin.ts');
const ini = SERVIDOR.indexOf('export async function reservarProximasPublico');
const LOTE = SERVIDOR.slice(ini, SERVIDOR.indexOf('// "Pagar y reservar sin login previo"', ini));

test('la llamada a evaluar_reserva lleva las claves de su firma viva', () => {
  const mig = leer('supabase/migrations/20261002145300_evaluar_reserva.sql');
  const firma = mig.match(/function public\.evaluar_reserva\(\s*([^)]*)\)/)?.[1] ?? '';
  const claves = [...firma.matchAll(/\b(p_[a-z_]+)\b/g)].map(m => m[1]);
  assert.deepEqual(claves, ['p_studio_id', 'p_sesion_id', 'p_socio_id', 'p_opciones']);
  const envoltorio = SERVIDOR.slice(SERVIDOR.indexOf('async function evaluarReservaServidor'), ini);
  for (const c of claves) assert.ok(envoltorio.includes(`${c}:`), `el envoltorio no manda ${c}`);
});

test('⚠️ el lote NO toca el saldo ni usa el prefijo de las plazas fijas: el bono lo descuenta reservar_plaza', () => {
  assert.ok(LOTE.length > 3000, 'no se aisló la función');
  assert.ok(!/\.update\(|\.insert\(|\.delete\(|\.rpc\('(consumir|devolver|liberar)/.test(LOTE), 'el lote no escribe: reserva por crearReservaPublica');
  assert.ok(!LOTE.includes('res-pf-'), 'nunca res-pf-');
  assert.match(LOTE, /idReservaDeIntento\(p\.intentoId as string, i\)/);
});

test('⚠️ cada ocurrencia: ventana → elegibilidad en seco (sin lista de espera, con derecho) → reserva; y nunca reserva si no puede', () => {
  const ventana = LOTE.indexOf('ventanaCerrada(');
  const evaluar = LOTE.indexOf('evaluarReservaServidor(admin');
  const reservar = LOTE.indexOf('await crearReservaPublica(');
  assert.ok(ventana > 0 && ventana < evaluar && evaluar < reservar, 'el orden es ventana, evaluar, reservar');
  assert.match(LOTE, /permite_lista_espera: false, requiere_aprobacion: false, exigir_entitlement: true, saltar_gate_impago: false/);
  assert.match(LOTE, /avisar: false/);
  // Antes de reservar: cada «no» (de la evaluación) y el derecho agotado hacen `continue`.
  const antes = LOTE.slice(evaluar, reservar);
  assert.match(antes, /if \(!ev\.puede\) \{[\s\S]*?continue;/);
  assert.match(antes, /origen === 'recuperacion'/, 'una recuperación pagaría el exceso del tope en silencio');
  assert.match(antes, /origen === 'ninguno'[\s\S]*?parar\(s, 'SIN_DERECHO'\)/);
  assert.match(antes, /\(await saldoDe\(id\)\) <= 0/, 'no promete más clases de las que le quedan');
});

test('una vez que para (sin derecho, ventana máxima…) el resto queda sin intentar, y un reintento del mismo intento no duplica', () => {
  assert.match(LOTE, /if \(paro\) \{ poner\(s, \{ resultado: 'NO_INTENTADA' \}\); continue; \}/);
  assert.match(LOTE, /from\('reservas'\)\.select\('socio_id, sesion_id, estado'\)/);
  assert.match(LOTE, /resultado: 'RESERVADA', reservaId, repetida: true/);
  // Una reserva con ese id de OTRA socia o de OTRA clase no se atribuye a esta.
  assert.match(LOTE, /previa\.socio_id === p\.socioId && previa\.sesion_id === s\.id/);
});

test('exige un bono y una clase que se repite; no admite reservas con aprobación manual', () => {
  assert.match(LOTE, /codigo: 'sin-bono', status: 409/);
  assert.match(LOTE, /codigo: 'solo-una-clase', status: 409/);
  assert.match(LOTE, /codigo: 'requiere-aprobacion', status: 409/);
  assert.match(LOTE, /validarSociaPublica\(admin, p\.studioId, p\.socioId, p\.authUserId\)/);
});

test('crearReservaPublica: las dos opciones nuevas son opcionales y, sin ellas, todo igual', () => {
  assert.match(SERVIDOR, /const reservaId = params\.reservaId \?\? `res-\$\{uid\(\)\}`;/);
  assert.match(SERVIDOR, /canal: 'alumna', reservaId, consumoBono, consumibleBono, avisarSocia: params\.avisar,/);
  // `avisarSocia: undefined` = avisa (solo `false` calla): el camino de siempre no cambia.
  assert.match(SERVIDOR, /if \(p\.avisarSocia !== false\) \{\s+await emitirReserva\(/);
});

test('la ruta: la identidad sale del JWT, el intento es solo para reservar y el N lo valida el servidor', () => {
  const ruta = leer('app/api/public/reserva-proximas/route.ts');
  assert.match(ruta, /export const maxDuration = 60;/);
  assert.match(ruta, /enforceRateLimit\(req, 'public-reserva-proximas', \{ max: 6, windowSeconds: 60 \}\)/);
  assert.match(ruta, /const socioId = await socioAutenticado\(user\.userId, studioId\);/);
  assert.ok(!/body\??\.socioId/.test(ruta), 'el socio no se lee del body');
  assert.match(ruta, /const n = normalizarN\(body\?\.n\);/);
  assert.match(ruta, /const intentoId = accion === 'reservar' \? normalizarIntento\(body\?\.intentoId\) : undefined;/);
  // Las mismas puertas que la reserva suelta, solo al RESERVAR.
  for (const puerta of ['paginaCerradaParaPeticion(', 'bloqueoPorSuspension(', 'bloqueoPorPreguntasAlta(']) {
    assert.ok(ruta.indexOf(puerta) > ruta.indexOf("if (accion === 'reservar') {"), `${puerta} va dentro de «reservar»`);
  }
});
