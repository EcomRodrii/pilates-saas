import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS_POR_TARJETA, TARJETAS_REGLAS, antelacionImposible, confirmarPenalizacion, consecuenciaRegla, excepcionesPorRegla,
  formularioReglas, fraseAntelacion, fraseSeAbre, reglasAGuardar, reglasDeTarjetaAGuardar, reglasGuardadas, tarjetasConCambios,
  type TipoConReglas,
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
// Llegadas después, cada una con su tarjeta y su motivo. 16-sep: qué pasa con las
// clases de su plaza fija cuando se queda sin cuota (la elige el estudio).
const NUEVAS = ['plazaFijaSinCuota', 'plazaFijaSolicitarDesdeApp', 'plazaFijaPausaDesdeApp', 'plazaFijaPausaLiberaSitio', 'plazaFijaFinPausa',
  // 27-sep: el control de acceso con QR, en la tarjeta de Asistencia.
  'controlAccesoQr',
  // 30-sep: el tope de clases al día y la hora a la que se abre, en «Reservar».
  'reservaMaxPorDia', 'reservaAntelacionHora',
  // 30-sep: el tope de recuperaciones sin usar (antes un 4 fijo), con su propia tarjeta.
  'recuperacionMaxVivas'];

test('la sección guarda las columnas de antes, menos las dos que se fueron a su sitio, más las nuevas con nombre', () => {
  const r = reglasAGuardar(formularioReglas(null), reglasGuardadas(null));
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.reglas).sort(), [...COLUMNAS_DE_ANTES.filter(c => !MUDADAS.includes(c)), ...NUEVAS].sort());
});

test('cada columna vive en UNA tarjeta, y entre todas están todas', () => {
  const repartidas = TARJETAS_REGLAS.flatMap(t => COLUMNAS_POR_TARJETA[t]);
  assert.equal(new Set(repartidas).size, repartidas.length, 'una columna en dos tarjetas');
  assert.deepEqual([...repartidas].sort(), Object.keys(reglasGuardadas(null)).sort());
});

