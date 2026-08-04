import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  situacionDe, estado, cifras, accion, filtrar, ordenar, pistaSemana, diaLibre, clases,
  semanasSinClase, SEMANAS_SIN_CLASE_AVISO, frecuenciaMensual,
  type MiembroCompleto,
} from './equipo-tarjetas.ts';

const AHORA = new Date('2026-08-03T12:00:00Z');

function m(overrides: Partial<MiembroCompleto> = {}): MiembroCompleto {
  return {
    id: 'i1', nombre: 'Julia Ramos', rol: 'INSTRUCTOR', color: '#F7A6C4',
    avatar: null, fotoUrl: null, activo: true, conAcceso: true, esYo: false,
    email: 'julia@x.es', telefono: null,
    enClaseAhora: false, claseHoyLabel: null, proximaClaseIso: null, ultimaClaseIso: null,
    clasesUltimos90Dias: null,
    semana: [1, 0, 1, 0, 1, 0, 0], horasDia: [null, null, null, null, null, null, null],
    ocupacionPct: 80, valoracion: { media: 4.8, total: 34 },
    horasMes: 20, costeMes: 400, coincideContigo: null,
    ...overrides,
  };
}

function situacion(overrides: Partial<MiembroCompleto> = {}, ahora: Date = AHORA) {
  return situacionDe(m(overrides), ahora);
}

// ── situacionDe / precedencia ───────────────────────────────────────────────

test('esYo manda sobre cualquier otra situación', () => {
  assert.equal(situacion({ esYo: true, rol: 'RECEPCION', enClaseAhora: true, ocupacionPct: 10 }), 'direccion');
});

test('recepción es "mostrador" aunque tenga ocupación baja', () => {
  assert.equal(situacion({ rol: 'RECEPCION', ocupacionPct: 10 }), 'mostrador');
});

test('dando clase ahora mismo prevalece sobre ocupación baja', () => {
  assert.equal(situacion({ enClaseAhora: true, ocupacionPct: 10 }), 'clase');
});

test('ocupación por debajo del 60% es "flojo" (atención)', () => {
  assert.equal(situacion({ ocupacionPct: 59 }), 'flojo');
});

test('60% exacto ya NO es atención', () => {
  assert.equal(situacion({ ocupacionPct: 60 }), 'libre');
});

test('sin datos de ocupación (null) no dispara atención', () => {
  assert.equal(situacion({ ocupacionPct: null }), 'libre');
});

// ── situacionDe / inactividad ───────────────────────────────────────────────

test(`sin clases desde hace ${SEMANAS_SIN_CLASE_AVISO} semanas y sin próxima programada → "inactiva"`, () => {
  const hace8semanas = new Date(AHORA.getTime() - SEMANAS_SIN_CLASE_AVISO * 7 * 86400000).toISOString();
  assert.equal(situacion({ ultimaClaseIso: hace8semanas, proximaClaseIso: null }), 'inactiva');
});

test('sin clases desde hace poco (1 semana) no dispara el aviso de inactividad', () => {
  const haceUnaSemana = new Date(AHORA.getTime() - 7 * 86400000).toISOString();
  assert.equal(situacion({ ultimaClaseIso: haceUnaSemana, proximaClaseIso: null }), 'libre');
});

test('con una próxima clase programada, no es "inactiva" aunque hayan pasado meses', () => {
  const haceMeses = new Date(AHORA.getTime() - 20 * 7 * 86400000).toISOString();
  assert.equal(situacion({ ultimaClaseIso: haceMeses, proximaClaseIso: '2026-09-01T10:00:00Z' }), 'libre');
});

test('nunca dio clase (ultimaClaseIso null) no dispara el aviso de inactividad', () => {
  assert.equal(situacion({ ultimaClaseIso: null, proximaClaseIso: null }), 'libre');
});

test('dando clase ahora mismo prevalece sobre la inactividad', () => {
  const haceMeses = new Date(AHORA.getTime() - 20 * 7 * 86400000).toISOString();
  assert.equal(situacion({ enClaseAhora: true, ultimaClaseIso: haceMeses, proximaClaseIso: null }), 'clase');
});

test('semanasSinClase: null si tiene próxima clase', () => {
  assert.equal(semanasSinClase({ ultimaClaseIso: '2026-01-01T10:00:00Z', proximaClaseIso: '2026-09-01T10:00:00Z' }, AHORA), null);
});

