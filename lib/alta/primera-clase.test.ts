import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DURACIONES_PRIMERA_CLASE, SEMANAS_SERIE, TEXTO_PRECIO, TOPES_PRECIO_RARO, VALORES_DE_SERIE,
  conTipo, cuandoCorto, diasParaElegir, etiquetaDia, fechasDeLaClase, formInicial, horaPorDefecto, infoPrecio,
  leerFormPrimeraClase, leerPrecio, lineaDeVenta, planificarPrimeraClase, precioEnTarjeta, primerError,
  resumenPrimeraClase, validarPrimeraClase, type FormPrimeraClase,
  claveRecibirReservas, decidirCorreoRecibirReservas, errorDePublicar,
} from './primera-clase.ts';
import { POR_DEFECTO } from '../onboarding/asistente-rapido.ts';

// Un miércoles a las 15:00 de Madrid (13:00 UTC, horario de verano).
const AHORA = new Date('2026-10-21T13:00:00Z');
const HOY = '2026-10-21';

function form(cambios: Partial<FormPrimeraClase> = {}): FormPrimeraClase {
  return { ...formInicial({ hoy: HOY }), precio: '20', ...cambios };
}

test('todo viene puesto menos el precio: los valores de serie del asistente', () => {
  const f = formInicial({ hoy: HOY });
  // Los mismos que la bienvenida de siempre (lib/onboarding/asistente-rapido.ts), no otros.
  assert.equal(f.tipo, POR_DEFECTO.clases?.[0]);
  assert.equal(`${f.duracion} minutos`, POR_DEFECTO.duracion);
  assert.equal(`${f.plazas} plazas`, POR_DEFECTO.aforos?.[0]);
  assert.deepEqual({ tipo: f.tipo, nombre: f.nombre, duracion: f.duracion, plazas: f.plazas }, { tipo: 'Reformer', nombre: 'Reformer', duracion: 55, plazas: 8 });
  assert.equal(f.fecha, '2026-10-22', 'mañana: la de hoy puede haber pasado ya');
  assert.equal(f.hora, '18:30');
  assert.equal(f.semanal, true);
  assert.equal(f.quien, 'yo');
  assert.equal(f.sala, 'Sala 1');
  assert.equal(f.precio, '', 'el precio solo lo sabe ella');
  assert.equal(f.cobro, 'estudio');
  assert.equal(f.gratis, false);
  assert.ok((DURACIONES_PRIMERA_CLASE as readonly number[]).includes(f.duracion));
  // Con una sala ya creada, esa.
  assert.equal(formInicial({ hoy: HOY, sala: 'Sala grande' }).sala, 'Sala grande');
});

test('la hora de serie cabe en la franja del estudio', () => {
  assert.equal(horaPorDefecto('07:00:00', '22:00:00', 55), '18:30');
  // Solo mañanas: las 18:30 no caben; una hora después de abrir.
  assert.equal(horaPorDefecto('07:00:00', '15:00:00', 55), '08:00');
  // Una franja en la que no cabe ni eso: al abrir.
  assert.equal(horaPorDefecto('09:00', '10:30', 60), '09:00');
  // Sin franja o al revés: la de serie.
  assert.equal(horaPorDefecto(null, null, 55), '18:30');
  assert.equal(horaPorDefecto('22:00', '07:00', 55), '18:30');
});

test('elegir otro tipo cambia el nombre solo si no lo había escrito ella', () => {
  const f = form();
  assert.equal(conTipo(f, 'Mat').nombre, 'Mat');
  assert.equal(conTipo(f, 'Otra').nombre, '', '«Otra» deja el nombre para que lo escriba');
  const escrito = { ...f, nombre: 'Reformer para principiantes' };
  assert.equal(conTipo(escrito, 'Mat').nombre, 'Reformer para principiantes');
  assert.equal(conTipo(escrito, 'Mat').tipo, 'Mat');
});

