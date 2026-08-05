import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cumpleCondicion,
  defaultsDe,
  resolverConfig,
  camposVisibles,
  validarCampo,
  type CampoSchema,
} from './campos.ts';

// Schema de juguete con un campo de cada familia — sirve de banco de pruebas
// sin atarse a ningún bloque real.
const CAMPOS: readonly CampoSchema[] = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: '' },
  { tipo: 'url', id: 'href', etiqueta: 'Enlace', porDefecto: '' },
  { tipo: 'colorHeredado', id: 'fondo', etiqueta: 'Fondo', porDefecto: null },
  { tipo: 'booleano', id: 'activo', etiqueta: 'Activo', porDefecto: false },
  { tipo: 'numero', id: 'columnas', etiqueta: 'Columnas', porDefecto: 2, min: 1, max: 4 },
  { tipo: 'opciones', id: 'alineacion', etiqueta: 'Alineación', porDefecto: 'izquierda',
    opciones: [{ id: 'izquierda', label: 'Izquierda' }, { id: 'centro', label: 'Centro' }] },
  { tipo: 'lista', id: 'preguntas', etiqueta: 'Preguntas', etiquetaElemento: 'pregunta', porDefecto: [],
    campos: [{ tipo: 'texto', id: 'pregunta', etiqueta: 'Pregunta', porDefecto: '' }] },
];

// ── cumpleCondicion ─────────────────────────────────────────────────────────

test('cumpleCondicion: sin condición no hay nada que exigir', () => {
  assert.equal(cumpleCondicion(undefined, {}), true);
});

test('cumpleCondicion: igual / distinto', () => {
  assert.equal(cumpleCondicion({ campo: 'a', igual: 'x' }, { a: 'x' }), true);
  assert.equal(cumpleCondicion({ campo: 'a', igual: 'x' }, { a: 'y' }), false);
  assert.equal(cumpleCondicion({ campo: 'a', distinto: 'x' }, { a: 'y' }), true);
  assert.equal(cumpleCondicion({ campo: 'a', distinto: 'x' }, { a: 'x' }), false);
  // Falsy comparado de verdad, no por coerción.
  assert.equal(cumpleCondicion({ campo: 'a', igual: false }, { a: false }), true);
  assert.equal(cumpleCondicion({ campo: 'a', igual: 0 }, { a: '' as unknown }), false);
});

test('cumpleCondicion: noVacio distingue string en blanco, array vacío y ausente', () => {
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, { a: 'hola' }), true);
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, { a: '' }), false);
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, { a: '   ' }), false);
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, { a: [] }), false);
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, { a: [1] }), true);
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, {}), false);
});

test('cumpleCondicion: minimo solo cuenta arrays', () => {
  assert.equal(cumpleCondicion({ campo: 'a', minimo: 1 }, { a: [1] }), true);
  assert.equal(cumpleCondicion({ campo: 'a', minimo: 2 }, { a: [1] }), false);
  // Un string de 5 letras NO cumple "mínimo 2 elementos".
  assert.equal(cumpleCondicion({ campo: 'a', minimo: 2 }, { a: 'hola!' }), false);
});

test('cumpleCondicion: validador href acepta ruta interna y https, rechaza javascript:', () => {
  const c = { campo: 'a', valido: 'href' } as const;
  assert.equal(cumpleCondicion(c, { a: '/reservar' }), true);
  assert.equal(cumpleCondicion(c, { a: 'https://tentare.app' }), true);
  assert.equal(cumpleCondicion(c, { a: 'http://tentare.app' }), true);
  // Los dos esquemas que el render ya rechaza (resolverHrefBloque).
  assert.equal(cumpleCondicion(c, { a: 'javascript:alert(1)' }), false);
  assert.equal(cumpleCondicion(c, { a: 'data:text/html,x' }), false);
  assert.equal(cumpleCondicion(c, { a: '' }), false);
  assert.equal(cumpleCondicion(c, { a: 'no es una url' }), false);
});