test('sin dato del servidor, los mismos valores por defecto que el formulario de antes', () => {
  assert.deepEqual(reglasGuardadas(null), {
    reservaExigirPlan: true, reservaVentanaMinimaMinutos: 0, reservaAntelacionMaximaDias: null, reservaAntelacionHora: null,
    reservaMaxSimultaneas: null, reservaMaxPorDia: null, bloquearReservaImpago: false, requiereAprobacion: false,
    cancelacionVentanaHoras: 12, cancelacionDevolverBonoTardia: false, cancelacionClaseDevuelveBono: true,
    minimoAsistentesPorClase: 0, recuperacionMaxVivas: 4, recuperacionCaducidadTipo: 'FIN_MES_SIGUIENTE', recuperacionCaducidadDias: null,
    recuperacionAutoSemanal: false, permiteListaEspera: true, listaEsperaPlazoAceptacionMinutos: 0,
    requiereCheckinQr: true, controlAccesoQr: true, penalizacionImporteEur: null, penalizacionAplicaCancelacionTardia: true,
    penalizacionAplicaNoShow: true, penalizacionCobroAutomatico: false,
    // Sin elegir: como siempre (decisión del fundador, 16-sep).
    plazaFijaSinCuota: 'MANTENER',
    // Pedir plaza fija desde la app: ENCENDIDO de serie desde el 22-sep (antes
    // apagado por defecto, 16-sep) — ver el comentario en reglas-reserva.ts.
    plazaFijaSolicitarDesdeApp: true, plazaFijaPausaDesdeApp: false,
    plazaFijaPausaLiberaSitio: false, plazaFijaFinPausa: 'RECUPERAR_SI_LIBRE',
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
    [{ recuperacionAutoSemanal: true }, ['recuperaciones']],
    [{ recuperacionMaxVivas: 6 }, ['recuperaciones']],
    [{ cancelacionClaseDevuelveBono: false }, ['si-se-cancela-una-clase']],
    [{ minimoAsistentesPorClase: 3 }, ['si-se-cancela-una-clase']],
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

test('el «Guardar» de un cajón manda SOLO las columnas de su tarjeta (#2027)', () => {
  const guardado = reglasGuardadas({ cancelacionVentanaHoras: 24, penalizacionImporteEur: 5, listaEsperaPlazoAceptacionMinutos: 20 });
  const form = formularioReglas(guardado);
  for (const t of TARJETAS_REGLAS) {
    const r = reglasDeTarjetaAGuardar(t, form, guardado);
    assert.ok(r.ok, t);
    assert.deepEqual(Object.keys(r.cambios).sort(), [...COLUMNAS_POR_TARJETA[t]].sort(), t);
  }
  const cancelar = reglasDeTarjetaAGuardar('cancelar-y-recuperar', { ...form, cancelacionVentanaHoras: 6 }, guardado);
  assert.deepEqual(cancelar, {
    ok: true,
    cambios: { cancelacionVentanaHoras: 6, cancelacionDevolverBonoTardia: false },
  });
  // «Sin lista» conserva el plazo guardado, también desde su cajón.
  assert.deepEqual(reglasDeTarjetaAGuardar('lista-de-espera', { ...form, listaEspera: { modo: 'sin-lista', minutos: '' } }, guardado), {
    ok: true, cambios: { permiteListaEspera: false, listaEsperaPlazoAceptacionMinutos: 20 },
  });
});

test('un cajón solo se bloquea por lo suyo', () => {
  // Una antelación imposible guardada de antes no bloquea la lista de espera.
  const guardado = reglasGuardadas({ reservaVentanaMinimaMinutos: 5000, reservaAntelacionMaximaDias: 1 });
  const form = formularioReglas(guardado);
  assert.equal(reglasDeTarjetaAGuardar('reservar', form, guardado).ok, false);
  assert.equal(reglasDeTarjetaAGuardar('lista-de-espera', form, guardado).ok, true);
  const lista = reglasDeTarjetaAGuardar('lista-de-espera', { ...form, listaEspera: { modo: 'con-plazo', minutos: '0' } }, guardado);
  assert.deepEqual(lista, { ok: false, texto: 'Pon cuántos minutos tiene para aceptar la plaza: 1 o más.' });
});

const tipo = (nombre: string, reglas: Partial<TipoConReglas> = {}): TipoConReglas => ({ id: `tc-${nombre}`, nombre, ...reglas });

test('excepciones por tipo de clase: solo cuenta lo que cambia de verdad, con la resolución de la reserva', () => {
  const estudio = reglasGuardadas({ cancelacionVentanaHoras: 12, penalizacionImporteEur: 5, listaEsperaPlazoAceptacionMinutos: 30 });
  const tipos = [
    tipo('Reformer', { ventanaCancelacionHoras: 24, penalizacionImporteEur: 0 }),
    // Su propio valor, IGUAL al del estudio: no lleva la contraria a nadie.
    tipo('Mat', { ventanaCancelacionHoras: 12, reservaExigirPlan: true }),
    tipo('Suelo', { permiteListaEspera: false, requiereCheckinQr: false, minimoAsistentesPorClase: 3 }),
    // NULL = hereda.
    tipo('Embarazadas', { ventanaCancelacionHoras: null, reservaAntelacionMaximaDias: 7 }),
  ];
  const ex = excepcionesPorRegla(estudio, tipos);
  const nombres = (t: keyof typeof ex) => ex[t].map(x => x.nombre);
  assert.deepEqual(nombres('cancelar-y-recuperar'), ['Reformer']);
  assert.deepEqual(nombres('si-cancela-tarde-o-no-viene'), ['Reformer']);
  assert.deepEqual(nombres('reservar'), ['Embarazadas']);
  assert.deepEqual(nombres('lista-de-espera'), ['Suelo']);
  assert.deepEqual(nombres('asistencia'), ['Suelo']);
  assert.deepEqual(nombres('si-se-cancela-una-clase'), ['Suelo']);
  // Un plazo propio con la lista apagada en todo el estudio no cambia nada: no hay lista.
  const sinLista = reglasGuardadas({ permiteListaEspera: false });
  assert.deepEqual(excepcionesPorRegla(sinLista, [tipo('X', { listaEsperaPlazoAceptacionMinutos: 10 })])['lista-de-espera'], []);
  // «Sin cargo» es sin cargo, venga como NULL o como 0.
  assert.deepEqual(excepcionesPorRegla(reglasGuardadas(null), [tipo('X', { penalizacionImporteEur: 0 })])['si-cancela-tarde-o-no-viene'], []);
  assert.deepEqual(excepcionesPorRegla(estudio, []).reservar, []);
});

test('la consecuencia de cada cajón: una línea que dice lo que va a pasar', () => {
  const r = reglasGuardadas({ cancelacionVentanaHoras: 12 });
  assert.equal(consecuenciaRegla('cancelar-y-recuperar', r), 'Si cancela con menos de 12 h, no recupera la sesión.');
  assert.equal(consecuenciaRegla('cancelar-y-recuperar', { ...r, cancelacionDevolverBonoTardia: true }), 'Si cancela con menos de 12 h, también recupera la sesión.');
  assert.equal(consecuenciaRegla('cancelar-y-recuperar', { ...r, cancelacionVentanaHoras: 0 }), 'Recupera la sesión cancele cuando cancele: no hay plazo de cancelación.');
  assert.match(consecuenciaRegla('si-se-cancela-una-clase', r), /—, devuelve la sesión\.$/);
  assert.equal(consecuenciaRegla('si-se-cancela-una-clase', { ...r, minimoAsistentesPorClase: 3, cancelacionClaseDevuelveBono: false }),
    'Si a 2 h del inicio hay menos de 3 alumnas, se cancela sola y no devuelve la sesión.');
  assert.equal(consecuenciaRegla('lista-de-espera', { ...r, listaEsperaPlazoAceptacionMinutos: 30 }),
    'Si se libera una plaza, la primera de la lista tiene 30 min para aceptarla; si no, pasa a la siguiente.');
  assert.equal(consecuenciaRegla('reservar', r), 'Se puede reservar con cualquier antelación, hasta que empieza la clase.');
  assert.equal(consecuenciaRegla('asistencia', { ...r, requiereCheckinQr: false }), 'Toda reserva confirmada cuenta como asistida al terminar la clase.');

  assert.equal(consecuenciaRegla('si-cancela-tarde-o-no-viene', r), 'Cancelar tarde o no venir no cuesta nada.');
  const cargo = { ...r, penalizacionImporteEur: 7.5 };
  assert.equal(consecuenciaRegla('si-cancela-tarde-o-no-viene', cargo), 'Si cancela con menos de 12 h o no viene sin avisar, se le cobran 7,50 € cuando lo apruebes.');
  assert.equal(consecuenciaRegla('si-cancela-tarde-o-no-viene', { ...cargo, penalizacionAplicaNoShow: false, penalizacionCobroAutomatico: true }),
    'Si cancela con menos de 12 h, se le cobran 7,50 € sin esperar a que lo apruebes.');
  // Sin plazo no hay cancelación tardía: no se promete un cargo que nunca llega.
  assert.match(consecuenciaRegla('si-cancela-tarde-o-no-viene', { ...cargo, cancelacionVentanaHoras: 0, penalizacionAplicaNoShow: false }), /nunca se cobran los 7,50 €/);

  for (const t of TARJETAS_REGLAS) {
    for (const v of [r, cargo, { ...cargo, minimoAsistentesPorClase: 12, listaEsperaPlazoAceptacionMinutos: 120, reservaAntelacionMaximaDias: 30, reservaVentanaMinimaMinutos: 90 }]) {
      const texto = consecuenciaRegla(t, v);
      assert.ok(texto.length > 0 && texto.length <= 120, `${t}: «${texto}» (${texto.length})`);
    }
  }
});

test('el cargo pregunta antes con lo que pasa, y con lo que NO pasa', () => {
  const antes = reglasGuardadas({ cancelacionVentanaHoras: 12 });
  const poner = confirmarPenalizacion(antes, { ...antes, penalizacionImporteEur: 5 }, { terminosPropios: false, tiposConCargoPropio: 0 });
  assert.equal(poner.titulo, '¿Cobrar 5 €?');
  assert.match(poner.descripcion, /^Si cancela con menos de 12 h o no viene sin avisar, se le cobran 5 € cuando lo apruebes\. Va a su tarjeta guardada/);
  assert.match(confirmarPenalizacion(antes, { ...antes, penalizacionImporteEur: 5 }, { terminosPropios: true, tiposConCargoPropio: 0 }).descripcion,
    /Con tus términos propios no se cobrará/);
  const quitar = confirmarPenalizacion({ ...antes, penalizacionImporteEur: 5 }, antes, { terminosPropios: false, tiposConCargoPropio: 2 });
  assert.equal(quitar.titulo, '¿Quitar el cargo?');
  assert.equal(quitar.descripcion, 'Desde ahora, cancelar tarde o no venir no le cuesta nada a tus alumnas, tampoco en los tipos de clase con su propio cargo.');
  // Un importe nuevo no se cobra a quien aceptó el texto anterior.
  assert.match(poner.descripcion, /quien las aceptó antes de este cambio no paga hasta que las vuelva a aceptar\.$/);
  const soloAutomatico = confirmarPenalizacion({ ...antes, penalizacionImporteEur: 5 }, { ...antes, penalizacionImporteEur: 5, penalizacionCobroAutomatico: true }, { terminosPropios: false, tiposConCargoPropio: 0 });
  assert.match(soloAutomatico.descripcion, /Va a su tarjeta guardada, si tiene una y aceptó tus condiciones\.$/);
  assert.equal(confirmarPenalizacion({ ...antes, penalizacionImporteEur: 5 }, { ...antes, penalizacionImporteEur: 8 }, { terminosPropios: false, tiposConCargoPropio: 0 }).titulo, '¿Cambiar el cargo?');
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

test('los topes de «Reservar» fuera del rango de la base de datos no se guardan y dicen por qué', () => {
  const guardado = reglasGuardadas(null);
  const form = formularioReglas(guardado);
  const cero = reglasDeTarjetaAGuardar('reservar', { ...form, reservaMaxPorDia: 0 }, guardado);
  assert.deepEqual(cero, { ok: false, texto: 'Las clases al día van de 1 a 20. Déjalo vacío para no poner límite.' });
  assert.equal(reglasDeTarjetaAGuardar('reservar', { ...form, reservaMaxPorDia: 21 }, guardado).ok, false);
  assert.equal(reglasDeTarjetaAGuardar('reservar', { ...form, reservaMaxSimultaneas: 0 }, guardado).ok, false);
  const uno = reglasDeTarjetaAGuardar('reservar', { ...form, reservaMaxPorDia: 1 }, guardado);
  assert.ok(uno.ok);
  assert.equal(uno.cambios.reservaMaxPorDia, 1);
  const vacio = reglasDeTarjetaAGuardar('reservar', { ...form, reservaMaxPorDia: null }, guardado);
  assert.ok(vacio.ok);
  assert.equal(vacio.cambios.reservaMaxPorDia, null);
});

test('con hora fija, «imposible» es para cualquier clase, y la frase lo cuenta con la hora', () => {
  // 1 día a las 20:00 y se cierra 30 min antes: la de las 21:00 del día siguiente
  // tiene 25 h y media. Posible.
  assert.equal(antelacionImposible(30, 1, '20:00'), false);
  // 0 días a las 20:00 con 5 h de cierre: ni la de las 23:59 llega (se cerraría a
  // las 18:59, antes de abrirse a las 20:00).
  assert.equal(antelacionImposible(300, 0, '20:00'), true);
  assert.equal(antelacionImposible(200, 0, '20:00'), false, 'la de las 23:59 aún tiene un rato');
  assert.equal(fraseAntelacion(30, 2, '20:00'), 'Se puede reservar desde 2 días antes a las 20:00 hasta 30 min antes de que empiece la clase.');
  assert.equal(fraseAntelacion(0, 0, '08:00'), 'Se puede reservar desde el mismo día a las 08:00 hasta que empieza la clase.');
  assert.equal(fraseSeAbre(7, '20:00'), 'se abre 7 días antes a las 20:00');
  assert.equal(fraseSeAbre(7, null), 'se abre 7 días antes');
});

test('«Reservar»: 0 días a la hora de la clase no se guarda; con hora fija, sí', () => {
  const guardado = reglasGuardadas(null);
  const form = formularioReglas(guardado);
  const cero = reglasDeTarjetaAGuardar('reservar', { ...form, reservaAntelacionMaximaDias: 0, reservaAntelacionHora: null }, guardado);
  assert.equal(cero.ok, false);
  const ceroALas8 = reglasDeTarjetaAGuardar('reservar', { ...form, reservaAntelacionMaximaDias: 0, reservaAntelacionHora: '08:00' }, guardado);
  assert.ok(ceroALas8.ok);
  assert.equal(ceroALas8.cambios.reservaAntelacionHora, '08:00');
  assert.equal(reglasDeTarjetaAGuardar('reservar', { ...form, reservaAntelacionMaximaDias: 2, reservaAntelacionHora: '25:00' }, guardado).ok, false);
});

test('«Recuperaciones»: el tope va de 1 a 20 y la fila y la consecuencia dicen el número', () => {
  const guardado = reglasGuardadas(null);
  const form = formularioReglas(guardado);
  assert.equal(reglasDeTarjetaAGuardar('recuperaciones', { ...form, recuperacionMaxVivas: 0 }, guardado).ok, false);
  assert.equal(reglasDeTarjetaAGuardar('recuperaciones', { ...form, recuperacionMaxVivas: 21 }, guardado).ok, false);
  assert.equal(reglasDeTarjetaAGuardar('recuperaciones', { ...form, recuperacionMaxVivas: Number.NaN }, guardado).ok, false);
  const seis = reglasDeTarjetaAGuardar('recuperaciones', { ...form, recuperacionMaxVivas: 6 }, guardado);
  assert.deepEqual(seis, { ok: true, cambios: { recuperacionMaxVivas: 6, recuperacionCaducidadTipo: 'FIN_MES_SIGUIENTE', recuperacionCaducidadDias: null, recuperacionAutoSemanal: false } });
  assert.equal(consecuenciaRegla('recuperaciones', { ...guardado, recuperacionMaxVivas: 2 }),
    'Con 2 sin usar, no se le da otra hasta que use o le caduque una. Si bajas el número, quien ya tenga más las conserva.');
});
