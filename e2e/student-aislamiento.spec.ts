import { test, expect } from '@playwright/test';
import { SLUG, sembrarSociaLista } from './socia-lista';

// Aislamiento por estudio, desde la interfaz.
//
// La prueba de fondo se hizo contra el servidor real atacándolo con una sesión
// legítima (401 en reservar, cancelar y editar ficha ajena de otro estudio, y
// el `id` del cuerpo ignorado al actualizar). Esto cubre la otra mitad: que la
// APP no se cuele a un estudio que no es el suyo cambiando el slug.

test.describe('Student PWA · aislamiento', () => {
  test('un slug desconocido NUNCA enseña el interior de otro estudio', async ({ page }) => {
    // ⚠️ Aquí NO se comprueba el código 404, y es a propósito. La suite corre
    // con un Supabase falso (`example.supabase.co`), así que la resolución del
    // estudio —que es de SERVIDOR y `page.route` no puede interceptar— falla
    // siempre. Con eso, todo slug cae en «no se ha podido leer», que desde F3
    // es un caso distinto de «no existe»: el primero enseña el error boundary
    // con reintento (200) y solo el segundo da 404.
    //
    // Esa distinción es deliberada —un parpadeo de la base de datos no puede
    // decirle a una clienta que su estudio no existe— y hace que el CÓDIGO no
    // sea comprobable sin base de datos. Lo que sí se comprueba, y es lo que
    // importa para el aislamiento, es que por ahí no se cuela contenido.
    await sembrarSociaLista(page);
    await page.goto('/portal/estudio-que-no-existe');
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('todos los enlaces de la app cuelgan del slug del estudio', async ({ page }) => {
    // Un enlace absoluto ('/reservar') mandaría a la alumna a la página pública
    // de otro sitio o a la landing de Tentare. El paquete los trae así.
    await sembrarSociaLista(page);
    await page.goto(`/portal/${SLUG}`);
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 30_000 });

    const hrefs = await page.locator('a[href^="/"]').evaluateAll(
      (as) => as.map((a) => a.getAttribute('href') ?? ''),
    );
    const fuera = hrefs.filter((h) => !h.startsWith(`/portal/${SLUG}`) && h !== '/portal/offline');
    expect(fuera, `enlaces fuera del estudio: ${fuera.join(', ')}`).toEqual([]);
  });
});
