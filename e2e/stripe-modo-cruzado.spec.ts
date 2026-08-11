import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La protección contra mezclar modos de Stripe, comprobada a través del runtime
// real y no solo con la función pura.
//
// El caso que cierra: copiar el `.env.local` de producción a una máquina de
// desarrollo —cosa que pasa constantemente— deja cualquier `npm run dev` a un
// clic de cobrar de verdad a una socia real. Aquí el servidor de pruebas corre
// con una clave `sk_live_` falsa fuera de producción, que es exactamente esa
// situación.
//
// Se ejecuta con:
//   STRIPE_SECRET_KEY=sk_live_FALSA npx playwright test e2e/stripe-modo-cruzado.spec.ts
// Sin esa variable el servidor no tiene clave, el modo es «sin configurar» y el
// endpoint corta antes por otro motivo — por eso el test se salta solo.
// ─────────────────────────────────────────────────────────────────────────────

const clave = process.env.STRIPE_SECRET_KEY ?? '';
const conClaveLive = clave.startsWith('sk_live_');

test.describe('Una clave live fuera de producción no puede cobrar', () => {
  test.skip(!conClaveLive, 'necesita STRIPE_SECRET_KEY=sk_live_… en el entorno del servidor');

  test('/api/stripe/checkout responde 503 y explica por qué', async ({ request }) => {
    const res = await request.post('/api/stripe/checkout', {
      data: { studioId: 'studio-test', planId: 'plan-1' },
    });

    expect(res.status()).toBe(503);
    const body = await res.json();
    // El mensaje tiene que nombrar el riesgo, no decir «error de configuración»:
    // quien lo lee está a punto de cobrarle a alguien de verdad.
    expect(body.error).toMatch(/dinero real/i);
    expect(body.error).toMatch(/sk_test_/);
  });

  test('corta ANTES de mirar el plan: no depende de que exista', async ({ request }) => {
    // Con un plan inexistente, sin el guardia la ruta respondería 404. Que siga
    // dando 503 prueba que el corte va primero, antes de tocar la base.
    const res = await request.post('/api/stripe/checkout', {
      data: { studioId: 'no-existe', planId: 'tampoco-existe' },
    });
    expect(res.status()).toBe(503);
  });
});
