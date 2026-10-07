import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelableHastaWellhub, configWellhubDe, cuerpoSlotWellhub, fechaLocalWellhub, HUELLA_SIN_VENTA, huellaSlotWellhub, planificarHorarioWellhub,
  totalBookedWellhub, wellhubPublicaPorApi, type ClaseWellhubGuardada, type SesionParaWellhub, type SlotWellhubGuardado,
} from './horario.ts';

const CFG = { gymId: '100001', productId: 100003 };
// Martes 6-oct-2026 08:00 UTC; las clases, días después (horario de verano, +02:00).
const AHORA = Date.parse('2026-10-06T08:00:00Z');

function sesion(id: string, o: Partial<SesionParaWellhub> = {}): SesionParaWellhub {
  return {
    id, inicio: '2026-10-08T08:00:00Z', fin: '2026-10-08T08:55:00Z', cancelada: false, aforo: 10,
    tipoClaseId: 'tc-reformer', sala: 'Sala 1', instructora: 'Marta', cancelacionHoras: 12,
    cupo: 3, ocupadas: 0, ocupadasWellhub: 0, ...o,
  };
}
const TIPOS = [
  { id: 'tc-reformer', nombre: 'Reformer', descripcion: 'Pilates en máquina' },
  { id: 'tc-mat', nombre: 'Mat', descripcion: null },
];
const plan = (o: { sesiones: SesionParaWellhub[]; clases?: ClaseWellhubGuardada[]; slots?: SlotWellhubGuardado[] }) =>
  planificarHorarioWellhub({ sesiones: o.sesiones, tipos: TIPOS, clases: o.clases ?? [], slots: o.slots ?? [], config: CFG, ahora: AHORA });

function guardados(s: SesionParaWellhub): { clase: ClaseWellhubGuardada; slot: SlotWellhubGuardado } {
  const ops = plan({ sesiones: [s] });
  const clase = ops.find(o => o.tipo === 'crear-clase');
  const slot = ops.find(o => o.tipo === 'crear-slot');
  assert.ok(clase && clase.tipo === 'crear-clase' && slot && slot.tipo === 'crear-slot');
  return {
    clase: { tipoClaseId: clase.tipoClaseId, gymId: CFG.gymId, claseId: 'cl-1', visible: true, huella: clase.huella },
    slot: { sesionId: s.id, slotId: 'sl-1', claseId: 'cl-1', borrado: false, huella: slot.huella, ocupadasEnviadas: slot.cuerpo.total_booked },
  };
}

test('fecha: hora LOCAL del estudio con su offset, que cambia en verano e invierno', () => {
  assert.equal(fechaLocalWellhub('2026-10-08T08:00:00Z'), '2026-10-08T10:00:00+02:00');
  assert.equal(fechaLocalWellhub('2026-12-01T09:30:00Z'), '2026-12-01T10:30:00+01:00');
  // La noche del cambio de hora (25-oct-2026, 03:00 → 02:00).
  assert.equal(fechaLocalWellhub('2026-10-25T00:30:00Z'), '2026-10-25T02:30:00+02:00');
  assert.equal(fechaLocalWellhub('2026-10-25T01:30:00Z'), '2026-10-25T02:30:00+01:00');
});

test('cancelación: la ventana del tipo, como mucho 24 h (Wellhub no admite más); sin ventana, hasta el inicio', () => {
  const inicio = '2026-10-08T08:00:00Z';
  assert.equal(cancelableHastaWellhub(inicio, 12), '2026-10-07T22:00:00+02:00');
  assert.equal(cancelableHastaWellhub(inicio, 48), '2026-10-07T10:00:00+02:00');
  assert.equal(cancelableHastaWellhub(inicio, null), '2026-10-08T10:00:00+02:00');
});

test('plazas libres en Wellhub: nunca más de las que quedan de verdad ni de las cedidas', () => {
  // Aforo 10, cede 3: con la clase vacía, 3 libres (0 «reservadas»).
  assert.equal(totalBookedWellhub(3, 10, 0, 0), 0);
  // Una de Wellhub: 2 libres.
  assert.equal(totalBookedWellhub(3, 10, 1, 1), 1);
  // Las socias del estudio llenan 9 de 10 (una de Wellhub): queda 1 hueco en toda la clase.
  assert.equal(totalBookedWellhub(3, 10, 9, 1), 2);
  // Clase llena: 0 libres.
  assert.equal(totalBookedWellhub(3, 10, 10, 0), 3);
  // Sobrevendida (no debería pasar): sigue dentro de lo publicado.
  assert.equal(totalBookedWellhub(3, 10, 12, 4), 3);
});

