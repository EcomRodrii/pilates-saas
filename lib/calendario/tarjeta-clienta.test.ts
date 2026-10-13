import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALUMNA_DE_MUESTRA, DE_SERIE, bonoAgotadoQueCubre, conQueVieneFila, esDeSerie, esPrimeraVez, esSuCumpleanos, notaFijadaPorSocia,
  pagoConocido, paraGuardar, piezasDeTarjeta, saludVisible, tarjetaClaseDe, textoCumpleanos, validarTarjetaClase,
  type DatosFila, type TarjetaClase,
} from './tarjeta-clienta.ts';
import type { PlanTarifa, Suscripcion } from '../types.ts';

const TODO: TarjetaClase = { conQueViene: true, confirmacion: true, cumpleanos: true, notaFijada: true, primeraVez: true, salud: 'adaptar' };
const PROPIETARIA = { verSemaforo: true, verFichaClinica: true };
const RECEPCION = { verSemaforo: true, verFichaClinica: false };

test('lo de serie es lo de siempre: solo el punto de color, y nada debajo del nombre', () => {
  assert.deepEqual(tarjetaClaseDe(null), DE_SERIE);
  assert.equal(DE_SERIE.salud, 'color');
  assert.deepEqual(piezasDeTarjeta(DE_SERIE, ALUMNA_DE_MUESTRA.datos, PROPIETARIA), []);
  assert.deepEqual(saludVisible(DE_SERIE, PROPIETARIA), { color: true, adaptar: false });
  assert.deepEqual(saludVisible(DE_SERIE, RECEPCION), { color: true, adaptar: false });
});

test('al leer, lo que no se entiende vuelve a lo de serie clave a clave', () => {
  assert.deepEqual(tarjetaClaseDe('hola'), DE_SERIE);
  assert.deepEqual(tarjetaClaseDe([true]), DE_SERIE);
  assert.deepEqual(tarjetaClaseDe({ conQueViene: 'sí', salud: 'todo', cumpleanos: true, otra: 1 }), { ...DE_SERIE, cumpleanos: true });
});

test('al guardar, solo las seis claves con su tipo', () => {
  assert.equal(validarTarjetaClase(TODO).ok, true);
  assert.equal(validarTarjetaClase({ ...TODO, extra: true }).ok, false);
  assert.equal(validarTarjetaClase({ ...TODO, salud: 'todo' }).ok, false);
  assert.equal(validarTarjetaClase({ ...TODO, conQueViene: 1 }).ok, false);
  const { primeraVez: _, ...sinUna } = TODO;
  assert.equal(validarTarjetaClase(sinUna).ok, false);
  assert.equal(validarTarjetaClase(null).ok, false);
  assert.equal(validarTarjetaClase([]).ok, false);
});

test('lo de serie se guarda como NULL; lo demás, entero', () => {
  assert.equal(paraGuardar({ ...DE_SERIE }), null);
  assert.ok(esDeSerie({ ...DE_SERIE }));
  assert.deepEqual(paraGuardar(TODO), TODO);
  assert.deepEqual(paraGuardar({ ...DE_SERIE, salud: 'nada' }), { ...DE_SERIE, salud: 'nada' });
});

test('«adaptar» nunca sale sin la ficha clínica, lo diga lo guardado o no', () => {
  assert.deepEqual(saludVisible(TODO, RECEPCION), { color: true, adaptar: false });
  assert.deepEqual(saludVisible(TODO, { verSemaforo: false, verFichaClinica: false }), { color: false, adaptar: false });
  assert.deepEqual(saludVisible(TODO, PROPIETARIA), { color: true, adaptar: true });
  const piezas = piezasDeTarjeta(TODO, ALUMNA_DE_MUESTRA.datos, RECEPCION).map(p => p.clave);
  assert.ok(!piezas.includes('adaptar'));
  assert.ok(piezasDeTarjeta(TODO, ALUMNA_DE_MUESTRA.datos, PROPIETARIA).some(p => p.clave === 'adaptar'));
});

test('salud «nada» quita también el punto de color', () => {
  assert.deepEqual(saludVisible({ ...DE_SERIE, salud: 'nada' }, PROPIETARIA), { color: false, adaptar: false });
});

test('con todo encendido, las piezas salen en su orden', () => {
  assert.deepEqual(piezasDeTarjeta(TODO, ALUMNA_DE_MUESTRA.datos, PROPIETARIA).map(p => p.clave),
    ['primera-vez', 'cumpleanos', 'con-que-viene', 'confirmacion', 'nota', 'adaptar']);
});

const BASE: DatosFila = {
  estado: 'CONFIRMADA', claseEmpezada: false, claseTerminada: false, conQueViene: null, cumpleanos: null,
  notaFijada: null, primeraVez: false, adaptacion: null,
};

