import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALTO_FOTO_FICHA, BOTON_SOBRE_FOTO, FUNDIDO_TEXTO_FICHA, PARADAS_VELO_FICHA,
  cuandoCorto, disponibilidadFicha, filasFicha, fundidoTextoFichaCss, rolInstructora, veloFichaCss,
} from './ficha-clase.ts';
import {
  BORDE_CRISTAL_SOBRE_FOTO, CRISTAL_SOBRE_FOTO, TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO, TINTA_SUAVE_SOBRE_FOTO,
  componerSobre, peorFondoBajoVelo,
} from './portada.ts';
import { ratioContraste } from '../wcag-contrast.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La ficha de una clase en /reservar (F4 del rediseño). Dos cosas se vigilan:
// que el texto que va sobre la foto se lea sea cual sea la foto —el medidor de
// contraste del navegador no ve fotos—, y que las filas de la clase digan lo
// mismo en la ficha y en «Tus datos».
//
// Las horas llevan su zona (+02:00): la cuenta se hace en la hora del estudio,
// no en la del runner.
// ─────────────────────────────────────────────────────────────────────────────

const AA = 4.5;
const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;
const alfaDe = (rgba: string) => Number(/,([\d.]+)\)$/.exec(rgba)![1]);

// ── El texto sobre la foto ──────────────────────────────────────────────────

