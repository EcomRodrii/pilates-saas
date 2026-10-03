import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAG_REDACCION_IA, redaccionIaActiva } from './redaccion-ia.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

test('opt-out: solo un `false` explícito del propio flag apaga la IA', () => {
  assert.equal(redaccionIaActiva([]), true);
  assert.equal(redaccionIaActiva([{ flag: FLAG_REDACCION_IA, activo: true }]), true);
  assert.equal(redaccionIaActiva([{ flag: FLAG_REDACCION_IA, activo: false }]), false);
  // Apagar otro flag (un especialista) no apaga la redacción.
  assert.equal(redaccionIaActiva([{ flag: 'RETENCION', activo: false }]), true);
});

test('las cuatro puertas por las que la IA redacta sola respetan el interruptor', () => {
  // Guardia estática: si alguien añade otra llamada automática a Anthropic con
  // datos de alumnas, tiene que pasar por aquí o este test le obliga a decidir.
  assert.match(leer('lib/decision/redaccion.ts'), /input\.conIA === false\) return aResultadoSerializable\(fallback\)/);
  assert.match(leer('lib/decision/personalizacion.ts'), /if \(ctx\.conIA === false\) return base;/);
  const auto = leer('lib/inngest/automatizaciones.ts');
  assert.match(auto, /if \(!conIA\) return fallback;/);
  assert.equal((auto.match(/redactarConIA\(\n/g) ?? []).length, (auto.match(/opts\.conIA,/g) ?? []).length,
    'cada redactarConIA lleva opts.conIA');
  const decision = leer('lib/inngest/decision.ts');
  assert.equal((decision.match(/personalizarMensajeSocia\(base/g) ?? []).length, 2);
  assert.equal((decision.match(/dbRedaccionIaActiva\(r\.studioId\)/g) ?? []).length, 2);
  assert.match(decision, /items: paraRedactar, conIA \}/);
  assert.match(leer('app/api/automatizaciones/run/route.ts'), /dbRedaccionIaActiva\(sesion\.studioId\)/);
});

test('el lector del interruptor falla CERRADO', () => {
  const db = leer('lib/decision/db.ts');
  const f = db.slice(db.indexOf('export async function dbRedaccionIaActiva'));
  assert.match(f.slice(0, 600), /if \(error\) \{ reportError\('\[dbRedaccionIaActiva\]', error\); return false; \}/);
});