test('los días, en palabras y en hora de Madrid', () => {
  assert.equal(etiquetaDia('2026-10-21', HOY), 'Hoy, miércoles 21 de octubre');
  assert.equal(etiquetaDia('2026-10-22', HOY), 'Mañana, jueves 22 de octubre');
  assert.equal(etiquetaDia('2026-10-26', HOY), 'Lunes 26 de octubre');
  const dias = diasParaElegir(HOY);
  assert.equal(dias.length, 14);
  assert.equal(dias[0].fecha, HOY);
  assert.equal(dias[13].fecha, '2026-11-03');
  assert.equal(cuandoCorto({ fecha: '2026-10-26', hora: '18:30', semanal: true }), 'lunes 26 a las 18:30, cada semana');
  assert.equal(cuandoCorto({ fecha: '2026-10-26', hora: '18:30', semanal: false }), 'lunes 26 a las 18:30');
});

test('el precio: falta, formato, negativo, 0 sin la casilla, raro y gratis', () => {
  assert.equal(leerPrecio(''), null);
  assert.equal(leerPrecio('20'), 20);
  assert.equal(leerPrecio('18,50'), 18.5);
  assert.equal(leerPrecio('20 €'), 20);
  assert.equal(leerPrecio('1.200,00'), 1200);
  assert.ok(Number.isNaN(leerPrecio('veinte') as number));
  assert.ok(Number.isNaN(leerPrecio('18,505') as number), 'más de dos decimales no es un precio');

  assert.deepEqual(infoPrecio({ precio: '', venta: 'suelta', gratis: false }), { estado: 'falta', texto: TEXTO_PRECIO.falta, bloquea: true });
  assert.equal(infoPrecio({ precio: 'abc', venta: 'suelta', gratis: false }).texto, TEXTO_PRECIO.formato);
  assert.equal(infoPrecio({ precio: '-5', venta: 'suelta', gratis: false }).texto, TEXTO_PRECIO.negativo);
  // 0 sin la casilla: error, y dice qué hacer (la casilla).
  const cero = infoPrecio({ precio: '0', venta: 'suelta', gratis: false });
  assert.equal(cero.estado, 'cero');
  assert.equal(cero.bloquea, true);
  assert.match(cero.texto, /marca «Esta clase es gratis»/);
  // Con la casilla, el precio no cuenta (ni un 0 ni uno escrito antes).
  assert.deepEqual(infoPrecio({ precio: '0', venta: 'suelta', gratis: true }).bloquea, false);
  assert.equal(infoPrecio({ precio: '', venta: 'bono', gratis: true }).estado, 'gratis');
});

test('un precio raro avisa con los topes de la maqueta y NUNCA bloquea', () => {
  assert.deepEqual({ ...TOPES_PRECIO_RARO }, { suelta: 80, bono: 600, cuota: 300 });
  const raro = infoPrecio({ precio: '900', venta: 'suelta', gratis: false });
  assert.equal(raro.estado, 'raro');
  assert.equal(raro.bloquea, false);
  assert.equal(raro.texto, '¿Seguro? 900,00 € es mucho para una clase suelta. Revisa el número.');
  assert.equal(infoPrecio({ precio: '80', venta: 'suelta', gratis: false }).estado, 'ok', 'el tope no avisa');
  assert.equal(infoPrecio({ precio: '601', venta: 'bono', gratis: false }).texto, '¿Seguro? 601,00 € es mucho para un bono. Revisa el número.');
  assert.equal(infoPrecio({ precio: '300', venta: 'cuota', gratis: false }).estado, 'ok');
  assert.equal(infoPrecio({ precio: '300,01', venta: 'cuota', gratis: false }).estado, 'raro');
  // Y deja publicar.
  assert.equal(planificarPrimeraClase(form({ precio: '900' }), AHORA).ok, true);
});

