// Reglas del cambio de cuota cobrando la diferencia (las decide el servidor, nunca el navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planificarCambioConDiferencia, type CuotaDelCambio, type PlanDelCambio } from './cambio-cuota.ts';

const cuota = (p: Partial<CuotaDelCambio> = {}): CuotaDelCambio => ({
  id: 'sus-1', socioId: 'soc-1', estado: 'ACTIVA', fechaFin: '2026-11-30', planId: 'plan-a', ...p,
});
const plan = (p: Partial<PlanDelCambio> & Pick<PlanDelCambio, 'id'>): PlanDelCambio => ({
  nombre: p.id, tipo: 'MENSUAL', precio: 49, activo: true, periodicidadMeses: 1, ...p,
});
const base = () => ({
  cuota: cuota(),
  planActual: plan({ id: 'plan-a', nombre: 'Esencial', precio: 49 }),
  planNuevo: plan({ id: 'plan-b', nombre: 'Premium', precio: 69 }),
  socioId: 'soc-1', recibosSinCobrar: false, hoyISO: '2026-11-19', importeConfirmado: 8,
});

test('subir de plan con 12 de 30 días: el servidor calcula 8 € y concepto con el porqué', () => {
  const r = planificarCambioConDiferencia(base());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.importe, 8);
  assert.match(r.concepto, /Esencial → Premium/);
  assert.match(r.concepto, /\(69 € − 49 €\) × 12 de 30 días/);
});

test('NUNCA se fía del importe del navegador: si no es el que sale, 409 con el bueno', () => {
  for (const manipulado of [0.01, 1, 20, 8.01, -8]) {
    const r = planificarCambioConDiferencia({ ...base(), importeConfirmado: manipulado });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 409);
    assert.equal(r.codigo, 'IMPORTE_CAMBIADO');
    assert.equal(r.importe, 8);
  }
});

test('la medianoche entre la vista previa y el confirmar cambia la cifra y obliga a reconfirmar', () => {
  // La persona vio 8 € el 19; el servidor lo calcula el 20 (11 de 30 días = 7,33 €).
  const r = planificarCambioConDiferencia({ ...base(), hoyISO: '2026-11-20' });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.codigo, 'IMPORTE_CAMBIADO'); assert.equal(r.importe, 7.33); }
});

