import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deudaDeLaCuota, etiquetaCaducidad, lineaRecibo, recibosPagables, recibosQueDebe, resumenClaseFija, subtituloTienda, textoCobro, textoHasta,
  hayDeudaQueNoSePagaAqui, porPagarEnLaApp, textoQuedaSemana, textoRecuperaciones, textoRenovacionCuota, textoSaldoDe, verLoQueEs,
  cuotaConTope, topeDeCuota,
} from './mi-plan-vista.ts';
import type { Bono, Pago, PlazaFijaVista } from './tipos.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const HOY = '2026-10-12'; // lunes
const cuota = (extra: Partial<Bono> = {}): Bono => ({
  id: 'q1', nombre: 'Reformer 2 días/semana', creditosTotales: Infinity, creditosUsados: 0, compradoEn: '2026-10-01',
  expiraEn: '2026-10-31', estado: 'activo', precio: 89, tipoPlan: 'MENSUAL', ...extra,
});
const plaza = (extra: Partial<PlazaFijaVista> = {}): PlazaFijaVista => ({
  id: 'pf1', diaSemana: 1, hora: '10:00', sala: 'Sala Sol', salaId: 's1', tipo: 'Reformer', estado: 'ACTIVA', pausaPedida: null,
  proximaFecha: '2026-10-13', vigenciaHasta: null, sinClase: false, pausa: null, proximas: [], deClaseFija: false, instructora: null, ...extra,
});
const pago = (extra: Partial<Pago> = {}): Pago => ({
  id: 'r1', concepto: 'Cuota de octubre', importe: 89, fecha: '2026-10-05', estado: 'pending', metodo: '', vence: '2026-10-05', ...extra,
});

test('una cuota mensual activa se renueva el día siguiente a su fin, por el precio de su plan', () => {
  assert.equal(textoRenovacionCuota(cuota()), 'Próxima renovación: 1 nov · 89 €');
});

test('con baja programada NO se dice que se renueva', () => {
  assert.equal(textoRenovacionCuota(cuota({ bajaAlVencer: true })), 'Termina el 31 oct · no se renueva');
});

test('sin saber si se renueva (tipo desconocido), solo la vigencia; sin fecha de fin, se dice', () => {
  assert.equal(textoRenovacionCuota(cuota({ tipoPlan: null })), 'Vigente hasta el 31 oct');
  assert.equal(textoRenovacionCuota(cuota({ expiraEn: null })), 'Sin fecha de fin');
});

test('lo que le queda esta semana, hasta el domingo', () => {
  assert.equal(textoQuedaSemana({ limite: 2, cuentan: 1 }), 'Te queda 1 clase hasta el domingo.');
  assert.equal(textoQuedaSemana({ limite: 3, cuentan: 1 }), 'Te quedan 2 clases hasta el domingo.');
  assert.equal(textoQuedaSemana({ limite: 2, cuentan: 2 }), 'Ya tienes todas las de esta semana.');
  assert.equal(textoQuedaSemana({ limite: 2, cuentan: 3 }), 'Ya tienes todas las de esta semana.');
  assert.equal(textoQuedaSemana({ limite: null, cuentan: 3 }), null);
});

test('el anillo dice DE QUÉ queda, nunca la cifra suelta', () => {
  assert.equal(textoSaldoDe({ quedan: 7, de: 10 }), '7 de 10 sesiones');
  assert.equal(textoSaldoDe({ quedan: 11, de: null }), '11 sesiones');
  assert.equal(textoSaldoDe({ quedan: 1, de: null }), '1 sesión');
});

test('la caducidad del bono, con aviso a una semana', () => {
  assert.deepEqual(etiquetaCaducidad({ expiraEn: '2026-11-07' }, HOY), { texto: 'Caduca en 26 días', aviso: false, dias: 26 });
  assert.deepEqual(etiquetaCaducidad({ expiraEn: '2026-10-13' }, HOY), { texto: 'Caduca mañana', aviso: true, dias: 1 });
  assert.deepEqual(etiquetaCaducidad({ expiraEn: HOY }, HOY), { texto: 'Caduca hoy', aviso: true, dias: 0 });
  assert.equal(etiquetaCaducidad({ expiraEn: null }, HOY), null);
  assert.equal(textoHasta({ expiraEn: '2026-10-31' }), 'Hasta el 31 oct');
});

