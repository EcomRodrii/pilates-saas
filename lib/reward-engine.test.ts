// Tests de la lógica de recompensas/créditos. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RewardRule, RewardAction, MemberCredits } from '@/lib/types';
import {
  reglaActivaPara,
  yaOtorgado,
  decidirOtorgarCreditos,
  aplicarGananciaCreditos,
} from './reward-engine.ts';

let n = 0;
function regla(p: Partial<RewardRule> & Pick<RewardRule, 'trigger' | 'creditos' | 'activa'>): RewardRule {
  return { id: `rwr-${++n}`, studioId: 'e1', nombre: 'R', descripcion: null, topeMensual: null, creadoEn: '2026-01-01', ...p };
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
  assert.deepEqual(r, { socioId: 's1', studioId: 'e1', saldo: 40, totalGanado: 40, totalCanjeado: 0, actualizadoEn: '2026-03-01' });
});

test('aplicarGananciaCreditos suma al saldo y al total ganado, sin tocar el canjeado', () => {
  const existente: MemberCredits = { socioId: 's1', studioId: 'e1', saldo: 30, totalGanado: 50, totalCanjeado: 20, actualizadoEn: '2026-02-01' };
  const r = aplicarGananciaCreditos(existente, 's1', 'e1', 10, '2026-03-01');
  assert.deepEqual(r, { socioId: 's1', studioId: 'e1', saldo: 40, totalGanado: 60, totalCanjeado: 20, actualizadoEn: '2026-03-01' });
});
