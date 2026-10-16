import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO, DIAS_MAX_POR_CIERRE, ESTADOS_ESTUDIO,
  anclaDeActividad, diasDeCierreDesde, diasSinActividad, modoBajas, pagaElEstudio, situacionDerivada,
  type EntradaSituacion, type PlanDeCadena,
} from './situacion-estudio.ts';
import { AVISO_PCT, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, MARGEN_DIAS, type FaseGratis } from '../billing/plan-gratis.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La situación de un estudio (bajas, fase 2), su gemela SQL y sus invariantes.
// El cruce caso a caso contra Postgres está en supabase/tests/situacion-estudio.test.ts;
// aquí, que las constantes son las mismas y que la máquina cumple lo que promete.
// ─────────────────────────────────────────────────────────────────────────────

const SQL = readFileSync(join(import.meta.dirname, '../../supabase/migrations/20261016123000_situacion_estudio_solo_lectura.sql'), 'utf8');

function constanteSql(nombre: string): number {
  const m = SQL.match(new RegExp(`${nombre} constant (?:integer|numeric) := ([\\d.]+);`));
  assert.ok(m, `no encuentro ${nombre} en la migración`);
  return Number(m[1]);
}

test('contrato TS↔SQL: los umbrales y los límites son los mismos números', () => {
  assert.equal(constanteSql('c_dias_inactivo'), DIAS_HASTA_INACTIVO);
  assert.equal(constanteSql('c_dias_suspendido'), DIAS_HASTA_SUSPENDIDO);
  assert.equal(constanteSql('c_limite_alumnas'), LIMITE_ALUMNAS);
  assert.equal(constanteSql('c_limite_reservas'), LIMITE_RESERVAS_MES);
  assert.equal(constanteSql('c_margen_dias'), MARGEN_DIAS);
  assert.equal(constanteSql('c_aviso_pct'), AVISO_PCT);
  // El tope por cierre (`c.desde + (365 - 1)`) y el aviso de la demo.
  assert.equal(Number(SQL.match(/c\.desde \+ \((\d+) - 1\)/)?.[1]), DIAS_MAX_POR_CIERRE);
  assert.match(SQL, new RegExp(`dias\\.sin_actividad >= ${DIAS_HASTA_INACTIVO} then 'demo_fuera_de_transiciones'`));
  // «Reciente», para el aviso de que solo quedan señales de alumnas: la misma ventana que la inactividad.
  assert.match(SQL, new RegExp(`> p_hoy - ${DIAS_HASTA_INACTIVO}\\n`));
});

test('solo lectura de verdad: la migración no añade columnas a `studios` ni la actualiza', () => {
  // Cualquier UPDATE de `studios` dispara el trigger que recalcula el contrato: las marcas viven aparte.
  assert.doesNotMatch(SQL, /alter table public\.studios/i);
  assert.doesNotMatch(SQL, /update public\.studios/i);
  assert.match(SQL, /create table if not exists public\.estudio_marcas_uso/);
});

test('contrato TS↔SQL: los estados del informe son los de la máquina (más ERROR)', () => {
  const m = SQL.match(/estado text not null check \(estado in \(([^)]*)\)\)/);
  assert.ok(m, 'no encuentro el CHECK de estudio_situacion_diaria');
  const sql = [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
  assert.deepEqual(sql, [...ESTADOS_ESTUDIO, 'ERROR']);
});

test('el «hoy» de la migración es el de Madrid: ni current_date ni días de UTC', () => {
  assert.doesNotMatch(SQL, /current_date/i);
  assert.doesNotMatch(SQL, /::timestamptz/, 'un día convertido a instante sin zona cae en UTC');
  assert.match(SQL, /p_hoy date default public\.hoy_estudio\(\)/);
});

test('todas las funciones nuevas, solo para service_role (revoke de public, anon y authenticated + grant)', () => {
  const funciones = [...SQL.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
  assert.ok(funciones.length >= 10);
  for (const f of funciones) {
    assert.match(SQL, new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`), f);
    assert.match(SQL, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`), f);
  }
});