test('la clase fija en el MISMO formato en Inicio y en Mi plan', () => {
  assert.deepEqual(resumenClaseFija([plaza()], HOY), { titulo: 'Tu clase fija', dias: 'lunes 10:00', sub: 'Próxima: mañana' });
  const dos = resumenClaseFija([plaza(), plaza({ id: 'pf2', diaSemana: 4, hora: '18:00', proximaFecha: '2026-10-15' })], HOY);
  assert.equal(dos?.titulo, 'Tus clases fijas');
  assert.equal(dos?.dias, 'lunes 10:00 · jueves 18:00');
  assert.equal(dos?.sub, 'Próxima: mañana');
  assert.equal(resumenClaseFija([plaza({ proximaFecha: null, pausa: { desde: '2026-10-01', hasta: '2026-10-31', enCurso: true } })], HOY)?.sub, 'En pausa hasta el 31 oct');
  assert.equal(resumenClaseFija([], HOY), null);
});

test('recuperaciones', () => {
  assert.deepEqual(textoRecuperaciones({ disponibles: 2, proximaCaducidad: '2026-10-20' }), { titulo: '2 clases por recuperar', sub: 'La primera caduca el 20 oct' });
  assert.deepEqual(textoRecuperaciones({ disponibles: 1, proximaCaducidad: '2026-10-20' }), { titulo: '1 clase por recuperar', sub: 'Caduca el 20 oct' });
  assert.equal(textoRecuperaciones({ disponibles: 0, proximaCaducidad: null }), null);
});

test('la tienda dice lo que vende ESTE estudio', () => {
  assert.equal(subtituloTienda([{ familia: 'bono' }, { familia: 'suscripcion' }, { familia: 'suelta' }]), 'Bonos, cuotas y clases sueltas');
  assert.equal(subtituloTienda([{ familia: 'suscripcion' }]), 'Cuotas');
  assert.equal(subtituloTienda([]), null);
});

test('lo que debe: lo que puede pagar ella primero; sin `cobro` del servidor no se ofrece nada', () => {
  const pagos = [
    pago({ id: 'banco', cobro: { como: 'BANCO', via: 'sepa', desde: '2026-10-05' }, vence: '2026-10-01' }),
    pago({ id: 'app', cobro: { como: 'APP' } }),
    pago({ id: 'sin-dato' }),
    pago({ id: 'cobrado', estado: 'success' }),
  ];
  assert.deepEqual(recibosQueDebe(pagos).map((p) => p.id), ['app', 'banco']);
  assert.deepEqual(recibosPagables(pagos).map((p) => p.id), ['app']);
});

test('lo que lo cobra otro se dice, y así no se paga dos veces', () => {
  assert.equal(textoCobro({ como: 'APP' }, HOY), null);
  assert.equal(textoCobro({ como: 'BANCO', via: 'sepa', desde: '2026-11-01' }, HOY), 'Lo cobrará tu banco el 1 nov. No tienes que hacer nada.');
  assert.equal(textoCobro({ como: 'BANCO', via: 'sepa', desde: '2026-10-01' }, HOY), 'Lo cobrará tu banco en los próximos días. No tienes que hacer nada.');
  // La remesa la prepara el estudio: sin fecha inventada.
  assert.equal(textoCobro({ como: 'BANCO', via: 'remesa', desde: null }, HOY), 'Tu estudio lo pasará a tu banco. No tienes que hacer nada.');
  assert.match(textoCobro({ como: 'BANCO', via: 'remesa', desde: null, cuandoVenza: true }, HOY) ?? '', /cuando venza tu cuota/);
  assert.match(textoCobro({ como: 'ESTUDIO', motivo: 'pendiente-estudio' }, HOY) ?? '', /todavía tiene que revisarlo/);
  assert.equal(textoCobro({ como: 'TARJETA', desde: '2026-10-13' }, HOY), 'Se cobrará de tu tarjeta guardada mañana. No tienes que hacer nada.');
  assert.equal(textoCobro({ como: 'ESTUDIO', motivo: 'sin-pago-online' }, HOY), 'Págalo en el estudio.');
  assert.match(textoCobro({ como: 'ESTUDIO', motivo: 'cuota-en-pausa' }, HOY) ?? '', /en pausa/);
});

test('la línea del recibo', () => {
  assert.equal(lineaRecibo(pago({ vence: '2026-10-20' }), HOY), 'Cuota de octubre · vence el 20 oct');
  assert.equal(lineaRecibo(pago({ vence: '2026-10-05' }), HOY), 'Cuota de octubre · venció el 5 oct');
  assert.equal(lineaRecibo(pago({ vence: null }), HOY), 'Cuota de octubre');
});

test('cada cosa con su palabra: nunca «bono» para una cuota', () => {
  assert.equal(verLoQueEs(cuota()), 'Ver tu cuota');
  assert.equal(verLoQueEs({ creditosTotales: 10, tipoPlan: 'BONO' }), 'Ver tu bono');
});

