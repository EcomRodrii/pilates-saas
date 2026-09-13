import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Lo que pide la app de la alumna al abrirse en frío, antes de que haya nada
// que ver. Dos cosas que se pagaban en CADA arranque:
//
// 1. **La portada de Inicio no empezaba a bajar hasta hidratar.** Es la imagen
//    más grande de la primera pantalla (su LCP), pero vive dentro de la guardia
//    de sesión, que en el servidor pinta el esqueleto: el `<img>` no existía en
//    el HTML y el navegador no sabía de ella hasta que React montaba la
//    pantalla, detrás de ~550 KB de JavaScript y de `/api/public/session`. La
//    URL se conoce en el servidor (`estudio.fotoPortada`), así que ahora va
//    precargada en el `<head>` con la MISMA url, `srcset` y `sizes` que pide el
//    `<img>` — si no coincidieran, se bajaría dos veces.
//
// 2. **El punto de la campana se traía la bandeja entera** (60 avisos con
//    título y cuerpo) para quedarse con un número. Ahora pide solo el conteo.

test('la respuesta de Inicio ya pide la portada, igual que la pide el <img>', async ({ page }) => {
  test.setTimeout(120_000);
  await sembrarSociaCompleta(page, { bono: 5 });
  await page.goto(`/portal/${SLUG}`);
  const heroe = page.locator('img[fetchpriority="high"]').first();
  await expect(heroe).toBeAttached({ timeout: 30_000 });
  const [src, srcset, sizes] = await Promise.all(['src', 'srcset', 'sizes'].map((a) => heroe.getAttribute(a)));
  expect(src, 'la portada tiene que existir para que esto mida algo').toBeTruthy();

  // La respuesta tal cual llega del servidor, sin JavaScript de por medio.
  //
  // ⚠️ React 19 manda las precargas tempranas en la CABECERA `Link` (Next le
  // pasa `onHeaders`), no en el HTML: buscarla solo en el `<head>` da un rojo
  // con la precarga funcionando. Si la cabecera se llena —un `srcset` de Storage
  // es largo— la pone en el HTML. Vale cualquiera de las dos.
  type Precarga = Record<string, string>;
  const res = await page.request.get(`/portal/${SLUG}`);
  const html = await res.text();

  const deHtml: Precarga[] = (html.match(/<link\b[^>]*>/gi) ?? []).map((tag) => {
    const p: Precarga = {};
    for (const m of tag.matchAll(/\s([a-z-]+)="([^"]*)"/gi)) p[m[1].toLowerCase()] = m[2].replace(/&amp;/g, '&');
    return p;
  });
  const deCabecera: Precarga[] = (res.headers()['link'] ?? '').split(/,\s*(?=<)/).filter(Boolean).map((parte) => {
    const p: Precarga = { href: parte.match(/^<([^>]*)>/)?.[1] ?? '' };
    for (const m of parte.matchAll(/;\s*([a-z-]+)=(?:"([^"]*)"|([^;]*))/gi)) p[m[1].toLowerCase()] = (m[2] ?? m[3]).trim();
    return p;
  });
  const precargas = [...deHtml, ...deCabecera].filter((p) => p.rel === 'preload' && p.as === 'image');

  const suya = precargas.find((p) => p.href === src);
  expect(suya, `ninguna precarga de imagen apunta a ${src}:\n${JSON.stringify(precargas, null, 2)}`).toBeTruthy();
  expect(suya!.fetchpriority).toBe('high');
  expect(suya!.imagesrcset ?? null).toBe(srcset);
  expect(suya!.imagesizes ?? null).toBe(srcset ? sizes : null);
});

test('la campana cuenta los avisos sin traerse la bandeja', async ({ page }) => {
  test.setTimeout(120_000);
  await sembrarSociaCompleta(page, { bono: 5 });

  const pedidas: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/notifications' && r.method() === 'GET') pedidas.push(u.search);
  });
  // Registrada DESPUÉS del andamiaje, así que manda sobre su mock. Contesta
  // solo `{ unread }`, como el servidor: si el cliente volviera a contar sobre
  // `items`, el punto no se encendería.
  await page.route(
    (u) => u.pathname === '/api/notifications' && u.searchParams.get('soloConteo') === '1',
    (r) => r.fulfill({ json: { unread: 2 } }),
  );

  await page.goto(`/portal/${SLUG}/reservar`);
  await expect(page.getByRole('link', { name: 'Notificaciones, 2 sin leer', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(pedidas.length).toBeGreaterThan(0);
  expect(pedidas.filter((q) => new URLSearchParams(q).get('soloConteo') !== '1'), 'pidió la bandeja entera').toEqual([]);
});
