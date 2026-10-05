import { test, expect, type Page, type Route } from '@playwright/test';
import { SLUG, fixtureSociaLista } from './socia-lista';
import { sembrarSociaCompleta } from './socia-completa';

// Cambiar de pestaña en la app de la alumna tiene que ser instantáneo: lo último
// que vio se pinta al momento (sin esqueleto) y se refresca por detrás
// (`useAsync` con `clave`, `useSesionWidget` con la sesión recordada).
//
// ⚠️ Y la otra cara, la que importa más: eso es una caché de datos de la socia,
// y una caché «por estudio» ya le sirvió una vez a una alumna lo de la anterior
// en la misma tablet. Lo guardado va POR PERSONA (la de la sesión del
// dispositivo), así que si cambia la persona no se enseña ni un fotograma de lo
// de la otra. Se vigila con un MutationObserver puesto ANTES de navegar: mirar
// el DOM al final no vería un parpadeo.

const base = `/portal/${SLUG}`;
const pestana = (page: Page, nombre: string) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: nombre });

/** Apunta si, desde ahora, aparece en `main` algo que case con `patron`, o un esqueleto. */
async function vigilar(page: Page, patron: string) {
  await page.evaluate((p) => {
    const w = window as unknown as { __visto: { texto: boolean; esqueleto: boolean } };
    w.__visto = { texto: false, esqueleto: false };
    const re = new RegExp(p);
    const mirar = () => {
      const main = document.querySelector('main');
      if (main && re.test(main.textContent ?? '')) w.__visto.texto = true;
      if (document.querySelector('.skel')) w.__visto.esqueleto = true;
    };
    new MutationObserver(mirar).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, patron);
}
const visto = (page: Page) => page.evaluate(() => (window as unknown as { __visto: { texto: boolean; esqueleto: boolean } }).__visto);

test.describe('Student PWA · pestañas al instante', () => {
  test.describe.configure({ timeout: 150_000 });

  test('volver a una pestaña ya vista la pinta al momento, sin esqueleto ni animación de entrada', async ({ page }) => {
    await sembrarSociaCompleta(page, { reservada: true });
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('proxima-clase')).toBeVisible({ timeout: 60_000 });

    await pestana(page, 'Bonos').click();
    // Primera visita a Bonos: en `next dev` la ruta se compila ahora.
    await expect(page).toHaveURL(new RegExp(`${base}/bonos$`), { timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });

    await vigilar(page, '$^');
    await pestana(page, 'Mis clases').click();
    await expect(page.getByTestId('proxima-clase')).toBeVisible();
    expect((await visto(page)).esqueleto, 'al volver a «Mis clases» no debe pasar por el esqueleto').toBe(false);
    // La pantalla ya vista no repite su entrada (`data-revisita` apaga `.a-up`/`.a-pop`).
    await expect(page.locator('.shell[data-revisita]')).toHaveCount(1);
  });

  test('si en el dispositivo entra OTRA alumna, no ve ni un instante lo que vio la anterior', async ({ page }) => {
    await sembrarSociaCompleta(page, { reservada: true });

    // La segunda alumna: otro token, otra ficha, ninguna reserva. Lo decide el
    // servidor por el token (como en producción), así que las rutas miran la
    // cabecera; la primera sigue con lo de `sembrarSociaCompleta`.
    const esB = (r: Route) => (r.request().headers()['authorization'] ?? '') === 'Bearer token-b';
    const f = fixtureSociaLista() as unknown as { socia: Record<string, unknown> };
    f.socia = { socio: { id: 'socio-b', nombre: 'Bea Otra', email: 'bea@example.com' }, reservas: [], suscripciones: [], plazasFijas: [], recibos: [] };
    let pedidasPorB = 0;
    await page.route('**/api/public/studio-data', async (r) => {
      if (!esB(r)) return r.fallback();
      pedidasPorB++;
      // Lenta a propósito: la guardia de sesión ya ha dejado pasar a la segunda
      // cuando sus datos aún no han llegado, que es el hueco en el que una
      // memoria sin persona pintaría los de la primera.
      await new Promise((ok) => setTimeout(ok, 2500));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...f, aforoReservas: [] }) });
    });
    await page.route((u) => u.pathname === '/api/public/session', (r) => (esB(r)
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ socioId: 'socio-b', nombre: 'Bea Otra', email: 'bea@example.com' }) })
      : r.fallback()));

    // La primera ve su clase en «Mis clases»…
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('proxima-clase')).toContainText('Reformer', { timeout: 60_000 });
    await pestana(page, 'Bonos').click();
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });

    // …y sin recargar, la sesión del dispositivo pasa a ser de otra persona.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('sb-portal-auth') ?? '{}');
      localStorage.setItem('sb-portal-auth', JSON.stringify({
        ...s, access_token: 'token-b', refresh_token: 'refresh-b',
        user: { ...s.user, id: 'auth-b', email: 'bea@example.com' },
      }));
    });

    await vigilar(page, 'Reformer');
    await pestana(page, 'Mis clases').click();
    await expect(page.getByText('No tienes clases próximas')).toBeVisible({ timeout: 45_000 });
    // Contador: la pantalla de verdad se pidió con la sesión de la segunda.
    expect(pedidasPorB).toBeGreaterThan(0);
    expect((await visto(page)).texto, 'la clase de la primera alumna no puede asomar en la pantalla de la segunda').toBe(false);
  });
});
