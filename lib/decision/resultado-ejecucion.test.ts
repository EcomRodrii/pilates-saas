import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cobroEjecutado, desenlaceCobro, detalleCobro, detalleInterrumpida, enlazaACobros, euros, lineaActividad, pudoMoverDinero, resumirCobro,
  type IntentoCobro,
} from './resultado-ejecucion.ts';

// Lo que devuelve `cobrarReciboOffSession` (lib/billing/stripe-cobros.ts) en cada caso.
const COBRADO = (importe: number): IntentoCobro => ({ ok: true, status: 'succeeded', importe });
const SEPA = (importe: number): IntentoCobro => ({ ok: true, status: 'processing', importe });
const RECHAZADA: IntentoCobro = { ok: false, errorCode: 'FALLO_COBRO', error: 'No se pudo completar el cobro. Inténtalo de nuevo más tarde.' };
const SIN_TARJETA: IntentoCobro = { ok: false, errorCode: 'SIN_TARJETA', error: 'La socia no tiene método de pago guardado' };
const YA_PAGADO: IntentoCobro = { ok: false, errorCode: 'NO_PENDIENTE', error: 'Este recibo ya no está pendiente' };
const SIN_RESPUESTA: IntentoCobro = {
  ok: false, errorCode: 'ERROR_TRANSITORIO',
  error: 'Stripe no respondió y el cobro quedó sin confirmar. Se reintentará solo con la misma clave, sin riesgo de doble cargo.',
};
const PROCESANDO: IntentoCobro = {
  ok: false, status: 'processing', errorCode: 'ERROR_TRANSITORIO',
  error: 'El banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.',
};
// `cerrarCobroOffSession` (lib/billing/confirmar-cobro.ts): Stripe cobró y el
// recibo no quedó cobrado — falló la escritura, o ya estaba cobrado con otro
// cargo (`otro_cobro`, un doble cobro de verdad). Llega con `ok: true`.
const SIN_PERSISTIR = (importe: number): IntentoCobro => ({
  ok: true, status: 'succeeded', importe, aviso: 'COBRADO_SIN_PERSISTIR',
  error: 'El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.',
});

test('un recibo cobrado: «Cobrado» con lo que entró, y EJECUTADA', () => {
  const r = resumirCobro([COBRADO(89)]);
  assert.equal(detalleCobro(r), 'Cobrado: 89 €.');
  assert.equal(cobroEjecutado(r), true);
});

test('el caso de la revisión: 5 recibos, 1 cobrado, 2 rechazados y 2 ya pagados — nunca «Cobrados: 150 €»', () => {
  const r = resumirCobro([COBRADO(30), RECHAZADA, SIN_TARJETA, YA_PAGADO, YA_PAGADO]);
  assert.equal(r.cobrados, 1);
  assert.equal(r.importeCobradoEur, 30);
  assert.equal(r.noCobrados, 2);
  assert.equal(r.yaNoPendientes, 2);
  assert.equal(detalleCobro(r),
    'Cobrados 1 de 5 recibos: 30 €. 2 ya no estaban pendientes al ir a cobrarlos. '
    + '2 no se han podido cobrar. No se pudo completar el cobro. Inténtalo de nuevo más tarde. La socia no tiene método de pago guardado.');
  // Entró dinero: EJECUTADA, y el desglose dice lo que no entró.
  assert.equal(cobroEjecutado(r), true);
});

test('un adeudo SEPA en curso no es un cobro: va aparte, con que aún puede devolverse', () => {
  const r = resumirCobro([SEPA(60)]);
  assert.equal(r.cobrados, 0);
  assert.equal(r.enCurso, 1);
  assert.equal(detalleCobro(r), 'Adeudo SEPA en curso (60 €): el banco tarda unos días en confirmarlo, y hasta entonces puede devolverse.');
  assert.equal(cobroEjecutado(r), true);
});

test('nada cobrado y algo rechazado: FALLIDA, con el motivo', () => {
  const r = resumirCobro([SIN_TARJETA]);
  assert.equal(detalleCobro(r), 'No se ha podido cobrar. La socia no tiene método de pago guardado.');
  assert.equal(cobroEjecutado(r), false);
  const dos = resumirCobro([SIN_TARJETA, SIN_TARJETA]);
  assert.equal(detalleCobro(dos), 'No se ha podido cobrar ninguno de los 2. La socia no tiene método de pago guardado.', 'el mismo motivo no se repite');
  assert.match(detalleCobro(resumirCobro([COBRADO(10), SIN_TARJETA])), /Uno no se ha podido cobrar\. La socia no tiene método de pago guardado\.$/);
});