test('semanasSinClase: null si nunca dio clase', () => {
  assert.equal(semanasSinClase({ ultimaClaseIso: null, proximaClaseIso: null }, AHORA), null);
});

test('semanasSinClase: cuenta semanas completas desde la última clase pasada', () => {
  const hace15dias = new Date(AHORA.getTime() - 15 * 86400000).toISOString();
  assert.equal(semanasSinClase({ ultimaClaseIso: hace15dias, proximaClaseIso: null }, AHORA), 2);
});

// ── estado(): vista de compañeras vs vista de quien gestiona ───────────────

test('instructora mirando a una compañera solo ve "hoy" y con quién coincide', () => {
  const e = estado(m({ claseHoyLabel: 'Mat · 10:00', coincideContigo: 'sábado' }), 'INSTRUCTOR', AHORA);
  assert.equal(e.etiqueta, 'Hoy');
  assert.equal(e.titulo, 'Mat · 10:00');
  assert.match(e.pie, /Coincidís: sábado/);
});

test('instructora mirando su propia ficha SÍ ve el detalle de gestión (tu cuenta)', () => {
  const e = estado(m({ esYo: true }), 'INSTRUCTOR', AHORA);
  assert.equal(e.etiqueta, 'Tu cuenta');
});

test('propietaria ve el detalle real de una compañera con ocupación baja', () => {
  const e = estado(m({ ocupacionPct: 55 }), 'PROPIETARIO', AHORA);
  assert.equal(e.etiqueta, 'Atención');
  assert.match(e.pie, /55%/);
});

// ── cifras(): el contrato de permisos ───────────────────────────────────────

test('propietaria ve coste en euros', () => {
  const c = cifras(m({ costeMes: 742 }), 'PROPIETARIO', AHORA);
  assert.equal(c.segundaEtiqueta, 'Coste del mes');
  assert.equal(c.segundaValor, '742,00 €');
});

test('responsable de sede ve horas, nunca euros — aunque el dato llegue relleno', () => {
  const c = cifras(m({ costeMes: 742, horasMes: 18.5 }), 'MANAGER', AHORA);
  assert.equal(c.segundaEtiqueta, 'Horas del mes');
  assert.equal(c.segundaValor, '18.5 h');
});

test('responsable de sede: el texto de horas no contiene el símbolo de euro', () => {
  const c = cifras(m({ costeMes: 742, horasMes: 18.5 }), 'MANAGER', AHORA);
  assert.ok(!c.segundaValor.includes('€'));
});

test('instructora mirando a una compañera no ve cifras ni barras', () => {
  const c = cifras(m(), 'INSTRUCTOR', AHORA);
  assert.equal(c.verCifras, false);
  assert.equal(c.verBarras, false);
});

test('instructora mirando SU PROPIA ficha sí ve sus cifras', () => {
  const c = cifras(m({ esYo: true }), 'INSTRUCTOR', AHORA);
  assert.equal(c.verCifras, true);
});

test('recepción (situación mostrador) no muestra cifras de clase a nadie', () => {
  const c = cifras(m({ rol: 'RECEPCION', ocupacionPct: null, horasMes: null }), 'PROPIETARIO', AHORA);
  assert.equal(c.verCifras, false);
  assert.equal(c.verBarras, false);
});

// ── frecuenciaMensual() / cifras().frecuenciaTexto ──────────────────────────

test('frecuenciaMensual: null sin datos', () => {
  assert.equal(frecuenciaMensual(null), null);
});

test('frecuenciaMensual: 6 clases en 90 días ≈ 2/mes', () => {
  assert.equal(frecuenciaMensual(6), 2);
});

test('frecuenciaMensual: 0 clases en 90 días es un dato real (0), no "sin datos"', () => {
  assert.equal(frecuenciaMensual(0), 0);
});

test('cifras().frecuenciaTexto: freelance de 2 clases/mes lo dice explícitamente', () => {
  const c = cifras(m({ clasesUltimos90Dias: 6 }), 'PROPIETARIO', AHORA);
  assert.equal(c.frecuenciaTexto, '≈2 clases/mes');
});

test('cifras().frecuenciaTexto: singular correcto para 1 clase/mes', () => {
  const c = cifras(m({ clasesUltimos90Dias: 3 }), 'PROPIETARIO', AHORA);
  assert.equal(c.frecuenciaTexto, '≈1 clase/mes');
});

