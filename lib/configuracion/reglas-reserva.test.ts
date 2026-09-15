import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS_POR_TARJETA, TARJETAS_REGLAS, antelacionImposible, formularioReglas, fraseAntelacion,
  reglasAGuardar, reglasGuardadas, tarjetasConCambios,
} from './reglas-reserva.ts';

// Partir el formulario en tarjetas no podía cambiar lo que se guarda. Estos
// tests fijan eso: las mismas columnas que antes (menos las dos que se fueron a
// su sección), los mismos valores por defecto, y que abrir y guardar sin tocar
// nada no cambie ninguna.

// Las veintidós columnas que mandaba «Guardar política de reservas» hasta el
// 15-sep, copiadas tal cual: es historia, no se toca.
const COLUMNAS_DE_ANTES = [
  'cancelacionVentanaHoras', 'cancelacionDevolverBonoTardia', 'cancelacionClaseDevuelveBono',
  'recuperacionCaducidadTipo', 'recuperacionCaducidadDias', 'reservaExigirPlan', 'reservaMaxSimultaneas',
  'compraPublicaModo', 'reservaVentanaMinimaMinutos', 'reservaAntelacionMaximaDias', 'permiteListaEspera',
  'requiereAprobacion', 'listaEsperaPlazoAceptacionMinutos', 'minimoAsistentesPorClase', 'penalizacionImporteEur',
  'penalizacionAplicaCancelacionTardia', 'penalizacionAplicaNoShow', 'penalizacionCobroAutomatico',
  'requiereCheckinQr', 'bloquearReservaImpago', 'recuperacionAutoSemanal', 'instructorasCreanClases',
];
// Se guardan ahora en «Alta de alumnas» y «Mi equipo».
const MUDADAS = ['compraPublicaModo', 'instructorasCreanClases'];

test('la sección guarda las columnas de antes, menos las dos que se fueron a su sitio, y ninguna nueva', () => {
  const r = reglasAGuardar(formularioReglas(null), reglasGuardadas(null));
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.reglas).sort(), COLUMNAS_DE_ANTES.filter(c => !MUDADAS.includes(c)).sort());
});

test('cada columna vive en UNA tarjeta, y entre todas están todas', () => {
  const repartidas = TARJETAS_REGLAS.flatMap(t => COLUMNAS_POR_TARJETA[t]);
  assert.equal(new Set(repartidas).size, repartidas.length, 'una columna en dos tarjetas');
  assert.deepEqual([...repartidas].sort(), Object.keys(reglasGuardadas(null)).sort());
});

test('sin dato del servidor, los mismos valores por defecto que el formulario de antes', () => {
  assert.deepEqual(reglasGuardadas(null), {
    reservaExigirPlan: true, reservaVentanaMinimaMinutos: 0, reservaAntelacionMaximaDias: null,
    reservaMaxSimultaneas: null, bloquearReservaImpago: false, requiereAprobacion: false,
    cancelacionVentanaHoras: 12, cancelacionDevolverBonoTardia: false, cancelacionClaseDevuelveBono: true,
    minimoAsistentesPorClase: 0, recuperacionCaducidadTipo: 'FIN_MES_SIGUIENTE', recuperacionCaducidadDias: null,
    recuperacionAutoSemanal: false, permiteListaEspera: true, listaEsperaPlazoAceptacionMinutos: 0,
    requiereCheckinQr: true, penalizacionImporteEur: null, penalizacionAplicaCancelacionTardia: true,
    penalizacionAplicaNoShow: true, penalizacionCobroAutomatico: false,
  });
});

test('abrir y guardar sin tocar nada manda exactamente lo guardado, y ninguna tarjeta tiene cambios', () => {
  const guardado = reglasGuardadas({
    cancelacionVentanaHoras: 24, permiteListaEspera: false, listaEsperaPlazoAceptacionMinutos: 30,
    penalizacionImporteEur: 5, recuperacionCaducidadTipo: 'DIAS', recuperacionCaducidadDias: 45,
    reservaAntelacionMaximaDias: 14, reservaVentanaMinimaMinutos: 60,
  });
  const form = formularioReglas(guardado);
  assert.deepEqual(tarjetasConCambios(form, guardado), []);
  assert.deepEqual(reglasAGuardar(form, guardado), { ok: true, reglas: guardado });
});

