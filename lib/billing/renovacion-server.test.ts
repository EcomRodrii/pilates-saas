import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarRenovacionServidor } from './renovacion-server.ts';

// El snapshot de la entrega es lo único que permitirá, cuando se devuelva el
// dinero, saber QUÉ habría que deshacer: `suscripciones` no tiene `updated_at`,
// ni triggers, ni histórico de sesiones.
//
// Lo que estos tests fijan, y que no se puede inferir de ningún otro sitio:
//  · `aplicada: false` cuando se evaluó y NO cambió nada — distinto de "no lo
//    sé", que es la ausencia de columna y aquí no se produce nunca.
//  · el DESPUÉS, no solo el antes: es lo que después permitirá detectar que
//    alguien tocó la suscripción entre la entrega y la devolución.

type Fila = Record<string, unknown>;

/** Supabase de mentira: sirve la suscripción y el plan, y guarda los updates. */
function fakeAdmin(opts: { sus: Fila; plan: Fila }) {
  const updates: Record<string, Fila[]> = { recibos: [], suscripciones: [] };
  const api = {
    from(tabla: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          if (tabla === 'recibos') return Promise.resolve({ data: { suscripcion_id: 'sus-1' }, error: null });
          if (tabla === 'suscripciones') return Promise.resolve({ data: opts.sus, error: null });
          if (tabla === 'planes_tarifa') return Promise.resolve({ data: opts.plan, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(fila: Fila) { updates[tabla]?.push(fila); return this; },
      };
    },
  };
  return { admin: api as never, updates };
}

const BONO = { tipo: 'BONO', sesiones: 10 };
const MENSUAL = { tipo: 'MENSUAL', sesiones: null };
const params = { studioId: 'studio-1', reciboId: 'rec-1' };

/** El snapshot que quedó escrito en el recibo. */
const snapshot = (u: Record<string, Fila[]>) => u.recibos[0];

test('bono agotado: recarga Y deja constancia de que el saldo previo era 0', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 0, fecha_fin: '2026-09-01', estado: 'EXPIRADA' },
    plan: BONO,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, true);
  assert.equal(r.tipo, 'BONO');
  assert.equal(updates.suscripciones.length, 1, 'tiene que recargar de verdad');

  const s = snapshot(updates);
  assert.equal(s.entrega_aplicada, true);
  assert.equal(s.entrega_sesiones_antes, 0);
  assert.equal(s.entrega_sesiones_despues, 10);
  // El estado previo se guarda porque la renovación lo pisa a ACTIVA sin leerlo:
  // sin esto no se podría restaurar.
  assert.equal(s.entrega_estado_antes, 'EXPIRADA');
  // La rama de bono NO toca fecha_fin: antes y después deben coincidir, o la
  // comprobación de interferencia daría un falso positivo.
  assert.equal(s.entrega_fecha_fin_antes, '2026-09-01');
  assert.equal(s.entrega_fecha_fin_despues, '2026-09-01');
});

test('bono con saldo: NO recarga, y lo deja escrito como "se evaluó y no cambió nada"', async () => {
  // Es el caso que hacía que un recibo COBRADO no probara que hubo entrega.
  // Sin esta distinción, después se ofrecería revertir algo que nunca ocurrió.
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: 3, fecha_fin: null, estado: 'ACTIVA' },
    plan: BONO,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, false);
  assert.equal(updates.suscripciones.length, 0, 'no debe tocar la suscripción');
  assert.equal(snapshot(updates).entrega_aplicada, false);
  assert.equal(snapshot(updates).entrega_sesiones_antes, 3);
  assert.equal(snapshot(updates).entrega_sesiones_despues, 3, 'antes y después iguales: no cambió nada');
});

test('mensual: extiende la fecha y guarda la de antes, que si no se pierde', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: '2026-01-15', estado: 'EXPIRADA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, true);
  assert.equal(r.tipo, 'MENSUAL');
  const s = snapshot(updates);
  assert.equal(s.entrega_fecha_fin_antes, '2026-01-15');
  assert.ok(s.entrega_fecha_fin_despues, 'la fecha nueva tiene que quedar guardada');
  assert.notEqual(s.entrega_fecha_fin_despues, s.entrega_fecha_fin_antes);
  assert.equal(s.entrega_estado_antes, 'EXPIRADA');
});

test('mensual ya extendido: no vuelve a extender, y lo deja escrito', async () => {
  const lejos = new Date();
  lejos.setFullYear(lejos.getFullYear() + 1);
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'plan-1', sesiones_restantes: null, fecha_fin: lejos.toISOString().slice(0, 10), estado: 'ACTIVA' },
    plan: MENSUAL,
  });
  const r = await aplicarRenovacionServidor(admin, params);

  assert.equal(r.aplicada, false, 'el guard de idempotencia sigue vivo');
  assert.equal(updates.suscripciones.length, 0);
  assert.equal(snapshot(updates).entrega_aplicada, false);
});

test('recibo sin suscripción (una penalización): NINGUNA, no en blanco', async () => {
  // Distinguir "no aplicaba" de "no se llegó a mirar" es lo que evita que
  // después se proponga revertir un cobro que no entregó ningún servicio.
  const api = {
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { suscripcion_id: null }, error: null }); },
        update(fila: Fila) { capturado.push(fila); return this; },
      };
    },
  };
  const capturado: Fila[] = [];
  const r = await aplicarRenovacionServidor(api as never, params);

  assert.equal(r.tipo, 'NINGUNA');
  assert.equal(r.aplicada, false);
  assert.equal(capturado[0].entrega_tipo, 'NINGUNA');
  assert.equal(capturado[0].entrega_aplicada, false);
});