test('plan igual o más barato: no hay diferencia (sin cobro ni devolución)', () => {
  for (const precio of [49, 30]) {
    const r = planificarCambioConDiferencia({ ...base(), planNuevo: plan({ id: 'plan-b', precio }), importeConfirmado: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.codigo, 'SIN_DIFERENCIA');
  }
});

test('una cuota gestionada por Stripe no se cambia desde aquí', () => {
  const r = planificarCambioConDiferencia({ ...base(), cuota: cuota({ stripeSubscriptionId: 'sub_x' }) });
  assert.equal(r.ok === false && r.codigo, 'CUOTA_EN_STRIPE');
});

test('la cuota ha de ser de esta clienta, de este estudio (si no, no existe) y estar ACTIVA', () => {
  const ajena = planificarCambioConDiferencia({ ...base(), cuota: cuota({ socioId: 'soc-OTRA' }) });
  assert.equal(ajena.ok === false && ajena.status, 404);
  const noExiste = planificarCambioConDiferencia({ ...base(), cuota: null });
  assert.equal(noExiste.ok === false && noExiste.status, 404);
  const cancelada = planificarCambioConDiferencia({ ...base(), cuota: cuota({ estado: 'CANCELADA' }) });
  assert.equal(cancelada.ok === false && cancelada.codigo, 'CUOTA_NO_ACTIVA');
});

test('solo cuota → cuota del mismo periodo; el plan nuevo ha de estar a la venta', () => {
  assert.equal((planificarCambioConDiferencia({ ...base(), planActual: plan({ id: 'plan-a', tipo: 'BONO' }) }) as { codigo?: string }).codigo, 'NO_ES_CUOTA');
  assert.equal((planificarCambioConDiferencia({ ...base(), planNuevo: plan({ id: 'plan-b', tipo: 'BONO', precio: 69 }) }) as { codigo?: string }).codigo, 'PLAN_NO_VALIDO');
  assert.equal((planificarCambioConDiferencia({ ...base(), planNuevo: plan({ id: 'plan-b', precio: 69, activo: false }) }) as { codigo?: string }).codigo, 'PLAN_NO_VALIDO');
  assert.equal((planificarCambioConDiferencia({ ...base(), planNuevo: null }) as { codigo?: string }).codigo, 'PLAN_NO_VALIDO');
  assert.equal((planificarCambioConDiferencia({ ...base(), planNuevo: plan({ id: 'plan-a', precio: 69 }) }) as { codigo?: string }).codigo, 'MISMO_PLAN');
  // trimestral → mensual: periodos distintos, no se calcula sola
  const r = planificarCambioConDiferencia({ ...base(), planActual: plan({ id: 'plan-a', precio: 120, periodicidadMeses: 3 }) });
  assert.equal(r.ok === false && r.codigo, 'SIN_DIFERENCIA');
});

test('con un recibo sin cobrar de la cuota no se cambia cobrando la diferencia', () => {
  const r = planificarCambioConDiferencia({ ...base(), recibosSinCobrar: true });
  assert.equal(r.ok === false && r.codigo, 'RECIBOS_SIN_COBRAR');
});

test('ciclo vencido: no se ofrece', () => {
  const r = planificarCambioConDiferencia({ ...base(), hoyISO: '2026-12-02' });
  assert.equal(r.ok === false && r.codigo, 'SIN_DIFERENCIA');
});

// ── Contrato de la ruta y de la migración (lo que NO puede cambiar sin que alguien lo decida) ──
const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('la ruta: rol que mueve dinero, estudio de la sesión, importe recalculado y una sola puerta de escritura', () => {
  const fuente = leer('app/api/suscripciones/cambiar-con-diferencia/route.ts');
  const f = fuente.replace(/^\s*\/\/.*$/gm, ''); // sin comentarios: se mira el código
  assert.match(f, /verificarSesionStaff\(req\)/);
  assert.match(f, /puedeMoverDinero\(sesion\.rol\)/);
  assert.match(f, /const studioId = sesion\.studioId/);
  assert.doesNotMatch(f, /body\.studioId|cuerpo\??\.studioId/, 'el estudio sale de la sesión, nunca del cuerpo');
  assert.match(f, /planificarCambioConDiferencia\(/);
  // Apagada de serie: la puerta de servidor mira el ajuste del estudio.
  assert.match(f, /cobro_proporcional_alta_activo/);
  // La escritura es UNA llamada a la función de base de datos (todo o nada), no tres `.insert/.update` sueltos.
  assert.match(f, /rpc\('cambiar_cuota_con_diferencia'/);
  assert.doesNotMatch(f, /\.insert\(|\.update\(|\.delete\(/);
  // No cobra: ni Stripe ni COBRADO.
  assert.doesNotMatch(f, /from .stripe|stripe\.|COBRADO|confirmarCobro/);
  // Todo cliente de esta ruta filtra por estudio.
  for (const m of f.matchAll(/admin\.from\('([a-z_]+)'\)/g)) {
    const desde = f.indexOf(m[0]);
    assert.match(f.slice(desde, desde + 400), m[1] === 'studios' ? /\.eq\('id', studioId\)/ : /studio_id', studioId/, `${m[1]}: lectura sin filtrar por estudio`);
  }
});

test('la migración: ids deterministas, todo o nada, grants de service_role y verificación', () => {
  const m = leer('supabase/migrations/20261021160100_cambiar_cuota_con_diferencia.sql');
  assert.match(m, /'sus-camb-' \|\| p_sus_actual_id/);
  assert.match(m, /'rec-camb-' \|\| p_sus_actual_id/);
  assert.match(m, /for update/);
  // Revalida bajo candado lo que el servidor leyó antes.
  assert.match(m, /p_fecha_fin_esperada/);
  assert.match(m, /estado in \('PENDIENTE', 'EN_CURSO', 'FALLIDO'\)/);
  assert.match(m, /stripe_subscription_id is not null/);
  assert.match(m, /from public;/);
  assert.match(m, /from anon;/);
  assert.match(m, /from authenticated;/);
  assert.match(m, /to service_role;/);
  assert.match(m, /has_function_privilege\('anon'/);
  assert.match(m, /security definer/);
  assert.match(m, /set search_path = ''/);
  // Nunca nace cobrado desde aquí: lo cobra el servidor por `confirmarCobro`.
  assert.doesNotMatch(m.replace(/--.*$/gm, ''), /'COBRADO'/);
  // Los ids del código y de la migración coinciden.
  const p = leer('lib/billing/prorrateo.ts');
  assert.match(p, /`\$\{PREFIJO_RECIBO_CAMBIO_PLAN\}\$\{suscripcionActualId\}`/);
  assert.match(p, /`sus-camb-\$\{suscripcionActualId\}`/);
});

test('la columna del ajuste: aditiva, apagada de serie y escribible por el navegador solo por su GRANT', () => {
  const m = leer('supabase/migrations/20261021160000_cobro_proporcional_alta.sql');
  assert.match(m, /add column if not exists cobro_proporcional_alta_activo boolean not null default false/);
  assert.match(m, /grant update \(cobro_proporcional_alta_activo\) on public\.studios to authenticated/);
  // Y el código la lee/escribe con ese mismo nombre.
  assert.match(leer('lib/supabase-data.ts'), /db\.cobro_proporcional_alta_activo = changes\.cobroProporcionalAltaActivo/);
  assert.match(leer('lib/supabase-data.ts'), /cobroProporcionalAltaActivo: r\.cobro_proporcional_alta_activo \?\? false/);
});
