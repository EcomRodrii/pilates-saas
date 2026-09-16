import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Las imágenes de la home.
//
// Una foto rota en la landing no la ve nadie del equipo —entramos logueados y
// "/" nos manda al panel—: la ve quien llega de Google a decidir si nos prueba.
// Lo que se fija aquí es lo que un test unitario no puede ver, porque depende
// del HTML de verdad y de lo que el navegador acaba pidiendo:
//
//   · la foto del héroe va la primera (eager + fetchpriority=high) y es la
//     ÚNICA con prioridad fuera de la cortina del logo: la de la app de alumnas
//     llevaba `priority` a 4.600 px del principio y competía con el LCP;
//   · al recorrer la página entera no queda ninguna <img> rota;
//   · todas llevan `alt` (vacío vale para las decorativas; ausente, no);
//   · ninguna imagen se pide a otro dominio.
//
// Los ficheros y sus pesos se comprueban sin navegador en
// lib/landing/fotos.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Imágenes de terceros que SÍ se piden a otro dominio, con su motivo.
 * Quedan fuera también de la comprobación de rotas: si ese tercero cae o CI no
 * tiene salida a internet, no es un fallo de nuestro despliegue.
 */
const HOSTS_EXTERNOS_PERMITIDOS = [
  // Insignia «Listed on Sell With boost» del pie (SeccionCtaFinal.tsx). Está
  // pendiente de decidir si se sirve desde public/ o se quita.
  'sellwithboost.com',
];

const esPermitido = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return HOSTS_EXTERNOS_PERMITIDOS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

test.describe('Las imágenes de la home', () => {
  test.beforeEach(async ({ page }) => {
    // Menos movimiento: sin la cortina del logo delante y sin animaciones, así
    // lo que se mide es la página y no el reloj de la intro. El popup de
    // «Empieza gratis» se da por convertido para que no salga a mitad del
    // recorrido (sus reglas se prueban en e2e/popup-empezar-gratis.spec.ts).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
    });
    // Los terceros permitidos no se piden de verdad: CI no depende de ellos.
    await page.route((url) => esPermitido(url.href), (route) => route.abort());
  });

  test('la foto del héroe carga la primera y es la única con prioridad', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    const heroe = page.locator('header#top picture img');
    await expect(heroe).toHaveCount(1);
    await expect(heroe).toHaveAttribute('loading', 'eager');
    await expect(heroe).toHaveAttribute('fetchpriority', 'high');
    await expect(heroe).toHaveAttribute('alt', /\S/);

    // Las piezas de la cortina (IntroLogo) también van en alta a propósito:
    // son el primer fotograma. Fuera de ella, solo el héroe.
    const conPrioridad = await page.evaluate(() =>
      [...document.images]
        .filter((i) => i.getAttribute('fetchpriority') === 'high' && !i.closest('.tnt-intro'))
        .map((i) => i.getAttribute('src')),
    );
    expect(conPrioridad, 'solo la foto del héroe puede competir por el LCP').toHaveLength(1);
  });

  test('al recorrer la página no queda ninguna imagen rota, todas con alt y ninguna de fuera', async ({ page, baseURL }) => {
    const hostPropio = new URL(baseURL ?? 'http://localhost:3000').host;
    const externas: string[] = [];
    page.on('request', (req) => {
      if (req.resourceType() !== 'image') return;
      const url = new URL(req.url());
      if (!/^https?:$/.test(url.protocol)) return; // data: y blob: no salen a ningún sitio
      if (url.host !== hostPropio && !esPermitido(req.url())) externas.push(req.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    // Bajando a trozos: las perezosas (`loading=lazy`) solo se piden cuando se
    // acercan a la pantalla, así que un salto directo al final no las cargaría.
    for (let vueltas = 0; vueltas < 80; vueltas++) {
      const alFinal = await page.evaluate(() => {
        window.scrollBy(0, Math.round(window.innerHeight * 0.7));
        return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      });
      await page.waitForTimeout(80);
      if (alFinal) break;
    }

    // Las que no son de terceros permitidos tienen que haber terminado de
    // cargar. `complete` también es true para una rota: de eso se encarga la
    // comprobación de `naturalWidth` de abajo.
    await expect
      .poll(() => page.evaluate((permitidos) => [...document.images]
        .filter((i) => !permitidos.some((h) => (i.currentSrc || i.src).includes(h)))
        .filter((i) => !i.complete).length, HOSTS_EXTERNOS_PERMITIDOS), { timeout: 20_000 })
      .toBe(0);

    const informe = await page.evaluate((permitidos) => {
      const propias = [...document.images].filter((i) => !permitidos.some((h) => (i.currentSrc || i.src).includes(h)));
      return {
        total: propias.length,
        rotas: propias.filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
        sinAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src),
      };
    }, HOSTS_EXTERNOS_PERMITIDOS);

    expect(informe.total, 'la home tiene fotos; si esto da 0, el recorrido no midió nada').toBeGreaterThan(0);
    expect(informe.rotas, 'imágenes rotas').toEqual([]);
    expect(informe.sinAlt, 'imágenes sin atributo alt').toEqual([]);
    expect(externas, 'imágenes pedidas a otro dominio').toEqual([]);
  });
});
