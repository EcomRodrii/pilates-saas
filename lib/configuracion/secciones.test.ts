import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MI_CUENTA, SECCIONES, cumpleCondicion, esSeccionId, esTarjetaId, seccionAnfitriona, seccionDeTarjeta,
  tarjetaPorId, tarjetasDeFuera, tarjetasPintadasEn,
  type TarjetaConfiguracion, type TarjetaId,
} from './secciones.ts';

// Los nombres y frases de Configuración son copy aprobado, y lo que se decide
// aquí lo pinta la pantalla tal cual. Estos tests no juzgan el texto: fijan lo
// que, si se rompe, deja a la propietaria sin encontrar algo o leyendo una
// frase que no dice la verdad.

const todas = SECCIONES.flatMap(s => s.tarjetas as readonly TarjetaConfiguracion[]);

test('once secciones, y ningún id repetido: ni entre secciones ni entre tarjetas de secciones distintas', () => {
  assert.equal(SECCIONES.length, 11);
  const ids = [...SECCIONES.map(s => s.id), ...todas.map(t => t.id)];
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'ids repetidos');
  for (const t of todas) assert.match(t.id, /^[a-z0-9][a-z0-9_-]*$/, `«${t.id}» no sirve como ancla de URL`);
});

test('cada sección se explica con un resumen corto y UNA frase', () => {
  for (const s of SECCIONES) {
    assert.ok(s.titulo.trim(), `${s.id}: sin título`);
    assert.ok(s.resumen.trim() && !s.resumen.endsWith('.'), `${s.id}: el resumen es una etiqueta, sin punto final`);
    assert.ok(s.resumen.length <= 60, `${s.id}: el resumen no cabe en dos líneas del móvil`);
    assert.ok(s.frase.endsWith('.'), `${s.id}: la frase termina en punto`);
    const frases = s.frase.split(/(?<=[.!?])\s+(?=[¿¡«A-ZÁÉÍÓÚÑ])/);
    assert.equal(frases.length, 1, `${s.id}: «${s.frase}» son ${frases.length} frases`);
    assert.ok(s.tarjetas.length > 0, `${s.id}: una sección sin tarjetas no lleva a nada`);
  }
});

test('cada tarjeta tiene título, una línea que dice qué hace y un modo de guardado conocido', () => {
  const modos = new Set(['barra', 'al-pulsar', 'catalogo', 'accion', 'lectura']);
  for (const t of todas) {
    assert.ok(t.titulo.trim(), `${t.id}: sin título`);
    assert.ok(t.frase.endsWith('.'), `${t.id}: la frase termina en punto`);
    assert.ok(t.frase.length <= 200, `${t.id}: «una línea» no son ${t.frase.length} caracteres`);
    assert.ok(modos.has(t.guardado), `${t.id}: modo de guardado «${t.guardado}»`);
  }
});

test('la propietaria ve todas las secciones (el resto de roles no entra en Configuración)', () => {
  for (const s of SECCIONES) assert.ok((s.roles as readonly string[]).includes('PROPIETARIO'), s.id);
});

test('el copy dice «alumna», nunca «clienta» ni «socia»', () => {
  const textos = [
    ...SECCIONES.flatMap(s => [s.titulo, s.resumen, s.frase]),
    ...todas.flatMap(t => [t.titulo, t.frase]),
    MI_CUENTA.titulo, MI_CUENTA.resumen,
  ];
  for (const texto of textos) assert.doesNotMatch(texto, /\b(client|soci)as?\b/i, texto);
});

test('una tarjeta hospedada en otra sección apunta a una sección que existe y no es la suya', () => {
  for (const s of SECCIONES) {
    for (const t of s.tarjetas as readonly TarjetaConfiguracion[]) {
      if (!t.hospedadaEn) continue;
      assert.ok(esSeccionId(t.hospedadaEn), `${t.id}: «${t.hospedadaEn}» no es una sección`);
      assert.notEqual(t.hospedadaEn, s.id, `${t.id}: hospedarse en su propia sección no significa nada`);
    }
  }
});

test('cada tarjeta se pinta en UN solo sitio, y cada sección sabe cuáles le vienen de fuera', () => {
  const pintadas = SECCIONES.flatMap(s => tarjetasPintadasEn(s.id).map(t => t.id));
  assert.deepEqual([...pintadas].sort(), todas.map(t => t.id).sort());
  for (const t of todas) {
    const id = t.id as TarjetaId;
    assert.equal(seccionAnfitriona(id), t.hospedadaEn ?? seccionDeTarjeta(id));
    assert.equal(tarjetaPorId(id), t);
    assert.ok(esTarjetaId(id));
  }
  // Desde el 15-sep solo quedan dos tarjetas hospedadas, las que viven dentro de
  // las reglas de reserva (PR C las saca de ahí).
  assert.deepEqual(todas.filter(t => t.hospedadaEn).map(t => t.id).sort(), ['ajuste-instructoras-crean-clases', 'compra-desde-tu-enlace']);
  assert.deepEqual(tarjetasDeFuera('altas').map(t => t.id), ['compra-desde-tu-enlace']);
  assert.deepEqual(tarjetasDeFuera('cobros'), []);
  assert.deepEqual(tarjetasDeFuera('datos'), []);
});

test('las tarjetas condicionales solo salen donde toca', () => {
  assert.equal(cumpleCondicion(undefined, { haySedes: false, esCadena: false }), true);
  assert.equal(cumpleCondicion('multiSede', { haySedes: false, esCadena: false }), false);
  assert.equal(cumpleCondicion('multiSede', { haySedes: true, esCadena: false }), true);
  assert.equal(cumpleCondicion('cadena', { haySedes: true, esCadena: false }), false);
  assert.equal(cumpleCondicion('cadena', { haySedes: true, esCadena: true }), true);
});

test('«Mi cuenta» lleva a su propia pantalla', () => {
  assert.equal(MI_CUENTA.href, '/mi-perfil');
});
