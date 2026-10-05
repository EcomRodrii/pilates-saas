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
    // La portada (y su h1) sale ya en el HTML, antes que el resto: los campos
    // —el buscador— llegan cuando la guardia de sesión termina.
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });

    const pequenos = await page.evaluate(() => {
      // `pointer: coarse` no se puede emular desde Playwright, así que se
      // comprueba la REGLA: la hoja de estilos tiene que declararla, y el
      // tamaño base de cada campo se lee para dejar constancia. Vale `16px` o
      // `max(16px, …)`: el mínimo es lo que importa; con «Texto más grande» crece.
      // ⚠️ `CSSMediaRule` DE VERDAD (`type === 4`), no un `cssText.includes`.
      // Un comentario mal cerrado justo encima hizo que el navegador se
      // tragara el `@media` entero como selector de una regla inválida: la
      // regla desaparecía de la hoja y un `includes` sobre el texto de
      // cualquier regla seguía encontrando las palabras. El tipo no se puede
      // falsificar así.
      const media = Array.from(document.styleSheets)
        .flatMap((h) => { try { return Array.from(h.cssRules); } catch { return []; } })
        .find((r) => r.type === 4
          && (r as CSSMediaRule).conditionText?.includes('coarse')
          && /font-size:\s*(16px|max\(16px,[^;]*\))\s*!important/.test(r.cssText)) as CSSMediaRule | undefined;
      const regla = Boolean(media);
      // ⚠️ Y que el VALOR se resuelve: con `max(16px, var(--t-body))`, una
      // variable mal escrita o borrada deja la declaración inválida en tiempo de
      // cálculo, el campo HEREDA el tamaño del padre y el `!important` hace que
      // esa herencia gane a todo. La regex seguiría en verde. Se aplica el valor
      // de la regla a un campo de prueba dentro de `.student-app`, con un padre
      // de 10 px, y se mide.
      const decl = Array.from(media?.cssRules ?? [])
        .map((r) => (r as CSSStyleRule).style?.getPropertyValue('font-size'))
        .find((v) => Boolean(v)) ?? '';
      const app = document.querySelector('.student-app');
      let efectivo = 0;
      if (app && decl) {
        const padre = document.createElement('div');
        padre.style.fontSize = '10px';
        const sonda = document.createElement('input');
        sonda.style.setProperty('font-size', decl, 'important');
        padre.appendChild(sonda);
        app.appendChild(padre);
        efectivo = parseFloat(getComputedStyle(sonda).fontSize);
        padre.remove();
      }
      const campos = Array.from(document.querySelectorAll('input, textarea, select')).map((e) => ({
        que: (e.getAttribute('name') || e.getAttribute('type') || e.tagName).slice(0, 20),
        px: parseFloat(getComputedStyle(e).fontSize),
      }));
      return { regla, campos, efectivo, decl };
    });

    // El `!important` NO es cosmético y por eso se afirma: el buscador de
    // Inicio, el del horario y varios campos más llevan su `font-size` en un
    // `style` EN LÍNEA, que gana a cualquier regla de hoja sin él. La versión
    // anterior de este test daba VERDE con la regla puesta y el zoom seguía
    // pasando, porque solo comprobaba que la regla existiera.
    expect(pequenos.regla, 'la hoja impone el mínimo de 16 px (y gana a los `style` en línea)').toBe(true);
    expect(pequenos.campos.length, 'hay algún campo que mirar').toBeGreaterThan(0);
    expect(pequenos.efectivo, `el valor de la regla (${pequenos.decl}) se resuelve a 16 px o más`).toBeGreaterThanOrEqual(16);
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
