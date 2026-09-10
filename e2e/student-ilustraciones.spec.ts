import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Las ilustraciones de los estados vacíos.
//
// ⚠️ Lo que se prueba aquí no es que se vean bonitas, sino que se TIÑEN con la
// marca del estudio. Este portal es marca blanca: los trece estudios de
// producción son índigo, violeta o tostado, y una ilustración con color propio
// —de un banco de imágenes o escrita a mano en el SVG— es la misma trampa que
// la barra del bono en verde (#1832) o el ✓ de acento sobre un muro (#1827).
//
// Se mide el color COMPUTADO del relleno, no la clase ni el `var()`: una
// ilustración puede referenciar `--accent` y quedarse igual si el token no
// llega hasta ella.
//
// ⚠️ El acento se inyecta en SERVIDOR (`acentoCssText`, en el layout del
// portal), así que `page.route` no puede cambiarlo. Por eso este fichero se
// apoya en `E2E_COLOR_PRIMARIO` (lib/studio-seo.ts), la misma palanca que ya
// usan `E2E_LOGO_URL` y `E2E_PAGINA_OCULTA`.

const base = `/portal/${SLUG}`;

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [];
  f.sesiones = [];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

test.describe('Student PWA · ilustraciones de los estados vacíos', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('el estado vacío trae ilustración, no un recuadro con texto', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No tienes clases próximas')).toBeVisible({ timeout: 30_000 });
    const svg = page.locator('svg[viewBox="0 0 160 120"]').first();
    await expect(svg, 'no se pinta ninguna ilustración').toBeVisible();
  });

  test('se tiñe con el acento del estudio, sin un solo color escrito a mano', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('No tienes ningún bono')).toBeVisible({ timeout: 30_000 });

    const medida = await page.evaluate(() => {
      const svg = document.querySelector('svg[viewBox="0 0 160 120"]');
      if (!svg) return null;
      const raiz = document.querySelector('.student-app') ?? document.documentElement;
      const tono = (n: string) => getComputedStyle(raiz).getPropertyValue(n).trim();
      // Todo lo que pinta: relleno y trazo de cada forma.
      const pintados = [...svg.querySelectorAll('*')].flatMap((el) => {
        const s = getComputedStyle(el);
        return [s.fill, s.stroke];
      }).filter((c) => c && c !== 'none' && !c.startsWith('rgba(0, 0, 0, 0)'));
      return { pintados: [...new Set(pintados)], accent: tono('--accent'), soft: tono('--accent-soft'), deep: tono('--accent-deep-muted'), card: tono('--card') };
    });

    expect(medida, 'no hay ilustración que medir').not.toBeNull();
    const m = medida!;
    const aRgb = (hex: string) => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const permitidos = new Set([m.accent, m.soft, m.deep, m.card].map(aRgb));
    const intrusos = m.pintados.filter((c) => !permitidos.has(c));
    expect(intrusos, `la ilustración pinta con colores que no son del estudio: ${intrusos.join(', ')}`).toEqual([]);
  });
});
