import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirPlazaAntesDeCobrar, decidirPlazaInvitadaSinFicha, MENSAJES_PLAZA, type EvaluacionReserva,
} from './plaza-antes-de-cobrar.ts';

// P06 · Fase A: antes de cobrar una clase se pregunta lo mismo que preguntará la reserva.
// Cada código es un 409 SIN PaymentIntent, sin matrícula y sin cupo.

const sinPlan: EvaluacionReserva = { puede: false, codigo: 'sin-plan' };
const confirmada: EvaluacionReserva = { puede: true, codigo: null, estado: 'CONFIRMADA', pagador: { origen: 'ninguno' } };
const base = { requiereAprobacion: false, conDerecho: sinPlan, paraReservar: confirmada, topes: null };

test('sin derecho y con plaza: se puede cobrar', () => {
  assert.deepEqual(decidirPlazaAntesDeCobrar(base), { ok: true });
});

test('ya la tiene cubierta (bono, cuota, recuperación, o la cola con su bono): no se le vende nada', () => {
  for (const origen of ['bono', 'cuota', 'recuperacion']) {
    const r = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: true, codigo: null, estado: 'CONFIRMADA', pagador: { origen } } });
    assert.equal(r.ok ? null : r.codigo, 'ya-cubierta', origen);
  }
  const cola = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: true, codigo: null, estado: 'LISTA_ESPERA', pagador: { origen: 'ninguno' } } });
  assert.equal(cola.ok ? null : cola.codigo, 'ya-cubierta');
  // Con tope semanal superado y una recuperación, `reservar_plaza` la gastaría: también cubierta.
  const rec = decidirPlazaAntesDeCobrar({ ...base, paraReservar: { ...confirmada, pagador: { origen: 'recuperacion' } } });
  assert.equal(rec.ok ? null : rec.codigo, 'ya-cubierta');
});

test('cada motivo de la primera pasada (que no es «no tiene plan») es su 409', () => {
  for (const codigo of ['impago', 'ya-reservada', 'conflicto-horario', 'limite-semanal', 'limite-semanal-actividad', 'necesita-autorizacion', 'estudio-cerrado']) {
    const r = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: false, codigo } });
    assert.deepEqual(r, { ok: false, codigo, error: MENSAJES_PLAZA[codigo as keyof typeof MENSAJES_PLAZA] }, codigo);
  }
});

test('el impago se mira ANTES de cobrar (decisión del fundador)', () => {
  const r = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: false, codigo: 'impago' } });
  assert.equal(r.ok ? null : r.codigo, 'impago');
  assert.match(r.ok ? '' : r.error, /No te hemos cobrado nada/);
});

test('llena: no se cobra para ir a la cola (Fase A), y se dice su posición; sin espera, «aforo-lleno»', () => {
  const r = decidirPlazaAntesDeCobrar({ ...base, paraReservar: { puede: true, codigo: null, estado: 'LISTA_ESPERA', posicion_espera: 3 } });
  assert.deepEqual(r, { ok: false, codigo: 'llena-con-espera', error: MENSAJES_PLAZA['llena-con-espera'], posicionEspera: 3 });
  const s = decidirPlazaAntesDeCobrar({ ...base, paraReservar: { puede: false, codigo: 'aforo-lleno' } });
  assert.equal(s.ok ? null : s.codigo, 'aforo-lleno');
});

test('el sitio y los topes de TypeScript también paran el cobro', () => {
  const sp = decidirPlazaAntesDeCobrar({ ...base, paraReservar: { puede: false, codigo: 'spot-ocupado' } });
  assert.equal(sp.ok ? null : sp.codigo, 'spot-ocupado');
  for (const topes of ['max-simultaneas', 'max-por-dia'] as const) {
    const r = decidirPlazaAntesDeCobrar({ ...base, topes });
    assert.equal(r.ok ? null : r.codigo, topes);
  }
});