test('validar: nombre, hora pasada, medianoche, otra persona, sala, plazas y bono', () => {
  assert.deepEqual(validarPrimeraClase(form(), AHORA), {});
  assert.equal(validarPrimeraClase(form({ nombre: '  ' }), AHORA).nombre, 'Ponle un nombre: así sale en tu página.');
  assert.match(validarPrimeraClase(form({ nombre: 'x'.repeat(61) }), AHORA).nombre ?? '', /Como mucho 60/);
  // Hoy a las 10:00 ya ha pasado (son las 15:00 en Madrid); a las 18:30, no.
  assert.equal(validarPrimeraClase(form({ fecha: HOY, hora: '10:00' }), AHORA).hora, 'Esa hora ya ha pasado hoy. Elige otra hora u otro día.');
  assert.deepEqual(validarPrimeraClase(form({ fecha: HOY, hora: '18:30' }), AHORA), {});
  assert.equal(validarPrimeraClase(form({ fecha: '2026-10-20' }), AHORA).fecha, 'Ese día ya ha pasado. Elige otro.');
  assert.match(validarPrimeraClase(form({ hora: '23:30' }), AHORA).hora ?? '', /antes de medianoche/);
  assert.equal(validarPrimeraClase(form({ quien: 'otra', otraPersona: '' }), AHORA).otraPersona, 'Escribe el nombre de quien la da.');
  assert.ok(validarPrimeraClase(form({ sala: '' }), AHORA).sala);
  assert.equal(validarPrimeraClase(form({ plazas: 0 }), AHORA).plazas, 'Entre 1 y 100 plazas.');
  assert.equal(validarPrimeraClase(form({ plazas: 101 }), AHORA).plazas, 'Entre 1 y 100 plazas.');
  assert.ok(validarPrimeraClase(form({ venta: 'bono', bonoClases: '0' }), AHORA).bonoClases);
  assert.equal(validarPrimeraClase(form({ venta: 'bono', bonoClases: '10' }), AHORA).bonoClases, undefined);
  // El bono no se mira si es gratis.
  assert.deepEqual(validarPrimeraClase(form({ venta: 'bono', bonoClases: '', gratis: true, precio: '' }), AHORA), {});
  // El primero en el orden de la pantalla recibe el foco.
  assert.equal(primerError(validarPrimeraClase(form({ nombre: '', precio: '' }), AHORA)), 'nombre');
  assert.equal(primerError(validarPrimeraClase(form({ precio: '' }), AHORA)), 'precio');
});

