import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bloqueadaPorAperturaSuave } from '../booking-logic.ts';
import { etiquetaAperturaSuave, MENSAJE_APERTURA_SUAVE } from './apertura-suave-texto.ts';
import { cierreAperturaSuave } from './apertura-suave.ts';

// 2026-11-02 abre; en hora de Madrid (CET) su medianoche es el 1 a las 23:00 UTC.
const APERTURA = '2026-11-02';
const INICIO_APERTURA = '2026-11-01T23:00:00.000Z';
const ANTES = '2026-11-01T22:30:00Z'; // 23:30 del día 1 en Madrid
const DESPUES = '2026-11-01T23:30:00Z'; // 00:30 del día 2 en Madrid

test('regla: solo cierra clases anteriores al día de apertura, en hora del estudio, y solo a quien no está en el grupo', () => {
  assert.equal(bloqueadaPorAperturaSuave(ANTES, INICIO_APERTURA, true, false), true);
  assert.equal(bloqueadaPorAperturaSuave(DESPUES, INICIO_APERTURA, true, false), false);
  assert.equal(bloqueadaPorAperturaSuave(ANTES, INICIO_APERTURA, true, true), false);
  assert.equal(bloqueadaPorAperturaSuave(ANTES, INICIO_APERTURA, false, false), false);
  assert.equal(bloqueadaPorAperturaSuave(ANTES, null, true, false), false);
});

test('etiqueta: solo en las clases de la apertura suave, y dice el día en que se abre', () => {
  assert.equal(etiquetaAperturaSuave(DESPUES, APERTURA), null);
  assert.equal(etiquetaAperturaSuave(ANTES, null), null);
  assert.match(etiquetaAperturaSuave(ANTES, APERTURA)!, /Abrimos a todas el 2 de noviembre/);
  assert.match(MENSAJE_APERTURA_SUAVE(APERTURA), /solo para fundadoras e invitadas/);
});

interface Mundo {
  activa: boolean; fechaApertura: string | null;
  planesEtapa: string[]; tags: string[]; cuotasActivas: string[];
}

// Admin falso: responde a las cuatro lecturas que hace cierreAperturaSuave.
function fakeAdmin(m: Mundo) {
  const leidas: string[] = [];
  const from = (tabla: string) => {
    leidas.push(tabla);
    const f: Record<string, unknown> = {};
    const q = {
      select: () => q, eq: (c: string, v: unknown) => { f[c] = v; return q; },
      not: () => q, is: () => q,
      in: (c: string, v: unknown) => { f[c] = v; return q; },
      limit: async () => ({
        data: m.cuotasActivas.filter(p => (f.plan_id as string[]).includes(p)).map(() => ({ id: 'sus' })), error: null,
      }),
      maybeSingle: async () => tabla === 'studios'
        ? { data: { apertura_suave: m.activa, fecha_apertura: m.fechaApertura }, error: null }
        : { data: { tags: m.tags }, error: null },
      then: (ok: (r: unknown) => void) => ok({ data: m.planesEtapa.map(plan_id => ({ plan_id })), error: null }),
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, leidas };
}

const base: Mundo = { activa: true, fechaApertura: APERTURA, planesEtapa: ['plan-fundadora'], tags: [], cuotasActivas: [] };

test('servidor: fuera del grupo, una clase de la apertura suave se cierra con la fecha para el mensaje', async () => {
  const { admin } = fakeAdmin(base);
  assert.equal(await cierreAperturaSuave(admin, 's1', 'soc-1', ANTES), APERTURA);
});

test('servidor: la invitada (etiqueta) y la fundadora (cuota activa de un plan de etapa) pasan', async () => {
  assert.equal(await cierreAperturaSuave(fakeAdmin({ ...base, tags: ['vip', 'apertura-suave'] }).admin, 's1', 'soc-1', ANTES), null);
  assert.equal(await cierreAperturaSuave(fakeAdmin({ ...base, cuotasActivas: ['plan-fundadora'] }).admin, 's1', 'soc-1', ANTES), null);
  // Una cuota de un plan normal NO la mete en el grupo.
  assert.equal(await cierreAperturaSuave(fakeAdmin({ ...base, cuotasActivas: ['plan-normal'] }).admin, 's1', 'soc-1', ANTES), APERTURA);
});

test('servidor: comprar un plan de etapa te deja reservar la clase que pagas; uno normal no', async () => {
  assert.equal(await cierreAperturaSuave(fakeAdmin(base).admin, 's1', null, ANTES, { planQueCompra: 'plan-fundadora' }), null);
  assert.equal(await cierreAperturaSuave(fakeAdmin(base).admin, 's1', null, ANTES, { planQueCompra: 'plan-normal' }), APERTURA);
});

test('servidor: apagada, sin fecha o con la clase ya de después de abrir, no mira a la socia', async () => {
  for (const m of [{ ...base, activa: false }, { ...base, fechaApertura: null }]) {
    const { admin, leidas } = fakeAdmin(m);
    assert.equal(await cierreAperturaSuave(admin, 's1', 'soc-1', ANTES), null);
    assert.deepEqual(leidas, ['studios']);
  }
  const { admin, leidas } = fakeAdmin(base);
  assert.equal(await cierreAperturaSuave(admin, 's1', 'soc-1', DESPUES), null);
  assert.deepEqual(leidas, ['studios']);
});
