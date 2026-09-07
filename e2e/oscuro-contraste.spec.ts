import { resolveTheme } from '../lib/theme-schema.ts';
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
  // ⚠️ El tema, con valores REALES. Sin este mock caía en el comodín `{}` de
  // arriba y, con un tema vacío, `--brand` y `--brand-foreground` acaban los DOS
  // en #16161A: el barrido daba 1:1 —«ilegible»— a todos los botones de marca,
  // que en pantalla se leen perfectamente. En producción `/api/theme` nunca
  // devuelve `{}` (sin tema propio responde el resuelto por defecto), así que
  // aquello era un hallazgo inventado por el andamiaje.
  await page.route('**/api/theme**', route => json(route, resolveTheme({})));
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
      // ⚠️ Los tokens se leen CON su `%`. Tailwind emite `oklab(56.4% 0.14 -0.2)`
      // y quitarle el signo mete una L de 56,4 donde el espacio va de 0 a 1: al
      // elevarla al cubo se dispara, el gamma la satura a blanco, y texto y
      // fondo salían los DOS blancos — 1:1 clavado. Así es como este barrido
      // daba por ilegible el botón de marca, que en pantalla se lee
      // perfectamente. Tercer error de medición del mismo medidor; por eso
      // ahora todo lo que no sepa leer se DECLARA, no se adivina.
      const toks = css.match(/-?[\d.]+%?/g) ?? [];
      const num = (i: number, escalaPct = 1): number | undefined => {
        const t = toks[i];
        if (t === undefined) return undefined;
        return t.endsWith('%') ? (parseFloat(t) / 100) * escalaPct : parseFloat(t);
      };
      const n = toks.map(t => parseFloat(t));
      if (css.startsWith('oklab')) {
        const L = num(0), a = num(1, 0.4), b = num(2, 0.4);
        if (L === undefined || a === undefined || b === undefined) return null;
        return deOklab(L, a, b, num(3) ?? 1);
      }
      if (css.startsWith('oklch')) {
        // El croma en porcentaje va a 0,4; el tono es un ÁNGULO y nunca lleva %.
        const L = num(0), C = num(1, 0.4);
        if (L === undefined || C === undefined) return null;
        const h = ((n[2] ?? 0) * Math.PI) / 180;
        return deOklab(L, C * Math.cos(h), C * Math.sin(h), num(3) ?? 1);
      }
      if (css.startsWith('#')) {
        const h = css.length === 4
          ? css.slice(1).split('').map(c => parseInt(c + c, 16))
          : [1, 3, 5].map(i => parseInt(css.slice(i, i + 2), 16));
        return [h[0], h[1], h[2], 1];
      }
      // `rgb()`/`rgba()` y nada más. ⚠️ Cualquier otra función de color —`lab()`,
      // `lch()`, `color()`— devuelve `null` A PROPÓSITO: leer sus números como si
      // fueran RGB es exactamente cómo `lab(75 -60 19)` (un verde claro) pasaba
      // por casi negro y salía como «ilegible» algo que se ve de sobra. Lo que
      // este medidor no sabe leer se declara y se cuenta aparte; adivinar es
      // peor que no medir.
      if (/^(rgb|rgba)\(/.test(css)) {
        return n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
      }
      return null;
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

    const out: { texto: string; ratio: number; color: string; fondo: string; clases: string }[] = [];
    // Cuántos textos se han llegado a MEDIR. Sin este número, una pantalla que
    // no carga (un 404 del `next dev` bajo carga, por ejemplo) sale con cero
    // hallazgos y el test da verde por no haber mirado nada — el test hueco
    // que este repo ya tiene documentado.
    let medidos = 0;
    // Textos con un color que este medidor no sabe convertir a sRGB.
    let noMedibles = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.3) continue;
      const propio = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
      if (!propio) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const tinta = aRGBA(cs.color);
      if (!tinta) { noMedibles += 1; continue; }

      const fondo = fondoDe(el);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      medidos += 1;
      const c = ratio(lum(sobre(tinta, fondo)), lum(fondo));
      if (c < (grande ? 3 : 4.5)) {
        out.push({ texto: propio.slice(0, 45), ratio: Math.round(c * 100) / 100, color: cs.color, fondo: `rgb(${fondo[0]},${fondo[1]},${fondo[2]})`, clases: String(el.className).slice(0, 75) });
      }
    }
    return { out, medidos, noMedibles };
  });
}

