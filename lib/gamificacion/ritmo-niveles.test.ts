import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RITMOS, bajadasPorNivel, clasesDeUmbral, creditosPorClase, escalaDeRitmo, quienBajaria, repartoPorNivel, ritmoDe,
  umbralAlEditarClases, umbralDeClases, validarNiveles, type NivelComparable,
} from './ritmo-niveles.ts';

const regla = (trigger: string, creditos: number, activa = true) => ({ trigger, creditos, activa });

test('créditos por clase: lo de asistir más la racha semanal repartida entre 2 clases', () => {
  assert.equal(creditosPorClase([regla('ASISTENCIA_CLASE', 10), regla('SEMANA_COMPLETA', 30)]), 25);
  assert.equal(creditosPorClase([regla('ASISTENCIA_CLASE', 10)]), 10);
  assert.equal(creditosPorClase([regla('SEMANA_COMPLETA', 30)]), 15);
  assert.equal(creditosPorClase([regla('ASISTENCIA_CLASE', 10, false), regla('COMPRA', 1)]), null, 'sin créditos por venir a clase, no hay equivalencia');
  assert.equal(creditosPorClase([regla('ASISTENCIA_CLASE', 10), regla('ASISTENCIA_CLASE', 50)]), 10, 'vale la primera activa, como la RPC');
});

test('umbrales y equivalencias, redondeados a 10', () => {
  assert.equal(umbralDeClases(0, 25), 0);
  assert.equal(umbralDeClases(10, 25), 250);
  assert.equal(umbralDeClases(1, 3), 10, 'nunca un umbral de 0 para algo que pide clases');
  assert.equal(clasesDeUmbral(250, 25), 10);
  assert.equal(clasesDeUmbral(0, 25), 0);
  assert.deepEqual(escalaDeRitmo('equilibrado', 25), [0, 500, 1250, 2500, 5000]);
});

test('el ritmo se deduce de los umbrales; si no coincide, «a medida»', () => {
  for (const r of Object.keys(RITMOS) as (keyof typeof RITMOS)[]) assert.equal(ritmoDe(escalaDeRitmo(r, 25), 25), r);
  assert.equal(ritmoDe([0, 500, 1250, 2500, 5010], 25), 'a_medida');
  assert.equal(ritmoDe(escalaDeRitmo('relajado', 25), null), 'a_medida');
});

const n = (id: string, umbral: number, activo = true): NivelComparable => ({ id, umbralCreditos: umbral, activo });
const ANTES = [n('a', 0), n('b', 200), n('c', 500)];

test('nadie baja: subir un umbral por encima de quien ya lo tenía, se detecta', () => {
  // Una alumna con 300 está en «b». Si «b» pasa a 400, bajaría a «a».
  assert.equal(quienBajaria([300], ANTES, [n('a', 0), n('b', 400), n('c', 500)]), 1);
  // Con 450 no: sigue en «b».
  assert.equal(quienBajaria([450], ANTES, [n('a', 0), n('b', 400), n('c', 500)]), 0);
});

test('nadie baja: quitar o desactivar el nivel en el que está alguien, se detecta', () => {
  assert.equal(quienBajaria([300], ANTES, [n('a', 0), n('c', 500)]), 1, 'borrado');
  assert.equal(quienBajaria([300], ANTES, [n('a', 0), n('b', 200, false), n('c', 500)]), 1, 'desactivado');
  assert.equal(quienBajaria([600], ANTES, [n('a', 0), n('c', 500)]), 0, 'quien está en otro nivel no se entera');
});

test('no es bajar: renombrar, bajar umbrales, añadir un nivel intermedio o subir (relajar el ritmo)', () => {
  assert.equal(quienBajaria([300, 600], ANTES, [n('a', 0), n('b', 100), n('c', 400)]), 0);
  assert.equal(quienBajaria([300], ANTES, [n('a', 0), n('x', 100), n('b', 200), n('c', 500)]), 0, 'intermedio por debajo');
  assert.equal(quienBajaria([300], ANTES, [n('a', 0), n('b', 200), n('x', 250), n('c', 500)]), 0, 'intermedio por encima: sube, no baja');
});

test('una alumna con 0 ganado no tiene nada concedido: quitar el primer nivel no cuenta', () => {
  assert.equal(quienBajaria([0, 0], ANTES, [n('b', 200), n('c', 500)]), 0);
  assert.equal(quienBajaria([0, 50], ANTES, [n('b', 200), n('c', 500)]), 1, 'con 50 ganados sí estaba en «a»');
});

test('reparto: cuántas quedan en cada nivel y cuántas en ninguno', () => {
  const r = repartoPorNivel([0, 50, 250, 700, 900], [n('b', 200), n('c', 500), n('d', 800, false)]);
  assert.equal(r.porNivel.get('b'), 1);
  assert.equal(r.porNivel.get('c'), 2, 'el inactivo no cuenta: 700 y 900 se quedan en «c»');
  assert.equal(r.sinNivel, 2);
});