test('cumpleCondicion: validador videoEmbed solo YouTube/Vimeo', () => {
  const c = { campo: 'a', valido: 'videoEmbed' } as const;
  assert.equal(cumpleCondicion(c, { a: 'https://www.youtube.com/watch?v=x' }), true);
  assert.equal(cumpleCondicion(c, { a: 'https://youtu.be/x' }), true);
  assert.equal(cumpleCondicion(c, { a: 'https://vimeo.com/123' }), true);
  assert.equal(cumpleCondicion(c, { a: 'https://evil.example/x' }), false);
});

test('cumpleCondicion: todas / alguna, incluso anidadas', () => {
  const valores = { a: 'x', b: '' };
  assert.equal(cumpleCondicion({ todas: [{ campo: 'a', noVacio: true }, { campo: 'b', noVacio: true }] }, valores), false);
  assert.equal(cumpleCondicion({ alguna: [{ campo: 'a', noVacio: true }, { campo: 'b', noVacio: true }] }, valores), true);
  assert.equal(cumpleCondicion({
    todas: [{ campo: 'a', igual: 'x' }, { alguna: [{ campo: 'b', noVacio: true }, { campo: 'a', igual: 'x' }] }],
  }, valores), true);
  // Listas vacías: `todas` se cumple por vacuidad, `alguna` no.
  assert.equal(cumpleCondicion({ todas: [] }, valores), true);
  assert.equal(cumpleCondicion({ alguna: [] }, valores), false);
});

test('cumpleCondicion: nunca lanza con valores basura', () => {
  assert.equal(cumpleCondicion({ campo: 'a', noVacio: true }, null as unknown as Record<string, unknown>), false);
  assert.equal(cumpleCondicion({ campo: 'a', valido: 'href' }, { a: 42 }), false);
});

// ── defaultsDe ──────────────────────────────────────────────────────────────

test('defaultsDe: una clave por campo, con su porDefecto', () => {
  assert.deepEqual(defaultsDe(CAMPOS), {
    titulo: '', href: '', fondo: null, activo: false, columnas: 2,
    alineacion: 'izquierda', preguntas: [],
  });
});

// El bug de la referencia compartida ya mordió en este repo con `instalar()`
// y `variantes`/`radioTema`: el spread es superficial.
test('defaultsDe: CLONA — dos bloques no comparten el array de su repetidor', () => {
  const a = defaultsDe(CAMPOS);
  const b = defaultsDe(CAMPOS);
  assert.notEqual(a.preguntas, b.preguntas, 'los arrays no pueden ser la misma referencia');
  (a.preguntas as unknown[]).push({ pregunta: 'x' });
  assert.deepEqual(b.preguntas, [], 'tocar uno no puede afectar al otro');
  // Y tampoco al literal del propio schema.
  assert.deepEqual(defaultsDe(CAMPOS).preguntas, []);
});

// ── resolverConfig ──────────────────────────────────────────────────────────

test('resolverConfig: rellena solo lo AUSENTE', () => {
  const r = resolverConfig(CAMPOS, { titulo: 'Hola' });
  assert.equal(r.titulo, 'Hola');
  assert.equal(r.columnas, 2);
  assert.deepEqual(r.preguntas, []);
});

// El bug clásico de esta clase de motor: tratar '' / false / 0 como "vacío"
// y pisarlos con el default. Borraría un texto que la propietaria vació
// a propósito.
test('resolverConfig: NUNCA pisa un valor guardado, ni falsy', () => {
  const r = resolverConfig(CAMPOS, { titulo: '', activo: false, columnas: 0, fondo: null, preguntas: [] });
  assert.equal(r.titulo, '');
  assert.equal(r.activo, false);
  assert.equal(r.columnas, 0);
  assert.equal(r.fondo, null);
  assert.deepEqual(r.preguntas, []);
});

test('resolverConfig: conserva claves desconocidas (un despliegue más nuevo pudo escribirlas)', () => {
  const r = resolverConfig(CAMPOS, { titulo: 'x', campoDelFuturo: 'no perder' });
  assert.equal(r.campoDelFuturo, 'no perder');
});

