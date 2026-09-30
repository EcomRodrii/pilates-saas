import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, SOCIO_ID } from './socia-completa';

// Inicio de la app de la alumna: la cabecera y la portada salen en el HTML y NO
// esperan a `/api/public/session` (StudentShell → ShellConHeroe). Antes la
// guardia tapaba la pantalla entera hasta que respondía: con 4G, ~2,5 s en
// blanco (medido en producción el 30-sep-2026).
//
// Las dos caras hacen falta: que con sesión se vea antes, y que SIN sesión en
// el dispositivo no se vea nunca (quien no ha entrado no ve la app antes del
// acceso — lo marca un script en línea antes de pintar).

test.setTimeout(120_000);

test('con sesión, la portada sale sin esperar a la sesión, y no se vuelve a montar al resolverse', async ({ page }) => {
  await sembrarSociaCompleta(page, { bono: 5, sinReloj: true });
  let peticionesSesion = 0;
  let soltar!: () => void;
  const retenida = new Promise<void>((r) => { soltar = r; });
  // Después del andamiaje: manda sobre su mock de la sesión.
  await page.route((u) => u.pathname === '/api/public/session', async (r) => {
    peticionesSesion++;
    await retenida;
    await r.fulfill({ json: { socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' } });
  });

  await page.goto(`/portal/${SLUG}`);
  const foto = page.locator('img[fetchpriority="high"]').first();
  await expect(foto).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Reservar clase' })).toBeVisible();
  // La sesión se ha pedido y sigue sin contestar: lo de debajo aún espera.
  await expect.poll(() => peticionesSesion).toBeGreaterThan(0);
  await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
  const laMisma = await foto.elementHandle();

  soltar();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana Test', { timeout: 30_000 });
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  expect(await laMisma!.evaluate((el) => el.isConnected), 'la portada se volvió a montar al resolverse la sesión').toBe(true);
});

test('sin sesión en el dispositivo, la portada no llega a verse: directa al acceso', async ({ page }) => {
  await sembrarSociaCompleta(page, { bono: 5, sinReloj: true });
  // Después del andamiaje (que la siembra): sin sesión guardada, y un vigilante
  // que apunta si la portada llega a ocupar sitio en algún momento.
  await page.addInitScript(() => {
    localStorage.removeItem('sb-portal-auth');
    const w = window as unknown as { __portadaVista?: boolean };
    w.__portadaVista = false;
    const mirar = () => {
      const img = document.querySelector('.shell img[fetchpriority="high"]');
      if (img && img.getClientRects().length > 0) w.__portadaVista = true;
    };
    new MutationObserver(mirar).observe(document, { childList: true, subtree: true, attributes: true });
    setInterval(mirar, 16);
  });

  await page.goto(`/portal/${SLUG}`);
  await page.waitForURL(/\/acceso\/login/, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __portadaVista?: boolean }).__portadaVista)).toBe(false);
});
