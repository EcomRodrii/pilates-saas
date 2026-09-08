// Tests de la lógica de recompensas/créditos. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RewardRule, RewardAction, MemberCredits, RewardCatalogItem } from '@/lib/types';
import {
  reglaActivaPara,
  yaOtorgado,
  decidirOtorgarCreditos,
  aplicarGananciaCreditos,
  validarCanje,
  aplicarCanjeCreditos,
} from './reward-engine.ts';

let n = 0;
function regla(p: Partial<RewardRule> & Pick<RewardRule, 'trigger' | 'creditos' | 'activa'>): RewardRule {
  return { id: `rwr-${++n}`, studioId: 'e1', nombre: 'R', descripcion: null, topeMensual: null, unidadEuros: null, creadoEn: '2026-01-01', ...p };
}
function action(trigger: RewardAction['trigger'], refId: string | null): RewardAction {
  return { id: `rwa-${++n}`, studioId: 'e1', socioId: 's1', trigger, refId, creadoEn: '2026-01-01' };
}

// ── reglaActivaPara ──────────────────────────────────────────────────────────
test('reglaActivaPara devuelve la regla activa del disparador; null si inactiva', () => {
  const rules = [regla({ trigger: 'ASISTENCIA_CLASE', creditos: 10, activa: true })];
  assert.equal(reglaActivaPara(rules, 'ASISTENCIA_CLASE')?.creditos, 10);
  assert.equal(reglaActivaPara(rules, 'REFERIDO_AMIGO'), null);
  const inactiva = [regla({ trigger: 'ASISTENCIA_CLASE', creditos: 10, activa: false })];
  assert.equal(reglaActivaPara(inactiva, 'ASISTENCIA_CLASE'), null);
});

// ── yaOtorgado (idempotencia) ────────────────────────────────────────────────
test('yaOtorgado true si existe una acción con mismo trigger y refId', () => {
  const acciones = [action('REFERIDO_AMIGO', 'soc-9')];
  assert.equal(yaOtorgado(acciones, 'REFERIDO_AMIGO', 'soc-9'), true);
  assert.equal(yaOtorgado(acciones, 'REFERIDO_AMIGO', 'soc-8'), false);
  assert.equal(yaOtorgado(acciones, 'ASISTENCIA_CLASE', 'soc-9'), false);
});

test('yaOtorgado false cuando refId es null (no deduplica sin referencia)', () => {
  assert.equal(yaOtorgado([action('ASISTENCIA_CLASE', null)], 'ASISTENCIA_CLASE', null), false);
});

// ── decidirOtorgarCreditos ───────────────────────────────────────────────────
test('decidirOtorgarCreditos: otorga con regla activa y sin duplicado', () => {
  const rules = [regla({ trigger: 'ASISTENCIA_CLASE', creditos: 10, activa: true })];
  const r = decidirOtorgarCreditos(rules, [], 'ASISTENCIA_CLASE', 'res-1');
  assert.equal(r.otorgar, true);
  assert.equal(r.regla?.creditos, 10);
});

test('decidirOtorgarCreditos: no otorga si no hay regla o créditos <= 0', () => {
  assert.equal(decidirOtorgarCreditos([], [], 'ASISTENCIA_CLASE', 'res-1').otorgar, false);
  const cero = [regla({ trigger: 'ASISTENCIA_CLASE', creditos: 0, activa: true })];
  assert.equal(decidirOtorgarCreditos(cero, [], 'ASISTENCIA_CLASE', 'res-1').otorgar, false);
});

test('decidirOtorgarCreditos: no otorga si ya se otorgó para ese refId', () => {
  const rules = [regla({ trigger: 'REFERIDO_AMIGO', creditos: 100, activa: true })];
  const acciones = [action('REFERIDO_AMIGO', 'soc-9')];
  assert.equal(decidirOtorgarCreditos(rules, acciones, 'REFERIDO_AMIGO', 'soc-9').otorgar, false);
});

// ── aplicarGananciaCreditos ──────────────────────────────────────────────────
test('aplicarGananciaCreditos crea el registro si no existía', () => {
  const r = aplicarGananciaCreditos(undefined, 's1', 'e1', 40, '2026-03-01');
  assert.deepEqual(r, { socioId: 's1', studioId: 'e1', saldo: 40, totalGanado: 40, totalCanjeado: 0, caducaEl: null, actualizadoEn: '2026-03-01' });
});

test('aplicarGananciaCreditos suma al saldo y al total ganado, sin tocar el canjeado', () => {
  const existente: MemberCredits = { socioId: 's1', studioId: 'e1', saldo: 30, totalGanado: 50, totalCanjeado: 20, caducaEl: null, actualizadoEn: '2026-02-01' };
  const r = aplicarGananciaCreditos(existente, 's1', 'e1', 10, '2026-03-01');
  assert.deepEqual(r, { socioId: 's1', studioId: 'e1', saldo: 40, totalGanado: 60, totalCanjeado: 20, caducaEl: null, actualizadoEn: '2026-03-01' });
});

// ── validarCanje ─────────────────────────────────────────────────────────────
function item(p: Partial<RewardCatalogItem> & Pick<RewardCatalogItem, 'costeCreditos'>): RewardCatalogItem {
  return {
    id: 'cat-1', studioId: 'e1', nombre: 'Toalla', descripcion: null, icono: '🎁',
    activo: true, stock: null, efecto: 'MANUAL', creadoEn: '2026-01-01',
    limitePorSocia: null, disponibleDesde: null, disponibleHasta: null, ...p,
  };
}

