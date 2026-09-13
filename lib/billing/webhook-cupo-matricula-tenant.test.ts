import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// C-1 (auditoría 59ª pasada, 13-sep-2026).
//
// `liberarCupoMatriculaDelWebhook` devolvía una plaza de "matrícula gratis para
// las N primeras" fiándose de `metadata.studioId` y `metadata.planId` a secas.
// A `/api/stripe/webhook` entran los eventos de TODAS las cuentas Connect, así
// que cualquier estudio podía crear PaymentIntents de un céntimo en su propia
// cuenta con la metadata apuntando a OTRO estudio, dejarlos fallar, y
// decrementar `matricula_gratis_usados` de la víctima una vez por PaymentIntent
// — regalando matrículas (dinero real) sin tope, porque la idempotencia es por
// PaymentIntent y no por estudio.
//
// Su gemelo, escrito en la MISMA pasada unas líneas más arriba
// (`liberarCobroPosFallidoDelWebhook`), sí resolvía el estudio por la cuenta que
// firma. Es el patrón «arreglar un endpoint y no su hermano» que este repo
// arrastra: la regla D-3 de la 22ª pasada dice que el tenant NUNCA sale de la
// metadata, y aquí volvió a salir de ahí.
//
// ── Por qué un test sobre el FUENTE y no sobre el comportamiento ─────────────
// El fallo no es de lógica: la lógica (`tenantAutorizado`) ya existía y ya
// estaba testeada. El fallo es NO LLAMARLA. Eso no lo ve `tsc`, no lo ve un
// unitario de `tenantAutorizado`, y solo se vería montando Stripe entero. Lo
// que hay que sujetar es que la puerta siga en su sitio, que es exactamente lo
// que hacen los otros guardianes de este repo (`liberar-cupo-solo-servidor`,
// `panel-apariencia`).
// ─────────────────────────────────────────────────────────────────────────────

const RUTA = join(import.meta.dirname, '..', '..', 'app', 'api', 'stripe', 'webhook', 'route.ts');

/** El cuerpo de una `async function <nombre>(` hasta su llave de cierre. */
function cuerpoDe(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`async function ${nombre}(`);
  assert.notEqual(inicio, -1, `no existe la función ${nombre} en app/api/stripe/webhook/route.ts`);
  const abre = fuente.indexOf('{', fuente.indexOf(')', inicio));
  let nivel = 0;
  for (let i = abre; i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++;
    else if (fuente[i] === '}' && --nivel === 0) return fuente.slice(abre, i + 1);
  }
  throw new Error(`no se pudo delimitar el cuerpo de ${nombre}`);
}

test('⚠️ liberar cupo de matrícula desde el webhook resuelve el estudio por la cuenta que FIRMA', () => {
  const cuerpo = cuerpoDe(readFileSync(RUTA, 'utf8'), 'liberarCupoMatriculaDelWebhook');

  assert.match(cuerpo, /studioDeCuentaConnect\(\s*admin\s*,\s*event\.account\s*\)/,
    'el estudio tiene que salir de `event.account`, nunca de la metadata (D-3, 22ª pasada)');
  assert.match(cuerpo, /tenantAutorizado\(/,
    'falta la comprobación de que la cuenta que firma corresponde al estudio de la metadata');
});

test('⚠️ la plaza se devuelve al estudio de la cuenta firmante, no al que diga la metadata', () => {
  const cuerpo = cuerpoDe(readFileSync(RUTA, 'utf8'), 'liberarCupoMatriculaDelWebhook');

  const llamada = cuerpo.match(/liberarCupoMatriculaUnaVez\([^)]*\)/s);
  assert.ok(llamada, 'la función ya no libera ningún cupo: si eso es a propósito, retira este guardián');
  assert.doesNotMatch(llamada[0], /studioIdMetadata|metadata\.studioId/,
    'el studioId que llega a la RPC no puede ser el de la metadata: tiene que ser el resuelto por la cuenta Connect');
  assert.match(llamada[0], /studioDeCuenta/,
    'se espera `studioDeCuenta` (el resuelto por la cuenta que firma) como estudio destino');
});

test('⚠️ los dos eventos que liberan cupo le pasan el `event` (sin él no hay cuenta que comprobar)', () => {
  const fuente = readFileSync(RUTA, 'utf8');

  // `payment_intent.payment_failed` y `checkout.session.expired`.
  const llamadas = [...fuente.matchAll(/await liberarCupoMatriculaDelWebhook\(([^)]*)\)/g)];
  assert.equal(llamadas.length, 2,
    'se esperaban exactamente 2 invocaciones (pago rechazado y sesión caducada); si aparece una tercera, revísala también');
  for (const l of llamadas) {
    assert.match(l[1], /\bevent\b/,
      'esta invocación no pasa el evento, así que la función no puede resolver la cuenta firmante');
  }
});
