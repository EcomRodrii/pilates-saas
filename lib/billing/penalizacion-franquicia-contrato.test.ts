// «Se cobra a partir de la falta N» (migr 20261110121922): el cron lo decide, y solo puede cobrar MENOS. Contrato estático
// de que la decisión está donde tiene que estar y cuenta lo que tiene que contar (la regla pura vive y se prueba en
// penalizacion-aprobar-reglas.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cron = readFileSync(join(import.meta.dirname, '..', 'inngest', 'penalizaciones.ts'), 'utf8');
const migracion = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261110121922_penalizacion_umbral.sql'), 'utf8');

test('la franquicia se decide ANTES de mirar Stripe y el consentimiento, para no avisar de un cargo bloqueado que nunca se cobraría', () => {
  const franquicia = cron.indexOf('omitirPorFranquicia({');
  const stripe = cron.indexOf('if (!studio.stripe_account_id) return;');
  const consentimiento = cron.indexOf('consentimientoCubrePenalizacion({');
  assert.ok(franquicia > 0 && stripe > franquicia && consentimiento > franquicia, 'orden de las guardias del cron');
});

test('cuenta las faltas ANTERIORES del cliente y de su estudio, sin las revertidas, dentro de la ventana', () => {
  assert.match(cron, /\.eq\('studio_id', pen\.studio_id\)\.eq\('socio_id', pen\.socio_id\)\.neq\('estado', 'OMITIDA_REVERTIDA'\)/);
  assert.match(cron, /desdeVentanaDeFaltas\(new Date\(detectada\)\.toISOString\(\), ventana\)/);
  // El desempate usa el instante TAL CUAL (microsegundos): `toISOString()` lo truncaba a ms y dos faltas de la misma transacción no se contaban.
  assert.match(cron, /const detectada = pen\.detectada_en;/);
  assert.match(cron, /detectada_en\.lt\.\$\{detectada\},and\(detectada_en\.eq\.\$\{detectada\},id\.lt\.\$\{pen\.id\}\)/);
});

test('sin poder contar las faltas no se decide nada (nunca se cobra «por si acaso»)', () => {
  assert.match(cron, /if \(errFaltas\) return;/);
});

test('la salida de DETECTADA es compare-and-set y suelta el recibo, como las demás omitidas', () => {
  const bloque = cron.slice(cron.indexOf("estado: 'OMITIDA_FRANQUICIA'"), cron.indexOf("estado: 'OMITIDA_FRANQUICIA'") + 400);
  assert.match(bloque, /recibo_id: null/);
  assert.match(bloque, /\.in\('estado', \[\.\.\.DESDE_DETECTADA\]\)/);
});

test('el revert del no-show cubre también las faltas ya omitidas, para que una asistencia corregida no siga contando', () => {
  const revert = migracion.slice(migracion.indexOf("elsif old.estado = 'NO_ASISTIO'"));
  for (const e of ['DETECTADA', 'PENDIENTE_APROBACION', 'OMITIDA_FRANQUICIA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_SIN_CUOTA']) {
    assert.match(revert, new RegExp(`'${e}'`), e);
  }
  // Las que movieron dinero NO se revierten solas: eso pide un reembolso explícito.
  for (const e of ['RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA']) assert.doesNotMatch(revert, new RegExp(`'${e}'`), e);
});

test('authenticated puede escribir las dos columnas nuevas de studios (solo escribe por lista blanca de columnas)', () => {
  assert.match(migracion, /grant update \(penalizacion_umbral_faltas, penalizacion_umbral_ventana_dias\) on public\.studios to authenticated;/);
});

test('el umbral y su ventana tienen los topes de la base de datos y el estado nuevo está en el CHECK', () => {
  assert.match(migracion, /penalizacion_umbral_faltas smallint not null default 1/);
  assert.match(migracion, /check \(penalizacion_umbral_faltas between 1 and 10\)/);
  assert.match(migracion, /penalizacion_umbral_ventana_dias in \(30, 60, 90, 180, 365\)/);
  assert.match(migracion, /'OMITIDA_FRANQUICIA'/);
});
