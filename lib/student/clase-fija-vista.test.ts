import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRASE_ACTIVA, avisoPenalizacionTardia, comoConseguirla, estadoTarjetaFija, proximasSemanas, resumenDelMes, trasNoIr,
  type DatosCalendarioFija,
} from './clase-fija-vista.ts';

const fc = (iso: string) => `F${iso}`;
const base = { estado: 'ACTIVA' as const, sinClase: false, vigenciaHasta: null, pausa: null };

// ── La tarjeta ───────────────────────────────────────────────────────────────

test('activa sin fecha de fin: «Activa», «Sin fecha de fin» y la frase de que se reserva sola', () => {
  assert.deepEqual(estadoTarjetaFija(base, null, fc), { texto: 'Activa', tono: 'activa', hasta: 'Sin fecha de fin', frase: FRASE_ACTIVA });
});

test('con fecha de fin la dice, con la fecha de la plaza', () => {
  assert.equal(estadoTarjetaFija({ ...base, vigenciaHasta: '2026-12-31' }, null, fc).hasta, 'Hasta el F2026-12-31');
});

test('en pausa (en curso): dice hasta cuándo y que no se reserva mientras tanto', () => {
  const e = estadoTarjetaFija({ ...base, pausa: { desde: '2026-08-01', hasta: '2026-08-20', enCurso: true } }, null, fc);
  assert.equal(e.tono, 'pausa');
  assert.equal(e.texto, 'En pausa hasta el F2026-08-20');
  assert.match(e.frase, /no se te reserva/);
});

test('una pausa futura no la pone en pausa hoy', () => {
  assert.equal(estadoTarjetaFija({ ...base, pausa: { desde: '2026-09-01', hasta: '2026-09-10', enCurso: false } }, null, fc).tono, 'activa');
});

test('pausa pedida sin contestar: lo dice, pero la clase sigue reservándose', () => {
  const e = estadoTarjetaFija(base, { desde: '2026-09-01', hasta: '2026-09-10' }, fc);
  assert.equal(e.texto, 'Pausa pedida');
  assert.equal(e.frase, FRASE_ACTIVA);
});

test('sin clase en su hueco manda sobre todo lo demás', () => {
  const e = estadoTarjetaFija({ ...base, sinClase: true }, { desde: 'a', hasta: 'b' }, fc);
  assert.equal(e.tono, 'sin-clase');
  assert.match(e.frase, /pregúntale al estudio/);
});

// ── Las próximas semanas ─────────────────────────────────────────────────────

