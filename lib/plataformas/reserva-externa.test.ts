import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisoCupoTrasApuntar, leerPeticionReservaExterna, mensajeErrorReservaExterna } from './reserva-externa.ts';

const base = { sesionId: 'ses-1', reservaId: 'res-abc123', plataforma: 'CLASSPASS', nombre: '  Ana   García ' };

test('acepta una petición válida y limpia el nombre', () => {
  const r = leerPeticionReservaExterna(base);
  assert.ok(r.ok);
  assert.equal(r.datos.nombre, 'Ana García');
  assert.equal(r.datos.codigo, null);
  assert.equal(r.datos.plataforma, 'CLASSPASS');
});

test('guarda el código de la plataforma si viene', () => {
  const r = leerPeticionReservaExterna({ ...base, codigo: ' CP-998 ' });
  assert.ok(r.ok);
  assert.equal(r.datos.codigo, 'CP-998');
});

test('rechaza lo que no es una reserva de plataforma bien formada', () => {
  assert.equal(leerPeticionReservaExterna(null).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, plataforma: 'TENTARE' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, plataforma: 'GYMPASS' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, nombre: '   ' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, sesionId: '' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, nombre: 'x'.repeat(121) }).ok, false);
});

test('el id de reserva sigue el formato del panel y nunca el de plaza fija', () => {
  assert.equal(leerPeticionReservaExterna({ ...base, reservaId: 'res-pf-123' }).ok, false);
  // Los de las reservas que entran por API: el servidor los usa para saber qué confirmar a la plataforma.
  assert.equal(leerPeticionReservaExterna({ ...base, reservaId: 'res-wh-BK_A1B2C3' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, reservaId: 'res-usc-123' }).ok, false);
  assert.equal(leerPeticionReservaExterna({ ...base, reservaId: 'otra-cosa' }).ok, false);
});

test('cada código de la RPC llega a recepción en su idioma, nunca el SQL crudo', () => {
  const lleno = mensajeErrorReservaExterna('ERROR: AFORO_LLENO', 'CLASSPASS');
  assert.equal(lleno?.status, 409);
  assert.match(lleno?.error ?? '', /ClassPass/);
  assert.equal(mensajeErrorReservaExterna('CUPO_PLATAFORMA_AGOTADO', 'URBAN_SPORTS_CLUB')?.status, 409);
  assert.equal(mensajeErrorReservaExterna('SESION_TERMINADA', 'WELLHUB')?.status, 400);
  assert.equal(mensajeErrorReservaExterna('TIPO_REQUIERE_AUTORIZACION', 'CLASSPASS')?.status, 400);
  assert.equal(mensajeErrorReservaExterna('relation "x" does not exist', 'CLASSPASS'), null);
});

test('pasarse de las plazas cedidas avisa, pero no lo impide', () => {
  assert.equal(avisoCupoTrasApuntar('CLASSPASS', null, 5), null);
  assert.equal(avisoCupoTrasApuntar('CLASSPASS', 2, 2), null);
  assert.match(avisoCupoTrasApuntar('CLASSPASS', 2, 3) ?? '', /3 de ClassPass.*cedes 2/);
});

// Guardia estática: la reserva de una plataforma tiene su propio dueño y NO
// arrastra los efectos de la reserva de una socia (bono, aviso a la alumna,
// créditos, gamificación). Si alguien los añade, que esto lo pare.
test('el dueño de la reserva externa no consume bono ni avisa a la alumna', () => {
  const fuente = readFileSync(new URL('./tras-reserva-externa.ts', import.meta.url), 'utf8');
  const inicio = fuente.indexOf('export async function trasReservaExterna');
  assert.ok(inicio > 0, 'no se encuentra trasReservaExterna');
  const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio));
  for (const prohibida of ['consumirBonoServidor', 'emitirReserva', 'otorgarPrimeraReservaSiToca', 'evaluarGamificacionServidor', 'capturar(']) {
    assert.ok(!cuerpo.includes(prohibida), `trasReservaExterna no puede llamar a ${prohibida}`);
  }
});