test('BAJAS_AUTOMATICAS: solo «informe» enciende algo; lo demás es apagado', () => {
  assert.equal(modoBajas({}), 'apagado');
  assert.equal(modoBajas({ BAJAS_AUTOMATICAS: 'informe' }), 'informe');
  assert.equal(modoBajas({ BAJAS_AUTOMATICAS: ' informe ' }), 'informe');
  for (const v of ['apagado', 'activa', 'on', 'true', 'INFORME', '']) assert.equal(modoBajas({ BAJAS_AUTOMATICAS: v }), 'apagado', v);
});

// ─── La máquina, sobre todas las combinaciones ───────────────────────────────

const ESTADOS_SUSCRIPCION = [null, 'active', 'past_due', 'trialing', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired',
  'trial_expirado', 'gratis', 'gratis_cerrado'];
const IDS = [null, '', 'sub_x'];
const FASES: FaseGratis[] = ['DENTRO', 'CERCA', 'MARGEN', 'CERRADO', 'SIN_MEDIR'];
const DIAS = [0, DIAS_HASTA_INACTIVO - 1, DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO - 1, DIAS_HASTA_SUSPENDIDO, 400];

function* combinaciones(): Generator<EntradaSituacion> {
  const cadenas: Array<{ tieneCadena: boolean; cadena: PlanDeCadena | null }> = [
    { tieneCadena: false, cadena: null },
    { tieneCadena: true, cadena: null },
    ...ESTADOS_SUSCRIPCION.flatMap(st => IDS.map(id => ({ tieneCadena: true, cadena: { subscriptionStatus: st, subscriptionId: id } }))),
  ];
  for (const subscriptionStatus of ESTADOS_SUSCRIPCION) for (const subscriptionId of IDS) for (const c of cadenas) {
    for (const esDemo of [false, true]) for (const baja of [0, 1, 2, 3]) for (const purgado of [false, true]) {
      for (const faseGratis of FASES) for (const diasSinActividad of DIAS) {
        yield {
          subscriptionStatus, subscriptionId, ...c, esDemo, purgado, faseGratis, diasSinActividad,
          contratoTerminado: (baja & 1) === 1, supresionPedida: (baja & 2) === 2,
        };
      }
    }
  }
}

test('quien paga NUNCA sale de ACTIVO_PAGO ni tiene nada limitado: Stripe, a mano, cadena, past_due y prueba de Stripe', () => {
  let pagan = 0;
  for (const e of combinaciones()) {
    if (!pagaElEstudio(e)) continue;
    pagan++;
    const s = situacionDerivada(e);
    assert.deepEqual(
      [s.estado, s.paga, s.gestionLimitada, s.servicioAlumnasSuspendido, s.cobrosAutomaticosPausados],
      ['ACTIVO_PAGO', true, false, false, false],
      JSON.stringify(e),
    );
  }
  assert.ok(pagan > 1000, 'la matriz no ha probado casi ningún estudio que paga');
});

test('un contrato vivo en Stripe (unpaid) no se suspende, ni pausa cobros, ni toca a las alumnas', () => {
  for (const e of combinaciones()) {
    const unpaid = e.subscriptionStatus === 'unpaid' || (e.tieneCadena && e.cadena?.subscriptionStatus === 'unpaid');
    if (!unpaid || pagaElEstudio(e) || e.purgado || e.contratoTerminado || e.supresionPedida) continue;
    const s = situacionDerivada(e);
    assert.equal(s.estado, 'PAGO_PENDIENTE', JSON.stringify(e));
    assert.equal(s.servicioAlumnasSuspendido, false);
    assert.equal(s.cobrosAutomaticosPausados, false);
  }
});

test('ni la inactividad ni nada suspende a quien paga o está en PAGO_PENDIENTE', () => {
  for (const e of combinaciones()) {
    const s = situacionDerivada(e);
    if (s.estado === 'ACTIVO_PAGO' || s.estado === 'PAGO_PENDIENTE') {
      assert.equal(s.motivo, null);
      assert.equal(s.variante, null);
    }
    if (s.motivo === 'abandono') assert.ok(!pagaElEstudio(e) && e.subscriptionStatus !== 'unpaid', JSON.stringify(e));
  }
});

