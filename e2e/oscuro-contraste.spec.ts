import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Modo oscuro medido por CONTRASTE, no por «fondo claro con texto claro».
//
// La primera versión de esta comprobación solo buscaba texto CLARO sobre fondo
// CLARO y pasaba en verde mientras la propietaria veía importes invisibles: lo
// suyo era lo contrario, texto OSCURO sobre fondo OSCURO. Medir contraste cubre
// los dos casos y además pone un número — 4.5:1 es el mínimo de WCAG AA para
// texto normal, 3:1 para texto grande.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem('panel-dark-mode', '1');
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/status**', route =>
    json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

/** Todo el texto que no llega al mínimo de contraste sobre su fondo real. */
async function ilegibles(page: Page) {
  return page.evaluate(() => {
    // ⚠️ Los colores hay que NORMALIZARLOS, no parsearlos a mano. Tailwind v4
    // emite `oklab(...)`, y sacarle los números con una expresión regular los
    // lee como si fueran RGB: `text-white/45` pasaba por casi negro y el
    // barrido daba por ilegible medio menú que se ve perfectamente.
    // El canvas convierte CUALQUIER color CSS a sRGB, que es lo único que se
    // puede comparar.
    type RGBA = [number, number, number, number];
    const gamma = (v: number) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    // ⚠️ oklab/oklch A MANO, no con un canvas. `ctx.fillStyle` de este Chromium
    // NO acepta `oklab(...)`: deja el valor anterior, así que la conversión
    // devolvía negro en silencio y el barrido daba 1.03:1 a texto blanco sobre
    // fondo oscuro. Un medidor que se equivoca así es peor que no medir.
    function deOklab(L: number, a: number, b: number, alpha: number): RGBA {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s2 = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [
        gamma(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2),
        gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2),
        gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s2),
        alpha,
      ];
    }
    function aRGBA(css: string): RGBA | null {
      if (!css || css === 'transparent') return [0, 0, 0, 0];
      const n = css.match(/-?[\d.]+/g)?.map(Number) ?? [];
      if (css.startsWith('oklab')) {
        return n.length >= 3 ? deOklab(n[0], n[1], n[2], n.length > 3 ? n[3] : 1) : null;
      }
      if (css.startsWith('oklch')) {
        const h = ((n[2] ?? 0) * Math.PI) / 180;
        return deOklab(n[0], (n[1] ?? 0) * Math.cos(h), (n[1] ?? 0) * Math.sin(h), n.length > 3 ? n[3] : 1);
      }
      if (css.startsWith('#')) {
        const h = css.length === 4
          ? css.slice(1).split('').map(c => parseInt(c + c, 16))
          : [1, 3, 5].map(i => parseInt(css.slice(i, i + 2), 16));
        return [h[0], h[1], h[2], 1];
      }
      return n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
    }
    // Una capa translúcida ENCIMA de otra: sin esto, un texto al 45 % se
    // compara como si fuera opaco y el número no se parece al que se ve.
    const sobre = (f: RGBA, b: RGBA): RGBA =>
      [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1) as RGBA;

    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    // El fondo real: se apilan las capas translúcidas hasta dar con una opaca.
    function fondoDe(el: HTMLElement): RGBA {
      const capas: RGBA[] = [];
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const c = aRGBA(getComputedStyle(n).backgroundColor);
        if (!c || c[3] === 0) continue;
        capas.push(c);
        if (c[3] >= 0.999) break;
      }
      let base: RGBA = capas.length && capas[capas.length - 1][3] >= 0.999
        ? capas.pop()! : [255, 255, 255, 1];
      for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
      return base;
    }

    const out: { texto: string; ratio: number; color: string; clases: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.3) continue;
      const propio = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
      if (!propio) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const tinta = aRGBA(cs.color);
      if (!tinta) continue;

      const fondo = fondoDe(el);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const c = ratio(lum(sobre(tinta, fondo)), lum(fondo));
      if (c < (grande ? 3 : 4.5)) {
        out.push({ texto: propio.slice(0, 45), ratio: Math.round(c * 100) / 100, color: cs.color, clases: String(el.className).slice(0, 75) });
      }
    }
    return out;
  });
}

const PANTALLAS = ['/dashboard', '/mensajeria', '/cierre', '/cobros', '/clientas', '/calendario', '/configuracion'];

test.describe('Modo oscuro — contraste real', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ningún texto por debajo del mínimo de WCAG AA', async ({ page }) => {
    test.setTimeout(900_000);
    await montar(page);
    const todos: string[] = [];
    for (const ruta of PANTALLAS) {
      await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `test-results/contraste${ruta.replace(/\//g, '_')}.png` });
      for (const m of await ilegibles(page)) {
        todos.push(`${ruta}  ${m.ratio}:1  «${m.texto}»  ${m.clases}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log('ILEGIBLES:\n' + (todos.join('\n') || '(ninguno)'));
    expect(todos, 'texto por debajo del contraste mínimo en modo oscuro').toEqual([]);
  });
});
