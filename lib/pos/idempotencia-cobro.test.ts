import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// POS-1: cada intento de cobro lleva su clave ante Stripe. Sin ella, un doble
// toque o un reintento tras un timeout abre un segundo PaymentIntent y el
// datáfono (o el enlace Bizum) cobra dos veces. No hay datáfono en CI: esto
// solo impide que la clave desaparezca sin que nadie lo note.
const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8');

test('los tres create de Stripe del TPV pasan idempotencyKey derivada del intento', () => {
  const t = leer('./terminal.ts');
  assert.match(t, /idempotencyKey: `\$\{p\.claveIdempotencia\}-pi`/);
  assert.match(t, /idempotencyKey: `\$\{p\.claveIdempotencia\}-lector`/);
  assert.match(t, /idempotencyKey: `\$\{p\.claveIdempotencia\}-cs`/);
});

test('venta y recibo mandan la clave; la del recibo cambia al cambiar la referencia guardada', () => {
  assert.match(leer('../../app/api/pos/venta/route.ts'), /claveIdempotencia: `pos-venta-\$\{base\.ventaId\}-\$\{metodoPago\}`/);
  assert.match(leer('../../app/api/pos/recibo/route.ts'), /claveIdempotencia: `pos-recibo-\$\{reciboId\}-\$\{metodo\}-\$\{recibo\.cobro_mostrador_pi \?\? 'sin'\}`/);
});
