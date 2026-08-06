import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularReversion, huellaDe, type Snapshot, type SuscripcionActual } from './preview-reversion.ts';

// Esto decide si a la propietaria se le ofrece un botón que quita servicio ya
// pagado. Prometer exactitud donde no la hay es peor que no ofrecer nada, así
// que la mayoría de estos tests son sobre cuándo NO hay que ofrecerlo.

const BONO_ENTREGADO: Snapshot = {
  tipo: 'BONO', aplicada: true,
  sesionesAntes: 0, sesionesDespues: 10,
  fechaFinAntes: '2026-09-01', fechaFinDespues: '2026-09-01',
  estadoAntes: 'EXPIRADA',
};

const actual = (s: Partial<SuscripcionActual>): SuscripcionActual =>
  ({ sesionesRestantes: 10, fechaFin: '2026-09-01', estado: 'ACTIVA', ...s });

// ── Cuándo NO se ofrece ─────────────────────────────────────────────────────

test('cobro anterior al snapshot: no se sabe qué entregó, no se ofrece', () => {
  const r = calcularReversion({ snapshot: { ...BONO_ENTREGADO, aplicada: null }, actual: actual({}) });
  assert.equal(r.posible, false);
  assert.equal(r.motivo, 'SIN_INSTRUMENTAR');
});

test('el cobro no entregó nada: ofrecerlo sería quitar sesiones que no puso', () => {
  // El bono aún tenía saldo, así que la renovación fue un no-op.
  const r = calcularReversion({ snapshot: { ...BONO_ENTREGADO, aplicada: false }, actual: actual({}) });
  assert.equal(r.posible, false);
  assert.equal(r.motivo, 'SIN_ENTREGA');
});

test('alguien recargó el bono por otro lado: ya no es exacto', () => {
  // Saldo POR ENCIMA de lo que dejó la entrega = interferencia.
  const r = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 15 }) });
  assert.equal(r.posible, false);
  assert.equal(r.motivo, 'ESTADO_CAMBIADO');
});

test('la fecha del mensual se ha movido desde la entrega: no se adivina', () => {
  // Otra renovación, o una descongelación (migr 0079) empujando la fecha.
  // Restar un mes aquí sería inventar.
  const mensual: Snapshot = {
    tipo: 'MENSUAL', aplicada: true, sesionesAntes: null, sesionesDespues: null,
    fechaFinAntes: '2026-02-28', fechaFinDespues: '2026-03-31', estadoAntes: 'EXPIRADA',
  };
  const r = calcularReversion({ snapshot: mensual, actual: actual({ fechaFin: '2026-04-30' }) });
  assert.equal(r.posible, false);
  assert.equal(r.motivo, 'ESTADO_CAMBIADO');
});

// ── Cuándo sí, y con qué números ────────────────────────────────────────────

test('bono sin tocar: vuelve a 0 y restaura el estado anterior', () => {
  const r = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 10 }) });
  assert.equal(r.posible, true);
  assert.equal(r.objetivo?.sesionesRestantes, 0);
  assert.equal(r.objetivo?.estado, 'EXPIRADA', 'la renovación lo pisó a ACTIVA sin leerlo');
  assert.equal(r.consumidasDesde, 0);
});

test('⚠️ ha usado 3 de 10: se puede revertir, PERO se le dice a la propietaria', () => {
  // Este aviso es lo que más valor aporta de toda la función: es lo que hace
  // que elija un reembolso parcial en Stripe en vez de revertir.
  const r = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 7 }) });
  assert.equal(r.posible, true);
  // Delta (10), no "= antes": max(0, 7-10) = 0.
  assert.equal(r.objetivo?.sesionesRestantes, 0);
  assert.equal(r.consumidasDesde, 3);
  assert.match(r.avisos.join(' '), /3 sesiones/);
  assert.match(r.avisos.join(' '), /sin pagar/);
});

test('mensual: restaura la fecha que había, y avisa si ya pasó', () => {
  const mensual: Snapshot = {
    tipo: 'MENSUAL', aplicada: true, sesionesAntes: null, sesionesDespues: null,
    fechaFinAntes: '2020-01-01', fechaFinDespues: '2026-03-31', estadoAntes: 'EXPIRADA',
  };
  const r = calcularReversion({ snapshot: mensual, actual: actual({ fechaFin: '2026-03-31' }) });
  assert.equal(r.posible, true);
  assert.equal(r.objetivo?.fechaFin, '2020-01-01');
  assert.match(r.avisos.join(' '), /sin plan activo/i);
});

test('compra por enlace público: se cancela, pero NO se borra la ficha', () => {
  const alta: Snapshot = {
    tipo: 'ALTA_WEB', aplicada: true, sesionesAntes: null, sesionesDespues: 10,
    fechaFinAntes: null, fechaFinDespues: '2026-11-01', estadoAntes: null,
  };
  const r = calcularReversion({ snapshot: alta, actual: actual({ sesionesRestantes: 10 }) });
  assert.equal(r.posible, true);
  assert.equal(r.objetivo?.sesionesRestantes, 0);
  assert.equal(r.objetivo?.estado, 'CANCELADA');
  assert.match(r.avisos.join(' '), /ficha de la clienta NO se borra/i);
});

// ── La congelación ──────────────────────────────────────────────────────────

test('⚠️ suscripción PAUSADA: se ajusta el saldo pero NO se descongela', () => {
  // Descongelar en silencio es un bug que este repo ya cometió una vez. Una
  // reversión no puede reactivar un plan que alguien congeló a propósito.
  const r = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ estado: 'PAUSADA', sesionesRestantes: 10 }) });
  assert.equal(r.posible, true);
  assert.equal(r.objetivo?.sesionesRestantes, 0);
  assert.equal(r.objetivo?.estado, undefined, 'el estado no se toca');
  assert.match(r.avisos.join(' '), /congelada/i);
});

// ── La huella, que evita escribir algo que no se enseñó ─────────────────────

test('si los números cambian entre pintar y pulsar, la huella difiere', () => {
  const antes = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 10 }) });
  const despues = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 7 }) });
  // Mismo objetivo (0) en los dos, así que la huella coincide: lo que cambió es
  // el aviso, no lo que se va a escribir. Es correcto que no bloquee.
  assert.equal(huellaDe(antes), huellaDe(despues));
  // Pero si deja de ser posible, la huella sí cambia y el endpoint frenará.
  const interferido = calcularReversion({ snapshot: BONO_ENTREGADO, actual: actual({ sesionesRestantes: 15 }) });
  assert.notEqual(huellaDe(antes), huellaDe(interferido));
});
