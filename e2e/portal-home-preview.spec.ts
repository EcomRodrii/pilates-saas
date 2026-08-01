process.env.HOME_PREVIEW_TOKEN_SECRET = 'e2e-test-home-preview-secret';

import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { firmarTokenPreviewHome } from '../lib/theme/home-preview-token.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 4 del editor de temas: preview en vivo del constructor de bloques del
// Inicio (/portal-preview/[slug]). A diferencia de /portal/[slug]/home, esta
// ruta NUNCA tiene sesión de socia — la abre el panel de staff dentro de un
// iframe, con un token firmado (lib/theme/home-preview-token.ts) en vez de
// login. Bajo E2E_TEST, getStudioSeo(slug) siempre resuelve a studio-test
// (lib/studio-seo.ts), así que el token se firma para ese id sin importar el
// slug de la URL — mismo criterio que el resto de specs públicas.
//
// El secreto se fija ANTES de cualquier import de la app (playwright.config.ts
// lo pasa igual al webServer) para que la firma de aquí y la verificación del
// servidor usen el mismo HMAC.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

test.describe('Vista previa del Inicio del portal — /portal-preview/[slug]', () => {
  test('sin token en la URL: placeholder, nunca el login (esta ruta no tiene formulario)', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal-preview/${SLUG}`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Tu email')).toHaveCount(0);
  });

  test('token caducado: placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const tokenCaducado = firmarTokenPreviewHome(STUDIO_ID, Date.now() - 60 * 60 * 1000);
    await page.goto(`/portal-preview/${SLUG}?t=${tokenCaducado}`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('token manipulado: placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const valido = firmarTokenPreviewHome(STUDIO_ID);
    const manipulado = `${valido.slice(0, -4)}xxxx`;
    await page.goto(`/portal-preview/${SLUG}?t=${manipulado}`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('token válido: Home con una socia de muestra ("Vista previa"), catálogo real del estudio', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}?t=${token}`);
    await expect(page.getByRole('heading', { name: /Hola, Vista\./ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  });

  test('montado dentro de un iframe (como hace el editor), refleja el borrador de bloques recibido por postMessage', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    const url = `/portal-preview/${SLUG}?t=${token}`;

    // Navega primero a la propia URL para que el documento superior quede en
    // el origen real de la app — setContent() no navega de verdad, así que
    // sin este paso window.location.origin sería "null" (about:blank) y el
    // postMessage de más abajo nunca superaría el chequeo de origen del
    // listener (ver useHomeBloquesPreviewOverride en
    // components/portal/portal-preview-home-client.tsx).
    await page.goto(url);
    await page.setContent(`<iframe id="prev" src="${url}" style="width:400px;height:800px;border:0"></iframe>`);

    const frame = page.frameLocator('#prev');
    await expect(frame.getByRole('heading', { name: /Hola, Vista\./ })).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByRole('heading', { name: 'Esta semana' })).toBeVisible();

    await page.evaluate(() => {
      const iframe = document.getElementById('prev') as HTMLIFrameElement;
      iframe.contentWindow?.postMessage({
        type: 'tentare-home-preview',
        bloques: [
          { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
          { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
          { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
        ],
      }, window.location.origin);
    });

    await expect(frame.getByRole('heading', { name: 'Esta semana' })).toHaveCount(0);
    // El resto de módulos, sin tocar, sigue ahí.
    await expect(frame.getByText('Trae a quien quieras')).toBeVisible();
  });
});
