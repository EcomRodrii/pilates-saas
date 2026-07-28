import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El callejón sin salida del portal.
//
// `/portal/[slug]/login` decía: "¿Eres nueva? Habla con tu instructora para que
// te añada como socia y puedas acceder." Y no era verdad: cualquiera puede
// apuntarse sola desde `/reservar/[slug]` (magic link + nombre + aceptar las
// condiciones), que crea la ficha por su cuenta.
//
// El resultado era que la clienta nueva que llegaba al portal —el enlace que el
// estudio comparte— se quedaba parada, cuando la puerta estaba abierta al lado.
// Las dos páginas no tenían un solo enlace entre ellas.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';

test.describe('El login del portal no es un callejón sin salida', () => {
  test('ofrece apuntarse en vez de mandar a hablar con la instructora', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);

    // La puerta real, con su enlace.
    // El texto cambió con el rediseño (v2); el contrato que protege este test
    // —que la puerta existe y lleva a /reservar— es el mismo.
    const apuntarse = page.getByRole('link', { name: /reserva tu primera clase/i });
    await expect(apuntarse).toBeVisible({ timeout: 30_000 });
    await expect(apuntarse).toHaveAttribute('href', `/reservar/${SLUG}`);

    // Y ya no se le dice que dependa de que alguien la dé de alta.
    await expect(page.getByText(/habla con tu instructora/i)).toHaveCount(0);
  });

  // No se comprueba que el clic NAVEGUE: eso probaría el router de Next, no este
  // cambio, y resultó frágil (el clic no llegaba a navegar en el entorno de
  // test). Con el href correcto y el mensaje falso fuera, el contrato está fijado.
});
