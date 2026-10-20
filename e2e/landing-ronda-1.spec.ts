import { test, expect, type Page } from '@playwright/test';
import { PAGINAS } from '../lib/seo/paginas.ts';
import { FAQ_FUNCIONALIDADES, FAQ_SOLUCIONES } from '../lib/seo/faq-hubs.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 1 de la revisión de la landing (19-oct-2026), lo que sale por el cable:
//  · el <title> y la meta description que lee el buscador son los del registro,
//  · las preguntas frecuentes de /funcionalidades y /soluciones: el JSON-LD
//    FAQPage dice lo mismo que ve la visitante, y las respuestas están en el
//    HTML del servidor (no solo al pulsar),
//  · cada tarjeta del bento lleva a SU página de función o solución, y esa
//    página responde,
//  · y el botón para empezar dice lo mismo en el héroe, la banda final y las
//    páginas de función (la isla de la cabecera queda como estaba).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

const desescapar = (s: string) =>
  s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

function metadatosDe(html: string) {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/.exec(html)?.[1];
  const descripcion = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  return { titulo: titulo === undefined ? undefined : desescapar(titulo), descripcion: descripcion === undefined ? undefined : desescapar(descripcion) };
}

// Las páginas comerciales cuyo texto cambió o se lee de otro sitio ahora. Las
// 13 comparativas no se tocan y las mide el test unitario.
const CAMBIADAS = [
  '/', '/precios', '/funcionalidades', '/glosario', '/recursos',
  '/funcionalidades/reservas-online', '/funcionalidades/lista-de-espera', '/funcionalidades/gestion-de-instructoras',
  '/funcionalidades/bonos-y-membresias', '/funcionalidades/cobros-recurrentes', '/funcionalidades/facturacion',
  '/funcionalidades/ficha-de-clienta', '/funcionalidades/multi-centro',
  '/soluciones/estudio-de-yoga', '/soluciones/estudio-de-pilates-reformer', '/soluciones/programa-de-gestion-para-estudio-de-pilates',
];

for (const path of CAMBIADAS) {
  test(`${path}: el title y la description del HTML son los del registro`, async ({ request }) => {
    const res = await request.get(path, { timeout: 120_000 });
    expect(res.status()).toBe(200);
    const { titulo, descripcion } = metadatosDe(await res.text());
    const esperado = PAGINAS.find((p) => p.path === path)!;
    expect(titulo).toBe(esperado.titulo);
    expect(descripcion).toBe(esperado.descripcion);
  });
}

const HUBS = [
  { path: '/funcionalidades', items: FAQ_FUNCIONALIDADES },
  { path: '/soluciones', items: FAQ_SOLUCIONES },
];

for (const hub of HUBS) {
  test(`${hub.path}: el FAQPage del JSON-LD coincide con las preguntas visibles y sus respuestas están en el HTML`, async ({ request }) => {
    const res = await request.get(hub.path, { timeout: 120_000 });
    expect(res.status()).toBe(200);
    const html = await res.text();

    const faqs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]) as { '@type'?: string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] })
      .filter((j) => j['@type'] === 'FAQPage');
    expect(faqs, 'exactamente un FAQPage por página').toHaveLength(1);
    const ld = faqs[0].mainEntity!;
    expect(ld.length).toBeGreaterThanOrEqual(4);
    expect(ld.length).toBeLessThanOrEqual(6);
    expect(ld.map((e) => e.name)).toEqual(hub.items.map((i) => i.q));

    const sinScripts = desescapar(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    const visibles = [...sinScripts.matchAll(/<summary[^>]*class="afaq-q"[^>]*><span>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
    expect(visibles).toEqual(ld.map((e) => e.name));
    for (const e of ld) {
      // La respuesta completa está en el cuerpo de la página, fuera de los <script>.
      expect(sinScripts, e.name).toContain(e.acceptedAnswer.text);
    }
  });
}

async function abrirLanding(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    if (!localStorage.getItem('tentare:intro-vista')) localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
}

test('el bento: cada tarjeta lleva a su página de función o solución, todas distintas y todas responden', async ({ page, request }) => {
  await abrirLanding(page, 1440);
  // Home nueva (fase 2.2): el bento es BentoProducto (clases `wh-bn-*`).
  const enlaces = await page.locator('#plataforma .wh-bn-h3 a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(enlaces).toHaveLength(6);
  expect(new Set(enlaces).size).toBe(6);
  for (const href of enlaces as string[]) {
    expect(href).toMatch(/^\/(funcionalidades|soluciones)\/[a-z-]+$/);
    expect(href).not.toMatch(/crear-estudio|empieza|demo/);
    const res = await request.get(href, { timeout: 120_000 });
    expect(res.status(), href).toBe(200);
  }
  // La fila «Seguir explorando» salió con la home nueva: ahora cada chip enlaza a su función (más que bsport, que no enlaza ninguno).
  const mas = await page.locator('#plataforma .wh-chip-enlace a').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))]);
  expect(mas.length).toBeGreaterThanOrEqual(10);
  for (const href of mas as string[]) {
    const res = await request.get(href, { timeout: 120_000 });
    expect(res.status(), href).toBe(200);
  }
});

test('un solo verbo para empezar: héroe, banda final y planes dicen «Empezar gratis»; la isla (ronda 2) también', async ({ page }) => {
  await abrirLanding(page, 1440);
  await expect(page.locator('.v5-hero-cta')).toHaveText('Empezar gratis');
  // Home nueva (fase 2.2): la banda final es CierreHome y los planes, PrecioHome.
  await expect(page.locator('.wh-cierre-boton')).toHaveText('Empezar gratis');
  await expect(page.locator('.wh-plan-cta').first()).toHaveText('Empezar gratis');
  // La isla (ronda 2, con autorización expresa del fundador para tocar la cabecera) dice lo mismo: «Probar Tentare»
  // arrastraba el aire de la prueba de 7 días, que ya no existe.
  await expect(page.locator('.v5-nav-cta')).toHaveText('Empezar gratis');
  await expect(page.locator('.v5-menu-cta')).toHaveCount(0); // el menú móvil solo existe abierto
});

for (const path of ['/funcionalidades/plazas-fijas', '/funcionalidades']) {
  test(`${path}: el botón para empezar dice «Empezar gratis»`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const botones = page.locator('a[href="/crear-estudio"]').filter({ hasNotText: 'Probar' });
    const textos = (await botones.allTextContents()).map((t) => t.trim());
    expect(textos.length).toBeGreaterThan(0);
    for (const t of textos) expect(t, textos.join(' | ')).toBe('Empezar gratis');
  });
}