test('ya pagado por otra vía entre el análisis y el clic: no es un fallo ni un cobro', () => {
  const r = resumirCobro([YA_PAGADO]);
  assert.equal(detalleCobro(r), 'Ya no estaba pendiente al ir a cobrarlo.');
  assert.doesNotMatch(detalleCobro(r), /No se ha podido|Cobrado/);
  // Lo que pidió (que no quede nada por cobrar) está hecho: EJECUTADA, no «No se pudo completar».
  assert.equal(cobroEjecutado(r), true);
});

test('sin confirmar (Stripe no contestó): ni cobrado ni rechazado, y no cuenta como hecho', () => {
  const r = resumirCobro([SIN_RESPUESTA]);
  assert.equal(r.sinConfirmar, 1);
  assert.equal(detalleCobro(r), `Sin confirmar todavía: ${SIN_RESPUESTA.error}`, '«Stripe» no pasa a minúscula');
  assert.doesNotMatch(detalleCobro(r), /No se ha podido cobrar/);
  assert.equal(cobroEjecutado(r), false);
  assert.equal(desenlaceCobro(r), 'SIN_CONFIRMAR');
  const mezcla = resumirCobro([YA_PAGADO, SIN_RESPUESTA]);
  assert.equal(cobroEjecutado(mezcla), false, 'algo sin confirmar no deja dar el cobro por hecho');
  assert.equal(desenlaceCobro(mezcla), 'SIN_CONFIRMAR');
  assert.match(detalleCobro(mezcla), /^Uno ya no estaba pendiente al ir a cobrarlo\. Uno sin confirmar todavía: Stripe no respondió/);
});

test('una tarjeta en «processing»: «Sin confirmar todavía», sin invitar a cobrarla de otra forma', () => {
  const r = resumirCobro([PROCESANDO]);
  assert.equal(detalleCobro(r), 'Sin confirmar todavía: el banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.');
  assert.equal(desenlaceCobro(r), 'SIN_CONFIRMAR');
  assert.equal(enlazaACobros(r), false, 'ni «Lo ves en Cobros»: allí el recibo sigue pareciendo por cobrar');
  assert.equal(pudoMoverDinero(r), true);
  // Aunque además se rechazara otro: lo que pudo entrar manda, y no es un fallo.
  const conRechazo = resumirCobro([PROCESANDO, SIN_TARJETA]);
  assert.equal(desenlaceCobro(conRechazo), 'SIN_CONFIRMAR');
  assert.match(detalleCobro(conRechazo), /^Uno sin confirmar todavía: el banco aún está procesando el cargo\. .* Uno no se ha podido cobrar\. La socia no tiene método de pago guardado\.$/);
});

test('cobrado en Stripe sin quedar cobrado el recibo: su propio grupo, con su importe, y nunca como cobrado', () => {
  const r = resumirCobro([SIN_PERSISTIR(89)]);
  assert.equal(r.cobrados, 0, 'no suma como cobrado');
  assert.equal(r.importeCobradoEur, 0);
  assert.equal(r.sinRegistrar, 1);
  assert.equal(r.importeSinRegistrarEur, 89);
  assert.deepEqual(r.motivosSinRegistrar, ['El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.']);
  assert.equal(detalleCobro(r), 'Cobrado en Stripe (89 €), pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.');
  assert.doesNotMatch(detalleCobro(r), /^Cobrado:/);
  // No es un éxito limpio: FALLIDA (lo mismo que anota Automatizaciones), ni enlace a Cobros.
  assert.equal(desenlaceCobro(r), 'A_REVISAR');
  assert.equal(cobroEjecutado(r), false);
  assert.equal(enlazaACobros(r), false);
  assert.equal(pudoMoverDinero(r), true);
});

