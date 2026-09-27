import test from 'node:test';
import assert from 'node:assert/strict';
import { canalesExtraDe, PREF_DEFECTO, preferenciaSinCuenta } from './inapp.ts';
import type { ReglaEvento } from './catalog.ts';
import { EVENTOS, REGLAS } from './catalog.ts';

// Auditoría de notificaciones (27-sep-2026): una socia sin cuenta reclamada no
// puede recibir IN-APP ni PUSH (los dos exigen `userId`) y no tiene ninguna
// pantalla donde activar el email — con `PREF_DEFECTO` (email:false) se quedaba
// sin NINGÚN canal aunque el propio evento ya declarase EMAIL.

const regla = (canales: ReglaEvento['canales']): ReglaEvento =>
  ({ category: 'reservas', priority: 'MEDIA', canales, audiencia: 'socia-del-evento' });

test('un evento que ya declara EMAIL se hace alcanzable sin cuenta', () => {
  const r = regla(['PUSH', 'EMAIL']);
  assert.deepEqual(preferenciaSinCuenta(r), { ...PREF_DEFECTO, email: true });
  assert.deepEqual(canalesExtraDe(r, preferenciaSinCuenta(r), false).sort(), ['EMAIL', 'PUSH']);
});

test('un evento que NO declara EMAIL sigue sin mandarlo: nunca se inventa un canal', () => {
  const r = regla(['PUSH']);
  assert.deepEqual(preferenciaSinCuenta(r), PREF_DEFECTO);
  assert.deepEqual(canalesExtraDe(r, preferenciaSinCuenta(r), false), ['PUSH']);
});

test('reserva.confirmada no declara EMAIL: la decisión de no mandarla por correo no se reabre', () => {
  assert.deepEqual(REGLAS[EVENTOS.RESERVA_CONFIRMADA].canales, ['PUSH']);
  assert.deepEqual(canalesExtraDe(REGLAS[EVENTOS.RESERVA_CONFIRMADA], preferenciaSinCuenta(REGLAS[EVENTOS.RESERVA_CONFIRMADA]), false), ['PUSH']);
});

test('reserva.oferta_lista_espera SÍ declara EMAIL: ahora alcanza a quien no tiene cuenta', () => {
  const r = REGLAS[EVENTOS.RESERVA_OFERTA_LISTA_ESPERA];
  assert.ok(r.canales.includes('EMAIL'));
  assert.deepEqual(canalesExtraDe(r, preferenciaSinCuenta(r), false).sort(), ['EMAIL', 'PUSH']);
});

test('con cuenta, nada cambia: sigue siendo PREF_DEFECTO (email off hasta que ella lo active)', () => {
  const r = regla(['PUSH', 'EMAIL']);
  assert.deepEqual(canalesExtraDe(r, PREF_DEFECTO, false), ['PUSH']);
});