test('las demos no se mueven por falta de uso', () => {
  for (const e of combinaciones()) {
    if (!e.esDemo) continue;
    const s = situacionDerivada(e);
    assert.notEqual(s.estado, 'INACTIVO', JSON.stringify(e));
    assert.notEqual(s.motivo, 'abandono', JSON.stringify(e));
  }
});

test('pasarse del gratis limita la gestión, nunca a las alumnas; y gana a la falta de uso', () => {
  for (const e of combinaciones()) {
    const s = situacionDerivada(e);
    if (s.motivo === 'limite_gratis' || s.variante === 'funciona') {
      assert.equal(s.estado, 'SUSPENDIDO');
      assert.equal(s.gestionLimitada, true);
      assert.equal(s.servicioAlumnasSuspendido, false, JSON.stringify(e));
      assert.equal(s.cobrosAutomaticosPausados, true);
    }
    if (s.estado === 'INACTIVO') assert.deepEqual([s.gestionLimitada, s.servicioAlumnasSuspendido, s.cobrosAutomaticosPausados], [false, false, true]);
    if (s.servicioAlumnasSuspendido) assert.ok(['SUSPENDIDO', 'EN_BAJA', 'ELIMINADO'].includes(s.estado) && s.variante !== 'funciona');
    assert.ok((ESTADOS_ESTUDIO as readonly string[]).includes(s.estado));
  }
  const base: EntradaSituacion = {
    subscriptionStatus: 'gratis', subscriptionId: null, tieneCadena: false, cadena: null, esDemo: false,
    contratoTerminado: false, supresionPedida: false, purgado: false, faseGratis: 'CERRADO', diasSinActividad: 400,
  };
  assert.deepEqual(
    [situacionDerivada(base).estado, situacionDerivada(base).motivo],
    ['SUSPENDIDO', 'limite_gratis'],
  );
});

test('casos concretos: los bordes de los días y las dos pruebas', () => {
  const gratis = (diasSinActividad: number, extra: Partial<EntradaSituacion> = {}) => situacionDerivada({
    subscriptionStatus: 'gratis', subscriptionId: null, tieneCadena: false, cadena: null, esDemo: false,
    contratoTerminado: false, supresionPedida: false, purgado: false, faseGratis: 'DENTRO', diasSinActividad, ...extra,
  });
  assert.equal(gratis(DIAS_HASTA_INACTIVO - 1).estado, 'GRATIS');
  assert.equal(gratis(DIAS_HASTA_INACTIVO).estado, 'INACTIVO');
  assert.equal(gratis(DIAS_HASTA_SUSPENDIDO - 1).estado, 'INACTIVO');
  assert.deepEqual([gratis(DIAS_HASTA_SUSPENDIDO).estado, gratis(DIAS_HASTA_SUSPENDIDO).variante], ['SUSPENDIDO', 'sin_senales']);
  assert.equal(gratis(10, { faseGratis: 'MARGEN' }).estado, 'GRATIS_EN_MARGEN');
  // La prueba LOCAL ('trialing' sin suscripción) no paga; la de Stripe, sí. Un id vacío no es una suscripción.
  assert.equal(gratis(0, { subscriptionStatus: 'trialing' }).estado, 'GRATIS');
  assert.equal(gratis(0, { subscriptionStatus: 'trialing', subscriptionId: '' }).paga, false);
  assert.equal(gratis(400, { subscriptionStatus: 'trialing', subscriptionId: 'sub_x' }).estado, 'ACTIVO_PAGO');
  // Una sede: su cadena con plan a mano ('active' sin suscripción) paga por ella, aunque la sede diga otra cosa.
  assert.equal(gratis(400, { subscriptionStatus: 'canceled', tieneCadena: true, cadena: { subscriptionStatus: 'active', subscriptionId: null }, contratoTerminado: true }).estado, 'ACTIVO_PAGO');
  // Cancelado sin el gratis: funciona, con la gestión limitada.
  assert.deepEqual([gratis(0, { subscriptionStatus: 'canceled' }).estado, gratis(0, { subscriptionStatus: 'canceled' }).motivo], ['SUSPENDIDO', 'sin_plan']);
  assert.deepEqual([gratis(0, { contratoTerminado: true }).estado, gratis(0, { supresionPedida: true }).motivo], ['EN_BAJA', 'borrado_pedido']);
  assert.equal(gratis(0, { purgado: true }).estado, 'ELIMINADO');
});