test('la confirmación solo si se le pidió, y solo mientras está apuntada sin pasar lista', () => {
  const t = { ...DE_SERIE, confirmacion: true };
  assert.deepEqual(piezasDeTarjeta(t, BASE, PROPIETARIA), []);
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, confirmacionPedidaEn: 'x' }, PROPIETARIA), [{ clave: 'confirmacion', texto: 'Sin contestar', aviso: true }]);
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, confirmacionPedidaEn: 'x', confirmadoEn: 'y' }, PROPIETARIA), [{ clave: 'confirmacion', texto: 'Ha confirmado', aviso: false }]);
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, estado: 'ASISTIDA', confirmacionPedidaEn: 'x' }, PROPIETARIA), []);
  // Empezada la clase, «sin contestar» ya no sirve de nada.
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, confirmacionPedidaEn: 'x', claseEmpezada: true }, PROPIETARIA), []);
});

test('terminada la clase, «con qué viene» y el cumpleaños se callan; la nota y la primera vez siguen', () => {
  const piezas = piezasDeTarjeta(TODO, { ...ALUMNA_DE_MUESTRA.datos, estado: 'ASISTIDA', claseEmpezada: true, claseTerminada: true }, PROPIETARIA)
    .map(p => p.clave);
  assert.deepEqual(piezas, ['primera-vez', 'nota', 'adaptar']);
});

test('«primera vez» no sale en una fila «No vino» ni en la lista de espera', () => {
  const t = { ...DE_SERIE, primeraVez: true };
  assert.equal(piezasDeTarjeta(t, { ...BASE, primeraVez: true }, PROPIETARIA).length, 1);
  assert.equal(piezasDeTarjeta(t, { ...BASE, primeraVez: true, estado: 'ASISTIDA' }, PROPIETARIA).length, 1);
  assert.equal(piezasDeTarjeta(t, { ...BASE, primeraVez: true, estado: 'NO_ASISTIO' }, PROPIETARIA).length, 0);
  assert.equal(piezasDeTarjeta(t, { ...BASE, primeraVez: true, estado: 'LISTA_ESPERA' }, PROPIETARIA).length, 0);
});

test('la nota fijada va en una línea, y una vacía no se pinta', () => {
  const t = { ...DE_SERIE, notaFijada: true };
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, notaFijada: '  Trae\n su esterilla ' }, PROPIETARIA), [{ clave: 'nota', texto: 'Nota: Trae su esterilla', aviso: false }]);
  assert.deepEqual(piezasDeTarjeta(t, { ...BASE, notaFijada: '   ' }, PROPIETARIA), []);
});

test('la nota fijada de cada alumna: la más reciente de EQUIPO, nunca privada, de sistema ni sin fijar', () => {
  const n = (socioId: string, texto: string, creadoEn: string, extra: Record<string, unknown> = {}) =>
    ({ socioId, texto, tipo: 'NOTA', fijada: true, creadoEn, visibilidad: 'EQUIPO', ...extra });
  const m = notaFijadaPorSocia([
    n('a', 'vieja', '2026-01-01'),
    n('a', 'nueva', '2026-02-01'),
    n('a', 'sin fijar', '2026-03-01', { fijada: false }),
    // La lista se mira en el iPad del mostrador: una privada no sale, aunque quien mira pueda leerla.
    n('a', 'privada', '2026-04-01', { visibilidad: 'PRIVADA' }),
    n('b', 'sistema', '2026-03-01', { tipo: 'SISTEMA' }),
  ]);
  assert.equal(m.get('a'), 'nueva');
  assert.equal(m.has('b'), false);
});

const PLAN_BONO: PlanTarifa = { id: 'pl-b', nombre: 'Bono 10', tipo: 'BONO', tiposClaseIds: [] } as unknown as PlanTarifa;
const sus = (extra: Partial<Suscripcion>): Suscripcion =>
  ({ id: 'sus-1', socioId: 'a', planId: 'pl-b', estado: 'ACTIVA', fechaFin: '2026-12-31', sesionesRestantes: 0, ...extra }) as Suscripcion;
const SIN_PLAN = { estado: 'SIN_PLAN', precio: 15 } as const;
const vacia = { marca: null, claseSuelta: false, pagoCon: null, bonoAgotado: null } as const;

test('con qué viene: lo que tiene hoy y cubre la clase, como en el mostrador', () => {
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: { estado: 'BONO', planNombre: 'Bono 10', sesionesRestantes: 3 } }), { texto: 'Bono 10 · le quedan 3', aviso: false });
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: { estado: 'MENSUAL', planNombre: 'Mensual' } }), { texto: 'Con su Mensual', aviso: false });
  // Sin nada que la pague: lo que diría el mostrador, como aviso.
  assert.equal(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN })?.aviso, true);
});

