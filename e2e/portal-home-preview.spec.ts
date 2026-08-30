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
    await expect(page.getByPlaceholder('tu@email.com')).toHaveCount(0);
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
      // Protocolo generalizado en la Fase 1 del Theme Builder (antes
      // "tentare-home-preview"): HomePreview manda el borrador de LAS TRES
      // pantallas en cada mensaje, con `pantalla` para distinguirlas — cada
      // vista solo se queda con el suyo (ver home-preview.tsx).
      iframe.contentWindow?.postMessage({
        type: 'tentare-bloques-preview',
        pantalla: 'home',
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

  // El hueco que cerró lib/theme-preview-puente.ts: el puente
  // `tentare-theme-preview` solo llevaba CSS vars, así que el preview grande
  // pintaba la PALETA del borrador con la FORMA del tema publicado. Con Bloom
  // en borrador se veía morado, pero la cabecera seguía en 'clasica' ("Hola,
  // X." grande) y las tarjetas de reto salían blancas.
  test('dentro del iframe, la FORMA del tema en borrador (variantes) también llega — no solo el color', async ({ page }) => {
    // Dos cargas completas de la ruta (la de arriba y la del iframe) más la
    // compilación de `next dev` no caben en el presupuesto por defecto.
    test.slow();
    // `retos` es el bloque donde se ve el eje `retos`, así que se publica
    // desde el mock en vez de depender de que el rail lo tenga visible: lo
    // que se prueba aquí es el canal del TEMA, y mezclar los dos haría que un
    // fallo en el otro se leyera como un fallo de este.
    await montarPortal(page, {
      conSesion: false,
      homeBloques: [
        { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
        { id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos' },
      ],
    });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    const url = `/portal-preview/${SLUG}?t=${token}`;

    // El iframe es imprescindible: los dos listeners del puente
    // (ThemePreviewListener para el color y StudioProvider para la forma) se
    // apagan solos cuando `self === top`, así que en una pestaña normal no
    // habría nada que probar. Mismo montaje que el test de bloques de arriba,
    // incluido el `goto` previo para que el origen del padre sea el real.
    await page.goto(url);
    await page.setContent(
      `<iframe id="prev" src="${url}" style="width:400px;height:1600px;border:0"></iframe>`,
      { waitUntil: 'domcontentloaded' },
    );

    const frame = page.frameLocator('#prev');
    // Punto de partida: el aspecto de hoy, con el tema PUBLICADO. "Estudio
    // Alma" es el nombre que devuelve el mock de /api/public/studio-data: hasta
    // que aparece, el catálogo (bloques incluidos) todavía no ha llegado y
    // cualquier aserción sobre la forma miraría un portal a medio cargar.
    await expect(frame.getByRole('heading', { name: /Hola, Vista\./ })).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByText('Estudio Alma').first()).toBeVisible({ timeout: 30_000 });

    const reto = frame.getByText('Core Pilates').locator('xpath=ancestor::div[1]/parent::div');
    await expect(frame.getByRole('heading', { name: 'Retos' })).toBeVisible();
    // Sin `variantes`, la tarjeta de reto es la neutra: fondo de superficie
    // (blanco en modo claro), nunca el verde propio del reto.
    await expect(reto).not.toHaveCSS('background-color', 'rgb(207, 239, 214)');

    // ⚠️ El mensaje se emite DESDE DENTRO del marco, no desde el padre como en
    // el test de bloques de arriba. No es un atajo ni una preferencia de
    // estilo: el salto padre→hijo es INESTABLE en este arnés (el test de
    // arriba, que sí lo usa, falla en local de forma intermitente; con
    // `--repeat-each=3` esta misma prueba pasaba 1 de 3 escrita así). Lo que
    // hay que verificar aquí es el extremo RECEPTOR —StudioProvider
    // resolviendo `temaJs` y PortalHomeView repintándose con otra FORMA—, y
    // eso se ejercita igual desde dentro. El emisor manda exactamente esta
    // forma de mensaje: ver HomePreview y lib/theme-preview-puente.test.ts.
    const marco = page.frames().find((f) => f !== page.mainFrame())!;
    await marco.evaluate(() => {
      // Mismo mensaje que manda HomePreview con Bloom en borrador: `vars` es
      // el color (ya funcionaba) y `temaJs` la forma (lo que faltaba). Aquí se
      // manda `vars` vacío a propósito, para que lo que se compruebe abajo sea
      // SOLO el eje nuevo y no un efecto colateral de la paleta.
      window.postMessage({
        type: 'tentare-theme-preview',
        vars: {},
        temaJs: {
          variantes: { cabeceraInicio: 'titular', accesosRapidos: 'rejilla', retos: 'color' },
          barraClasica: false,
          tabBarStyle: 'clasica',
        },
      }, window.location.origin);
    });

    // Cabecera: de "Hola, X." grande al titular con avatar y el nombre solo.
    await expect(frame.getByRole('heading', { name: /Hola, Vista\./ })).toHaveCount(0);
    await expect(frame.getByRole('heading', { name: 'Vista', exact: true })).toBeVisible();
    // Y con ella el subtítulo ascendido a titular, que en 'clasica' iba dentro
    // del saludo.
    await expect(frame.getByText('¿Qué te apetece hoy?')).toBeVisible();
    // Retos: el fondo propio del reto (#CFEFD6, lib/retos-portal.ts).
    await expect(reto).toHaveCSS('background-color', 'rgb(207, 239, 214)');
  });
});
