import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearTextoRico, tieneMarcas, alternarMarca, insertarEnlace } from './texto-rico.ts';

// El guardia real es `resolverHrefBloque`; aquí se inyecta uno equivalente
// para que este módulo siga sin depender del catálogo de bloques.
const href = (v: string): string | null => {
  const t = v.trim();
  if (t.startsWith('/')) return t;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? t : null;
  } catch { return null; }
};

test('un texto sin marcas es un solo nodo — lo guardado antes no cambia', () => {
  // Lo que hace que no haga falta migración: todo lo que ya hay escrito en
  // producción es texto plano y se sigue pintando igual.
  assert.deepEqual(parsearTextoRico('Hola a todas', href), [
    { tipo: 'texto', texto: 'Hola a todas' },
  ]);
  assert.deepEqual(parsearTextoRico('', href), []);
});

test('negrita, cursiva y enlace', () => {
  assert.deepEqual(parsearTextoRico('Ven a **Pilates**', href), [
    { tipo: 'texto', texto: 'Ven a ' },
    { tipo: 'negrita', texto: 'Pilates' },
  ]);
  assert.deepEqual(parsearTextoRico('Es *suave*', href), [
    { tipo: 'texto', texto: 'Es ' },
    { tipo: 'cursiva', texto: 'suave' },
  ]);
  assert.deepEqual(parsearTextoRico('Mira [las clases](/clases) ya', href), [
    { tipo: 'texto', texto: 'Mira ' },
    { tipo: 'enlace', texto: 'las clases', href: '/clases' },
    { tipo: 'texto', texto: ' ya' },
  ]);
});

test('`**` gana a `*` — si no, la negrita se leería como cursiva con restos', () => {
  // Con el orden al revés, «**hola**» casaría el patrón de una estrella sobre
  // «*hola*» y dejaría un asterisco suelto a cada lado. El orden de la
  // alternancia ES la precedencia.
  assert.deepEqual(parsearTextoRico('**hola**', href), [{ tipo: 'negrita', texto: 'hola' }]);
});

test('⚠️ nada de lo que se escriba puede convertirse en HTML', () => {
  // El motivo por el que esto no guarda HTML. El parser devuelve TEXTO, y el
  // render construye elementos de React: no hay ningún `innerHTML` donde un
  // `<script>` pueda interpretarse.
  const veneno = '<script>alert(1)</script> y <img onerror=x>';
  assert.deepEqual(parsearTextoRico(veneno, href), [{ tipo: 'texto', texto: veneno }]);
});

test('⚠️ un enlace con protocolo peligroso NO se enlaza, pero su texto se conserva', () => {
  // Ni enlace muerto ni contenido desaparecido: si la URL no pasa el guardia,
  // se queda lo que escribió la propietaria. Perder su texto porque el
  // destino estaba mal sería peor que no enlazarlo.
  assert.deepEqual(parsearTextoRico('[pincha](javascript:void)', href), [
    { tipo: 'texto', texto: 'pincha' },
  ]);
  assert.deepEqual(parsearTextoRico('[ojo](data:text/html,<script>)', href), [
    { tipo: 'texto', texto: 'ojo' },
  ]);
});

test('límite conocido: el destino no puede llevar paréntesis', () => {
  // `[x](a(b))` corta el destino en el primer `)` y deja el segundo suelto
  // como texto. Es la limitación clásica de esta sintaxis y no se arregla:
  // los destinos reales aquí son `/clases` o `https://…`, y un parser que
  // equilibre paréntesis es mucho más máquina de la que este campo necesita.
  //
  // Importa que quede escrito porque la primera versión del test daba por
  // hecho lo contrario y falló — no el código, la expectativa.
  assert.deepEqual(parsearTextoRico('[pincha](javascript:alert(1))', href), [
    { tipo: 'texto', texto: 'pincha' },
    { tipo: 'texto', texto: ')' },
  ]);
});

test('parsear dos veces seguidas da lo mismo — el regex global no arrastra estado', () => {
  // `exec` en bucle sobre un regex `g` de módulo arrastra `lastIndex` entre
  // llamadas: el segundo parseo empezaría por donde acabó el primero. Por eso
  // se usa `matchAll`. Este test es el que lo sostiene.
  const uno = parsearTextoRico('**a** y **b**', href);
  const dos = parsearTextoRico('**a** y **b**', href);
  assert.deepEqual(uno, dos);
  assert.equal(uno.length, 3);
});

test('tieneMarcas tampoco arrastra estado entre llamadas', () => {
  assert.equal(tieneMarcas('**a**'), true);
  assert.equal(tieneMarcas('**a**'), true);
  assert.equal(tieneMarcas('sin marcas'), false);
});

test('alternarMarca envuelve y desenvuelve, y devuelve dónde queda la selección', () => {
  // Sin devolver la selección, el cursor salta al final tras cada clic y se
  // pierde el sitio a la segunda palabra que se marca.
  const a = alternarMarca('hola mundo', 5, 10, '**');
  assert.equal(a.texto, 'hola **mundo**');
  assert.deepEqual([a.desde, a.hasta], [5, 14]);

  const b = alternarMarca(a.texto, a.desde, a.hasta, '**');
  assert.equal(b.texto, 'hola mundo');
  assert.deepEqual([b.desde, b.hasta], [5, 10]);
});

test('alternarMarca sin selección no toca nada', () => {
  const r = alternarMarca('hola', 2, 2, '**');
  assert.equal(r.texto, 'hola');
});

test('insertarEnlace deja seleccionado el DESTINO, que es lo que hay que cambiar', () => {
  const r = insertarEnlace('Mira aquí', 5, 9);
  assert.equal(r.texto, 'Mira [aquí](/clases)');
  assert.equal(r.texto.slice(r.desde, r.hasta), '/clases');
});

test('insertarEnlace sin selección pone un texto de relleno', () => {
  const r = insertarEnlace('', 0, 0);
  assert.equal(r.texto, '[texto del enlace](/clases)');
});