test('resolverConfig: entrada basura → todos los defaults, sin lanzar', () => {
  const esperado = defaultsDe(CAMPOS);
  assert.deepEqual(resolverConfig(CAMPOS, undefined), esperado);
  assert.deepEqual(resolverConfig(CAMPOS, null), esperado);
  assert.deepEqual(resolverConfig(CAMPOS, 'texto suelto'), esperado);
  // Un array NO es un objeto de config válido.
  assert.deepEqual(resolverConfig(CAMPOS, [1, 2]), esperado);
});

test('resolverConfig: no muta la entrada ni comparte referencias con ella', () => {
  const entrada = { titulo: 'x' };
  const r = resolverConfig(CAMPOS, entrada);
  assert.deepEqual(entrada, { titulo: 'x' }, 'la entrada no se toca');
  (r.preguntas as unknown[]).push({ pregunta: 'y' });
  assert.deepEqual(resolverConfig(CAMPOS, entrada).preguntas, []);
});

// ── camposVisibles ──────────────────────────────────────────────────────────

test('camposVisibles: sin condiciones, todos y en orden', () => {
  assert.deepEqual(camposVisibles(CAMPOS, {}).map((c) => c.id),
    ['titulo', 'href', 'fondo', 'activo', 'columnas', 'alineacion', 'preguntas']);
});

test('camposVisibles: visibleSi filtra, y el valor oculto NO se pierde', () => {
  const campos: readonly CampoSchema[] = [
    { tipo: 'booleano', id: 'conBoton', etiqueta: 'Con botón', porDefecto: false },
    { tipo: 'texto', id: 'textoBoton', etiqueta: 'Texto', porDefecto: '',
      visibleSi: { campo: 'conBoton', igual: true } },
  ];
  const valores = { conBoton: false, textoBoton: 'Reservar' };
  assert.deepEqual(camposVisibles(campos, valores).map((c) => c.id), ['conBoton']);
  // El motor no toca los valores: ocultar es de presentación.
  assert.equal(valores.textoBoton, 'Reservar');
  assert.deepEqual(camposVisibles(campos, { conBoton: true }).map((c) => c.id), ['conBoton', 'textoBoton']);
});

test('camposVisibles: `obsoleto` desaparece del panel pero el dato sigue resolviéndose', () => {
  const campos: readonly CampoSchema[] = [
    { tipo: 'texto', id: 'vigente', etiqueta: 'Vigente', porDefecto: '' },
    { tipo: 'texto', id: 'viejo', etiqueta: 'Viejo', porDefecto: '', obsoleto: true },
  ];
  assert.deepEqual(camposVisibles(campos, {}).map((c) => c.id), ['vigente']);
  assert.equal(resolverConfig(campos, { viejo: 'contenido de antes' }).viejo, 'contenido de antes');
});

// ── validarCampo ────────────────────────────────────────────────────────────

test('validarCampo: es advisory — el campo vacío nunca es un error', () => {
  const url = CAMPOS[1];
  assert.equal(validarCampo(url, ''), null, 'un enlace vacío es legítimo mientras se escribe');
  assert.equal(validarCampo(url, '/reservar'), null);
  assert.ok(validarCampo(url, 'javascript:alert(1)'));
});

test('validarCampo: límites de número y de largo', () => {
  const num = CAMPOS[4];
  assert.equal(validarCampo(num, 2), null);
  assert.ok(validarCampo(num, 0));
  assert.ok(validarCampo(num, 9));
  const conTope: CampoSchema = { tipo: 'texto', id: 't', etiqueta: 'T', porDefecto: '', maxLargo: 3 };
  assert.equal(validarCampo(conTope, 'abc'), null);
  assert.ok(validarCampo(conTope, 'abcd'));
});

test('validarCampo: colorHeredado admite null (hereda) y rechaza un hex inválido', () => {
  const c = CAMPOS[2];
  assert.equal(validarCampo(c, null), null);
  assert.equal(validarCampo(c, '#AABBCC'), null);
  assert.ok(validarCampo(c, 'azul'));
  assert.ok(validarCampo(c, '#ABC'));
});