test('el fundido que va detrás del texto nunca baja de su alfa donde empieza el texto', () => {
  const css = fundidoTextoFichaCss();
  const { entrada, alfa, alfaPie } = FUNDIDO_TEXTO_FICHA;
  assert.match(css, /^linear-gradient\(180deg, /);
  assert.ok(css.includes(`rgba(8,8,8,${alfa}) ${entrada}px`), 'falta la parada donde empieza el texto');
  assert.ok(css.includes(`rgba(8,8,8,${alfaPie}) 100%`), 'falta la parada del pie');
  // Por debajo de la entrada solo sube: el pie es igual o más oscuro.
  assert.ok(alfaPie >= alfa);
});

test('el nombre y el nivel pasan AA sobre un píxel blanco con el fundido más claro', () => {
  const fondo = peorFondoBajoVelo(FUNDIDO_TEXTO_FICHA.alfa);
  assert.ok(r(TINTA_SOBRE_FOTO, fondo) >= AA, `${r(TINTA_SOBRE_FOTO, fondo).toFixed(2)}:1 sobre ${fondo}`);
  const suave = componerSobre(TINTA_SUAVE_SOBRE_FOTO, fondo);
  assert.ok(suave);
  assert.ok(r(suave!, fondo) >= AA, `el nivel: ${r(suave!, fondo).toFixed(2)}:1`);
});

test('los chips de cristal (día, duración, sala) se leen sobre el fundido más claro', () => {
  const fondo = peorFondoBajoVelo(FUNDIDO_TEXTO_FICHA.alfa, { color: '#080808', alfa: alfaDe(CRISTAL_SOBRE_FOTO) });
  assert.ok(r(TINTA_SOBRE_FOTO, fondo) >= AA, `${r(TINTA_SOBRE_FOTO, fondo).toFixed(2)}:1`);
});

test('el borde de un chip se distingue sobre una foto oscura (3:1, WCAG 1.4.11)', () => {
  const fondo = peorFondoBajoVelo(1);
  const borde = componerSobre(BORDE_CRISTAL_SOBRE_FOTO, fondo);
  assert.ok(borde);
  assert.ok(r(borde!, fondo) >= 3, `${r(borde!, fondo).toFixed(2)}:1`);
});

test('el botón de volver se lee igual sobre una foto negra que sobre una blanca', () => {
  // Crema casi opaco con la tinta de día: el peor caso es la foto negra, que es
  // la que más oscurece el crema.
  for (const debajo of ['#000000', '#FFFFFF']) {
    const fondo = componerSobre(BOTON_SOBRE_FOTO, debajo);
    assert.ok(fondo);
    assert.ok(r(TINTA_SOBRE_CREMA, fondo!) >= AA, `sobre ${debajo}: ${r(TINTA_SOBRE_CREMA, fondo!).toFixed(2)}:1`);
  }
});

test('el velo de la foto entera está ordenado de arriba abajo y va de 0 a 100', () => {
  const posiciones = PARADAS_VELO_FICHA.map(([p]) => p);
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  assert.equal(posiciones[0], 0);
  assert.equal(posiciones[posiciones.length - 1], 100);
  const css = veloFichaCss();
  for (const [p, a] of PARADAS_VELO_FICHA) assert.ok(css.includes(`rgba(8,8,8,${a}) ${p}%`), `falta la parada ${p}%`);
});

test('la foto de la ficha es más baja en la hoja que en la página', () => {
  assert.ok(ALTO_FOTO_FICHA.hoja < ALTO_FOTO_FICHA.amplia);
  // Y por debajo de los 290 de la app: en /reservar hay una cabecera encima.
  assert.ok(ALTO_FOTO_FICHA.amplia <= 290);
});

// ── Las filas de la clase ───────────────────────────────────────────────────

const HOY = '2026-08-12';
const CLASE = { inicio: '2026-08-12T10:00:00+02:00', fin: '2026-08-12T10:50:00+02:00', hoy: HOY };

test('las cuatro filas, en el orden de la app y en la hora del estudio', () => {
  const filas = filasFicha({
    ...CLASE, salaNombre: 'Sala Reformer', direccion: 'Calle Larios 1',
    aforoMaximo: 10, libres: 6, ventanaCancelacionHoras: 12,
  });
  assert.deepEqual(filas, [
    { clave: 'Cuándo', valor: 'Hoy · 10:00 – 10:50' },
    { clave: 'Dónde', valor: 'Calle Larios 1 · Sala Reformer' },
    { clave: 'Capacidad', valor: '10 personas · 6 libres' },
    { clave: 'Cancelación', valor: 'Gratis hasta 12 h antes' },
  ]);
});

test('mañana se dice «Mañana», y otro día con su fecha corta', () => {
  assert.match(filasFicha({ ...CLASE, hoy: '2026-08-11' })[0].valor, /^Mañana · 10:00/);
  const otroDia = filasFicha({ ...CLASE, hoy: '2026-08-01' })[0].valor;
  assert.doesNotMatch(otroDia, /^(Hoy|Mañana)/);
  assert.match(otroDia, /12/);
});

test('una clase de madrugada cae en SU día del estudio, no en el del runner', () => {
  // 23:30 UTC del 11 = 01:30 del 12 en Madrid.
  const filas = filasFicha({ inicio: '2026-08-11T23:30:00Z', fin: '2026-08-12T00:20:00Z', hoy: HOY });
  assert.equal(filas[0].valor, 'Hoy · 01:30 – 02:20');
});

test('sin ventana de cancelación no se promete nada gratis', () => {
  for (const ventana of [0, null, undefined]) {
    const claves = filasFicha({ ...CLASE, ventanaCancelacionHoras: ventana }).map(f => f.clave);
    assert.ok(!claves.includes('Cancelación'), `con ${String(ventana)} no debería haber fila`);
  }
});

test('la ventana que se dice es la que llega (la del tipo de clase, si tiene la suya)', () => {
  const fila = filasFicha({ ...CLASE, ventanaCancelacionHoras: 24 }).find(f => f.clave === 'Cancelación');
  assert.equal(fila?.valor, 'Gratis hasta 24 h antes');
});

test('sin aforo la fila se llama «Plazas» y solo dice las libres', () => {
  const filas = filasFicha({ ...CLASE, libres: 1 });
  assert.deepEqual(filas.find(f => f.clave === 'Plazas'), { clave: 'Plazas', valor: '1 libre' });
  assert.ok(!filas.some(f => f.clave === 'Capacidad'));
  assert.equal(filasFicha({ ...CLASE, libres: 0 }).find(f => f.clave === 'Plazas')?.valor, 'Completa');
});

test('llena, la capacidad lo dice; y nunca libres negativas', () => {
  assert.equal(filasFicha({ ...CLASE, aforoMaximo: 8, libres: 0 }).find(f => f.clave === 'Capacidad')?.valor, '8 personas · completa');
  assert.equal(filasFicha({ ...CLASE, aforoMaximo: 8, libres: -2 }).find(f => f.clave === 'Capacidad')?.valor, '8 personas · completa');
});

test('«Dónde» con lo que haya: solo la sala, solo la calle, o nada', () => {
  assert.equal(filasFicha({ ...CLASE, salaNombre: 'Sala Mat' }).find(f => f.clave === 'Dónde')?.valor, 'Sala Mat');
  assert.equal(filasFicha({ ...CLASE, direccion: 'Calle Larios 1', salaNombre: '  ' }).find(f => f.clave === 'Dónde')?.valor, 'Calle Larios 1');
  assert.ok(!filasFicha(CLASE).some(f => f.clave === 'Dónde'));
});

test('los chips de la foto: el día y la hora de inicio', () => {
  assert.equal(cuandoCorto(CLASE.inicio, HOY), 'Hoy · 10:00');
  assert.equal(cuandoCorto(CLASE.inicio, '2026-08-11'), 'Mañana · 10:00');
});

// ── La insignia de disponibilidad ───────────────────────────────────────────

test('la insignia usa los cortes de la app', () => {
  assert.deepEqual(disponibilidadFicha(9, null), { texto: '9 plazas libres', tono: 'libre' });
  assert.deepEqual(disponibilidadFicha(2, null), { texto: 'Quedan 2', tono: 'pocas' });
  assert.deepEqual(disponibilidadFicha(1, null), { texto: 'Última plaza', tono: 'pocas' });
  assert.deepEqual(disponibilidadFicha(0, null), { texto: 'Completa', tono: 'completa' });
  assert.deepEqual(disponibilidadFicha(-1, null), { texto: 'Completa', tono: 'completa' });
});

test('lo suyo gana a las plazas: reservada o en espera, aunque esté llena', () => {
  assert.equal(disponibilidadFicha(0, 'CONFIRMADA').texto, 'Reservada');
  assert.equal(disponibilidadFicha(0, 'LISTA_ESPERA').texto, 'En espera');
  // Ni «lista de espera»: esa frase la dice el aviso de la hoja al apuntarse.
  assert.doesNotMatch(disponibilidadFicha(0, 'LISTA_ESPERA').texto, /lista de espera/i);
});

test('el rótulo de quien da la clase', () => {
  assert.equal(rolInstructora('PROPIETARIO'), 'Directora');
  assert.equal(rolInstructora('INSTRUCTOR'), 'Instructora');
  assert.equal(rolInstructora(null), 'Instructora');
});
