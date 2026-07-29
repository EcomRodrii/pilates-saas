import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeConceder, puedeDarDeAlta, puedeGuardarCambio, puedeTocarA, quedaAlgunCeo,
  type MiembroInterno,
} from './equipo-reglas.ts';

const CEO = { userId: 'u-marco', permisos: ['admin.full'] };
const RRHH = { userId: 'u-rrhh', permisos: ['users.create', 'studios.read'] };

const EQUIPO: MiembroInterno[] = [
  { userId: 'u-marco', nombre: 'Marco', activo: true, permisos: ['admin.full'] },
  { userId: 'u-meri', nombre: 'Meri', activo: true, permisos: ['studios.read', 'billing.read', 'crm.update'] },
  { userId: 'u-rrhh', nombre: 'Álex', activo: true, permisos: ['users.create', 'studios.read'] },
];

test('nadie se cambia su propio acceso', () => {
  // Cierra las dos puertas de golpe: ascenderse solo y dejarse fuera sin querer.
  const r = puedeTocarA(CEO, 'u-marco');
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /tu propio acceso/);
});

test('ni siquiera el CEO puede ascenderse a sí mismo', () => {
  const r = puedeGuardarCambio(CEO, EQUIPO, 'u-marco', { activo: true, permisos: ['admin.full'] });
  assert.equal(r.ok, false);
});

test('con users.create no se fabrica un admin.full', () => {
  // La escalada de privilegios en un clic: doy de alta a un cómplice como CEO,
  // o me asciendo a través de él.
  const r = puedeConceder(RRHH, ['admin.full']);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /no lo tienes/);
});

test('solo se concede lo que uno tiene', () => {
  const r = puedeConceder(RRHH, ['billing.refund']);
  assert.equal(r.ok, false);
});

test('el CEO sí concede cualquier cosa: admin.full es comodín', () => {
  assert.equal(puedeConceder(CEO, ['billing.refund', 'studios.delete', 'admin.full']).ok, true);
});

test('los permisos que no se delegan no se delegan ni teniéndolos', () => {
  // Alguien con studios.delete concedido a mano NO puede pasárselo a otro:
  // borrar un estudio destruye los datos de las clientas de otra persona.
  const conBorrado = { userId: 'u-x', permisos: ['users.create', 'studios.delete'] };
  const r = puedeConceder(conBorrado, ['studios.delete']);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /no se delega/);
});

test('quitar el último admin.full activo está prohibido', () => {
  const r = quedaAlgunCeo(EQUIPO, 'u-marco', { activo: true, permisos: ['studios.read'] });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /sin nadie con acceso total/);
});

test('desactivar al último admin.full activo también está prohibido', () => {
  // El otro camino al mismo agujero: no le quito el permiso, lo desactivo.
  const r = quedaAlgunCeo(EQUIPO, 'u-marco', { activo: false, permisos: ['admin.full'] });
  assert.equal(r.ok, false);
});

test('si hay dos CEO, quitarle el acceso a uno sí se puede', () => {
  const dos = [...EQUIPO, { userId: 'u-cofu', nombre: 'Meri', activo: true, permisos: ['admin.full'] }];
  assert.equal(quedaAlgunCeo(dos, 'u-marco', { activo: false, permisos: ['admin.full'] }).ok, true);
});

test('un CEO desactivado no cuenta como red de seguridad', () => {
  const conFantasma: MiembroInterno[] = [
    { userId: 'u-marco', nombre: 'Marco', activo: true, permisos: ['admin.full'] },
    { userId: 'u-viejo', nombre: 'Antiguo', activo: false, permisos: ['admin.full'] },
  ];
  const r = quedaAlgunCeo(conFantasma, 'u-marco', { activo: false, permisos: ['admin.full'] });
  assert.equal(r.ok, false, 'el desactivado no puede entrar: no salva a nadie');
});

test('QUITAR un permiso que uno no tiene sí se puede', () => {
  // Reducir acceso nunca es una escalada. Si esto no valiera, nadie sin
  // billing.refund podría limpiar los permisos de un CEO que se va.
  const equipo: MiembroInterno[] = [
    { userId: 'u-marco', nombre: 'Marco', activo: true, permisos: ['admin.full'] },
    { userId: 'u-fin', nombre: 'Fin', activo: true, permisos: ['billing.refund', 'studios.read'] },
  ];
  const r = puedeGuardarCambio(RRHH, equipo, 'u-fin', { activo: true, permisos: ['studios.read'] });
  assert.equal(r.ok, true);
});

test('cambiar a alguien que no está en el equipo se rechaza', () => {
  const r = puedeGuardarCambio(CEO, EQUIPO, 'u-desconocido', { activo: true, permisos: ['studios.read'] });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /no está en el equipo/);
});

test('el camino normal funciona: RRHH ajusta a Meri dentro de lo que él tiene', () => {
  const r = puedeGuardarCambio(RRHH, EQUIPO, 'u-meri', { activo: true, permisos: ['studios.read'] });
  assert.equal(r.ok, true);
});

test('un alta normal pasa, y un alta con admin.full desde RRHH no', () => {
  assert.equal(puedeDarDeAlta(RRHH, ['studios.read']).ok, true);
  assert.equal(puedeDarDeAlta(RRHH, ['admin.full']).ok, false);
});
