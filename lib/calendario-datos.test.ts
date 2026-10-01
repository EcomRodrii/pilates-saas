import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enriquecerSesiones, ocultarImporteSiCorresponde, instructoresVisiblesPorRol, completarSesiones, flojaDeRecomendacion,
  type FlojaDeClase,
} from './calendario-datos.ts';
import type { Sesion, Instructor } from './types.ts';

const sesion = (o: Partial<Sesion> & Pick<Sesion, 'id' | 'instructorId'>): Sesion => ({
  studioId: 'e1', tipoClaseId: 'tc1', salaId: 'sala1', inicio: '2026-07-13T08:00:00Z',
  fin: '2026-07-13T09:00:00Z', aforoMaximo: 8, cancelada: false, notas: null,
  precioPuntual: 15, ...o,
});

// ── enriquecerSesiones ───────────────────────────────────────────────────────

test('enriquecerSesiones: sin sustitución → sustitucionAbierta false, motivoBaja null', () => {
  const [r] = enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' })], []);
  assert.equal(r.sustitucionAbierta, false);
  assert.equal(r.motivoBaja, null);
});

test('enriquecerSesiones: sustitución en estado "buscando" → abierta, con motivo y su id', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' })],
    [{ id: 'sus-1', sesion_id: 's1', estado: 'buscando', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, true);
  assert.equal(r.motivoBaja, 'Gripe');
  assert.equal(r.sustitucionId, 'sus-1');
});

test('enriquecerSesiones: sustitución "confirmada" NO cuenta como abierta (ya tiene sustituta)', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'maria' })],
    [{ id: 'sus-1', sesion_id: 's1', estado: 'confirmada', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, false);
  assert.equal(r.motivoBaja, null);
});

test('enriquecerSesiones: "cancelada"/"resuelta_fuera"/"sin_sustituta" tampoco cuentan como abiertas', () => {
  for (const estado of ['cancelada', 'resuelta_fuera', 'sin_sustituta']) {
    const [r] = enriquecerSesiones(
      [sesion({ id: 's1', instructorId: 'maria' })],
      [{ id: 'sus-1', sesion_id: 's1', estado, motivo: 'x' }],
    );
    assert.equal(r.sustitucionAbierta, false, `estado ${estado} no debería contar como abierta`);
  }
});

test('enriquecerSesiones: una sustitución de OTRA sesión no contamina esta', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' })],
    [{ id: 'sus-1', sesion_id: 'otra-sesion', estado: 'buscando', motivo: 'Gripe' }],
  );
  assert.equal(r.sustitucionAbierta, false);
});

// ── Los tres roles reciben payloads distintos ───────────────────────────────

test('PROPIETARIO: ve el importe y todas las sesiones del estudio', () => {
  const enr = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'maria' })],
    [],
  );
  const finales = ocultarImporteSiCorresponde(enr, 'PROPIETARIO');
  assert.equal(finales.length, 2);
  assert.ok(finales.every(s => s.precioPuntual === 15));
});

test('RECEPCION: SÍ ve el importe (cobra en mostrador, puedeMoverDinero la incluye)', () => {
  // Se confirma aquí explícitamente en vez de asumirlo, para que un cambio en
  // permisos-reglas.ts rompa este test en vez de colar en silencio.
  const enr = enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' })], []);
  const conImporte = ocultarImporteSiCorresponde(enr, 'RECEPCION');
  assert.equal(conImporte[0].precioPuntual, 15);
});

test('INSTRUCTOR: sin importe (el calendario del panel ya le da 403; esto es la red de debajo)', () => {
  const enr = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'maria' })],
    [],
  );
  const sinImporte = ocultarImporteSiCorresponde(enr, 'INSTRUCTOR');
  assert.ok(sinImporte.every(s => s.precioPuntual === null));
});

// ── instructoresVisiblesPorRol ───────────────────────────────────────────────

const ficha = (id: string): Instructor => ({
  id, studioId: 'e1', nombre: id, email: `${id}@estudio.es`, telefono: '600000000',
  color: '#000', activo: true, rol: 'INSTRUCTOR', authUserId: `u-${id}`,
} as Instructor);

