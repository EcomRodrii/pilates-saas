import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TEXTO, preguntasPendientes, tieneRespuesta, validarRespuestas, type PreguntaAlta } from './preguntas-alta.ts';

const p = (id: string, tipo: PreguntaAlta['tipo'], requerido = false, opciones: string[] = []): PreguntaAlta =>
  ({ id, etiqueta: id, tipo, opciones, requerido });

const OBJETIVO = p('objetivo', 'seleccion', true, ['Fuerza', 'Flexibilidad']);
const COMO = p('como', 'texto');
const NACIO = p('nacio', 'fecha');
const VINO = p('vino', 'booleano', true);
const EDAD = p('edad', 'numero');

test('pendiente: la que nunca se le hizo, y la obligatoria vacía; la opcional en blanco ya no insiste', () => {
  const todas = [OBJETIVO, COMO, VINO];
  assert.deepEqual(preguntasPendientes(todas, null).map(x => x.id), ['objetivo', 'como', 'vino']);
  // Ya contestó: nada pendiente. «No» es una respuesta y la opcional en null también cuenta.
  assert.deepEqual(preguntasPendientes(todas, { objetivo: 'Fuerza', como: null, vino: false }), []);
  // Obligatoria vacía (p. ej. rellenada a medias desde el mostrador): se le vuelve a pedir.
  assert.deepEqual(preguntasPendientes(todas, { objetivo: '', como: null, vino: true }).map(x => x.id), ['objetivo']);
  // Una pregunta añadida después le sale sola, sin repetirle las demás.
  assert.deepEqual(preguntasPendientes([...todas, EDAD], { objetivo: 'Fuerza', como: null, vino: true }).map(x => x.id), ['edad']);
});

test('tieneRespuesta: false y 0 son respuestas; vacío y espacios no', () => {
  assert.equal(tieneRespuesta(false), true);
  assert.equal(tieneRespuesta(0), true);
  for (const nada of [null, undefined, '', '   ', NaN]) assert.equal(tieneRespuesta(nada), false);
});

test('valida y normaliza cada tipo, y guarda la opcional en blanco como null', () => {
  const r = validarRespuestas([OBJETIVO, COMO, NACIO, VINO, EDAD], {
    objetivo: 'Fuerza', como: '  Por Instagram ', nacio: '', vino: false, edad: '42,5',
  });
  assert.deepEqual(r, { ok: true, valores: { objetivo: 'Fuerza', como: 'Por Instagram', nacio: null, vino: false, edad: 42.5 } });
});

test('rechaza lo que no encaja, pregunta a pregunta', () => {
  const r = validarRespuestas([OBJETIVO, NACIO, VINO, EDAD, COMO], {
    objetivo: 'Otra cosa', nacio: '2026-02-30', vino: 'sí', edad: 'muchos', como: 'x'.repeat(MAX_TEXTO + 1),
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(Object.keys(r.errores).sort(), ['como', 'edad', 'nacio', 'objetivo', 'vino']);
});

test('una obligatoria sin contestar no se guarda', () => {
  const r = validarRespuestas([OBJETIVO, COMO], { como: 'hola' });
  assert.deepEqual(r, { ok: false, errores: { objetivo: 'Esta pregunta es obligatoria.' } });
});

test('solo se guardan las preguntas del estudio: lo demás del cuerpo se ignora', () => {
  const r = validarRespuestas([COMO], { como: 'hola', inventada: 'x', __proto__: 'y' });
  assert.deepEqual(r, { ok: true, valores: { como: 'hola' } });
});