test('validarCanje: ok con saldo suficiente, activa y con stock', () => {
  assert.deepEqual(validarCanje(item({ costeCreditos: 100 }), 100), { ok: true });
});

test('validarCanje: error si la recompensa no existe o está inactiva', () => {
  assert.ok('error' in validarCanje(undefined, 999));
  assert.ok('error' in validarCanje(item({ costeCreditos: 10, activo: false }), 999));
});

test('validarCanje: error si sin stock', () => {
  assert.ok('error' in validarCanje(item({ costeCreditos: 10, stock: 0 }), 999));
});

test('validarCanje: error si saldo insuficiente', () => {
  const r = validarCanje(item({ costeCreditos: 100 }), 99);
  assert.ok('error' in r && r.error.includes('créditos'));
});

// ── validarCanje: vigencia ───────────────────────────────────────────────────
test('vigencia: los dos extremos ENTRAN', () => {
  const i = item({ costeCreditos: 10, disponibleDesde: '2026-09-01', disponibleHasta: '2026-09-30' });
  assert.deepEqual(validarCanje(i, 99, { hoy: '2026-09-01' }), { ok: true }, 'el primer día ya vale');
  assert.deepEqual(validarCanje(i, 99, { hoy: '2026-09-30' }), { ok: true }, 'el último día todavía vale');
  assert.deepEqual(validarCanje(i, 99, { hoy: '2026-09-15' }), { ok: true });
});

test('vigencia: fuera de la ventana no se canjea, y los dos lados dicen cosas distintas', () => {
  const i = item({ costeCreditos: 10, disponibleDesde: '2026-09-01', disponibleHasta: '2026-09-30' });
  const antes = validarCanje(i, 99, { hoy: '2026-08-31' });
  const despues = validarCanje(i, 99, { hoy: '2026-10-01' });
  // «Todavía no» invita a volver; «ya no» cierra. Dar el mismo texto a los dos
  // mandaría a ahorrar créditos para algo que ya no existe.
  assert.ok('error' in antes && /todavía/i.test(antes.error));
  assert.ok('error' in despues && /ya no/i.test(despues.error));
});

test('vigencia: sin fechas, siempre vigente; y sin `hoy` no se evalúa', () => {
  assert.deepEqual(validarCanje(item({ costeCreditos: 10 }), 99, { hoy: '2030-01-01' }), { ok: true });
  // Quien no pasa `hoy` (contextos que no lo tienen) no se queda bloqueado: la
  // ventana la vuelve a comprobar la BD, que es la que manda.
  const caducada = item({ costeCreditos: 10, disponibleHasta: '2020-01-01' });
  assert.deepEqual(validarCanje(caducada, 99), { ok: true });
});

// ── validarCanje: límite por socia ───────────────────────────────────────────
test('límite: se puede hasta el tope, y en el tope ya no', () => {
  const i = item({ costeCreditos: 10, limitePorSocia: 2 });
  assert.deepEqual(validarCanje(i, 99, { canjesPrevios: 0 }), { ok: true });
  assert.deepEqual(validarCanje(i, 99, { canjesPrevios: 1 }), { ok: true });
  assert.ok('error' in validarCanje(i, 99, { canjesPrevios: 2 }));
});

test('límite: sin límite configurado, da igual cuántas lleve', () => {
  assert.deepEqual(validarCanje(item({ costeCreditos: 10 }), 99, { canjesPrevios: 50 }), { ok: true });
});

test('límite: el mensaje de una sola vez no habla de «veces»', () => {
  const una = validarCanje(item({ costeCreditos: 10, limitePorSocia: 1 }), 99, { canjesPrevios: 1 });
  const tres = validarCanje(item({ costeCreditos: 10, limitePorSocia: 3 }), 99, { canjesPrevios: 3 });
  assert.ok('error' in una && !/veces/.test(una.error), una);
  assert.ok('error' in tres && /3 veces/.test(tres.error), tres);
});

test('límite: se comprueba ANTES que el stock y que el saldo', () => {
  // Si el orden fuera al revés, a quien ya se la ha llevado se le diría «te
  // faltan 90 créditos» y se pondría a ahorrar para algo que no puede canjear.
  const i = item({ costeCreditos: 100, limitePorSocia: 1, stock: 0 });
  const r = validarCanje(i, 0, { canjesPrevios: 1 });
  assert.ok('error' in r && /canjeado/i.test(r.error), r);
});

test('vigencia manda sobre el límite: una recompensa vencida no dice «ya la has canjeado»', () => {
  const i = item({ costeCreditos: 10, limitePorSocia: 1, disponibleHasta: '2020-01-01' });
  const r = validarCanje(i, 99, { hoy: '2026-09-08', canjesPrevios: 1 });
  assert.ok('error' in r && /ya no está disponible/i.test(r.error), r);
});

// ── aplicarCanjeCreditos ─────────────────────────────────────────────────────
test('aplicarCanjeCreditos descuenta del saldo y suma al total canjeado', () => {
  const existente: MemberCredits = { socioId: 's1', studioId: 'e1', saldo: 100, totalGanado: 100, totalCanjeado: 0, caducaEl: null, actualizadoEn: '2026-02-01' };
  const r = aplicarCanjeCreditos(existente, 's1', 'e1', 30, '2026-03-01');
  assert.deepEqual(r, { socioId: 's1', studioId: 'e1', saldo: 70, totalGanado: 100, totalCanjeado: 30, caducaEl: null, actualizadoEn: '2026-03-01' });
});
