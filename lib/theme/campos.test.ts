import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_PROXIMA_CLASE } from '../portal-home-bloques.ts';
import {
  cumpleCondicion,
  defaultsDe,
  resolverConfig,
  camposVisibles,
  validarCampo,
  type CampoSchema, agruparCampos } from './campos.ts';

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

// ─────────────────────────────────────────────────────────────────────────────
// `numeroHeredado` — el hermano de `colorHeredado` para los ejes donde
// "ausente" no es cero ni ningún número concreto. Nació de un caso real:
// `--portal-radius-card` cae a TRES valores distintos según quién la lee (20
// en portal-tokens, 24 en portal-design, 26 escrito a mano en bonos), así que
// no existe "el valor por defecto" que un campo `numero` tendría que pintar.
// ─────────────────────────────────────────────────────────────────────────────

const RADIO: CampoSchema = {
  tipo: 'numeroHeredado', id: 'radioCard', etiqueta: 'Esquina de las tarjetas',
  porDefecto: null, min: 0, max: 40,
};

test('numeroHeredado: su porDefecto es null — "hereda", no un número', () => {
  assert.equal((RADIO as { porDefecto: unknown }).porDefecto, null);
});

test('validarCampo: numeroHeredado admite null (hereda) y respeta min/max', () => {
  assert.equal(validarCampo(RADIO, null), null);
  assert.equal(validarCampo(RADIO, 24), null);
  assert.equal(validarCampo(RADIO, 0), null);
  assert.ok(validarCampo(RADIO, -1));
  assert.ok(validarCampo(RADIO, 41));
});

test('validarCampo: numeroHeredado rechaza lo que no es número ni null', () => {
  assert.ok(validarCampo(RADIO, '24'));
  assert.ok(validarCampo(RADIO, 'del tema'));
});

test('resolverConfig NO inventa un número donde había herencia', () => {
  // La trampa que motiva este tipo: si `resolverConfig` rellenara con un
  // número, guardar fijaría un valor y mataría la herencia sin que nadie lo
  // pidiera. `porDefecto: null` garantiza que lo que se rellena es "hereda".
  const r = resolverConfig([RADIO], {}) as Record<string, unknown>;
  assert.equal(r.radioCard, null);
  // Y un valor guardado de verdad no se pisa, ni siquiera el 0.
  assert.equal((resolverConfig([RADIO], { radioCard: 0 }) as Record<string, unknown>).radioCard, 0);
});

// ── agruparCampos ───────────────────────────────────────────────────────────
test('agruparCampos: sin `grupo`, todo sale suelto y en orden (el panel de siempre)', () => {
  const campos = [
    { tipo: 'texto', id: 'a', etiqueta: 'A', porDefecto: '' },
    { tipo: 'texto', id: 'b', etiqueta: 'B', porDefecto: '' },
  ] as const satisfies readonly CampoSchema[];
  const r = agruparCampos(campos, {});
  assert.deepEqual(r.sueltos.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(r.grupos, []);
});

test('agruparCampos: los sueltos van primero aunque estén DESPUÉS en el schema', () => {
  const campos = [
    { tipo: 'texto', id: 'enGrupo', etiqueta: 'X', grupo: 'Uno', porDefecto: '' },
    { tipo: 'texto', id: 'suelto', etiqueta: 'Y', porDefecto: '' },
  ] as const satisfies readonly CampoSchema[];
  const r = agruparCampos(campos, {});
  assert.deepEqual(r.sueltos.map((c) => c.id), ['suelto']);
  assert.deepEqual(r.grupos.map((g) => g.titulo), ['Uno']);
});

test('agruparCampos: campos del mismo grupo se juntan aunque estén salteados, y el orden del grupo es el de su PRIMER campo', () => {
  const campos = [
    { tipo: 'texto', id: 'a1', etiqueta: 'A1', grupo: 'A', porDefecto: '' },
    { tipo: 'texto', id: 'b1', etiqueta: 'B1', grupo: 'B', porDefecto: '' },
    { tipo: 'texto', id: 'a2', etiqueta: 'A2', grupo: 'A', porDefecto: '' },
  ] as const satisfies readonly CampoSchema[];
  const r = agruparCampos(campos, {});
  assert.deepEqual(r.grupos.map((g) => g.titulo), ['A', 'B']);
  assert.deepEqual(r.grupos[0].campos.map((c) => c.id), ['a1', 'a2']);
});

test('agruparCampos: respeta `visibleSi` y `obsoleto` — un grupo que se queda sin campos NO aparece', () => {
  // Si no, la propietaria vería una sección vacía que no puede abrir a nada.
  const campos = [
    { tipo: 'booleano', id: 'avanzado', etiqueta: 'Avanzado', porDefecto: false },
    { tipo: 'texto', id: 'x', etiqueta: 'X', grupo: 'Solo si avanzado', porDefecto: '',
      visibleSi: { campo: 'avanzado', igual: true } },
    { tipo: 'texto', id: 'viejo', etiqueta: 'Viejo', grupo: 'Retirado', porDefecto: '', obsoleto: true },
  ] as const satisfies readonly CampoSchema[];

  const cerrado = agruparCampos(campos, { avanzado: false });
  assert.deepEqual(cerrado.grupos, []);

  const abierto = agruparCampos(campos, { avanzado: true });
  assert.deepEqual(abierto.grupos.map((g) => g.titulo), ['Solo si avanzado']);
});

test('agruparCampos: el bloque de la próxima clase queda en 6 secciones y ninguna suelta', () => {
  // Es el caso que motivó esto: 16 campos en lista plana. Si alguna sección
  // creciera sola o un campo se quedara sin `grupo`, vuelve el muro.
  // (Escribí "seis" de memoria al documentarlo; eran cinco. Este test lo fijó.
  // Con la foto propia de la tarjeta pasan a ser seis — y el test volvió a
  // hacer su trabajo: el campo nuevo entró sin `grupo` y se quedó suelto.)
  const r = agruparCampos(CAMPOS_PROXIMA_CLASE, {});
  assert.deepEqual(r.sueltos, []);
  assert.equal(r.grupos.length, 6);
  // La foto va PRIMERA: los grupos salen en el orden de su primer campo, y el
  // primero es el que el Inspector abre. Es lo que se viene a tocar.
  assert.equal(r.grupos[0].titulo, 'Foto');
  for (const g of r.grupos) assert.ok(g.campos.length <= 4, `"${g.titulo}" tiene ${g.campos.length} campos`);
});