test('cifras().frecuenciaTexto: null sin datos suficientes', () => {
  const c = cifras(m({ clasesUltimos90Dias: null }), 'PROPIETARIO', AHORA);
  assert.equal(c.frecuenciaTexto, null);
});

// ── accion(): una acción con nombre propio ──────────────────────────────────

test('la propia ficha siempre ofrece "Ver mis avisos"', () => {
  assert.equal(accion(m({ esYo: true, ocupacionPct: 10 }), 'PROPIETARIO', { pedido: false }).tipo, 'avisos');
});

test('instructora sobre una compañera: siempre "Escribirle"', () => {
  assert.equal(accion(m(), 'INSTRUCTOR', { pedido: false }).tipo, 'mensaje');
});

test('propietaria sobre recepción: "Escribirle" (no se le pide disponibilidad de clases)', () => {
  assert.equal(accion(m({ rol: 'RECEPCION' }), 'PROPIETARIO', { pedido: false }).tipo, 'mensaje');
});

test('propietaria sobre instructora con ocupación baja: "Revisar sus horas"', () => {
  assert.equal(accion(m({ ocupacionPct: 40 }), 'PROPIETARIO', { pedido: false }).tipo, 'horas');
});

test('propietaria sobre instructora normal: "Pedirle disponibilidad"', () => {
  assert.equal(accion(m({ ocupacionPct: 90 }), 'PROPIETARIO', { pedido: false }).tipo, 'pedir');
});

test('tras copiar el enlace, la acción pasa a "hecho"', () => {
  assert.equal(accion(m({ ocupacionPct: 90 }), 'PROPIETARIO', { pedido: true }).tipo, 'hecho');
});

// ── pistaSemana / diaLibre ───────────────────────────────────────────────────

test('detecta el primer día libre de la semana', () => {
  assert.equal(diaLibre([2, 0, 1, 0, 1, 1, 0]), 1);
  assert.match(pistaSemana(m({ semana: [2, 0, 1, 0, 1, 1, 0] })), /martes/);
});

test('sin días libres, la pista lo dice explícitamente', () => {
  assert.equal(diaLibre([1, 1, 1, 1, 1, 1, 1]), null);
  assert.match(pistaSemana(m({ semana: [1, 1, 1, 1, 1, 1, 1] })), /todos los días/);
});

test('clases() suma la semana', () => {
  assert.equal(clases(m({ semana: [2, 0, 1, 0, 1, 1, 0] })), 5);
});

// ── filtrar / ordenar ────────────────────────────────────────────────────────

const equipo: MiembroCompleto[] = [
  m({ id: 'a', nombre: 'Ana', activo: true, rol: 'INSTRUCTOR', semana: [1, 0, 0, 0, 0, 0, 0], ocupacionPct: 90, costeMes: 100 }),
  m({ id: 'b', nombre: 'Beatriz', activo: false, rol: 'INSTRUCTOR', semana: [0, 0, 0, 0, 0, 0, 0], ocupacionPct: 40, costeMes: 300 }),
  m({ id: 'c', nombre: 'Carla', activo: true, rol: 'RECEPCION', semana: [3, 0, 0, 0, 0, 0, 0], ocupacionPct: null, costeMes: 200 }),
];

test('filtrar por estado activas excluye a las inactivas', () => {
  assert.deepEqual(filtrar(equipo, { busca: '', estadoF: 'activas', rol: 'todos' }).map(x => x.id), ['a', 'c']);
});

test('filtrar por rol', () => {
  assert.deepEqual(filtrar(equipo, { busca: '', estadoF: 'todas', rol: 'RECEPCION' }).map(x => x.id), ['c']);
});

test('buscar ignora acentos y mayúsculas', () => {
  const conAcento = filtrar([m({ id: 'x', nombre: 'María Ángeles' })], { busca: 'maria angeles', estadoF: 'todas', rol: 'todos' });
  assert.equal(conAcento.length, 1);
});

test('ordenar por peor ocupación deja primero a quien menos llena, y a los sin dato al final', () => {
  assert.deepEqual(ordenar(equipo, 'peor-ocupacion').map(x => x.id), ['b', 'a', 'c']);
});

test('ordenar por mayor coste', () => {
  assert.deepEqual(ordenar(equipo, 'mayor-coste').map(x => x.id), ['b', 'c', 'a']);
});

test('ordenar no muta el array original', () => {
  const original = [...equipo];
  ordenar(equipo, 'nombre-za');
  assert.deepEqual(equipo, original);
});
