import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  situacionDe, estado, cifras, accion, filtrar, ordenar, pistaSemana, diaLibre, clases,
  semanasSinClase, SEMANAS_SIN_CLASE_AVISO, frecuenciaMensual, horas, horasCsv, valoracionMedia,
  ventanaEstudio, diaDeSemanaEstudio,
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
    horasMes: 20, costeMes: 400, coincideContigo: null, disponibilidadActualizadaEn: null,
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
  assert.equal(c.segundaValor, '18,5 h');
});

test('propietaria sobre alguien sin tarifa: horas con coma decimal, como los euros', () => {
  const c = cifras(m({ costeMes: null, horasMes: 14.2 }), 'PROPIETARIO', AHORA);
  assert.equal(c.segundaEtiqueta, 'Horas del mes');
  assert.equal(c.segundaValor, '14,2 h');
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

// ── horas() / valoracionMedia(): coma decimal, nunca punto ──────────────────

test('horas(): coma decimal y un decimal como mucho', () => {
  assert.equal(horas(14.2), '14,2 h');
  assert.equal(horas(14.25), '14,3 h');
  assert.equal(horas(0.5), '0,5 h');
});

test('horas(): un número entero sale sin decimales', () => {
  assert.equal(horas(14), '14 h');
  assert.equal(horas(0), '0 h');
  // Una suma de duraciones en coma flotante que se queda a nada del entero.
  assert.equal(horas(2.9999999), '3 h');
  assert.equal(horas(14.04), '14 h');
});

test('horasCsv(): coma decimal para el Excel en español, sin decimales si es entero', () => {
  assert.equal(horasCsv(1.5), '1,50');
  assert.equal(horasCsv(0.75), '0,75');
  assert.equal(horasCsv(14), '14');
  assert.ok(!horasCsv(2 / 3).includes('.'));
});

test('valoracionMedia(): siempre un decimal, con coma', () => {
  assert.equal(valoracionMedia(4.8), '4,8');
  assert.equal(valoracionMedia(5), '5,0');
  assert.equal(valoracionMedia(4.63), '4,6');
});

test('cifras().valoracionTexto: la media con coma decimal', () => {
  const c = cifras(m({ valoracion: { media: 4.8, total: 34 } }), 'PROPIETARIO', AHORA);
  assert.equal(c.valoracionTexto, '4,8 de 34 clientas');
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

test('cifras().frecuenciaTexto: con decimal, coma y no punto', () => {
  // 4 clases en 90 días ≈ 1,3 al mes.
  const c = cifras(m({ clasesUltimos90Dias: 4 }), 'PROPIETARIO', AHORA);
  assert.equal(c.frecuenciaTexto, '≈1,3 clases/mes');
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

// ─── La semana y el mes son los del estudio (Madrid), no los del servidor (UTC) ───
// GET /api/equipo/tarjetas corre en Vercel (UTC). Con la medianoche, el `getDay()` y el
// `new Date(año, mes, 1)` del proceso, una clase antes de las 01:00/02:00 de Madrid caía
// en el día, la semana o el mes anterior.

const iso = (d: Date) => d.toISOString();

test('martes a las 00:30 de Madrid (verano): es martes, y la semana empezó el lunes a las 00:00 de Madrid', () => {
  const ahora = new Date('2026-10-19T22:30:00Z'); // martes 20, 00:30 (+02:00)
  const v = ventanaEstudio(ahora);
  assert.equal(v.hoy, '2026-10-20');
  assert.equal(iso(v.lunes), '2026-10-18T22:00:00.000Z');
  assert.equal(diaDeSemanaEstudio(ahora), 1);
  // Lo de antes: en UTC aún era lunes.
  assert.equal((ahora.getUTCDay() + 6) % 7, 0);
});

test('martes a las 00:30 de Madrid (invierno): lo mismo con +01:00', () => {
  const ahora = new Date('2026-11-16T23:30:00Z'); // martes 17, 00:30 (+01:00)
  const v = ventanaEstudio(ahora);
  assert.equal(v.hoy, '2026-11-17');
  assert.equal(iso(v.lunes), '2026-11-15T23:00:00.000Z');
  assert.equal(diaDeSemanaEstudio(ahora), 1);
});

test('el día 1 a las 00:30 de Madrid ya es el mes nuevo (y el mes acaba a las 00:00 de Madrid del 1 siguiente)', () => {
  const ahora = new Date('2026-10-31T23:30:00Z'); // domingo 1 de noviembre, 00:30 (+01:00)
  const v = ventanaEstudio(ahora);
  assert.equal(v.hoy, '2026-11-01');
  assert.equal(iso(v.inicioMes), '2026-10-31T23:00:00.000Z');
  assert.equal(iso(v.finMes), '2026-11-30T23:00:00.000Z');
  // Una clase de las 00:30 del 1 cuenta en noviembre, no en octubre.
  assert.ok(ahora >= v.inicioMes && ahora < v.finMes);
});

test('diciembre: el mes acaba el 1 de enero del año siguiente', () => {
  const v = ventanaEstudio(new Date('2026-12-15T12:00:00Z'));
  assert.equal(iso(v.inicioMes), '2026-11-30T23:00:00.000Z');
  assert.equal(iso(v.finMes), '2026-12-31T23:00:00.000Z');
});

test('la semana del cambio de hora: del lunes a las 00:00 (+02:00) al lunes siguiente a las 00:00 (+01:00)', () => {
  const ahora = new Date('2026-10-25T22:30:00Z'); // domingo 25, 23:30 (+01:00): aún domingo
  const v = ventanaEstudio(ahora);
  assert.equal(diaDeSemanaEstudio(ahora), 6);
  assert.equal(iso(v.lunes), '2026-10-18T22:00:00.000Z');
  assert.equal(iso(v.finSemana), '2026-10-25T23:00:00.000Z');
  assert.ok(ahora >= v.lunes && ahora < v.finSemana);
});

test('el día de la semana de una clase es el de Madrid, también con el proceso en otra zona', () => {
  // Domingo 23:30 en Madrid es domingo, aunque en UTC sea domingo 21:30 o lunes en Asia.
  assert.equal(diaDeSemanaEstudio(new Date('2026-07-05T21:30:00Z')), 6);
  // Lunes 00:15 en Madrid (verano) es lunes, aunque en UTC sea domingo 22:15.
  assert.equal(diaDeSemanaEstudio(new Date('2026-07-05T22:15:00Z')), 0);
});
