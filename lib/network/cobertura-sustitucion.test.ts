import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoCoberturaNetwork, estadosCoberturaPorPerfil, faltaColumnaSustitucion,
  type SolicitudCobertura, type InstructorCobertura,
} from './cobertura-sustitucion.ts';

const SUST = 'sust-1';

function sol(p: Partial<SolicitudCobertura>): SolicitudCobertura {
  return { id: 'redcontacto-1', perfil_id: 'perfil-ana', estado: 'pendiente', creado_en: '2026-09-01T10:00:00Z', ...p };
}
function ficha(p: Partial<InstructorCobertura> = {}): InstructorCobertura {
  return { id: 'red-eq-ana', auth_user_id: 'auth-ana', activo: true, rol: 'INSTRUCTOR', ...p };
}
const base = { sustitucionId: SUST, instructorOriginalId: 'inst-laura' };

test('sin solicitudes ni ficha: se le puede pedir', () => {
  assert.deepEqual(estadoCoberturaNetwork({ ...base, solicitudes: [], instructor: null }), { tipo: 'sin-solicitud' });
});

test('pendiente: solicitada, y sabe si se pidió desde ESTA sustitución', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ sustitucion_id: SUST })], instructor: null }),
    { tipo: 'solicitada', paraEstaClase: true },
  );
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ sustitucion_id: 'sust-otra' })], instructor: null }),
    { tipo: 'solicitada', paraEstaClase: false },
  );
  // Antes de la migración la columna no llega: no se inventa que fuera para esta clase.
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({})], instructor: null }),
    { tipo: 'solicitada', paraEstaClase: false },
  );
});

test('aceptada sin ficha en el equipo: toca formalizar, con el id del hilo', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ id: 'redcontacto-9', estado: 'aceptada' })], instructor: null }),
    { tipo: 'aceptada', solicitudId: 'redcontacto-9' },
  );
});

test('una aceptada antigua manda sobre una pendiente o rechazada posterior', () => {
  const r = estadoCoberturaNetwork({
    ...base,
    solicitudes: [
      sol({ id: 'a', estado: 'aceptada', creado_en: '2026-08-01T00:00:00Z' }),
      sol({ id: 'b', estado: 'rechazada', creado_en: '2026-09-01T00:00:00Z', sustitucion_id: SUST }),
    ],
    instructor: null,
  });
  assert.deepEqual(r, { tipo: 'aceptada', solicitudId: 'a' });
});

test('formalizada (ficha activa en el estudio): asignable con SU id de ficha', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ estado: 'aceptada' })], instructor: ficha() }),
    { tipo: 'asignable', instructorId: 'red-eq-ana' },
  );
  // activo NULL = activa (coalesce(activo, true) de la RPC).
  assert.equal(estadoCoberturaNetwork({ ...base, solicitudes: [], instructor: ficha({ activo: null }) }).tipo, 'asignable');
});

test('ficha dada de baja o de recepción NO es asignable: se sigue el camino de la solicitud', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ id: 'x', estado: 'aceptada' })], instructor: ficha({ activo: false }) }),
    { tipo: 'aceptada', solicitudId: 'x' },
  );
  assert.equal(estadoCoberturaNetwork({ ...base, solicitudes: [], instructor: ficha({ rol: 'RECEPCION' }) }).tipo, 'sin-solicitud');
});

test('la instructora que da la baja no puede cubrirse a sí misma', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [], instructor: ficha({ id: 'inst-laura' }) }),
    { tipo: 'titular' },
  );
});

test('un «no» solo cierra la puerta para la clase por la que se preguntó', () => {
  assert.deepEqual(
    estadoCoberturaNetwork({ ...base, solicitudes: [sol({ estado: 'rechazada', sustitucion_id: SUST })], instructor: null }),
    { tipo: 'rechazada' },
  );
  for (const sustitucion_id of ['sust-otra', null, undefined]) {
    assert.deepEqual(
      estadoCoberturaNetwork({ ...base, solicitudes: [sol({ estado: 'rechazada', sustitucion_id })], instructor: null }),
      { tipo: 'sin-solicitud' },
    );
  }
});

test('por perfil: cruza perfil → auth_user_id → ficha, y no mezcla solicitudes de otras', () => {
  const estados = estadosCoberturaPorPerfil({
    ...base,
    perfilIds: ['perfil-ana', 'perfil-bea', 'perfil-cris', 'perfil-dani'],
    perfiles: [
      { id: 'perfil-ana', auth_user_id: 'auth-ana' },
      { id: 'perfil-bea', auth_user_id: 'auth-bea' },
      { id: 'perfil-cris', auth_user_id: 'auth-cris' },
      // perfil-dani sin fila: perfil retirado entretanto.
    ],
    solicitudes: [
      sol({ id: 's-ana', perfil_id: 'perfil-ana', estado: 'aceptada' }),
      sol({ id: 's-bea', perfil_id: 'perfil-bea', estado: 'aceptada' }),
      sol({ id: 's-cris', perfil_id: 'perfil-cris', estado: 'pendiente', sustitucion_id: SUST }),
    ],
    instructores: [
      ficha({ id: 'red-eq-ana-vieja', auth_user_id: 'auth-ana', activo: false }),
      ficha({ id: 'red-eq-ana', auth_user_id: 'auth-ana', activo: true }),
      ficha({ id: 'ficha-de-otra', auth_user_id: 'auth-otra' }),
    ],
  });
  assert.deepEqual(estados, {
    'perfil-ana': { tipo: 'asignable', instructorId: 'red-eq-ana' },
    'perfil-bea': { tipo: 'aceptada', solicitudId: 's-bea' },
    'perfil-cris': { tipo: 'solicitada', paraEstaClase: true },
    'perfil-dani': { tipo: 'sin-solicitud' },
  });
});

test('faltaColumnaSustitucion: solo el «no existe» de ESA columna', () => {
  assert.equal(faltaColumnaSustitucion({ code: '42703', message: 'column red_solicitudes_contacto.sustitucion_id does not exist' }), true);
  assert.equal(faltaColumnaSustitucion({ code: 'PGRST204', message: "Could not find the 'sustitucion_id' column of 'red_solicitudes_contacto' in the schema cache" }), true);
  assert.equal(faltaColumnaSustitucion({ code: '42703', message: 'column red_perfiles.otra does not exist' }), false);
  assert.equal(faltaColumnaSustitucion({ code: '23505', message: 'duplicate key sustitucion_id' }), false);
  assert.equal(faltaColumnaSustitucion(null), false);
});