// Jueves a las 10:00 en la sala 1. Hoy, miércoles 12 de agosto de 2026.
const plazaCal = { diaSemana: 4, hora: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc', estado: 'ACTIVA' as const, vigenciaDesde: '2026-01-01', vigenciaHasta: null };
const jueves = ['2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'];
const sesiones = jueves.map((fecha, i) => ({ id: `s${i}`, fecha, hora: '10:00', salaId: 'sala-1', tipoClaseId: 'tc', cancelada: false }));
const plaza = (proximas: { reservaId: string; sesionId: string }[]) => ({ diaSemana: 4, hora: '10:00', salaId: 'sala-1', proximas });

test('cinco semanas como mucho, con la reserva de su clase fija en cada una', () => {
  const datos: DatosCalendarioFija = { plazas: [plazaCal], sesiones, reservas: jueves.map((_, i) => ({ sesionId: `s${i}`, estado: 'CONFIRMADA' })) };
  const s = proximasSemanas(plaza(jueves.map((_, i) => ({ reservaId: `res-pf-${i}`, sesionId: `s${i}` }))), datos, '2026-08-12', '09:00');
  assert.equal(s.length, 5);
  assert.deepEqual(s.map((x) => x.estado), ['va', 'va', 'va', 'va', 'va']);
  assert.equal(s[0].reservaId, 'res-pf-0');
});

test('la semana cancelada sale como «no va», la pausa como pausa, y una sin reserva lo dice', () => {
  const datos: DatosCalendarioFija = {
    plazas: [{ ...plazaCal, pausaDesde: '2026-08-27', pausaHasta: '2026-08-27' }], sesiones,
    reservas: [{ sesionId: 's0', estado: 'CONFIRMADA' }, { sesionId: 's1', estado: 'CANCELADA' }],
  };
  const s = proximasSemanas(plaza([{ reservaId: 'res-pf-0', sesionId: 's0' }]), datos, '2026-08-12', '09:00');
  assert.deepEqual(s.map((x) => x.estado), ['va', 'no-va', 'pausa', 'sin-reservar', 'sin-reservar']);
  assert.equal(s[1].reservaId, null, 'una semana que ya no va no tiene reserva que cancelar');
});

test('una reserva hecha a mano en su hueco NO es de su clase fija: no se cancela desde la píldora', () => {
  const datos: DatosCalendarioFija = { plazas: [plazaCal], sesiones, reservas: [{ sesionId: 's0', estado: 'CONFIRMADA' }] };
  const [primera] = proximasSemanas(plaza([]), datos, '2026-08-12', '09:00');
  assert.equal(primera.estado, 'va-a-mano');
  assert.equal(primera.reservaId, null);
});

test('la clase de hoy que ya ha empezado no cuenta como próxima', () => {
  const datos: DatosCalendarioFija = { plazas: [plazaCal], sesiones, reservas: [] };
  assert.equal(proximasSemanas(plaza([]), datos, '2026-08-13', '10:30')[0].fecha, '2026-08-20');
  assert.equal(proximasSemanas(plaza([]), datos, '2026-08-13', '09:30')[0].fecha, '2026-08-13');
});

test('sin clases programadas: ninguna semana (la pantalla dice que se reservará cuando las haya)', () => {
  assert.deepEqual(proximasSemanas(plaza([]), { plazas: [plazaCal], sesiones: [], reservas: [] }, '2026-08-12', '09:00'), []);
});

// ── «No voy» ─────────────────────────────────────────────────────────────────

test('lo que se dice tras «no voy» sale de la respuesta del servidor', () => {
  assert.deepEqual(trasNoIr({ eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-11' }, fc),
    { texto: 'Tienes una clase para recuperar hasta el F2026-09-11: úsala desde el horario. Tu clase fija sigue activa.', invitarAReservar: false });
  assert.match(trasNoIr({ eraConfirmada: true, recuperacionAlCerrarSemana: true }, fc).texto, /al acabarla tendrás una clase para recuperar/);
  assert.equal(trasNoIr({ eraConfirmada: true, tardia: true }, fc).texto, 'Fuera de plazo: esta vez no hay clase para recuperar. Tu clase fija sigue activa.');
  assert.equal(trasNoIr({ eraConfirmada: true }, fc).texto, 'Tu clase fija sigue activa.');
});

test('volver a reservarla solo se ofrece cuando no le regala ni le esconde nada', () => {
  assert.equal(trasNoIr({ eraConfirmada: true }, fc).invitarAReservar, true);
  assert.equal(trasNoIr({ eraConfirmada: true, recuperacionAlCerrarSemana: true }, fc).invitarAReservar, true, 'el barrido no compensa una clase a la que volvió');
  assert.equal(trasNoIr({ eraConfirmada: true, recuperacionCreada: true }, fc).invitarAReservar, false, 'se quedaría con la clase Y la recuperación');
  assert.equal(trasNoIr({ eraConfirmada: true, tardia: true }, fc).invitarAReservar, false, 'volver no anula la cancelación tardía');
});

test('la confirmación nombra la penalización solo si hay una, y como «puede»', () => {
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  assert.equal(avisoPenalizacionTardia(8, eur), 'Tu estudio puede cobrarte 8,00 € por cancelar tan tarde.');
  assert.equal(avisoPenalizacionTardia(0, eur), null);
  assert.equal(avisoPenalizacionTardia(null, eur), null);
});

test('no queda nada de «Deshacer» en la tarjeta', async () => {
  const { readFileSync } = await import('node:fs');
  const tarjeta = readFileSync(new URL('../../components/student/domain/MiClaseFija.tsx', import.meta.url), 'utf8');
  // Fuera de los comentarios (que explican por qué no está).
  const codigo = tarjeta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(codigo, /Deshacer|confirmarReserva/);
});

// ── El mes ───────────────────────────────────────────────────────────────────

test('el resumen del mes cuenta sus clases y las que no va; las que no tiene reservadas, aparte', () => {
  const datos: DatosCalendarioFija = { plazas: [plazaCal], sesiones, reservas: [{ sesionId: 's0', estado: 'CONFIRMADA' }, { sesionId: 's1', estado: 'CANCELADA' }] };
  assert.equal(resumenDelMes(datos, '2026-08-12'), 'Agosto: 2 clases, 1 que no vas · 1 sin reservar');
  assert.equal(resumenDelMes({ plazas: [plazaCal], sesiones, reservas: [] }, '2026-08-12'), 'Agosto: 3 sin reservar', 'una clase sin reserva no es una de sus clases');
  assert.equal(resumenDelMes({ plazas: [plazaCal], sesiones: [], reservas: [] }, '2026-08-12'), null);
});

// ── Sin clase fija ───────────────────────────────────────────────────────────

test('cómo conseguirla dice la verdad del estudio: si no deja pedirla desde la app, «Pídesela a tu estudio»', () => {
  const sinApp = comoConseguirla({}, true);
  assert.equal(sinApp.pasos.length, 3);
  assert.match(sinApp.pasos[1], /Pídesela a tu estudio/);
  assert.ok(!sinApp.pasos.some((p) => /Activa «Clase fija»/.test(p)));
  assert.equal(sinApp.muestraInterruptor, false);

  const conApp = comoConseguirla({ puedePedirPlazaFija: true }, true);
  assert.deepEqual(conApp.pasos, ['Abre la clase a la que vas siempre', 'Activa «Clase fija» y elige hasta cuándo', 'Tu estudio la confirma y ya está']);
  assert.equal(conApp.muestraInterruptor, true);
  assert.match(comoConseguirla({ puedePedirPlazaFija: true, plazaFijaAutomatica: true }, true).pasos[2], /es tuya al momento; si no, la confirma/);
});

test('…y la de ella: sin cuota no se le enseña un interruptor que no va a encontrar', () => {
  const sinCuota = comoConseguirla({ puedePedirPlazaFija: true }, false);
  assert.match(sinCuota.pasos[0], /cuota que cubra tus clases/);
  assert.equal(sinCuota.muestraInterruptor, false);
  assert.match(sinCuota.conBono ?? '', /Con bono, desde la ficha de una clase puedes reservar varias semanas/);
  // Sin peticiones desde la app tampoco hay «varias semanas» en la ficha: no se promete.
  const ni = comoConseguirla({}, false);
  assert.match(ni.pasos[0], /cuota/);
  assert.equal(ni.conBono, null);
});