test('la clase semanal son cuatro semanas del mismo día, como «Clase semanal» del Calendario', () => {
  assert.equal(SEMANAS_SERIE, 4);
  assert.deepEqual(fechasDeLaClase({ fecha: '2026-10-26', semanal: true }), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(fechasDeLaClase({ fecha: '2026-10-26', semanal: false }), ['2026-10-26']);
});

test('el plan: instantes en hora de Madrid a través del cambio de hora, tarifa y «Yo» sin identidad', () => {
  const r = planificarPrimeraClase(form({ fecha: '2026-10-22', hora: '18:30' }), AHORA);
  assert.ok(r.ok);
  const p = r.plan;
  // 18:30 en Madrid: 16:30 UTC con horario de verano, 17:30 UTC después del 25-oct.
  assert.deepEqual(p.sesiones, [
    { inicio: '2026-10-22T16:30:00.000Z', fin: '2026-10-22T17:25:00.000Z' },
    { inicio: '2026-10-29T17:30:00.000Z', fin: '2026-10-29T18:25:00.000Z' },
    { inicio: '2026-11-05T17:30:00.000Z', fin: '2026-11-05T18:25:00.000Z' },
    { inicio: '2026-11-12T17:30:00.000Z', fin: '2026-11-12T18:25:00.000Z' },
  ]);
  assert.deepEqual(p.tarifa, { tipo: 'PUNTUAL', nombre: 'Clase suelta', precio: 20, sesiones: 1 });
  // El navegador solo dice «yo»: el nombre y la cuenta los pone el servidor.
  assert.deepEqual(p.instructor, { propia: true });
  assert.equal(p.aforo, 8);
  assert.equal(p.semanal, true);
  assert.equal(p.tipo.nombre, 'Reformer');

  const bono = planificarPrimeraClase(form({ venta: 'bono', precio: '90', bonoClases: '10', semanal: false, quien: 'otra', otraPersona: ' Marta ' }), AHORA);
  assert.ok(bono.ok);
  assert.deepEqual(bono.plan.tarifa, { tipo: 'BONO', nombre: 'Bono 10 clases', precio: 90, sesiones: 10 });
  assert.equal(bono.plan.sesiones.length, 1);
  assert.deepEqual(bono.plan.instructor, { propia: false, nombre: 'Marta' });

  const cuota = planificarPrimeraClase(form({ venta: 'cuota', precio: '65,50' }), AHORA);
  assert.ok(cuota.ok);
  assert.deepEqual(cuota.plan.tarifa, { tipo: 'MENSUAL', nombre: 'Cuota mensual', precio: 65.5, sesiones: null });

  const gratis = planificarPrimeraClase(form({ gratis: true, precio: '' }), AHORA);
  assert.ok(gratis.ok);
  assert.equal(gratis.plan.tarifa, null, 'gratis: sin tarifa');
  assert.equal(gratis.plan.gratis, true);

  const sinPrecio = planificarPrimeraClase(form({ precio: '' }), AHORA);
  assert.equal(sinPrecio.ok, false);
});

test('un choque con una clase que ya hay lo dice antes de publicar', () => {
  const existentes = [{ id: 'x', salaId: 'sala-1', instructorId: null, inicio: '2026-11-05T17:00:00.000Z', fin: '2026-11-05T18:00:00.000Z' }];
  const e = validarPrimeraClase(form({ fecha: '2026-10-22', hora: '18:30' }), AHORA, { existentes, salaId: 'sala-1', instructorId: null });
  assert.equal(e.hora, 'El jue 5 nov a esa hora la sala ya tiene otra clase. Elige otra hora o cambia la sala.');
  // Con una sala nueva no puede chocar nada.
  assert.deepEqual(validarPrimeraClase(form({ fecha: '2026-10-22', hora: '18:30' }), AHORA, { existentes, salaId: null, instructorId: null }), {});
  const ins = [{ id: 'y', salaId: 'otra', instructorId: 'ins-1', inicio: '2026-10-22T16:00:00.000Z', fin: '2026-10-22T17:00:00.000Z' }];
  assert.match(validarPrimeraClase(form({ fecha: '2026-10-22' }), AHORA, { existentes: ins, salaId: null, instructorId: 'ins-1' }).hora ?? '', /quien la da ya tiene otra clase/);
});

test('leer el formulario que llega: lo que no tiene la forma, null', () => {
  const f = form();
  assert.deepEqual(leerFormPrimeraClase(JSON.parse(JSON.stringify(f))), f);
  assert.equal(leerFormPrimeraClase(null), null);
  assert.equal(leerFormPrimeraClase({ ...f, venta: 'regalo' }), null);
  assert.equal(leerFormPrimeraClase({ ...f, plazas: '8' }), null);
  assert.equal(leerFormPrimeraClase({ ...f, gratis: 'no' }), null);
  // Textos larguísimos se cortan antes de validar.
  assert.equal(leerFormPrimeraClase({ ...f, nombre: 'x'.repeat(5000) })?.nombre.length, 200);
});

test('el resumen y la vista previa dicen lo que se crea y cómo se paga', () => {
  const lineas = resumenPrimeraClase(form({ fecha: '2026-10-26' }), 'Lucía');
  assert.deepEqual(lineas, [
    'El tipo de clase «Reformer», de 55 minutos',
    'La sala «Sala 1», con 8 plazas',
    'Tu ficha de instructora (Lucía)',
    'La clase del lunes 26 a las 18:30, cada semana',
    'La tarifa «Clase suelta» a 20,00 €, activa',
  ]);
  const ya = { tipos: new Set(['reformer']), salas: new Set(['sala 1']), fichaPropia: true, instructoras: new Set<string>() };
  const conYa = resumenPrimeraClase(form({ fecha: '2026-10-26' }), 'Lucía', ya);
  assert.match(conYa[0], /que ya tienes/);
  assert.match(conYa[1], /^Tu sala/);
  assert.match(conYa[2], /que ya tienes/);
  assert.equal(resumenPrimeraClase(form({ gratis: true }), 'Lucía')[4], 'Sin tarifa: la clase es gratis');
  assert.equal(resumenPrimeraClase(form({ precio: '' }), 'Lucía')[4], 'La tarifa «Clase suelta» a falta el precio, activa');

  assert.deepEqual(lineaDeVenta(form()), { tarifa: '20,00 € la clase', pago: 'Se paga en el estudio' });
  assert.deepEqual(lineaDeVenta(form({ venta: 'bono', precio: '90', cobro: 'online' })), { tarifa: 'Bono de 10 clases · 90,00 €', pago: 'Con tarjeta al reservar' });
  assert.deepEqual(lineaDeVenta(form({ gratis: true })), { tarifa: 'Gratis', pago: 'Se reserva sin pagar nada' });
  // La tarjeta de /reservar solo pinta el precio de la clase suelta.
  assert.equal(precioEnTarjeta(form()), 20);
  assert.equal(precioEnTarjeta(form({ venta: 'bono', precio: '90' })), null);
  assert.equal(precioEnTarjeta(form({ gratis: true })), null);
});

test('la RPC recibe lo mismo que valida este fichero (migración 20261021134000)', () => {
  // Sin los comentarios: la cabecera explica por qué nunca `current_date`.
  const sql = readFileSync(new URL('../../supabase/migrations/20261021134000_alta_primera_clase.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '');
  // Las tres tarifas y los dos cobros, con los mismos nombres.
  assert.match(sql, /v_tipo_tarifa not in \('PUNTUAL', 'BONO', 'MENSUAL'\)/);
  assert.match(sql, /v_cobro not in \('estudio', 'online'\)/);
  // El mismo tope de plazas y de clases del bono.
  assert.match(sql, /v_aforo > 100/);
  assert.match(sql, /v_sesiones_tarifa > 999/);
  // La serie se renueva sola: «La paras desde el calendario» es verdad.
  assert.match(sql, /renovacion_automatica\)\s*values \(v_serie_id, p_studio_id, .*, true\)$/m);
  // «Hoy» es el de Madrid, nunca el de UTC.
  assert.match(sql, /public\.hoy_estudio\(\)/);
  assert.doesNotMatch(sql, /current_date/);
  assert.equal(VALORES_DE_SERIE.plazas <= 100, true);
});

test('lo que dice si la RPC rechaza: el solape dice si es la sala o quien la da, y que no se ha creado nada', () => {
  const sala = errorDePublicar({ code: '23P01', message: 'conflicting key value violates exclusion constraint "sesiones_sala_sin_solape"' });
  assert.deepEqual(sala, { status: 409, error: 'A esa hora la sala ya tiene otra clase. Elige otra hora o cambia la sala. No se ha creado nada.', campo: 'hora' });
  const ins = errorDePublicar({ code: '23P01', message: 'conflicting key value violates exclusion constraint "sesiones_instructor_sin_solape"' });
  assert.match(ins.error, /^A esa hora quien la da ya tiene otra clase\./);
  // Sin el nombre de la restricción, el texto de siempre de lib/errores.
  assert.match(errorDePublicar({ code: '23P01', message: 'x' }).error, /^Esa sala o instructora ya tiene una clase a esa hora\./);
  assert.deepEqual(errorDePublicar({ code: 'P0001', message: 'FECHA_PASADA' }), {
    status: 422, error: 'Esa hora ya ha pasado. Elige otra hora u otro día. No se ha creado nada.', campo: 'hora',
  });
  assert.equal(errorDePublicar({ code: 'P0001', message: 'SIN_PRECIO' }).campo, 'precio');
  // Lo que no provoca el formulario: un fallo nuestro, sin detalles técnicos.
  const raro = errorDePublicar({ code: 'P0001', message: 'TIPO_AJENO' });
  assert.equal(raro.status, 500);
  assert.doesNotMatch(raro.error, /TIPO_AJENO/);
});

test('el correo 4 sale solo con el SÍ del servidor, una vez y en los primeros días', () => {
  const base = { veredicto: 'SI', yaEnviado: false, creadoEn: '2026-10-21T10:00:00Z', email: 'duena@example.com', slug: 'estudio-alba', ahora: AHORA };
  assert.deepEqual(decidirCorreoRecibirReservas(base), { enviar: true });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, veredicto: 'NO' }), { enviar: false, motivo: 'no_puede_reservar' });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, veredicto: 'SIN_COMPROBAR' }), { enviar: false, motivo: 'no_puede_reservar' });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, yaEnviado: true }), { enviar: false, motivo: 'ya_enviado' });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, creadoEn: '2025-01-01T00:00:00Z' }), { enviar: false, motivo: 'fuera_de_ventana' });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, email: null }), { enviar: false, motivo: 'sin_email' });
  assert.deepEqual(decidirCorreoRecibirReservas({ ...base, slug: '' }), { enviar: false, motivo: 'sin_pagina' });
  assert.equal(claveRecibirReservas('st-1'), 'alta-recibir-reservas:st-1');
});
