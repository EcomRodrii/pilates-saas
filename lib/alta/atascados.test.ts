import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertasAtascadas, diasSinActividad, estadoAtasco, filaAtascadaDesdeBd, mailtoContacto, motivoProbable,
  resumirAtascados, situacionDeAlerta, validarPeticionSeguimiento, UMBRAL_DIAS_ATASCO,
  type FilaAtascada,
} from './atascados.ts';

const HOY = '2026-11-20';
const base = (o: Partial<FilaAtascada> = {}): FilaAtascada => ({
  clave: '11111111-1111-4111-8111-111111111111', studioId: 's1', nombre: 'Estudio Prueba', email: 'a@example.com',
  altaEn: '2026-11-10T10:00:00Z', emailConfirmadoEn: '2026-11-10T10:05:00Z', estudioCreadoEn: '2026-11-10T10:10:00Z',
  ultimoAccesoEn: null, ultimaActividadEn: '2026-11-10T10:10:00Z', tieneTipoClase: false, tieneClase: false,
  tieneTarifaActiva: false, claseReservable: false, tieneReserva: false, errorEstudioEn: null, version: 'v2', seguimiento: null, ...o,
});

test('estado: recorre el alta en orden', () => {
  assert.equal(estadoAtasco(base({ emailConfirmadoEn: null, estudioCreadoEn: null })), 'sin_confirmar');
  assert.equal(estadoAtasco(base({ estudioCreadoEn: null })), 'sin_estudio');
  assert.equal(estadoAtasco(base()), 'sin_clase');
  assert.equal(estadoAtasco(base({ tieneClase: true })), 'sin_enlace');
  assert.equal(estadoAtasco(base({ tieneClase: true, claseReservable: true })), 'activado');
  assert.equal(estadoAtasco(base({ tieneReserva: true })), 'activado');
});

test('umbral: menos de 3 días no alerta, 3 sí; activado nunca', () => {
  assert.equal(alertasAtascadas([base({ ultimaActividadEn: '2026-11-18T09:00:00Z' })], HOY).length, 0); // 2 días
  assert.equal(alertasAtascadas([base({ ultimaActividadEn: '2026-11-17T09:00:00Z' })], HOY).length, 1); // 3 días
  assert.equal(alertasAtascadas([base({ claseReservable: true })], HOY).length, 0);
  assert.equal(UMBRAL_DIAS_ATASCO, 3);
});

test('el último acceso cuenta como actividad: quien entró ayer no está atascado', () => {
  const f = base({ ultimoAccesoEn: '2026-11-19T20:00:00Z' });
  assert.equal(diasSinActividad(f, HOY), 1);
  assert.equal(alertasAtascadas([f], HOY).length, 0);
});

test('sin duplicados: una alerta por cuenta', () => {
  assert.equal(alertasAtascadas([base(), base()], HOY).length, 1);
});

test('seguimiento: cerrada y pospuesta no molestan; pospuesta vuelve su día', () => {
  const seg = (accion: 'cerrada' | 'pospuesta' | 'contactado' | 'reabierta', creadoEn: string, hasta: string | null = null) =>
    base({ seguimiento: { accion, creadoEn, hasta, nota: null } });
  assert.equal(situacionDeAlerta(seg('cerrada', '2026-11-18T10:00:00Z'), HOY), 'cerrada');
  assert.equal(situacionDeAlerta(seg('pospuesta', '2026-11-18T10:00:00Z', '2026-11-25'), HOY), 'pospuesta');
  assert.equal(situacionDeAlerta(seg('pospuesta', '2026-11-18T10:00:00Z', '2026-11-20'), HOY), 'pendiente');
  assert.equal(situacionDeAlerta(seg('reabierta', '2026-11-18T10:00:00Z'), HOY), 'pendiente');
});

test('contactada: no pide nada hasta pasados 7 días sin avanzar; si avanzó, sigue contactada', () => {
  const contactada = (creadoEn: string, act: string) =>
    base({ ultimaActividadEn: act, seguimiento: { accion: 'contactado', creadoEn, hasta: null, nota: null } });
  assert.equal(situacionDeAlerta(contactada('2026-11-18T10:00:00Z', '2026-11-10T10:00:00Z'), HOY), 'contactada');
  assert.equal(situacionDeAlerta(contactada('2026-11-12T10:00:00Z', '2026-11-10T10:00:00Z'), HOY), 'pendiente');
  assert.equal(situacionDeAlerta(contactada('2026-11-12T10:00:00Z', '2026-11-15T10:00:00Z'), HOY), 'contactada');
});