test('cada cambio marca su tarjeta, y solo la suya', () => {
  const guardado = reglasGuardadas(null);
  const base = formularioReglas(guardado);
  const casos: [Partial<typeof base>, string[]][] = [
    [{ reservaMaxSimultaneas: 3 }, ['reservar']],
    [{ cancelacionVentanaHoras: 24 }, ['cancelar-y-recuperar']],
    [{ recuperacionAutoSemanal: true }, ['cancelar-y-recuperar']],
    [{ listaEspera: { modo: 'con-plazo', minutos: '15' } }, ['lista-de-espera']],
    [{ requiereCheckinQr: false }, ['asistencia']],
    [{ penalizacionImporteEur: 5 }, ['si-cancela-tarde-o-no-viene']],
    [{ bloquearReservaImpago: true, penalizacionCobroAutomatico: true }, ['reservar', 'si-cancela-tarde-o-no-viene']],
  ];
  for (const [cambio, esperadas] of casos) {
    assert.deepEqual(tarjetasConCambios({ ...base, ...cambio }, guardado), esperadas, JSON.stringify(cambio));
  }
});

test('la lista de espera: cambiar la cifra sin cambiar lo que se guardaría no cuenta como cambio', () => {
  const guardado = reglasGuardadas(null); // con lista, al momento
  const form = formularioReglas(guardado);
  // Pasó por «durante 15 minutos» y volvió a «al momento»: la cifra se queda
  // en pantalla, pero lo que se guardaría es lo mismo.
  assert.deepEqual(tarjetasConCambios({ ...form, listaEspera: { modo: 'al-momento', minutos: '15' } }, guardado), []);
  // Una cifra que no vale sí: la barra tiene que seguir ahí con el error.
  assert.deepEqual(tarjetasConCambios({ ...form, listaEspera: { modo: 'con-plazo', minutos: '' } }, guardado), ['lista-de-espera']);
});

test('lo que no se puede guardar no se manda, y dice en qué tarjeta está', () => {
  const guardado = reglasGuardadas(null);
  const form = formularioReglas(guardado);
  const antelacion = reglasAGuardar({ ...form, reservaVentanaMinimaMinutos: 3 * 24 * 60 + 1, reservaAntelacionMaximaDias: 3 }, guardado);
  assert.equal(antelacion.ok, false);
  assert.equal(!antelacion.ok && antelacion.problema.tarjeta, 'reservar');
  const lista = reglasAGuardar({ ...form, listaEspera: { modo: 'con-plazo', minutos: '0' } }, guardado);
  assert.equal(!lista.ok && lista.problema.tarjeta, 'lista-de-espera');
});

test('la lista de espera se guarda en sus dos columnas de siempre', () => {
  const guardado = reglasGuardadas({ listaEsperaPlazoAceptacionMinutos: 20 });
  const form = formularioReglas(guardado);
  const sin = reglasAGuardar({ ...form, listaEspera: { modo: 'sin-lista', minutos: '' } }, guardado);
  assert.ok(sin.ok);
  assert.equal(sin.reglas.permiteListaEspera, false);
  assert.equal(sin.reglas.listaEsperaPlazoAceptacionMinutos, 20, '«sin lista» conserva el plazo guardado');
  const momento = reglasAGuardar({ ...form, listaEspera: { modo: 'al-momento', minutos: '20' } }, guardado);
  assert.ok(momento.ok);
  assert.deepEqual([momento.reglas.permiteListaEspera, momento.reglas.listaEsperaPlazoAceptacionMinutos], [true, 0]);
});

test('la antelación, en una frase que dice lo que aplica la reserva', () => {
  assert.equal(fraseAntelacion(0, null), 'Se puede reservar con cualquier antelación, hasta que empieza la clase.');
  assert.equal(fraseAntelacion(120, null), 'Se puede reservar con cualquier antelación, hasta 2 h antes de que empiece la clase.');
  assert.equal(fraseAntelacion(45, 14), 'Se puede reservar desde 14 días antes hasta 45 min antes de que empiece la clase.');
  assert.equal(fraseAntelacion(0, 1), 'Se puede reservar desde 1 día antes hasta que empieza la clase.');
  assert.equal(fraseAntelacion(0, 0), 'La reserva no se abre hasta que empieza la clase.');
  assert.match(fraseAntelacion(90, 0), /se cerraría antes de abrirse/);
  assert.equal(antelacionImposible(1440, 1), false, 'justo un día: se abre y se cierra a la vez, pero no es imposible');
  assert.equal(antelacionImposible(1441, 1), true);
});