test('validar lo que llega: nombres, umbrales enteros, sin dos activos en el mismo punto', () => {
  assert.equal(validarNiveles('x').ok, false);
  assert.equal(validarNiveles([{ nombre: '', umbralCreditos: 0 }]).ok, false);
  assert.equal(validarNiveles([{ nombre: 'A', umbralCreditos: -1 }]).ok, false);
  assert.equal(validarNiveles([{ nombre: 'A', umbralCreditos: 1.5 }]).ok, false);
  assert.equal(validarNiveles([{ nombre: 'A', umbralCreditos: 0 }, { nombre: 'B', umbralCreditos: 0 }]).ok, false);
  const ok = validarNiveles([{ id: 'lvl-1', nombre: ' Centro ', umbralCreditos: 0, color: 'rojo', icono: '' }, { nombre: 'B', umbralCreditos: 0, activo: false }]);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.niveles[0].nombre, 'Centro');
    assert.equal(ok.niveles[0].color, '#8B7355', 'un color raro cae al de serie');
    assert.equal(ok.niveles[1].id, undefined);
  }
  assert.equal(validarNiveles([{ id: "x' or 1=1", nombre: 'A', umbralCreditos: 0 }]).ok && (validarNiveles([{ id: "x' or 1=1", nombre: 'A', umbralCreditos: 0 }]) as { niveles: { id?: string }[] }).niveles[0].id, undefined);
});

test('un id repetido o unos beneficios de más de 200 caracteres no pasan (sin cortar un emoji por la mitad)', () => {
  assert.equal(validarNiveles([{ id: 'lvl-1', nombre: 'A', umbralCreditos: 0 }, { id: 'lvl-1', nombre: 'B', umbralCreditos: 10 }]).ok, false);
  assert.equal(validarNiveles([{ nombre: 'A', umbralCreditos: 0, beneficios: '🎁'.repeat(201) }]).ok, false);
  const ok = validarNiveles([{ nombre: 'A', umbralCreditos: 0, beneficios: '🎁'.repeat(200) }]);
  assert.equal(ok.ok, true);
});

test('editar a mano en clases: ida y vuelta sin mover el umbral, y sin redondear a 10', () => {
  // Con 30 por clase, 200 se enseña como «7»: reescribir «7» no puede dejarlo en 210.
  assert.equal(clasesDeUmbral(200, 30), 7);
  assert.equal(umbralAlEditarClases(7, 200, 30), 200);
  assert.equal(umbralAlEditarClases(8, 200, 30), 240);
  // Con 5 por clase, cada clase cuenta (13 → 65, no 70 ni 60).
  assert.equal(umbralAlEditarClases(13, 0, 5), 65);
  assert.equal(umbralAlEditarClases(0, 200, 30), 0);
});

test('empates: como la app y el panel, por orden (y luego id)', () => {
  // Dos niveles a 200: la alumna con 250 ve el de orden mayor (el último que alcanza).
  const antes = [{ id: 'z', umbralCreditos: 200, activo: true, orden: 0 }, { id: 'a', umbralCreditos: 200, activo: true, orden: 1 }];
  // Subir «a» a 300: ella baja a «z».
  assert.equal(quienBajaria([250], antes, [{ id: 'z', umbralCreditos: 200, activo: true, orden: 0 }, { id: 'a', umbralCreditos: 300, activo: true, orden: 1 }]), 1);
});

test('qué nivel provoca cada bajada (para decirlo en pantalla)', () => {
  const m = bajadasPorNivel([300, 320, 700], ANTES, [n('a', 0), n('b', 400), n('c', 800)]);
  assert.equal(m.get('b'), 2);
  assert.equal(m.get('c'), 1);
});

test('dos niveles activos con el mismo nombre no pasan; un nombre larguísimo dice cuál es', () => {
  assert.equal(validarNiveles([{ nombre: 'Centro', umbralCreditos: 0 }, { nombre: 'centro', umbralCreditos: 10 }]).ok, false);
  assert.equal(validarNiveles([{ nombre: 'Centro', umbralCreditos: 0 }, { nombre: 'Centro', umbralCreditos: 10, activo: false }]).ok, true, 'uno inactivo puede repetir');
  const largo = validarNiveles([{ nombre: 'x'.repeat(61), umbralCreditos: 0 }]);
  assert.equal(largo.ok, false);
  if (!largo.ok) assert.match(largo.error, /^«x{20}…»/);
  const enorme = validarNiveles([{ nombre: 'A', umbralCreditos: 2_000_000 }]);
  if (!enorme.ok) assert.match(enorme.error, /como mucho 1\.000\.000/);
});

