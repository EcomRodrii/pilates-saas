import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CODIGO_CUOTA_EN_PAUSA, MENSAJE_CUOTA_EN_PAUSA, pagoOnlineDeRenovacionPermitido, renovacionPorLaAlumna,
} from './renovar-plan-reglas.ts';

// La alumna no renueva desde la app una cuota en PAUSADA (decisión del fundador,
// 5-oct-2026): al cobrarse, la renovación la dejaba ACTIVA sin que el estudio la
// reanudara, y la cobraba. Lo que hoy funciona (cuota vencida, bono agotado o
// caducado, cuota cancelada con la política del estudio) sigue igual.

const SI = { renovarSolaCuotaCancelada: true };
const NO = { renovarSolaCuotaCancelada: false };

test('una cuota en PAUSADA no la renueva la alumna: 409 con código que la app traduce', () => {
  assert.deepEqual(renovacionPorLaAlumna('PAUSADA', SI), { ok: false, codigo: 'cuota-en-pausa', error: MENSAJE_CUOTA_EN_PAUSA });
  assert.equal(CODIGO_CUOTA_EN_PAUSA, 'cuota-en-pausa');
  assert.equal(MENSAJE_CUOTA_EN_PAUSA, 'Tu cuota está en pausa. Habla con tu estudio para reanudarla.');
});

test('lo de siempre sigue: la cuota vencida o el bono agotado (ACTIVA) y lo ya terminado (EXPIRADA)', () => {
  assert.deepEqual(renovacionPorLaAlumna('ACTIVA', NO), { ok: true });
  assert.deepEqual(renovacionPorLaAlumna('EXPIRADA', NO), { ok: true });
});

test('una cuota CANCELADA, según lo que haya elegido el estudio (por defecto sí)', () => {
  assert.deepEqual(renovacionPorLaAlumna('CANCELADA', SI), { ok: true });
  const no = renovacionPorLaAlumna('CANCELADA', NO);
  assert.equal(no.ok, false);
  assert.equal(!no.ok && no.codigo, 'plan-cancelado');
});

test('un estado que no se conoce no se renueva desde la app (falla cerrado)', () => {
  assert.equal(renovacionPorLaAlumna('OTRO_ESTADO', SI).ok, false);
  assert.equal(renovacionPorLaAlumna(null, SI).ok, false);
});

test('pagar online: la renovación de una cuota pausada no; cualquier otro recibo de esa alumna, sí', () => {
  assert.equal(pagoOnlineDeRenovacionPermitido({ es_renovacion: true }, 'PAUSADA'), false);
  assert.equal(pagoOnlineDeRenovacionPermitido({ es_renovacion: false }, 'PAUSADA'), true, 'una venta o una penalización no la descongela');
  assert.equal(pagoOnlineDeRenovacionPermitido({ es_renovacion: true }, 'ACTIVA'), true);
  assert.equal(pagoOnlineDeRenovacionPermitido({ es_renovacion: null }, 'PAUSADA'), true);
});

// ── Las dos puertas (alias `@/`: `node --test` no las carga) ──

const raiz = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

test('/api/public/renovar-plan decide con la regla ANTES de reutilizar o crear el recibo', () => {
  const s = leer('app/api/public/renovar-plan/route.ts');
  const regla = s.indexOf('renovacionPorLaAlumna(sus.estado as string | null, { renovarSolaCuotaCancelada })');
  const respuesta = s.indexOf('return NextResponse.json({ error: puede.error, codigo: puede.codigo }, { status: 409 });', regla);
  const reutiliza = s.indexOf(".in('estado', ['PENDIENTE', 'EN_CURSO'])");
  const crea = s.indexOf("await admin.from('recibos').insert(");
  assert.ok(regla > 0 && respuesta > regla && reutiliza > respuesta && crea > reutiliza);
});

test('/api/stripe/checkout no abre el pago de la renovación de una cuota pausada', () => {
  const s = leer('app/api/stripe/checkout/route.ts');
  assert.match(s, /cobro_mostrador_checkout_session_id, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, entrega_tipo, suscripcion_id, es_renovacion'\)/);
  const mira = s.indexOf('if (recibo.es_renovacion === true && recibo.suscripcion_id) {');
  const abre = s.indexOf('await stripe.checkout.sessions.retrieve(');
  assert.ok(mira > 0 && abre > mira, 'antes de reutilizar o crear ninguna sesión');
  assert.match(s.slice(mira, mira + 1200), /error: MENSAJE_CUOTA_EN_PAUSA, codigo: CODIGO_CUOTA_EN_PAUSA \}, \{ status: 409 \}/);
});
