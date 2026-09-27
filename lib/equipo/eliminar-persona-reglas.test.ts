import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_GENERICO, avisoNombreSinReconocer, avisoPendientesEquipo, interpretarErrorEliminarPersona, nombreSePuedeReconocerEnTextos,
  puedeEliminarDefinitivamente,
} from './eliminar-persona-reglas.ts';

const base = { rolActor: 'PROPIETARIO', esPropia: false, rolDeLaPersona: 'RECEPCION', activa: false };

test('solo la propietaria elimina, y solo a alguien ya de baja que no sea ella ni la dueña', () => {
  assert.deepEqual(puedeEliminarDefinitivamente(base), { ok: true });
  assert.deepEqual(puedeEliminarDefinitivamente({ ...base, rolDeLaPersona: 'INSTRUCTOR' }), { ok: true });

  const casos: Array<[string, Partial<typeof base>, string, number]> = [
    ['una responsable de sede no', { rolActor: 'MANAGER' }, 'SOLO_PROPIETARIA', 403],
    ['recepción no', { rolActor: 'RECEPCION' }, 'SOLO_PROPIETARIA', 403],
    ['una instructora no', { rolActor: 'INSTRUCTOR' }, 'SOLO_PROPIETARIA', 403],
    ['ni a sí misma', { esPropia: true }, 'ES_UNA_MISMA', 409],
    ['ni a la propietaria', { rolDeLaPersona: 'PROPIETARIO' }, 'ES_PROPIETARIA', 409],
    ['ni a quien sigue en el equipo', { activa: true }, 'SIGUE_ACTIVA', 409],
  ];
  for (const [nombre, cambio, motivo, http] of casos) {
    const v = puedeEliminarDefinitivamente({ ...base, ...cambio });
    assert.equal(v.ok, false, nombre);
    assert.ok(!v.ok && v.motivo === motivo && v.http === http, nombre);
    assert.ok(!v.ok && v.mensaje.length > 20, `${nombre}: sin frase para la persona`);
  }
});

test('quien no es la propietaria no ve otro motivo: no se le cuenta nada de la persona', () => {
  // El orden importa: el rol se comprueba PRIMERO (una responsable de sede no tiene por qué saber si alguien sigue activo).
  const v = puedeEliminarDefinitivamente({ rolActor: 'MANAGER', esPropia: true, rolDeLaPersona: 'PROPIETARIO', activa: true });
  assert.ok(!v.ok && v.motivo === 'SOLO_PROPIETARIA');
});

test('los códigos de la base de datos se traducen a una frase, y lo desconocido nunca se enseña crudo', () => {
  assert.deepEqual(interpretarErrorEliminarPersona('PERSONA_NO_ENCONTRADA').http, 404);
  assert.deepEqual(interpretarErrorEliminarPersona('PERSONA_ACTIVA').http, 409);
  assert.match(interpretarErrorEliminarPersona('TIENE_CLASES_FUTURAS').error, /clases o citas por venir/);
  assert.match(interpretarErrorEliminarPersona('TIENE_LIQUIDACION_SIN_PAGAR').error, /liquidación sin pagar/);
  assert.match(interpretarErrorEliminarPersona('TIENE_JORNADA_ABIERTA').error, /jornada abierta/);
  assert.equal(interpretarErrorEliminarPersona('TIENE_JORNADA_ABIERTA').http, 409);
  assert.match(interpretarErrorEliminarPersona('ES_PROPIETARIA').error, /propietaria/);
  for (const raro of ['CODIGO_NUEVO', 'duplicate key value violates unique constraint "x"', '', null, undefined, 'constructor', '__proto__']) {
    assert.deepEqual(interpretarErrorEliminarPersona(raro as string), { error: ERROR_GENERICO, http: 500 }, String(raro));
  }
});

test('el aviso de lo pendiente habla de una persona del equipo, no de una clienta', () => {
  assert.equal(avisoPendientesEquipo([]), null);
  const aviso = avisoPendientesEquipo([{ tercero: 'cuenta_acceso' }]);
  assert.match(aviso ?? '', /esta persona/);
  assert.doesNotMatch(aviso ?? '', /clienta/i);
});

test('el aviso de lo pendiente nombra QUÉ falta, y dice cómo reintentarlo (no promete que otro lo hará)', () => {
  assert.match(avisoPendientesEquipo([{ tercero: 'cuenta_acceso' }]) ?? '', /su cuenta de acceso no se ha podido borrar/);
  assert.match(avisoPendientesEquipo([{ tercero: 'foto_avatar' }]) ?? '', /su foto no se ha podido borrar/);
  const los2 = avisoPendientesEquipo([{ tercero: 'foto_avatar' }, { tercero: 'cuenta_acceso' }, { tercero: 'cuenta_acceso' }]) ?? '';
  assert.match(los2, /su foto y su cuenta de acceso no se ha podido borrar/);
  // Hay un camino real para reintentar (la ficha sigue en Equipo como «Persona eliminada») y el aviso lo dice.
  assert.match(los2, /Vuelve a intentarlo desde Equipo/);
  assert.doesNotMatch(los2, /Queda registrado para completarlo/, 'promete algo que ningún proceso hace');
});

test('el aviso de un nombre que no se pudo buscar en los textos existe para cada motivo y para ninguno más', () => {
  assert.match(avisoNombreSinReconocer('UNA_PALABRA') ?? '', /una sola palabra/);
  assert.match(avisoNombreSinReconocer('AMBIGUO') ?? '', /coincide con el de otra persona/);
  for (const nada of [null, undefined, '', 'OTRO', 42]) assert.equal(avisoNombreSinReconocer(nada), null);
});

test('la pantalla avisa ANTES de un nombre que no se buscará: la misma regla que la función SQL (tres letras y dos palabras)', () => {
  assert.equal(nombreSePuedeReconocerEnTextos('Ana García'), true);
  assert.equal(nombreSePuedeReconocerEnTextos('Ana-María Ruiz López'), true);
  assert.equal(nombreSePuedeReconocerEnTextos('  Ana   García  '), true);
  assert.equal(nombreSePuedeReconocerEnTextos('Laura'), false);
  assert.equal(nombreSePuedeReconocerEnTextos('  Laura '), false);
  assert.equal(nombreSePuedeReconocerEnTextos('Xi'), false);
  assert.equal(nombreSePuedeReconocerEnTextos(''), false);
  assert.equal(nombreSePuedeReconocerEnTextos('Ana M.'), true);
});
