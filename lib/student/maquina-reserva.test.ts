import test from 'node:test';
import assert from 'node:assert/strict';
import { disponibilidad, avisoCancelacion, transicionValida, COPY } from './maquina-reserva.ts';
import type { Clase, Reserva } from './tipos.ts';

const clase = (over: Partial<Clase> = {}): Clase => ({
  id: 'c1', tipoClaseId: 'tc-1', fecha: '2026-10-01', hora: '10:00', duracionMin: 55,
  nombre: 'Reformer', tipo: 'Reformer', disciplina: 'Pilates', nivel: 'Todos',
  instructoraId: 'i1', sala: 'Sala 1', capacidad: 10, plazasLibres: 5,
  precioSuelto: 18, fotoUrl: '/x.webp', ventanaCancelacionHoras: null, ...over,
});
const reserva = (over: Partial<Reserva> = {}): Reserva => ({
  id: 'r1', claseId: 'c1', alumnaId: 'a1', estado: 'confirmada',
  creadaEn: '2026-09-01T10:00:00Z', ...over,
});

test('disponibilidad: mi reserva gana sobre las plazas libres', () => {
  // Aunque la clase esté llena, si es MÍA se pinta «reservada», no «completa».
  assert.equal(disponibilidad(clase({ plazasLibres: 0 }), [reserva()], true), 'reservada');
  assert.equal(disponibilidad(clase({ plazasLibres: 0 }), [reserva({ estado: 'en-espera' })], true), 'lista-espera');
});

test('disponibilidad: una reserva cancelada no cuenta como mía', () => {
  assert.equal(disponibilidad(clase(), [reserva({ estado: 'cancelada' })], true), 'disponible');
});

test('disponibilidad: sin plazas depende de si el estudio admite espera', () => {
  assert.equal(disponibilidad(clase({ plazasLibres: 0 }), [], true), 'completa');
  assert.equal(disponibilidad(clase({ plazasLibres: 0 }), [], false), 'no-disponible');
});

test('disponibilidad: dos o menos es «pocas»', () => {
  assert.equal(disponibilidad(clase({ plazasLibres: 2 }), [], true), 'pocas');
  assert.equal(disponibilidad(clase({ plazasLibres: 3 }), [], true), 'disponible');
});

test('disponibilidad: una reserva de OTRA clase no afecta', () => {
  assert.equal(disponibilidad(clase(), [reserva({ claseId: 'otra' })], true), 'disponible');
});

test('avisoCancelacion: dentro de plazo anuncia que devuelve, fuera no', () => {
  const c = clase({ fecha: '2026-10-01', hora: '10:00' });
  const dosDiasAntes = new Date('2026-09-29T10:00:00Z');
  const unaHoraAntes = new Date('2026-10-01T07:00:00Z'); // 09:00 en Madrid
  assert.equal(avisoCancelacion(c, 12, dosDiasAntes).devolveriaCredito, true);
  assert.equal(avisoCancelacion(c, 12, unaHoraAntes).devolveriaCredito, false);
});

test('avisoCancelacion: una clase que ya empezó no se puede cancelar', () => {
  const c = clase({ fecha: '2026-10-01', hora: '10:00' });
  assert.equal(avisoCancelacion(c, 12, new Date('2026-10-01T12:00:00Z')).puede, false);
});

test('transiciones: submitting puede acabar en cualquier desenlace; confirmed es terminal', () => {
  for (const fin of ['confirmed', 'waitlisted', 'full', 'conflict', 'duplicate', 'session-expired', 'error', 'offline'] as const) {
    assert.equal(transicionValida('submitting', fin), true, `submitting → ${fin}`);
  }
  // Nada sale de `confirmed`: una reserva confirmada no vuelve al formulario.
  assert.equal(transicionValida('confirmed', 'reviewing'), false);
  // Y no se puede saltar de idle a confirmed sin pasar por el servidor.
  assert.equal(transicionValida('idle', 'confirmed'), false);
});

test('COPY: los tres estados que niegan un cargo lo dicen con esas palabras', () => {
  // Es lo que evita la llamada al estudio preguntando si le han cobrado.
  for (const s of ['session-expired', 'offline'] as const) {
    assert.match(COPY[s].cuerpo, /no se ha hecho ningún cargo/i, s);
  }
  assert.match(COPY.error.cuerpo, /no se ha usado ninguna sesión/i);
});

test('COPY: solo confirmed tiene tono de éxito', () => {
  const ok = Object.entries(COPY).filter(([, v]) => v.tono === 'ok').map(([k]) => k);
  assert.deepEqual(ok, ['confirmed']);
});

test('la ventana del TIPO de clase manda sobre la del estudio', () => {
  // Estudio con 12 h y clase con 24: a 18 h vista, el estudio diría «gratis» y
  // el tipo dice que ya no. Manda el tipo, que es lo que aplica el servidor.
  const c = clase({ ventanaCancelacionHoras: 24 });
  const a18h = new Date(new Date(c.fecha + 'T' + c.hora + ':00').getTime() - 18 * 36e5);
  assert.equal(avisoCancelacion(c, 12, a18h).devolveriaCredito, false);
  assert.equal(avisoCancelacion(clase({ ventanaCancelacionHoras: null }), 12, a18h).devolveriaCredito, true);
});

test('una ventana de 0 h del tipo NO cae al valor del estudio', () => {
  // `??` y no `||`: un estudio que deja cancelar hasta el último minuto pone 0,
  // y con `||` se habría leído como «usa las 12 del estudio».
  const c = clase({ ventanaCancelacionHoras: 0 });
  const a1h = new Date(new Date(c.fecha + 'T' + c.hora + ':00').getTime() - 1 * 36e5);
  assert.equal(avisoCancelacion(c, 12, a1h).devolveriaCredito, true);
});
