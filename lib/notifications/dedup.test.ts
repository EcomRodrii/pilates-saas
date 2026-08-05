import test from 'node:test';
import assert from 'node:assert/strict';
import { claveDedup, identidadesEnDosBandejas } from './inapp.ts';
import type { Recipient } from './types.ts';

// `uq_notification_dedup (studio_id, dedup_key)` decide qué avisos EXISTEN: dos
// destinatarios con la misma clave = una sola fila, y la segunda se descarta en
// silencio (`omitidas++`). Así que esta función decide, sin ruido de red, cuándo
// una persona recibe un aviso y cuándo lo pierde.

const UID = 'auth-480ef964';

const dest = (role: Recipient['role'], extra: Partial<Recipient> = {}): Recipient => ({
  role, userId: UID, nombre: 'X', email: null, ...extra,
});

test('la misma persona como staff y como socia recibe DOS filas, no una', () => {
  // El bug: `pago.fallido` (audiencia `mostrador-y-socia`) para quien es
  // propietaria Y socia del mismo estudio generaba la misma clave dos veces, la
  // segunda chocaba y desaparecía. Con el centro partido en dos bandejas, ese
  // aviso de dinero solo existía en la del panel.
  const dests = [dest('PROPIETARIO'), dest('SOCIA', { socioId: 'soc-1' })];
  const dobles = identidadesEnDosBandejas(dests);
  const claves = dests.map(d => claveDedup('pago-fallido:rec-1', d, dobles));
  assert.equal(new Set(claves).size, 2, 'las dos bandejas tienen que dar claves distintas');
});

test('la misma persona con DOS roles de staff sigue recibiendo UNA sola fila', () => {
  // La trampa del arreglo obvio: `mostrador` = propietaria + recepcionistas, y
  // quien es dueña y además tiene ficha de RECEPCION se resuelve por las dos
  // vías. Desempatar por el rol crudo le habría duplicado el aviso en la MISMA
  // campana. Staff es una bandeja sola, valga el rol que valga.
  for (const rol of ['RECEPCION', 'MANAGER', 'INSTRUCTOR'] as const) {
    const dests = [dest('PROPIETARIO'), dest(rol)];
    const dobles = identidadesEnDosBandejas(dests);
    const claves = dests.map(d => claveDedup('pago-fallido:rec-1', d, dobles));
    assert.equal(claves[0], claves[1], `PROPIETARIO y ${rol} de la misma cuenta comparten bandeja`);
  }
});

test('sin colisión, la clave es EXACTAMENTE la de antes del arreglo', () => {
  // Lo que hace que desplegar esto no duplique nada: el sufijo solo aparece
  // cuando hay colisión real. Si se marcaran siempre las filas de socia, el
  // cron de recordatorios —que re-escanea cada 15 min y confía en el dedup para
  // mandar `recordatorio-24h:${reservaId}` UNA vez en toda su ventana— habría
  // soltado un segundo recordatorio por cada reserva viva al desplegar. Y por
  // el otro lado, `decision-mensaje-dia` (uno al día: la promesa del Umbral) e
  // `inactiva:…:${mes}` (cron SEMANAL, dedup MENSUAL) se habrían duplicado si
  // el sufijo hubiera caído del lado staff.
  const soloSocia = identidadesEnDosBandejas([dest('SOCIA', { socioId: 'soc-1' })]);
  assert.equal(
    claveDedup('recordatorio-24h:res-9', dest('SOCIA', { socioId: 'soc-1' }), soloSocia),
    `recordatorio-24h:res-9:${UID}`,
  );

  const soloDuena = identidadesEnDosBandejas([dest('PROPIETARIO')]);
  assert.equal(
    claveDedup('decision-mensaje-dia:studio-1:2026-08-05', dest('PROPIETARIO'), soloDuena),
    `decision-mensaje-dia:studio-1:2026-08-05:${UID}`,
  );
  assert.equal(
    claveDedup('inactiva:soc-9:2026-08', dest('PROPIETARIO'), soloDuena),
    `inactiva:soc-9:2026-08:${UID}`,
  );
});

test('identidadesEnDosBandejas solo señala a quien está en las dos', () => {
  const dobles = identidadesEnDosBandejas([
    dest('PROPIETARIO'),                                    // dual
    dest('SOCIA', { socioId: 'soc-1' }),                    // dual
    dest('RECEPCION', { userId: 'auth-recep' }),            // solo staff
    dest('SOCIA', { userId: 'auth-otra', socioId: 'soc-2' }), // solo socia
  ]);
  assert.deepEqual([...dobles], [UID]);
});

test('personas distintas nunca comparten clave, ni en la misma bandeja', () => {
  const dests = [dest('PROPIETARIO'), dest('RECEPCION', { userId: 'auth-otra' })];
  const dobles = identidadesEnDosBandejas(dests);
  const claves = dests.map(d => claveDedup('pago-fallido:rec-1', d, dobles));
  assert.notEqual(claves[0], claves[1]);
});

test('sin cuenta, la socia se identifica por socioId', () => {
  // La socia se resuelve aunque no tenga cuenta (su fila ancla los canales
  // externos), así que la identidad cae a socioId — y entonces ya no puede
  // colisionar con la fila de staff, que va por userId.
  const dests = [dest('PROPIETARIO'), dest('SOCIA', { userId: null, socioId: 'soc-1' })];
  const dobles = identidadesEnDosBandejas(dests);
  assert.equal(dobles.size, 0, 'identidades distintas: no hay nada que desempatar');
  assert.equal(
    claveDedup('pago-fallido:rec-1', dests[1], dobles),
    'pago-fallido:rec-1:soc-1',
  );
});

test('sin clave base no hay dedup (null se propaga)', () => {
  // No todos los eventos declaran dedupKey; los que no, no deben deduplicarse.
  const vacio = new Set<string>();
  assert.equal(claveDedup(null, dest('SOCIA'), vacio), null);
  assert.equal(claveDedup(undefined, dest('PROPIETARIO'), vacio), null);
  assert.equal(claveDedup('', dest('PROPIETARIO'), vacio), null);
});