test('con qué viene: una reserva ya pagada nunca sale como aviso', () => {
  // Gastó la última sesión en ESTA clase: «le quedan 0», nunca «no tiene bono».
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN, pagoCon: { planNombre: 'Bono 10', sesionesRestantes: 0, vigente: true } }),
    { texto: 'Bono 10 · le quedan 0', aviso: false });
  // El bono que la pagó caducó o se pausó después: la clase sigue pagada.
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN, pagoCon: { planNombre: 'Bono 10', sesionesRestantes: 3, vigente: false } }),
    { texto: 'Pagada con Bono 10', aviso: false });
  // Hecha en esta sesión (sin `bonoSuscripcionId` aún) con el último del bono.
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN, bonoAgotado: { planNombre: 'Bono 10' } }), { texto: 'Bono 10 · le quedan 0', aviso: false });
  assert.deepEqual(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN, claseSuelta: true }), { texto: 'Clase suelta', aviso: false });
  // La recuperación ya la nombra la fila: nada que añadir, y nada contradictorio.
  assert.equal(conQueVieneFila({ ...vacia, cobertura: SIN_PLAN, marca: 'recuperacion' }), null);
  // Si tiene otro bono que cubre la clase, manda lo que tiene.
  assert.equal(conQueVieneFila({ ...vacia, cobertura: { estado: 'BONO', planNombre: 'Bono 5', sesionesRestantes: 5 }, pagoCon: { planNombre: 'Bono 10', sesionesRestantes: 0, vigente: true } })?.texto, 'Bono 5 · le quedan 5');
});

test('el bono que pagó la reserva, tal como está hoy', () => {
  assert.deepEqual(pagoConocido('sus-1', [sus({})], [PLAN_BONO], '2026-10-13'), { planNombre: 'Bono 10', sesionesRestantes: 0, vigente: true });
  assert.equal(pagoConocido('sus-1', [sus({ fechaFin: '2026-10-01' })], [PLAN_BONO], '2026-10-13')?.vigente, false);
  assert.equal(pagoConocido('sus-1', [sus({ estado: 'PAUSADA' })], [PLAN_BONO], '2026-10-13')?.vigente, false);
  assert.equal(pagoConocido(null, [sus({})], [PLAN_BONO], '2026-10-13'), null);
  assert.equal(pagoConocido('otra', [sus({})], [PLAN_BONO], '2026-10-13'), null);
});

test('un bono suyo agotado que cubre la clase: vigente, a 0 y del tipo de clase', () => {
  const d = { socioId: 'a', planesTarifa: [PLAN_BONO], hoyISO: '2026-10-13', tipoClaseId: 'tc-1' };
  assert.deepEqual(bonoAgotadoQueCubre({ ...d, suscripciones: [sus({})] }), { planNombre: 'Bono 10' });
  assert.equal(bonoAgotadoQueCubre({ ...d, suscripciones: [sus({ sesionesRestantes: 2 })] }), null);
  assert.equal(bonoAgotadoQueCubre({ ...d, suscripciones: [sus({ fechaFin: '2026-10-01' })] }), null);
  assert.equal(bonoAgotadoQueCubre({ ...d, suscripciones: [sus({ socioId: 'b' })] }), null);
  const soloOtroTipo = { ...PLAN_BONO, tiposClaseIds: ['tc-2'] } as unknown as PlanTarifa;
  assert.equal(bonoAgotadoQueCubre({ ...d, planesTarifa: [soloOtroTipo], suscripciones: [sus({})] }), null);
});

test('cumpleaños con el día de la clase en Madrid, y el 29 de febrero el 28 si no es bisiesto', () => {
  assert.equal(esSuCumpleanos('03-14', '2026-03-14'), true);
  assert.equal(esSuCumpleanos('03-14', '2026-03-15'), false);
  assert.equal(esSuCumpleanos('02-29', '2027-02-28'), true);
  assert.equal(esSuCumpleanos('02-29', '2028-02-28'), false);
  assert.equal(esSuCumpleanos('02-29', '2028-02-29'), true);
  assert.equal(esSuCumpleanos(null, '2026-03-14'), false);
  assert.equal(esSuCumpleanos('3-14', '2026-03-14'), false);
  assert.equal(textoCumpleanos('03-14', '2026-03-14', '2026-03-14'), 'Hoy es su cumpleaños');
  assert.equal(textoCumpleanos('03-14', '2026-03-14', '2026-03-10'), 'Cumple años ese día');
  assert.equal(textoCumpleanos('03-15', '2026-03-14', '2026-03-14'), null);
});

test('primera vez: solo con el histórico cargado y nunca a quien trae historial o no tiene ficha', () => {
  const base = { historialCargado: true, historialPrevio: false, primeraReserva: '2026-03-14T09:00:00Z', inicioClase: '2026-03-14T09:00:00Z' };
  assert.equal(esPrimeraVez(base), true);
  assert.equal(esPrimeraVez({ ...base, primeraReserva: null }), true);
  assert.equal(esPrimeraVez({ ...base, primeraReserva: '2026-03-01T09:00:00Z' }), false);
  assert.equal(esPrimeraVez({ ...base, historialCargado: false }), false);
  assert.equal(esPrimeraVez({ ...base, historialPrevio: true }), false);
  assert.equal(esPrimeraVez({ ...base, historialPrevio: null }), false);
});

test('una fila sin alumna del estudio (una plataforma) no lleva «con qué viene»', () => {
  assert.deepEqual(piezasDeTarjeta({ ...DE_SERIE, conQueViene: true }, BASE, PROPIETARIA), []);
});
