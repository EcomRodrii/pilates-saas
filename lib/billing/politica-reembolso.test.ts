import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarReembolso, sesionesConsumidas, diasDesdeCobro,
  type PoliticaReembolso, type ReciboParaReembolso,
} from './politica-reembolso.ts';

// Estas pruebas son la ÚNICA red de este flujo que corre en CI: el reembolso de
// verdad llama a Stripe, y en este repo ninguna prueba llega a la red (los e2e
// la mockean con `page.route`). Lo que no se compruebe aquí no lo comprueba
// nadie hasta que haya dinero de por medio.

const AHORA = new Date('2026-08-11T12:00:00Z');

const POLITICA_ABIERTA: PoliticaReembolso = { activos: true, plazoDias: 0, soloSinUsar: false };

function recibo(over: Partial<ReciboParaReembolso> = {}): ReciboParaReembolso {
  return {
    estado: 'COBRADO',
    importe: 60,
    fechaCobro: '2026-08-10T09:00:00Z',
    sesionesAlEntregar: null,
    sesionesRestantesHoy: null,
    ...over,
  };
}

test('con la política abierta, un recibo cobrado se puede devolver', () => {
  assert.deepEqual(evaluarReembolso(POLITICA_ABIERTA, recibo(), AHORA), { permitido: true });
});

test('apagada por defecto: no se devuelve nada hasta que el estudio la active', () => {
  const v = evaluarReembolso({ ...POLITICA_ABIERTA, activos: false }, recibo(), AHORA);
  assert.equal(v.permitido, false);
  assert.equal(v.motivo, 'DESACTIVADA');
  // El mensaje tiene que decir DÓNDE se activa: si no, la propietaria ve un
  // "no se puede" sin salida y acaba en el chat de soporte.
  assert.match(v.mensaje!, /Configuración/);
});

test('un recibo ya devuelto lo dice, no se confunde con "no cobrado"', () => {
  const v = evaluarReembolso(POLITICA_ABIERTA, recibo({ estado: 'DEVUELTO' }), AHORA);
  assert.equal(v.motivo, 'YA_DEVUELTO');
});

test('un recibo pendiente no se devuelve: se anula', () => {
  const v = evaluarReembolso(POLITICA_ABIERTA, recibo({ estado: 'PENDIENTE' }), AHORA);
  assert.equal(v.motivo, 'NO_COBRADO');
});

test('un SEPA en curso tampoco: el dinero aún no ha llegado', () => {
  const v = evaluarReembolso(POLITICA_ABIERTA, recibo({ estado: 'EN_CURSO' }), AHORA);
  assert.equal(v.motivo, 'NO_COBRADO');
});

// ── Plazo ────────────────────────────────────────────────────────────────────

test('dentro del plazo, sí', () => {
  const p = { ...POLITICA_ABIERTA, plazoDias: 14 };
  assert.equal(evaluarReembolso(p, recibo({ fechaCobro: '2026-08-01T09:00:00Z' }), AHORA).permitido, true);
});

test('pasado el plazo, no, y el mensaje dice cuántos días han pasado', () => {
  const p = { ...POLITICA_ABIERTA, plazoDias: 14 };
  const v = evaluarReembolso(p, recibo({ fechaCobro: '2026-07-01T09:00:00Z' }), AHORA);
  assert.equal(v.motivo, 'FUERA_DE_PLAZO');
  assert.match(v.mensaje!, /41 días/);
});

test('el día exacto del límite todavía entra', () => {
  // 14 días clavados: `> plazo` y no `>=`, para que "14 días de plazo" signifique
  // que el día 14 aún puedes. Lo contrario se lee como 13.
  const p = { ...POLITICA_ABIERTA, plazoDias: 14 };
  const v = evaluarReembolso(p, recibo({ fechaCobro: '2026-07-28T12:00:00Z' }), AHORA);
  assert.equal(diasDesdeCobro('2026-07-28T12:00:00Z', AHORA), 14);
  assert.equal(v.permitido, true);
});

