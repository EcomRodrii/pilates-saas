import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS, ORIGENES, ESTADOS, ETIQUETA_ESTADO, resolverPasos, resumirRecorrido, pendientesAntesDeActivar, origenDe, esEstado, LIMITES_DE_LA_MIGRACION } from './recorrido.ts';
import { ENTIDADES } from './clasificador.ts';

const VACIO = { numAlumnas: 0, numPlanesActivos: 0, numSuscripciones: 0, numClases: 0, numReservas: 0 };

test('son 11 pasos en orden, con id y número únicos', () => {
  assert.equal(PASOS.length, 11);
  assert.deepEqual(PASOS.map(p => p.numero), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
  assert.equal(new Set(PASOS.map(p => p.id)).size, 11);
});

test('hay exactamente cinco estados, con su etiqueta en español', () => {
  assert.deepEqual([...ESTADOS], ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REQUIERE_REVISION', 'BLOQUEADO']);
  assert.deepEqual(ESTADOS.map(e => ETIQUETA_ESTADO[e]), ['Pendiente', 'En progreso', 'Completado', 'Requiere revisión', 'Bloqueado']);
  assert.ok(esEstado('BLOQUEADO') && !esEstado('HECHO') && !esEstado(null));
});

test('un estudio vacío lo tiene todo pendiente; lo manual nunca se da por hecho solo', () => {
  const p = resolverPasos([], VACIO);
  assert.ok(p.every(x => x.estado === 'PENDIENTE'));
  // Aunque tenga datos de sobra, lo que ocurre fuera de Tentare o lo decide ella no se completa solo.
  const conTodo = resolverPasos([], { numAlumnas: 50, numPlanesActivos: 3, numSuscripciones: 40, numClases: 30, numReservas: 200 });
  for (const x of conTodo) assert.equal(x.estado === 'COMPLETADO', x.paso.modo === 'datos', x.paso.id);
});

test('los pasos de datos se completan por el dato real y se distinguen de lo marcado a mano', () => {
  const p = resolverPasos([], { ...VACIO, numAlumnas: 12, numClases: 5 });
  const por = Object.fromEntries(p.map(x => [x.paso.id, x]));
  assert.equal(por['importar-alumnas'].estado, 'COMPLETADO');
  assert.equal(por['importar-alumnas'].porDatos, true);
  assert.equal(por.horario.estado, 'COMPLETADO');
  // Bonos pide planes Y suscripciones: con solo uno de los dos, no.
  assert.equal(por['importar-bonos'].estado, 'PENDIENTE');
  assert.equal(resolverPasos([], { ...VACIO, numPlanesActivos: 2 }).find(x => x.paso.id === 'importar-bonos')!.estado, 'PENDIENTE');
});

test('«Requiere revisión» y «Bloqueado» mandan sobre el dato; «En progreso» no lo tapa', () => {
  const datos = { ...VACIO, numAlumnas: 12 };
  const rev = resolverPasos([{ paso: 'importar-alumnas', estado: 'REQUIERE_REVISION', nota: 'faltan teléfonos' }], datos).find(x => x.paso.id === 'importar-alumnas')!;
  assert.equal(rev.estado, 'REQUIERE_REVISION'); assert.equal(rev.nota, 'faltan teléfonos'); assert.equal(rev.porDatos, false);
  assert.equal(resolverPasos([{ paso: 'importar-alumnas', estado: 'BLOQUEADO', nota: null }], datos).find(x => x.paso.id === 'importar-alumnas')!.estado, 'BLOQUEADO');
  assert.equal(resolverPasos([{ paso: 'importar-alumnas', estado: 'EN_PROGRESO', nota: null }], datos).find(x => x.paso.id === 'importar-alumnas')!.estado, 'COMPLETADO');
});

test('lo manual toma lo que ella marcó', () => {
  const p = resolverPasos([{ paso: 'exportar', estado: 'EN_PROGRESO', nota: null }, { paso: 'prueba', estado: 'COMPLETADO', nota: 'ok' }], VACIO);
  assert.equal(p.find(x => x.paso.id === 'exportar')!.estado, 'EN_PROGRESO');
  assert.equal(p.find(x => x.paso.id === 'prueba')!.estado, 'COMPLETADO');
});

test('el resumen cuenta, da el siguiente en orden y señala lo que pide atención', () => {
  const p = resolverPasos([
    { paso: 'diagnostico', estado: 'COMPLETADO', nota: null }, { paso: 'que-traes', estado: 'COMPLETADO', nota: null },
    { paso: 'exportar', estado: 'BLOQUEADO', nota: 'su soporte no contesta' },
  ], { ...VACIO, numAlumnas: 3 });
  const r = resumirRecorrido(p);
  assert.equal(r.completados, 3); assert.equal(r.total, 11); assert.equal(r.pct, 27);
  assert.equal(r.siguiente?.paso.id, 'exportar');
  assert.deepEqual(r.conAviso.map(x => x.paso.id), ['exportar']);
});

test('antes de activar se dice qué falta, sin impedirlo', () => {
  const p = resolverPasos([{ paso: 'activar', estado: 'COMPLETADO', nota: null }], VACIO);
  const falta = pendientesAntesDeActivar(p);
  assert.equal(falta.length, 10);
  assert.ok(!falta.some(x => x.paso.id === 'activar'));
});

test('los cinco softwares pedidos están, con fecha, y solo se dan pasos si constan en su documentación', () => {
  assert.deepEqual(['timp', 'bsport', 'eversports', 'mindbody', 'momence'].filter(id => !origenDe(id)), []);
  for (const o of ORIGENES) {
    assert.match(o.comprobado, /^\d{4}-\d{2}-\d{2}$/, o.id);
    // Sin verificar: ningún paso inventado y siempre una salida (su soporte).
    if (!o.verificado) { assert.equal(o.pasos.length, 0, `${o.id}: sin verificar no se dan pasos`); assert.match(o.aviso, /soporte|confirm/i, o.id); }
    // Verificado de un software concreto: cita su fuente.
    if (o.verificado && o.id !== 'otro') { assert.ok(o.fuente?.href.startsWith('https://'), o.id); assert.ok(o.pasos.length >= 2, o.id); }
    if (o.fuente) assert.match(o.fuente.href, /^https:\/\//);
  }
  assert.deepEqual(ORIGENES.filter(o => o.verificado).map(o => o.id).sort(), ['eversports', 'otro', 'timp']);
});

test('nada promete que Tentare haga la migración por ella (se retiró el 21-oct-2026)', () => {
  const texto = JSON.stringify([PASOS, ORIGENES, LIMITES_DE_LA_MIGRACION]).toLowerCase();
  for (const mal of ['te la hacemos', 'lo hacemos nosotros', 'migración automática', 'migramos por ti', 'sin esfuerzo']) assert.ok(!texto.includes(mal), mal);
});

test('lo que se dice que el importador lee coincide con lo que de verdad lee', () => {
  const lee = Object.values(ENTIDADES).map(e => e.etiqueta.toLowerCase());
  const descripcion = PASOS.find(p => p.id === 'que-traes')!.descripcion.toLowerCase();
  for (const etiqueta of lee) {
    const primera = etiqueta.split(' ')[0].replace(/s$/, '');
    assert.ok(descripcion.includes(primera), `«${etiqueta}» no se menciona en el paso «Decide qué datos traes»`);
  }
});