test('lo que puede pagar en la app: lo que dice el servidor, y la renovación sin tarjeta si no dijo otra cosa', () => {
  const ren = { reciboId: 'ren', concepto: 'Renovación Cuota', importe: 60, vence: '2026-10-01', pagableOnline: true };
  assert.deepEqual(porPagarEnLaApp([pago({ id: 'app', cobro: { como: 'APP' } })], null).map((p) => p.reciboId), ['app']);
  // Payload sin `cobro` para ese recibo: la regla de siempre.
  assert.deepEqual(porPagarEnLaApp([], ren).map((p) => [p.reciboId, p.esRenovacion]), [['ren', true]]);
  // El servidor dice que lo cobra el banco: no se ofrece.
  assert.deepEqual(porPagarEnLaApp([pago({ id: 'ren', cobro: { como: 'BANCO', via: 'remesa', desde: null } })], ren), []);
  // El estudio no cobra online: no se ofrece.
  assert.deepEqual(porPagarEnLaApp([], { ...ren, pagableOnline: false }), []);
  // No se repite.
  assert.equal(porPagarEnLaApp([pago({ id: 'ren', cobro: { como: 'APP' } })], ren).length, 1);
});

test('«Renovar mi plan» no se ofrece si hay una deuda que no se paga aquí (o de la que no se sabe quién la cobra)', () => {
  const app = pago({ id: 'a', cobro: { como: 'APP' } });
  const banco = pago({ id: 'b', cobro: { como: 'BANCO', via: 'remesa', desde: null } });
  const sinDato = pago({ id: 'c' });
  assert.equal(hayDeudaQueNoSePagaAqui([app], [app]), false);
  assert.equal(hayDeudaQueNoSePagaAqui([app, banco], [app, banco]), true);
  assert.equal(hayDeudaQueNoSePagaAqui([sinDato], [sinDato]), true);
  assert.equal(hayDeudaQueNoSePagaAqui([], []), false);
});

test('la línea de la cuota: «pendiente» solo si lo paga ella; si lo cobra otro, la frase de Recibos', () => {
  const banco = pago({ id: 'b', bonoId: 'q1', cobro: { como: 'BANCO', via: 'sepa', desde: '2026-11-01' } });
  const app = pago({ id: 'a', bonoId: 'q1', importe: 45, cobro: { como: 'APP' } });
  // Lo del banco no es «Pago pendiente»: es «Lo cobrará tu banco…».
  assert.deepEqual(deudaDeLaCuota([banco], 'q1', HOY), {
    reciboId: 'b', concepto: 'Cuota de octubre', importe: 89, pagaElla: false,
    aviso: 'Lo cobrará tu banco el 1 nov. No tienes que hacer nada.',
  });
  // Con uno del banco y otro que paga ella, manda el suyo (y así no salen dos «Pago pendiente» distintos en Inicio).
  assert.equal(deudaDeLaCuota([banco, app], 'q1', HOY)?.reciboId, 'a');
  assert.equal(deudaDeLaCuota([banco, app], 'q1', HOY)?.aviso, null);
  // Sin saber quién lo cobra: «pendiente», sin frase inventada.
  assert.equal(deudaDeLaCuota([pago({ id: 's', bonoId: 'q1' })], 'q1', HOY)?.aviso, null);
  // De otra cuota, o ya cobrado: nada.
  assert.equal(deudaDeLaCuota([pago({ bonoId: 'otra', cobro: { como: 'APP' } })], 'q1', HOY), null);
  assert.equal(deudaDeLaCuota([pago({ bonoId: 'q1', estado: 'success' })], 'q1', HOY), null);
});

test('el tope de la cuota, UNA frase para «Lo tuyo» y la tarjeta de Perfil', () => {
  assert.equal(topeDeCuota({ limiteSemanal: 2 }), '2 clases a la semana');
  assert.equal(topeDeCuota({ limiteSemanal: 1 }), '1 clase a la semana');
  // Por actividad: «Lo tuyo» no tiene los nombres de los tipos, y no nombra uno con su id.
  assert.equal(topeDeCuota({ limiteSemanal: null, limitePorTipo: { 'tc-r': 1 } }), 'con máximo por actividad');
  assert.equal(topeDeCuota({ limiteSemanal: null }), 'sin máximo semanal');
  assert.equal(topeDeCuota({ limiteSemanal: 0, limitePorTipo: {} }), 'sin máximo semanal');
  assert.equal(cuotaConTope({ limiteSemanal: 0, limitePorTipo: { 'tc-r': 2 } }), true);
  assert.equal(cuotaConTope({}), false);
});
