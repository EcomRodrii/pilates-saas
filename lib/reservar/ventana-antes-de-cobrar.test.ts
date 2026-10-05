import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pagar una clase suelta sin cuenta cobra PRIMERO y reserva DESPUÉS (webhook →
// `reservarPlazaTrasPagoPublico`), y esa reserva comprueba la ventana de reserva.
// Si la puerta de pago no la mira antes, cobrar una clase que aún no se abre —o
// que ya se cerró— es cobrar sin plaza. Con la reserva abriéndose a una hora
// fija (mucha gente a la vez a las 20:00) ese caso deja de ser raro.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

for (const ruta of ['app/api/stripe/checkout/route.ts', 'app/api/public/checkout-embebido/route.ts']) {
  test(`${ruta} comprueba la ventana de reserva antes de cobrar`, () => {
    const fuente = leer(ruta);
    const ventana = fuente.indexOf('comprobarVentanaReserva(');
    assert.ok(ventana > 0, 'no llama a comprobarVentanaReserva');
    // Antes de crear nada en Stripe (la llamada de verdad, no un comentario que la
    // nombre): directa con `await`, o dentro de la función que crea el cobro
    // (`crearSesion`/`crearCobro`, que también mira la repetición idempotente).
    const cobro = fuente.search(/(?:await\s+|=>\s*)(?:stripe|getStripe\(\))\S*\.(?:paymentIntents|checkout\.sessions)\.create\(/);
    assert.ok(cobro > 0, 'no se encuentra la llamada que crea el cobro: el test ya no mira nada');
    assert.ok(ventana < cobro, 'la ventana se comprueba después de crear el cobro');
  });
}

test('la reserva tras pagar usa la misma ventana que las puertas de pago', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  const tras = fuente.slice(fuente.indexOf('export async function reservarPlazaTrasPagoPublico'));
  assert.match(tras.slice(0, 4000), /ventanaCerrada\(/);
});