test('config: gym numérico y producto; en manual no publica pero conserva los ids', () => {
  assert.deepEqual(configWellhubDe({ gymId: '100001', productId: '100003' }), CFG);
  assert.equal(configWellhubDe({ gymId: 'abc', productId: 1 }), null);
  assert.equal(configWellhubDe({ gymId: '1', productId: 0 }), null);
  assert.equal(wellhubPublicaPorApi({ modo: 'api', gymId: '1', productId: 2 }), true);
  assert.equal(wellhubPublicaPorApi({ modo: 'manual', gymId: '1', productId: 2 }), false);
});

test('cuerpo del slot: lo que pide su API, sin sala si es demasiado corta y sin instructora si no hay', () => {
  const c = cuerpoSlotWellhub(sesion('s1', { ocupadas: 2, ocupadasWellhub: 1 }), CFG);
  assert.deepEqual(c, {
    occur_date: '2026-10-08T10:00:00+02:00', room: 'Sala 1', status: 1, length_in_minutes: 55,
    total_capacity: 3, total_booked: 1, product_id: 100003, cancellable_until: '2026-10-07T22:00:00+02:00',
    instructors: [{ name: 'Marta', substitute: false }],
  });
  const sinSala = cuerpoSlotWellhub(sesion('s1', { sala: 'A', instructora: null }), CFG);
  assert.equal('room' in sinSala, false);
  assert.deepEqual(sinSala.instructors, []);
});

test('clase nueva con plazas cedidas: se crea su clase de Wellhub y después su slot', () => {
  const ops = plan({ sesiones: [sesion('s1')] });
  assert.deepEqual(ops.map(o => o.tipo), ['crear-clase', 'crear-slot']);
  const clase = ops[0];
  assert.ok(clase.tipo === 'crear-clase');
  assert.deepEqual(clase.cuerpo, {
    name: 'Reformer', description: 'Pilates en máquina', bookable: true, visible: true, product_id: 100003, reference: 'tc-reformer',
  });
});

test('sin plazas cedidas, cancelada, empezada o más allá de dos semanas: no se publica', () => {
  assert.deepEqual(plan({ sesiones: [sesion('s1', { cupo: null })] }), []);
  assert.deepEqual(plan({ sesiones: [sesion('s1', { cupo: 0 })] }), []);
  assert.deepEqual(plan({ sesiones: [sesion('s1', { cancelada: true })] }), []);
  assert.deepEqual(plan({ sesiones: [sesion('s1', { inicio: '2026-10-06T07:30:00Z', fin: '2026-10-06T08:25:00Z' })] }), []);
  assert.deepEqual(plan({ sesiones: [sesion('s1', { inicio: '2026-10-30T08:00:00Z', fin: '2026-10-30T08:55:00Z' })] }), []);
  // Sin tipo de clase no hay clase de Wellhub de la que colgar.
  assert.deepEqual(plan({ sesiones: [sesion('s1', { tipoClaseId: null })] }), []);
});

test('ya publicada y sin cambios: nada; solo cambia la ocupación: PATCH de aforo, no PUT', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  assert.deepEqual(plan({ sesiones: [s], clases: [clase], slots: [slot] }), []);
  const ops = plan({ sesiones: [{ ...s, ocupadas: 9, ocupadasWellhub: 1 }], clases: [clase], slots: [slot] });
  assert.deepEqual(ops, [{ tipo: 'aforo-slot', sesionId: 's1', claseId: 'cl-1', slotId: 'sl-1', total_capacity: 3, total_booked: 2 }]);
});

test('cambia la hora o la instructora: se edita el slot entero (Wellhub deja mover la hora)', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const movida = { ...s, inicio: '2026-10-08T09:00:00Z', fin: '2026-10-08T09:55:00Z' };
  const ops = plan({ sesiones: [movida], clases: [clase], slots: [slot] });
  assert.equal(ops.length, 1);
  assert.ok(ops[0].tipo === 'editar-slot' && ops[0].cuerpo.occur_date === '2026-10-08T11:00:00+02:00');
  assert.equal(ops[0].huella, huellaSlotWellhub(ops[0].cuerpo));
});