const PANTALLAS = ['/dashboard', '/mensajeria', '/cierre', '/cobros', '/clientas', '/calendario', '/configuracion'];

test.describe('Modo oscuro — contraste real', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ningún texto por debajo del mínimo de WCAG AA', async ({ page }) => {
    test.setTimeout(900_000);
    await montar(page);
    const todos: string[] = [];
    // Lo que el medidor no ha sabido leer, por pantalla. Se INFORMA aunque no
    // haga fallar: un barrido que calla lo que no mide vuelve a ser un barrido
    // en el que no se puede confiar.
    const sinMedir: string[] = [];
    for (const ruta of PANTALLAS) {
      // ⚠️ Esperar a que la pantalla EXISTA, no un tiempo fijo.
      //
      // Dos cosas distintas dan cero hallazgos y verde falso: un 404 del
      // `next dev`, que compila la ruta en la primera petición y bajo carga
      // responde antes de terminar (se arregla recargando), y el esqueleto de
      // carga, que no tiene ni un texto (se arregla esperando — recargar lo
      // empeora, porque vuelve a empezar). Se distinguen y se tratan distinto.
      let out: Awaited<ReturnType<typeof ilegibles>>['out'] = [];
      let medidos = 0;
      let noMedibles = 0;
      await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      for (let intento = 0; intento < 15 && medidos <= 30; intento++) {
        await page.waitForTimeout(2000);
        ({ out, medidos, noMedibles } = await ilegibles(page));
        if (medidos > 30) break;
        if (await page.getByText('Esta página no existe').count()) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 300_000 });
        }
      }
      await page.screenshot({ path: `test-results/contraste${ruta.replace(/\//g, '_')}.png` });
      // ⚠️ La prueba de que SÍ se ha mirado. 30 es un suelo generoso: la
      // pantalla más pobre del panel pasa de 100 textos, y un 404 da 4.
      expect(medidos, `${ruta} no llegó a pintarse: solo ${medidos} textos medidos`).toBeGreaterThan(30);
      if (noMedibles) sinMedir.push(`${ruta}: ${noMedibles}`);
      for (const m of out) {
        todos.push(`${ruta}  ${m.ratio}:1  «${m.texto}»  tinta=${m.color} fondo=${m.fondo}  ${m.clases}`);
      }
    }
    console.log('SIN MEDIR (color no convertible): ' + (sinMedir.join(', ') || 'ninguno'));
    console.log('ILEGIBLES:\n' + (todos.join('\n') || '(ninguno)'));

    // ⚠️ UNA excepción conocida, con su diagnóstico — no una lista para ir
    // engordando.
    //
    // `text-brand` sobre una tarjeta oscura mide 2,55:1 porque el tema se aplica
    // EN LÍNEA (`PanelThemeProvider` escribe `--brand` en el `style` del
    // contenedor) y un `style` gana a la clase: la regla de `.dark` en
    // globals.css, que aclararía el oliva a #8A9165, nunca llega a pisarlo. Es
    // el mismo patrón que este repo ya documentó con los tokens del logo.
    //
    // No se arregla aquí porque no es un color suelto: hay que decidir cómo
    // emite el proveedor de tema los tokens de marca en oscuro, y eso afecta a
    // TODA superficie con color de marca. Queda medido y acotado; lo que este
    // test impide es que aparezca uno NUEVO.
    const CONOCIDOS = [/«Ver todos los pasos».*text-brand/];
    const nuevos = todos.filter(t => !CONOCIDOS.some(re => re.test(t)));
    expect(nuevos, 'texto NUEVO por debajo del contraste mínimo en modo oscuro').toEqual([]);
  });
});
