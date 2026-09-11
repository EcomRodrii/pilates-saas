import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Dos fallos que solo salieron al abrir la app en un iPhone de verdad.
//
// Ninguno de los dos lo podía ver la suite: el primero es un campo que no
// viajaba —así que en el andamiaje el resultado era el mismo—, y el segundo es
// una regla de Safari que Chromium no aplica. Se fijan aquí porque la causa sí
// es comprobable sin un iPhone.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · lo que enseñó el iPhone', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('ningún campo baja de 16 px con pantalla táctil', async ({ page }) => {
    // Safari de iOS hace zoom a la página al enfocar un input de menos de
    // 16 px, y al cerrar el teclado no vuelve solo: la home se queda encogida
    // con márgenes grises y la cuarta baldosa cortada. Se arregla con el
    // tamaño; `maximum-scale=1` lo «arreglaría» quitándole el zoom a quien ve
    // poco.
    await sembrarSociaCompleta(page);
    await page.emulateMedia({ reducedMotion: null });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    const pequenos = await page.evaluate(() => {
      // `pointer: coarse` no se puede emular desde Playwright, así que se
      // comprueba la REGLA: la hoja de estilos tiene que declararla, y el
      // tamaño base de cada campo se lee para dejar constancia.
      const regla = Array.from(document.styleSheets)
        .flatMap((h) => { try { return Array.from(h.cssRules); } catch { return []; } })
        .some((r) => r.cssText.includes('pointer: coarse') && r.cssText.includes('font-size: 16px'));
      const campos = Array.from(document.querySelectorAll('input, textarea, select')).map((e) => ({
        que: (e.getAttribute('name') || e.getAttribute('type') || e.tagName).slice(0, 20),
        px: parseFloat(getComputedStyle(e).fontSize),
      }));
      return { regla, campos };
    });

    expect(pequenos.regla, 'la hoja declara el mínimo de 16 px para pantalla táctil').toBe(true);
    expect(pequenos.campos.length, 'hay algún campo que mirar').toBeGreaterThan(0);
  });

  test('la portada es la del PORTAL, nunca la foto de la propietaria', async ({ page }) => {
    // `studios.foto_url` es la foto de perfil de la propietaria (bucket
    // `avatars`). Salía de portada en la app de sus alumnas: el héroe era un
    // primer plano de una cara. La buena es `imagen_bienvenida_url`.
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const foto = page.locator('main.page > section img').first();
    await expect(foto).toBeVisible({ timeout: 30_000 });
    const src = await foto.getAttribute('src');
    expect(src, 'hay portada').toBeTruthy();
    expect(src!, 'la portada NO sale del bucket de avatares').not.toMatch(/\/avatars\//);
    expect(src!, 'y menos de un fichero admin-studio-*').not.toMatch(/admin-studio/);
  });
});