test('orden: pendientes antes que contactadas, y más días primero', () => {
  const a = base({ clave: '22222222-2222-4222-8222-222222222222', ultimaActividadEn: '2026-11-01T10:00:00Z',
    seguimiento: { accion: 'contactado', creadoEn: '2026-11-19T10:00:00Z', hasta: null, nota: null } });
  const b = base({ clave: '33333333-3333-4333-8333-333333333333', ultimaActividadEn: '2026-11-16T10:00:00Z' });
  const c = base({ clave: '44444444-4444-4444-8444-444444444444', ultimaActividadEn: '2026-11-12T10:00:00Z' });
  const r = alertasAtascadas([a, b, c], HOY);
  assert.deepEqual(r.map(x => x.fila.clave.slice(0, 1)), ['4', '3', '2']);
  assert.deepEqual(resumirAtascados(r), { pendientes: 2, contactadas: 1, pospuestas: 0, cerradas: 0 });
});

test('motivo: solo con hechos medidos; sin hechos, null', () => {
  assert.match(motivoProbable(base({ emailConfirmadoEn: null, estudioCreadoEn: null }))!, /código/);
  assert.match(motivoProbable(base({ estudioCreadoEn: null, errorEstudioEn: '2026-11-10T10:08:00Z' }))!, /Falló/);
  assert.match(motivoProbable(base({ tieneClase: true }))!, /tarifa/);
  assert.equal(motivoProbable(base({ claseReservable: true })), null);
});

test('el día se cuenta en Madrid, no en UTC', () => {
  // 23:30 UTC del 17 ya es el 18 en Madrid (UTC+1): 2 días hasta el 20, no 3.
  assert.equal(diasSinActividad(base({ ultimaActividadEn: '2026-11-17T23:30:00Z' }), HOY), 2);
});

test('filaDesdeBd: descarta lo que no es fila y no se fía de los tipos', () => {
  assert.equal(filaAtascadaDesdeBd(null), null);
  assert.equal(filaAtascadaDesdeBd({ clave: 'x' }), null);
  const f = filaAtascadaDesdeBd({ clave: '11111111-1111-4111-8111-111111111111', alta_en: '2026-11-10T10:00:00Z', seg_accion: 'rara', seg_creado_en: '2026-11-11T10:00:00Z' });
  assert.equal(f?.seguimiento, null);
  assert.equal(f?.claseReservable, false);
});

test('validar petición: acción, uuid, días y nota', () => {
  const ok = validarPeticionSeguimiento({ clave: '11111111-1111-4111-8111-111111111111', accion: 'pospuesta', dias: 7 });
  assert.equal(ok.ok, true);
  assert.equal(validarPeticionSeguimiento({ clave: 'no', accion: 'cerrada' }).ok, false);
  assert.equal(validarPeticionSeguimiento({ clave: '11111111-1111-4111-8111-111111111111', accion: 'borrar' }).ok, false);
  assert.equal(validarPeticionSeguimiento({ clave: '11111111-1111-4111-8111-111111111111', accion: 'pospuesta', dias: 90 }).ok, false);
  assert.equal(validarPeticionSeguimiento({ clave: '11111111-1111-4111-8111-111111111111', accion: 'pospuesta' }).ok, false);
  assert.equal(validarPeticionSeguimiento({ clave: '11111111-1111-4111-8111-111111111111', accion: 'cerrada', nota: 'x'.repeat(501) }).ok, false);
});

test('mailto: sin email no hay enlace; con email sale cifrado y sin tono comercial', () => {
  const [a] = alertasAtascadas([base({ ultimaActividadEn: '2026-11-01T10:00:00Z' })], HOY);
  const url = mailtoContacto(a)!;
  assert.ok(url.startsWith('mailto:a@example.com?subject='));
  assert.doesNotMatch(decodeURIComponent(url), /oferta|descuento|promoci/i);
  assert.equal(mailtoContacto({ ...a, fila: { ...a.fila, email: null } }), null);
});