test('cancelada en Tentare, sin plazas cedidas o borrada: su slot se borra allí (Wellhub cancela sus reservas)', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const borrar = { tipo: 'borrar-slot', sesionId: 's1', claseId: 'cl-1', slotId: 'sl-1' };
  assert.deepEqual(plan({ sesiones: [{ ...s, cancelada: true }], clases: [clase], slots: [slot] })[0], borrar);
  assert.deepEqual(plan({ sesiones: [{ ...s, cupo: null }], clases: [clase], slots: [slot] })[0], borrar);
  // Sesión borrada: el slot queda sin sesión y la sesión ya no llega.
  const huerfano = { ...slot, sesionId: null };
  const ops = plan({ sesiones: [], clases: [clase], slots: [huerfano] });
  assert.deepEqual(ops[0], { ...borrar, sesionId: null });
});

test('el tipo deja de tener plazas cedidas: se borran sus slots y su clase se oculta (no se borra)', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const ops = plan({ sesiones: [{ ...s, cupo: null }], clases: [clase], slots: [slot] });
  assert.deepEqual(ops.map(o => o.tipo), ['borrar-slot', 'ocultar-clase']);
  // Vuelve a tener plazas: la clase se vuelve a enseñar y el slot se crea otra vez.
  const vuelta = plan({ sesiones: [s], clases: [{ ...clase, visible: false }], slots: [{ ...slot, borrado: true }] });
  assert.deepEqual(vuelta.map(o => o.tipo), ['editar-clase', 'crear-slot']);
});

test('la sesión cambia de tipo de clase: su slot se borra de la clase vieja y se crea en la nueva', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const claseMat: ClaseWellhubGuardada = { tipoClaseId: 'tc-mat', gymId: CFG.gymId, claseId: 'cl-2', visible: true, huella: null };
  const ops = plan({ sesiones: [{ ...s, tipoClaseId: 'tc-mat' }], clases: [clase, claseMat], slots: [slot] });
  assert.deepEqual(ops.map(o => o.tipo), ['borrar-slot', 'ocultar-clase', 'editar-clase', 'crear-slot']);
  const crear = ops.find(o => o.tipo === 'crear-slot');
  assert.ok(crear && crear.tipo === 'crear-slot' && crear.tipoClaseId === 'tc-mat');
});

test('una clase de Wellhub por tipo aunque haya varias sesiones; y lo que quita plazas va antes que lo que crea', () => {
  const ops = plan({
    sesiones: [sesion('s1'), sesion('s2', { inicio: '2026-10-09T08:00:00Z', fin: '2026-10-09T08:55:00Z' })],
    slots: [{ sesionId: null, slotId: 'viejo', claseId: 'cl-x', borrado: false, huella: null, ocupadasEnviadas: null }],
  });
  assert.deepEqual(ops.map(o => o.tipo), ['borrar-slot', 'crear-clase', 'crear-slot', 'crear-slot']);
});

test('⚠️ deja de ceder plazas con socias de Wellhub ya apuntadas: no se borra (cancelaría sus reservas), se deja de vender', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const conDos = { ...s, cupo: null, ocupadas: 4, ocupadasWellhub: 2 };
  const ops = plan({ sesiones: [conDos], clases: [clase], slots: [slot] });
  assert.deepEqual(ops, [{
    tipo: 'aforo-slot', sesionId: 's1', claseId: 'cl-1', slotId: 'sl-1', total_capacity: 2, total_booked: 2, huella: HUELLA_SIN_VENTA,
  }]);
  // Ya parado y sin cambios: nada que enviar (ni se oculta la clase, que aún tiene slot vivo).
  const parado = { ...slot, huella: HUELLA_SIN_VENTA, ocupadasEnviadas: 2 };
  assert.deepEqual(plan({ sesiones: [conDos], clases: [clase], slots: [parado] }), []);
  // Una de ellas cancela: se ajusta; las dos cancelan: entonces sí se borra.
  assert.equal(plan({ sesiones: [{ ...conDos, ocupadasWellhub: 1 }], clases: [clase], slots: [parado] })[0].tipo, 'aforo-slot');
  assert.equal(plan({ sesiones: [{ ...conDos, ocupadasWellhub: 0 }], clases: [clase], slots: [parado] })[0].tipo, 'borrar-slot');
  // Vuelve a ceder plazas: se reescribe entero (la huella de «parado» no casa con ninguna).
  assert.equal(plan({ sesiones: [{ ...s, ocupadasWellhub: 2 }], clases: [clase], slots: [parado] })[0].tipo, 'editar-slot');
});