// ─── Días sin actividad ──────────────────────────────────────────────────────

test('el ancla es el día de MADRID más reciente: una señal a las 00:30 de Madrid ya es «hoy»', () => {
  // 17-oct-2026 00:30 en Madrid (CEST) = 16-oct 22:30 UTC. Con el día de UTC sería ayer.
  const base = { creadoEn: '2026-01-01T10:00:00Z', eventosDePlan: [], cierres: [], hoy: '2026-10-17' };
  assert.equal(anclaDeActividad({ ...base, ultimaActividad: '2026-10-16T22:30:00Z' }), '2026-10-17');
  assert.equal(diasSinActividad({ ...base, ultimaActividad: '2026-10-16T22:30:00Z' }).dias, 0);
  // 23:30 del 16 en Madrid: un día.
  assert.equal(diasSinActividad({ ...base, ultimaActividad: '2026-10-16T21:30:00Z' }).dias, 1);
  // Sin actividad, manda el alta; un cambio de plan posterior la adelanta.
  assert.equal(anclaDeActividad({ ...base, ultimaActividad: null }), '2026-01-01');
  assert.equal(anclaDeActividad({ ...base, ultimaActividad: null, eventosDePlan: [null, '2026-09-30T23:00:00Z'] }), '2026-10-01');
  // Un día pasado se mira con lo que había entonces: lo posterior a `hoy` no ancla.
  assert.equal(anclaDeActividad({ ...base, hoy: '2026-03-01', ultimaActividad: null, eventosDePlan: ['2026-09-30T23:00:00Z'] }), '2026-01-01');
  assert.equal(anclaDeActividad({ ...base, hoy: '2025-12-01', ultimaActividad: null }), '2025-12-01');
});

test('los días de «Cierre del centro» no cuentan: una vez cada día, con su tope, y solo entre el ancla y hoy', () => {
  assert.equal(diasDeCierreDesde('2026-08-01', '2026-10-01', [{ desde: '2026-08-10', hasta: '2026-08-16' }]), 7);
  // Dos cierres que se solapan: cada día una vez.
  assert.equal(diasDeCierreDesde('2026-08-01', '2026-10-01', [
    { desde: '2026-08-10', hasta: '2026-08-16' }, { desde: '2026-08-14', hasta: '2026-08-20' },
  ]), 11);
  // Empezado antes del ancla: solo lo de después. Terminando después de hoy: solo hasta hoy.
  assert.equal(diasDeCierreDesde('2026-08-12', '2026-08-14', [{ desde: '2026-08-10', hasta: '2026-08-30' }]), 2);
  // Un cierre de dos años cuenta DIAS_MAX_POR_CIERRE días.
  assert.equal(diasDeCierreDesde('2024-12-31', '2027-01-01', [{ desde: '2025-01-01', hasta: '2026-12-31' }]), DIAS_MAX_POR_CIERRE);
  const r = diasSinActividad({
    ultimaActividad: '2026-08-01T10:00:00Z', creadoEn: '2026-01-01T10:00:00Z', eventosDePlan: [],
    cierres: [{ desde: '2026-08-10', hasta: '2026-08-16' }], hoy: '2026-10-01',
  });
  assert.deepEqual(r, { ancla: '2026-08-01', diasDeCierre: 7, dias: 61 - 7 });
});