test('INSTRUCTOR: sus compañeras llegan sin email, teléfono ni cuenta; su ficha, entera', () => {
  const [julia, maria] = instructoresVisiblesPorRol([ficha('julia'), ficha('maria')], 'INSTRUCTOR', 'u-julia');
  assert.equal(julia.email, 'julia@estudio.es');
  assert.equal(julia.authUserId, 'u-julia', 'el calendario se reconoce a sí mismo por authUserId');
  assert.equal(maria.email, null);
  assert.equal(maria.telefono, null);
  assert.equal(maria.authUserId, null);
  assert.equal(maria.nombre, 'maria', 'nombre y color siguen: pintan la rejilla');
});

test('INSTRUCTOR sin cuenta resuelta no recibe el contacto de nadie', () => {
  const lista = instructoresVisiblesPorRol([ficha('julia')], 'INSTRUCTOR', null);
  assert.equal(lista[0].email, null);
});

test('quien organiza el calendario recibe el contacto de todo el equipo', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
    const [maria] = instructoresVisiblesPorRol([ficha('maria')], rol, 'u-otra');
    assert.equal(maria.telefono, '600000000', rol);
  }
});

// ── completarSesiones: ausencias, instructora dada de baja y «floja» ─────────

const VACACIONES = new Map([['aus-1', { tipo: 'BAJA_MEDICA', desde: '2026-07-10', hasta: '2026-07-20' }]]);
const BLOQUEO = [{ instructorId: 'julia', fecha: '2026-07-13', horaInicio: null, horaFin: null, ausenciaId: 'aus-1' }];
const FLOJA: FlojaDeClase = { recomendacionId: 'rec-1', reservasAhora: 2, aforo: 8, referenciaHabitual: 5, diasVista: 4, ocurrencias: 6 };
const completar = (rol: 'PROPIETARIO' | 'MANAGER' | 'RECEPCION') => completarSesiones(
  enriquecerSesiones([sesion({ id: 's1', instructorId: 'julia' }), sesion({ id: 's2', instructorId: 'ana' })], []),
  { rol, bloqueos: BLOQUEO, ausencias: VACACIONES, instructorasInactivas: new Set(['ana']), flojas: new Map([['s2', FLOJA]]) },
);

test('completarSesiones: la ausencia y la instructora dada de baja llegan a su clase', () => {
  const [s1, s2] = completar('PROPIETARIO');
  assert.deepEqual(s1.ausencia, { tipo: 'BAJA_MEDICA', desde: '2026-07-10', hasta: '2026-07-20' });
  assert.equal(s1.instructoraInactiva, false);
  assert.equal(s2.ausencia, null);
  assert.equal(s2.instructoraInactiva, true);
});

test('completarSesiones: el tipo de ausencia (puede hablar de salud) solo lo ve quien gestiona el equipo', () => {
  assert.equal(completar('MANAGER')[0].ausencia?.tipo, 'BAJA_MEDICA');
  const recepcion = completar('RECEPCION')[0].ausencia;
  assert.equal(recepcion?.tipo, 'OTRO');
  // Que no está, sí lo sabe: es lo que necesita para no apuntar a nadie con ella.
  assert.equal(recepcion?.desde, '2026-07-10');
});

test('completarSesiones: «floja» sale del Centro de Control y solo la ve quien lo ve', () => {
  assert.deepEqual(completar('PROPIETARIO')[1].floja, FLOJA);
  assert.equal(completar('RECEPCION')[1].floja, null);
  assert.equal(completar('PROPIETARIO')[0].floja, null);
});

test('flojaDeRecomendacion: sin sus cifras no hay «floja» que pintar', () => {
  const datos = { reservasAhora: 2, aforo: 8, referenciaHabitual: 5, diasVista: 4, ocurrenciasComparadas: 6 };
  assert.deepEqual(flojaDeRecomendacion({ id: 'rec-1', datos_usados: datos }), FLOJA);
  assert.equal(flojaDeRecomendacion({ id: 'rec-1', datos_usados: { ...datos, referenciaHabitual: undefined } }), null);
  assert.equal(flojaDeRecomendacion({ id: 'rec-1', datos_usados: null }), null);
});

test('enriquecerSesiones: el estado de la sustitución viaja con ella', () => {
  const [r] = enriquecerSesiones(
    [sesion({ id: 's1', instructorId: 'julia' })],
    [{ id: 'sus-1', sesion_id: 's1', estado: 'pendiente_aprobacion', motivo: null }],
  );
  assert.equal(r.sustitucionEstado, 'pendiente_aprobacion');
  assert.equal(enriquecerSesiones([sesion({ id: 's2', instructorId: 'julia' })], [])[0].sustitucionEstado, null);
});