test('⚠️ clase cancelada en Tentare: su slot se borra aunque tenga socias de Wellhub (la clase no se da)', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const ops = plan({ sesiones: [{ ...s, cancelada: true, ocupadasWellhub: 2 }], clases: [clase], slots: [slot] });
  assert.equal(ops[0].tipo, 'borrar-slot');
});

test('⚠️ cambia de tipo con socias de Wellhub ya apuntadas: el slot no se mueve (moverlo cancelaría sus reservas) y deja de vender', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const claseMat: ClaseWellhubGuardada = { tipoClaseId: 'tc-mat', gymId: CFG.gymId, claseId: 'cl-2', visible: true, huella: null };
  const movida = { ...s, tipoClaseId: 'tc-mat', ocupadasWellhub: 1 };
  const ops = plan({ sesiones: [movida], clases: [clase, claseMat], slots: [slot] });
  assert.equal(ops.some(o => o.tipo === 'borrar-slot'), false);
  assert.equal(ops.some(o => o.tipo === 'crear-slot'), false);
  // Lo que entrara en la clase vieja sería otra clase: no se vende más ahí.
  assert.deepEqual(ops.filter(o => o.tipo === 'aforo-slot'), [{
    tipo: 'aforo-slot', sesionId: 's1', claseId: 'cl-1', slotId: 'sl-1', total_capacity: 1, total_booked: 1, huella: HUELLA_SIN_VENTA,
  }]);
  // Ya parada: no se repite.
  const parado = { ...slot, huella: HUELLA_SIN_VENTA, ocupadasEnviadas: 1 };
  assert.equal(plan({ sesiones: [movida], clases: [clase, claseMat], slots: [parado] }).some(o => o.tipo === 'aforo-slot'), false);
});

test('el estudio deja de vender en Wellhub: se retira todo con las mismas reglas (lo que tiene socias, se deja de vender)', () => {
  const s1 = sesion('s1');
  const { clase, slot } = guardados(s1);
  const s2 = sesion('s2', { inicio: '2026-10-09T08:00:00Z', fin: '2026-10-09T08:55:00Z', ocupadasWellhub: 1 });
  const slot2 = { ...slot, sesionId: 's2', slotId: 'sl-2' };
  const ops = planificarHorarioWellhub({
    sesiones: [s1, s2], tipos: TIPOS, clases: [clase], slots: [slot, slot2], config: CFG, ahora: AHORA, publicar: false,
  });
  assert.deepEqual(ops.map(o => o.tipo), ['borrar-slot', 'aforo-slot']);
});

test('cambió de gym: lo publicado en el gym viejo se retira y se publica en el nuevo', () => {
  const s = sesion('s1');
  const { clase, slot } = guardados(s);
  const viejo = { ...clase, gymId: '999' };
  const ops = planificarHorarioWellhub({
    sesiones: [s], tipos: TIPOS, clases: [viejo], slots: [slot], config: CFG, ahora: AHORA,
  });
  assert.deepEqual(ops.map(o => o.tipo), ['borrar-slot', 'ocultar-clase', 'crear-clase', 'crear-slot']);
});

test('⚠️ cambió de gym con socias de Wellhub en un slot del gym viejo: deja de vender allí y su clase no se oculta', () => {
  const s = sesion('s1', { ocupadasWellhub: 2 });
  const { clase, slot } = guardados(s);
  const viejo = { ...clase, gymId: '999' };
  const ops = planificarHorarioWellhub({
    sesiones: [s], tipos: TIPOS, clases: [viejo], slots: [slot], config: CFG, ahora: AHORA,
  });
  // La clase del gym nuevo se crea; el slot viejo se queda (con sus reservas) sin vender, y su clase sigue visible.
  assert.deepEqual(ops.map(o => o.tipo), ['crear-clase', 'aforo-slot']);
  const aforo = ops.find(o => o.tipo === 'aforo-slot');
  assert.ok(aforo && aforo.tipo === 'aforo-slot' && aforo.claseId === 'cl-1' && aforo.total_capacity === 2 && aforo.huella === HUELLA_SIN_VENTA);
});
