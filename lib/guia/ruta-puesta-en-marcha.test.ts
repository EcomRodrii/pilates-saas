import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASOS_RUTA, hrefPaso, pasoPedido, rutaPuestaEnMarcha, siguienteBase, type DatosRuta } from './ruta-puesta-en-marcha.ts';
import { calcularOnboarding, type DatosOnboarding } from '../onboarding.ts';

const nada: DatosRuta = {
  estudio: false, salas: false, instructoras: false, tipos: false, horario: false, tarifas: false,
  cobros: false, marca: false, alumnas: false, primeraReserva: false,
};
const bases = { salas: true, instructoras: true, tipos: true };

test('estudio recién creado: doce pasos, el primero es tu estudio', () => {
  const r = rutaPuestaEnMarcha(nada);
  assert.equal(r.pasos.length, 12);
  assert.equal(r.hechos, 0);
  assert.equal(r.ahora?.id, 'estudio');
  assert.equal(r.etiqueta, 'Paso 1 de 12');
  assert.deepEqual(r.faltanBases.map(p => p.id), ['salas', 'instructoras', 'tipos']);
  assert.equal(siguienteBase(r)?.id, 'salas');
});

test('REGLA DE ORO: nunca se ofrece programar clases sin sala, instructora y tipo de clase', () => {
  let r = rutaPuestaEnMarcha({ ...nada, estudio: true, salas: true });
  assert.equal(r.ahora?.id, 'instructoras');
  const horario = r.pasos.find(p => p.id === 'horario')!;
  assert.equal(horario.estado, 'bloqueado');
  assert.deepEqual(horario.faltaAntes.map(p => p.id), ['instructoras', 'tipos']);
  r = rutaPuestaEnMarcha({ ...nada, estudio: true, ...bases, saltados: ['reglas-reserva', 'reglas-cancelacion', 'tarifas', 'cobros'] });
  assert.equal(r.ahora?.id, 'horario');
});

test('el orden respeta dependencias: cada requisito va antes que quien lo pide', () => {
  const orden = PASOS_RUTA.map(p => p.id);
  for (const p of PASOS_RUTA) for (const req of p.requiere ?? []) {
    assert.ok(orden.indexOf(req) < orden.indexOf(p.id), `${p.id} pide ${req} antes`);
  }
  assert.ok(orden.indexOf('tipos') < orden.indexOf('reglas-reserva'));
  assert.ok(orden.indexOf('tarifas') < orden.indexOf('horario'));
});

test('las revisiones (reglas) nunca cuentan como hechas: no hay dato que lo diga', () => {
  const r = rutaPuestaEnMarcha({ ...nada, estudio: true, ...bases, saltados: ['reglas-reserva', 'reglas-cancelacion'] });
  assert.equal(r.pasos.find(p => p.id === 'reglas-reserva')?.estado, 'saltado');
  assert.equal(r.total, 10);
  assert.equal(r.hechos, 4);
});

test('saltar lo saltable pasa al siguiente sin darlo por hecho; lo imprescindible no se salta', () => {
  const r = rutaPuestaEnMarcha({ ...nada, saltados: ['estudio', 'salas'] });
  assert.equal(r.pasos.find(p => p.id === 'estudio')?.estado, 'saltado');
  assert.equal(r.ahora?.id, 'salas');
});

test('listo para abrir: solo lo imprescindible; pagos, cuotas y clientas no bloquean', () => {
  assert.equal(rutaPuestaEnMarcha({ ...nada, ...bases }).listoParaAbrir, false);
  const r = rutaPuestaEnMarcha({ ...nada, ...bases, horario: true });
  assert.equal(r.listoParaAbrir, true);
  assert.deepEqual(r.faltaParaAbrir, []);
  assert.equal(rutaPuestaEnMarcha({ ...nada, ...bases }).faltaParaAbrir[0].id, 'horario');
});

test('todo con dato hecho: terminada aunque las revisiones queden sin marcar', () => {
  const r = rutaPuestaEnMarcha({
    estudio: true, salas: true, instructoras: true, tipos: true, horario: true, tarifas: true,
    cobros: true, marca: true, alumnas: true, primeraReserva: true,
  });
  assert.equal(r.terminada, true);
  assert.equal(r.ahora?.id, 'reglas-reserva'); // sigue ofreciendo la revisión, sin contarla
});

test('pasoPedido: el de la dirección, y si no existe, el que toca', () => {
  const r = rutaPuestaEnMarcha({ ...nada, estudio: true });
  assert.equal(pasoPedido(r, 'marca')?.id, 'marca');
  assert.equal(pasoPedido(r, 'inventado')?.id, 'salas');
});

test('los textos caben y son honestos', () => {
  const ids = new Set<string>();
  for (const p of PASOS_RUTA) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(p.titulo.length <= 40, p.titulo);
    assert.ok(p.que.length <= 140, `«que» largo: ${p.id}`);
    assert.ok(p.porque.length <= 170, `«porque» largo: ${p.id}`);
    assert.ok(p.como.length >= 2 && p.como.length <= 3, p.id);
    if (p.boton && 'href' in p.boton) assert.ok(p.boton.href.startsWith('/'), p.id);
    assert.ok(hrefPaso(p.id).includes(p.id));
    assert.equal(!!p.siSaltas, p.saltable, p.id);
    if (p.revision) assert.ok(p.saltable, `${p.id}: una revisión se cierra saltándola`);
  }
});

test('los pasos con dato se marcan con ids que calcularOnboarding conoce', () => {
  const vacio: DatosOnboarding = {
    nif: null, stripeAccountId: null, slug: 'estudio', colorPrimario: null, temaPortal: null, logoUrl: null,
    numInstructores: 0, numInstructoresConCuenta: 0, numTiposClase: 0, numSesiones: 0, numSocios: 0, numSalas: 0,
    numPlanesTarifa: 0, numSuscripcionesActivas: 0, numReservas: 0, hayTarjetaEnLaApp: false, automatizacionesActivas: new Set(),
  };
  const ids = new Set(calcularOnboarding(vacio).categorias.flatMap(c => c.pasos.map(p => p.id)));
  for (const id of ['estudio', 'salas', 'instructor', 'clase', 'horario', 'bonos', 'stripe', 'marca']) assert.ok(ids.has(id), id);
});