test('plazo 0 = sin límite: un cobro de hace un año se puede devolver', () => {
  const v = evaluarReembolso(POLITICA_ABIERTA, recibo({ fechaCobro: '2025-08-10T09:00:00Z' }), AHORA);
  assert.equal(v.permitido, true);
});

test('cobrado sin fecha no bloquea por plazo: manda a Stripe en vez de adivinar', () => {
  const p = { ...POLITICA_ABIERTA, plazoDias: 14 };
  const v = evaluarReembolso(p, recibo({ fechaCobro: null }), AHORA);
  assert.equal(v.motivo, 'SIN_FECHA_COBRO');
});

// ── Bono ya usado ────────────────────────────────────────────────────────────

test('un bono sin empezar se devuelve', () => {
  const p = { ...POLITICA_ABIERTA, soloSinUsar: true };
  const v = evaluarReembolso(p, recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 4 }), AHORA);
  assert.equal(v.permitido, true);
});

test('un bono empezado no, y el mensaje dice cuántas sesiones lleva', () => {
  const p = { ...POLITICA_ABIERTA, soloSinUsar: true };
  const v = evaluarReembolso(p, recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 1 }), AHORA);
  assert.equal(v.motivo, 'BONO_YA_USADO');
  assert.match(v.mensaje!, /3 sesiones/);
});

test('una sola sesión se dice en singular', () => {
  const p = { ...POLITICA_ABIERTA, soloSinUsar: true };
  const v = evaluarReembolso(p, recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 3 }), AHORA);
  assert.match(v.mensaje!, /1 sesión\b/);
});

test('con la regla apagada, un bono usado se devuelve igual', () => {
  const p = { ...POLITICA_ABIERTA, soloSinUsar: false };
  const v = evaluarReembolso(p, recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 1 }), AHORA);
  assert.equal(v.permitido, true);
});

test('sin datos de sesiones (un mensual, una cita) la regla no inventa consumo', () => {
  // Bloquear aquí sería inventarse que está usado: un mensual no tiene sesiones
  // que contar, y un recibo viejo puede no tener el snapshot de entrega.
  const p = { ...POLITICA_ABIERTA, soloSinUsar: true };
  assert.equal(sesionesConsumidas(recibo()), null);
  assert.equal(evaluarReembolso(p, recibo(), AHORA).permitido, true);
});

test('si le añadieron sesiones después, no cuenta como consumo negativo', () => {
  // Otro bono encima, o un ajuste a mano: `restantesHoy` supera a las de la
  // entrega. Eso no es haber gastado -2 sesiones, es no haber gastado ninguna.
  assert.equal(sesionesConsumidas(recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 6 })), 0);
  const p = { ...POLITICA_ABIERTA, soloSinUsar: true };
  assert.equal(evaluarReembolso(p, recibo({ sesionesAlEntregar: 4, sesionesRestantesHoy: 6 }), AHORA).permitido, true);
});

// ── Orden de las comprobaciones ──────────────────────────────────────────────

test('la política apagada gana a todo lo demás', () => {
  // Si no, un estudio con las devoluciones apagadas vería "fuera de plazo",
  // que sugiere que dentro de plazo habría podido. No es el caso.
  const p: PoliticaReembolso = { activos: false, plazoDias: 1, soloSinUsar: true };
  const v = evaluarReembolso(p, recibo({ estado: 'DEVUELTO', fechaCobro: '2020-01-01T00:00:00Z' }), AHORA);
  assert.equal(v.motivo, 'DESACTIVADA');
});

test('importe 0 no llega a evaluarse por plazo', () => {
  const v = evaluarReembolso(POLITICA_ABIERTA, recibo({ importe: 0 }), AHORA);
  assert.equal(v.motivo, 'SIN_IMPORTE');
});