test('cobrado sin registrar junto a cobros limpios: manda revisarlo, y el desglose dice las dos cosas', () => {
  const r = resumirCobro([COBRADO(30), COBRADO(30), SIN_PERSISTIR(30)]);
  assert.equal(r.cobrados, 2);
  assert.equal(r.importeCobradoEur, 60);
  assert.equal(desenlaceCobro(r), 'A_REVISAR', 'lo cobrado sin registrar va primero aunque otros entraran bien');
  assert.equal(cobroEjecutado(r), false);
  assert.equal(enlazaACobros(r), false);
  assert.equal(detalleCobro(r),
    'Cobrados 2 de 3 recibos: 60 €. Uno se ha cobrado en Stripe (30 €), pero su recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.');
  const dos = resumirCobro([SIN_PERSISTIR(10), SIN_PERSISTIR(20), SIN_TARJETA]);
  assert.match(detalleCobro(dos), /^2 se han cobrado en Stripe \(30 €\), pero sus recibos no han quedado cobrados: revísalos antes de volver a cobrarlos\./);
  // Sin importe conocido no se inventa un «(0 €)».
  assert.equal(detalleCobro(resumirCobro([{ ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR' }])),
    'Cobrado en Stripe, pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.');
});

test('«Lo ves en Cobros» solo si allí hay algo que ver de este cobro', () => {
  assert.equal(enlazaACobros(resumirCobro([COBRADO(10)])), true);
  assert.equal(enlazaACobros(resumirCobro([SEPA(10)])), true);
  assert.equal(enlazaACobros(resumirCobro([YA_PAGADO])), true, 'el recibo que ya estaba pagado se ve allí');
  assert.equal(enlazaACobros(resumirCobro([YA_PAGADO, RECHAZADA])), true);
  // Todo rechazado: un rechazo no deja nada en Cobros.
  assert.equal(enlazaACobros(resumirCobro([RECHAZADA])), false);
  assert.equal(enlazaACobros(resumirCobro([RECHAZADA, SIN_TARJETA])), false);
  assert.equal(enlazaACobros(resumirCobro([])), false);
  // Algo sin confirmar o cobrado sin registrar: allí el recibo invita a cobrarlo otra vez.
  assert.equal(enlazaACobros(resumirCobro([COBRADO(10), SIN_RESPUESTA])), false);
  assert.equal(enlazaACobros(resumirCobro([COBRADO(10), SIN_PERSISTIR(10)])), false);
});

test('el resumen leído de la base de datos tolera campos que falten (una fila de antes, una respuesta a medias)', () => {
  const viejo = { recibos: 1, cobrados: 1, importeCobradoEur: 89 } as unknown as Parameters<typeof detalleCobro>[0];
  assert.equal(detalleCobro(viejo), 'Cobrado: 89 €.');
  assert.equal(desenlaceCobro(viejo), 'COBRADO');
  assert.equal(enlazaACobros(viejo), true);
  const sinMotivos = { recibos: 1, noCobrados: 1 } as unknown as Parameters<typeof detalleCobro>[0];
  assert.equal(detalleCobro(sinMotivos), 'No se ha podido cobrar.');
});

test('desenlaceCobro: en cada caso, lo que decide si queda EJECUTADA', () => {
  const casos: Array<[IntentoCobro[], ReturnType<typeof desenlaceCobro>, boolean]> = [
    [[], 'SIN_RECIBOS', false],
    [[COBRADO(10)], 'COBRADO', true],
    [[SEPA(10)], 'COBRADO', true],
    [[COBRADO(10), RECHAZADA], 'COBRADO', true],
    [[COBRADO(10), SIN_RESPUESTA], 'COBRADO', true],
    [[YA_PAGADO], 'YA_NO_PENDIENTE', true],
    [[YA_PAGADO, RECHAZADA], 'NO_COBRADO', false],
    [[RECHAZADA], 'NO_COBRADO', false],
    [[SIN_RESPUESTA], 'SIN_CONFIRMAR', false],
    [[SIN_PERSISTIR(10)], 'A_REVISAR', false],
    [[COBRADO(10), SIN_PERSISTIR(10)], 'A_REVISAR', false],
  ];
  for (const [intentos, desenlace, ejecutada] of casos) {
    const r = resumirCobro(intentos);
    assert.equal(desenlaceCobro(r), desenlace, JSON.stringify(intentos));
    assert.equal(cobroEjecutado(r), ejecutada, JSON.stringify(intentos));
  }
});

test('pudoMoverDinero: lo cobrado, lo que va de camino, lo cobrado sin registrar y lo que no se sabe; nada más', () => {
  assert.equal(pudoMoverDinero(resumirCobro([COBRADO(1)])), true);
  assert.equal(pudoMoverDinero(resumirCobro([SEPA(1)])), true);
  assert.equal(pudoMoverDinero(resumirCobro([SIN_PERSISTIR(1)])), true);
  assert.equal(pudoMoverDinero(resumirCobro([SIN_RESPUESTA])), true);
  assert.equal(pudoMoverDinero(resumirCobro([RECHAZADA, SIN_TARJETA, YA_PAGADO])), false);
  assert.equal(pudoMoverDinero(resumirCobro([])), false);
});

test('una ejecución interrumpida dice qué revisar antes de repetirla, según lo que hacía el botón', () => {
  assert.equal(detalleInterrumpida('COBRAR_RECIBOS', 'COBRAR'), 'No se ha podido terminar; revisa Cobros antes de volver a cobrar.');
  assert.equal(detalleInterrumpida('COBRAR_RECIBOS'), 'No se ha podido terminar; revisa Cobros antes de volver a cobrar.', 'el piloto no manda efecto');
  assert.match(detalleInterrumpida('CONTACTO_MANUAL', 'ENVIAR_MENSAJE'), /comprueba si le ha llegado el mensaje antes de volver a escribirle/);
  assert.match(detalleInterrumpida('ENVIAR_EMAIL', 'ENVIAR_EMAIL'), /comprueba si le ha llegado el mensaje/);
  // Con «Hecho» no se mandó ni se cobró nada: no se le pide que compruebe un mensaje que no salió.
  assert.equal(detalleInterrumpida('CONTACTO_MANUAL', 'MARCAR'), 'No se ha podido terminar; si sigue haciendo falta, volverá a aparecer.');
  assert.equal(detalleInterrumpida('MARCAR_GESTIONADO'), 'No se ha podido terminar; si sigue haciendo falta, volverá a aparecer.');
});

test('la línea de Actividad: un cobro y una ejecución interrumpida se describen solos, sin «No se pudo completar» delante', () => {
  const titulo = 'Se quedaron 2 pagos sin completar';
  const sinPersistir = resumirCobro([SIN_PERSISTIR(89)]);
  assert.equal(
    lineaActividad({ titulo, nombreSocia: null, ok: false, resultado: { detalle: detalleCobro(sinPersistir), cobro: sinPersistir } }),
    `${titulo} — Cobrado en Stripe (89 €), pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.`);
  const sinConfirmar = resumirCobro([SIN_RESPUESTA]);
  assert.match(lineaActividad({ titulo, nombreSocia: null, ok: false, resultado: { detalle: detalleCobro(sinConfirmar), cobro: sinConfirmar } }),
    /^Se quedaron 2 pagos sin completar — Sin confirmar todavía: Stripe no respondió/);
  assert.equal(lineaActividad({ titulo, nombreSocia: 'Laura', ok: true, resultado: { detalle: 'Cobrado: 89 €.', cobro: resumirCobro([COBRADO(89)]) } }),
    'Laura: Cobrado: 89 €.');
  assert.equal(lineaActividad({ titulo, nombreSocia: null, ok: false, resultado: { detalle: detalleInterrumpida('COBRAR_RECIBOS'), interrumpida: true } }),
    `${titulo} — No se ha podido terminar; revisa Cobros antes de volver a cobrar.`);
  // Lo de siempre fuera de un cobro.
  assert.equal(lineaActividad({ titulo: 'Bea lleva 6 semanas sin venir', nombreSocia: null, ok: false, resultado: { detalle: 'No se le ha enviado nada: no tiene email.' } }),
    'No se pudo completar: Bea lleva 6 semanas sin venir — No se le ha enviado nada: no tiene email.');
  assert.equal(lineaActividad({ titulo: 'Aviso de horario', nombreSocia: null, ok: true, resultado: { detalle: 'Marcada como gestionada.' } }),
    'Gestionada: Aviso de horario');
  assert.equal(lineaActividad({ titulo: 'Bea', nombreSocia: 'Bea', ok: true, resultado: { detalle: 'WhatsApp enviado.' } }), 'Bea: WhatsApp enviado.');
});

test('sin recibos que cobrar: FALLIDA, y lo dice', () => {
  const r = resumirCobro([]);
  assert.equal(detalleCobro(r), 'No había ningún recibo que cobrar.');
  assert.equal(cobroEjecutado(r), false);
});

test('los importes se suman en céntimos y se escriben como dinero', () => {
  const r = resumirCobro([COBRADO(0.1), COBRADO(0.2), COBRADO(44.5)]);
  assert.equal(r.importeCobradoEur, 44.8);
  assert.equal(detalleCobro(r), 'Cobrados los 3 recibos: 44,80 €.');
  assert.equal(euros(1240), '1240 €');
  assert.equal(euros(12400.5), '12.400,50 €');
});
