import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cadenaPagaSusSedes, sedeIncluidaEnSuCadena } from './sede-incluida-en-cadena.ts';

// ── La regla ────────────────────────────────────────────────────────────────

test('cadena con suscripción viva: la sede ya está pagada', () => {
  for (const estado of ['active', 'trialing', 'past_due', 'unpaid']) {
    assert.equal(cadenaPagaSusSedes(estado), true, estado);
  }
});

test('checkout de cadena abandonado (sin estado): la sede puede contratar su plan', () => {
  assert.equal(cadenaPagaSusSedes(null), false);
  assert.equal(cadenaPagaSusSedes(undefined), false);
});

test('cadena que ya no está viva: la sede puede contratar su plan', () => {
  for (const estado of ['canceled', 'incomplete', 'incomplete_expired', 'trial_expirado']) {
    assert.equal(cadenaPagaSusSedes(estado), false, estado);
  }
});

// ── La lectura ──────────────────────────────────────────────────────────────

type Respuesta = { data: { subscription_status: string | null } | null; error: { message: string } | null };

function adminFalso(cadena: Respuesta) {
  const consultas: string[] = [];
  const admin = {
    from(tabla: string) {
      return {
        select(columnas: string) {
          return {
            eq(col: string, val: string) {
              consultas.push(`${tabla}:${columnas}:${col}=${val}`);
              return { maybeSingle: () => Promise.resolve(cadena) };
            },
          };
        },
      };
    },
  };
  return { admin: admin as never, consultas };
}

test('el caso que se cierra: sede añadida a una cadena activa (subscription_id NULL en la sede)', async () => {
  const { admin, consultas } = adminFalso({ data: { subscription_status: 'active' }, error: null });
  assert.equal(await sedeIncluidaEnSuCadena(admin, 'cadena-1'), true);
  assert.deepEqual(consultas, ['cadenas:subscription_status:id=cadena-1']);
});

test('estudio sin cadena: no está incluida y ni se consulta cadenas', async () => {
  const { admin, consultas } = adminFalso({ data: { subscription_status: 'active' }, error: null });
  assert.equal(await sedeIncluidaEnSuCadena(admin, null), false);
  assert.deepEqual(consultas, []);
});

test('sede vinculada a una cadena sin suscripción (checkout abandonado): no está incluida', async () => {
  const { admin } = adminFalso({ data: { subscription_status: null }, error: null });
  assert.equal(await sedeIncluidaEnSuCadena(admin, 'cadena-1'), false);
});

test('cadena que no aparece: no está incluida', async () => {
  const { admin } = adminFalso({ data: null, error: null });
  assert.equal(await sedeIncluidaEnSuCadena(admin, 'cadena-x'), false);
});

test('si la lectura de la cadena falla, lanza: sin saberlo no se abre un Checkout', async () => {
  const { admin } = adminFalso({ data: null, error: { message: 'timeout' } });
  await assert.rejects(sedeIncluidaEnSuCadena(admin, 'cadena-1'), /leer cadena: timeout/);
});

// ── La ruta la usa antes de tocar nada ──────────────────────────────────────

test('/api/billing/checkout lo comprueba para los planes individuales, antes del descuento y de Stripe', () => {
  const ruta = join(import.meta.dirname, '..', '..', 'app', 'api', 'billing', 'checkout', 'route.ts');
  const codigo = readFileSync(ruta, 'utf8');
  const guard = codigo.indexOf('sedeIncluidaEnSuCadena(admin, studio.cadena_id');
  assert.ok(guard > 0, 'la ruta ya no llama a sedeIncluidaEnSuCadena');
  assert.match(codigo.slice(0, guard), /if \(plan !== 'CADENA'\) \{[^}]*$/, 'el guard debe ir en un `if (plan !== \'CADENA\')`');
  for (const despues of ["from('review_boost_recompensas')", 'stripe.customers.create(', 'stripe.checkout.sessions.create(']) {
    const i = codigo.indexOf(despues);
    assert.ok(i > guard, `${despues} tiene que ir después del guard de cadena`);
  }
});