test('con aprobación del estudio no se vende en Fase A', () => {
  const r = decidirPlazaAntesDeCobrar({ ...base, requiereAprobacion: true });
  assert.equal(r.ok ? null : r.codigo, 'requiere-aprobacion');
});

test('un código que no conocemos no se inventa: «error», que tampoco cobra', () => {
  const r = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: false, codigo: 'algo-nuevo' } });
  assert.equal(r.ok ? null : r.codigo, 'error');
});

test('invitada con ficha: lo personal sale neutro («necesita-entrar»); lo de la clase, tal cual', () => {
  const impago = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: false, codigo: 'impago' }, invitadaConFicha: true });
  assert.equal(impago.ok ? null : impago.codigo, 'necesita-entrar', 'no se le dice a quien solo conoce un email que esa persona debe dinero');
  const ya = decidirPlazaAntesDeCobrar({ ...base, conDerecho: { puede: false, codigo: 'ya-reservada' }, invitadaConFicha: true });
  assert.equal(ya.ok ? null : ya.codigo, 'necesita-entrar');
  const llena = decidirPlazaAntesDeCobrar({ ...base, paraReservar: { puede: true, codigo: null, estado: 'LISTA_ESPERA', posicion_espera: 1 }, invitadaConFicha: true });
  assert.equal(llena.ok ? null : llena.codigo, 'llena-con-espera');
  assert.deepEqual(decidirPlazaAntesDeCobrar({ ...base, invitadaConFicha: true }), { ok: true });
});

test('invitada sin ficha: solo la clase', () => {
  const b = { requiereAprobacion: false, aforo: 10, ocupadas: 3, permiteListaEspera: true };
  assert.deepEqual(decidirPlazaInvitadaSinFicha(b), { ok: true });
  const llena = decidirPlazaInvitadaSinFicha({ ...b, ocupadas: 10, enEspera: 2 });
  assert.deepEqual(llena, { ok: false, codigo: 'llena-con-espera', error: MENSAJES_PLAZA['llena-con-espera'], posicionEspera: 3 });
  assert.equal((decidirPlazaInvitadaSinFicha({ ...b, ocupadas: 10, permiteListaEspera: false }) as { codigo: string }).codigo, 'aforo-lleno');
  assert.equal((decidirPlazaInvitadaSinFicha({ ...b, spot: 'ocupado' }) as { codigo: string }).codigo, 'spot-ocupado');
  assert.equal((decidirPlazaInvitadaSinFicha({ ...b, spot: 'no-disponible' }) as { codigo: string }).codigo, 'spot-no-disponible');
  assert.deepEqual(decidirPlazaInvitadaSinFicha({ ...b, aforo: null, ocupadas: 99 }), { ok: true }, 'sin tope de aforo');
  assert.equal((decidirPlazaInvitadaSinFicha({ ...b, requiereAprobacion: true }) as { codigo: string }).codigo, 'requiere-aprobacion');
});

test('todos los mensajes dicen que no se ha cobrado nada', () => {
  for (const [codigo, texto] of Object.entries(MENSAJES_PLAZA)) assert.match(texto, /no te hemos cobrado nada/i, codigo);
});

test('⚠️ invitada sin ficha: las plazas apartadas para ClassPass también llenan la clase (no se le cobra una plaza que no puede tener)', () => {
  const b = { requiereAprobacion: false, aforo: 4, ocupadas: 2, permiteListaEspera: true };
  assert.deepEqual(decidirPlazaInvitadaSinFicha({ ...b, apartadas: 1 }), { ok: true });
  const llena = decidirPlazaInvitadaSinFicha({ ...b, apartadas: 2, enEspera: 0 });
  assert.equal(llena.ok, false);
  assert.equal(!llena.ok && llena.codigo, 'llena-con-espera');
  const sinEspera = decidirPlazaInvitadaSinFicha({ ...b, permiteListaEspera: false, apartadas: 2 });
  assert.equal(!sinEspera.ok && sinEspera.codigo, 'aforo-lleno');
});
