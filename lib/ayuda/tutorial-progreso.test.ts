import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUTORIALES_DESDE, TUTORIALES_DESDE_INSTANTE, anotar, claveProgreso, debeAbrirseSolo, guardarProgreso, leerProgreso,
  nacioConTutoriales, yaVisto,
} from './tutorial-progreso.ts';

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); }, datos };
}
const roto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };

test('la clave lleva usuario Y estudio: la misma persona en dos sedes son dos progresos', () => {
  assert.equal(claveProgreso('u-1', 'studio-a'), 'tentare:tutoriales:v1:u-1:studio-a');
  assert.notEqual(claveProgreso('u-1', 'studio-a'), claveProgreso('u-1', 'studio-b'));
});

test('leer nunca lanza: sin storage, bloqueado o corrupto es «no ha visto nada»', () => {
  assert.deepEqual(leerProgreso(null, 'k'), {});
  assert.deepEqual(leerProgreso(roto, 'k'), {});
  assert.deepEqual(leerProgreso(almacen({ k: '{no es json' }), 'k'), {});
  assert.deepEqual(leerProgreso(almacen({ k: '[1,2]' }), 'k'), {});
  // Las entradas con mala forma se descartan, las buenas se quedan.
  const mezcla = JSON.stringify({ '/calendario': { version: 1, como: 'saltado' }, '/clientas': { version: 'x' }, '/cobros': null });
  assert.deepEqual(leerProgreso(almacen({ k: mezcla }), 'k'), { '/calendario': { version: 1, como: 'saltado' } });
});

test('guardar nunca lanza y dice si pudo', () => {
  const a = almacen();
  assert.equal(guardarProgreso(a, 'k', anotar({}, '/calendario', 1, 'completado')), true);
  assert.deepEqual(leerProgreso(a, 'k'), { '/calendario': { version: 1, como: 'completado' } });
  assert.equal(guardarProgreso(roto, 'k', {}), false);
  assert.equal(guardarProgreso(null, 'k', {}), false);
});

test('subir la versión lo vuelve a enseñar', () => {
  const p = anotar({}, '/calendario', 1, 'saltado');
  assert.equal(yaVisto(p, '/calendario', 1), true);
  assert.equal(yaVisto(p, '/calendario', 2), false);
  assert.equal(yaVisto(p, '/clientas', 1), false);
});

const BASE = {
  rol: 'PROPIETARIO', visitaActiva: false, visitaObligatoria: false, dialogoAbierto: false, esSedeDeCadena: false,
  creadoEn: `${TUTORIALES_DESDE}T10:00:00Z`, ruta: '/calendario', version: 1, progreso: {}, vistoEnSesion: false,
};

test('se abre solo para la propietaria de un estudio nuevo que no lo ha visto', () => {
  assert.equal(debeAbrirseSolo(BASE), true);
});

test('nada se impone a quien ya trabaja: un estudio de antes solo lo ve con el «?»', () => {
  assert.equal(debeAbrirseSolo({ ...BASE, creadoEn: '2026-09-01T10:00:00Z' }), false);
  assert.equal(debeAbrirseSolo({ ...BASE, creadoEn: null }), false);
});

test('no se abre solo: otro rol, la visita en marcha u obligatoria, un diálogo abierto, una sede de cadena', () => {
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR', null]) assert.equal(debeAbrirseSolo({ ...BASE, rol }), false, String(rol));
  assert.equal(debeAbrirseSolo({ ...BASE, visitaActiva: true }), false);
  // Ya se lo enseña la visita: al terminarla, los tutoriales le repetirían lo mismo.
  assert.equal(debeAbrirseSolo({ ...BASE, visitaObligatoria: true }), false);
  assert.equal(debeAbrirseSolo({ ...BASE, dialogoAbierto: true }), false);
  assert.equal(debeAbrirseSolo({ ...BASE, esSedeDeCadena: true }), false);
});

test('visto, saltado o ya enseñado en esta sesión (sin storage): no vuelve solo', () => {
  assert.equal(debeAbrirseSolo({ ...BASE, progreso: anotar({}, '/calendario', 1, 'saltado') }), false);
  assert.equal(debeAbrirseSolo({ ...BASE, progreso: anotar({}, '/calendario', 1, 'completado') }), false);
  assert.equal(debeAbrirseSolo({ ...BASE, vistoEnSesion: true }), false);
  // Con una versión nueva, sí.
  assert.equal(debeAbrirseSolo({ ...BASE, version: 2, progreso: anotar({}, '/calendario', 1, 'saltado') }), true);
});

test('«estudio nuevo» empieza a las 00:00 de MADRID de TUTORIALES_DESDE, no a las de UTC', () => {
  // El +02:00 del instante tiene que ser el desfase real de Madrid ese día (verano: +2; invierno: +1).
  const enMadrid = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(TUTORIALES_DESDE_INSTANTE));
  assert.equal(enMadrid, '00:00');
  // El 13 a las 00:30 de Madrid es el 12 a las 22:30 UTC: ya es nuevo.
  assert.equal(nacioConTutoriales(new Date(TUTORIALES_DESDE_INSTANTE + 30 * 60_000).toISOString()), true);
  assert.equal(nacioConTutoriales(new Date(TUTORIALES_DESDE_INSTANTE - 60_000).toISOString()), false);
  assert.equal(nacioConTutoriales('basura'), false);
  assert.equal(nacioConTutoriales(undefined), false);
});
