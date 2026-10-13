import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarArchivoDeterminista, CTX_VACIO, pareceReservaDeClase } from './clasificador.ts';

// Hallazgo de la evaluación de Marta (10-oct-2026): una lista de reservas con
// «Instructora» y «Sala» se clasificaba como CITAS 1:1 (reconocía más columnas)
// y 1.100 reservas de clase iban a entrar como sesiones privadas.

const csv = (cab: string[], filas: string[][]) => [cab.join(','), ...filas.map(f => f.join(','))].join('\n');

test('reservas de clase con instructora y sala: son RESERVAS, no citas', () => {
  const contenido = csv(
    ['Email clienta', 'Clase', 'Fecha', 'Hora inicio', 'Instructora', 'Sala'],
    [
      ['ana.garcia1@example.com', 'Pilates Máquinas', '2026-10-12', '08:00', 'Alba Pons', 'Sala 1'],
      ['lucia.lopez2@example.com', 'Yoga', '2026-10-12', '08:00', 'Carmen Prueba', 'Sala 2'],
      ['sara.ruiz3@example.com', 'Yoga', '2026-10-13', '09:15', 'Paula Vidal', 'Sala 2'],
    ],
  );
  const r = clasificarArchivoDeterminista({ nombre: 'm_reservas.csv', contenido }, CTX_VACIO);
  assert.equal(r.tipo, 'ok');
  if (r.tipo === 'ok') assert.equal(r.analisis.entidad, 'reservas');
});

test('un archivo de citas con servicio y duración sigue siendo de citas', () => {
  const contenido = csv(
    ['Email', 'Servicio', 'Fecha', 'Hora', 'Duración', 'Terapeuta', 'Precio'],
    [
      ['ana.garcia1@example.com', 'Sesión privada', '2026-10-12', '08:00', '60', 'Alba Pons', '55'],
      ['lucia.lopez2@example.com', 'Fisioterapia', '2026-10-13', '10:00', '45', 'Carmen Prueba', '50'],
    ],
  );
  const r = clasificarArchivoDeterminista({ nombre: 'citas.csv', contenido }, CTX_VACIO);
  assert.equal(r.tipo, 'ok');
  if (r.tipo === 'ok') assert.equal(r.analisis.entidad, 'citas');
});

test('cabeceras más libres: «Class Type», «Clase reservada»; y «Solicitada» no es una cita', () => {
  assert.equal(pareceReservaDeClase(['Email', 'Class Type', 'Date', 'Time']), true);
  assert.equal(pareceReservaDeClase(['Email', 'Clase reservada', 'Fecha', 'Hora']), true);
  assert.equal(pareceReservaDeClase(['Email', 'Nombre de la actividad', 'Fecha', 'Hora', 'Solicitada']), true);
  assert.equal(pareceReservaDeClase(['Email', 'Clase', 'Fecha', 'Hora', 'Cita previa']), false);
});

test('pareceReservaDeClase: habla de clase y no de citas', () => {
  assert.equal(pareceReservaDeClase(['Email', 'Clase', 'Fecha', 'Hora', 'Instructora']), true);
  assert.equal(pareceReservaDeClase(['Email', 'Class', 'Date', 'Time', 'Teacher']), true);
  assert.equal(pareceReservaDeClase(['Email', 'Servicio', 'Fecha', 'Hora', 'Terapeuta']), false);
  assert.equal(pareceReservaDeClase(['Email', 'Clase', 'Tipo de cita', 'Fecha', 'Hora']), false);
});
