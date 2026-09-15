import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración se DISTINGUE: qué es tarjeta, qué es campo, dónde estás, si un
// interruptor está encendido y qué estado tiene cada cosa.
//
// El fundador: «es un poco horrible por la diferencia de colores, no se
// distingue muy bien». Con números (medidos con este mismo fichero antes del
// cambio): tarjeta contra fondo 1,16:1, borde de campo 1,24:1, fila activa del
// rail 1,07:1, interruptor apagado 1,75:1 y, en oscuro, el encendido a 1,12:1
// —más apagado que el apagado—. Nada de eso lo caza un test que solo mira si la
// pantalla carga.
//
// Umbrales:
//   · 3:1 para el contorno de un CONTROL (WCAG 1.4.11): borde de campo, pista y
//     bola del interruptor, fila activa del rail;
//   · 4,5:1 para TEXTO (1.4.3): ayudas, pastillas de estado, botones apagados
//     —un botón deshabilitado está exento en WCAG, pero aquí se tiene que leer
//     por qué está así—, y la letra de ayuda nunca por debajo de 12 px;
//   · 1,4:1 para el borde de una TARJETA contra el fondo de la página. Una
//     tarjeta no es un control: agrupa. A 3:1 sería una rejilla de cajas negras
//     compitiendo con los campos, que sí tienen que ganar. 1,4:1 es donde
//     separan los bordes por defecto de GitHub (#D0D7DE, 1,47:1) o Stripe, y
//     queda claramente por encima del 1,16:1 que se veía como «una sábana».
//
// ⚠️ Los colores se LEEN, no se adivinan. Tailwind v4 emite `oklab()`,
// `oklch()` y `color(srgb …)` (los `/12` de opacidad salen como color-mix), y
// este repo ya tuvo un barrido que leía `oklab` como si fuera RGB y daba por
// ilegible lo que se veía perfectamente. Lo que el conversor no sabe leer se
// cuenta en `sinLeer` y hace fallar el test: medir mal es peor que no medir.
//
// ⚠️ Cada familia exige un mínimo de piezas medidas. Un barrido que no encuentra
// nada pasa en verde sin haber medido nada — el mismo hueco que el contador de
// intentos en los tests de 4xx.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
  plan: 'ESTUDIO', subscription_status: 'active',
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function panel(page: Page, oscuro: boolean) {
  if (oscuro) await enOscuro(page);
  // El tema de `montar` es el REAL (oliva #343825): en producción `panel-theme`
  // lo aplica en línea también en oscuro, así que el oliva del modo oscuro de
  // globals.css no llega nunca. Medir con él es medir lo que ve la propietaria.
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const UMBRAL = { control: 3, texto: 4.5, tarjeta: 1.4, letraMinima: 12 } as const;

type Medida = { que: string; ratio: number };
type Resultado = {
  tarjetas: Medida[];
  campos: Medida[];
  interruptores: (Medida & { on: boolean; bola: number })[];
  estados: (Medida & { px: number })[];
  textos: (Medida & { px: number })[];
  botonesApagados: Medida[];
  rail: { fila: number; texto: number } | null;
  sinLeer: string[];
};

/** Todo lo que se mide, en el navegador, con los colores ya calculados. */
function medir(page: Page): Promise<Resultado> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const sinLeer: string[] = [];

    // ── Conversión de CUALQUIER color calculado a sRGB ──
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const deLineal = (v: number) => clamp(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055));
    function deOklab(L: number, a: number, b: number, alpha: number): RGBA {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [
        deLineal(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        deLineal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        deLineal(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
        alpha,
      ];
    }
    // CIE Lab (D50) → XYZ D50 → XYZ D65 (Bradford) → sRGB lineal.
    function deLab(L: number, a: number, b: number, alpha: number): RGBA {
      const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
      const e = 216 / 24389, k = 24389 / 27;
      const inv = (f: number) => (f ** 3 > e ? f ** 3 : (116 * f - 16) / k);
      const X = inv(fx) * 0.96422, Y = (L > k * e ? fy ** 3 : L / k), Z = inv(fz) * 0.82521;
      const x = 0.9554734527 * X - 0.0230985368 * Y + 0.0632593086 * Z;
      const y = -0.0283697093 * X + 1.0099954580 * Y + 0.0210413990 * Z;
      const z = 0.0123140016 * X - 0.0205076964 * Y + 1.3303659366 * Z;
      return [
        deLineal(3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z),
        deLineal(-0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z),
        deLineal(0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z),
        alpha,
      ];
    }
    function aRGBA(css: string): RGBA | null {
      const c = css.trim();
      if (!c || c === 'transparent') return [0, 0, 0, 0];
      if (c.startsWith('#')) {
        const h = c.length <= 5 ? c.slice(1).split('').map(x => x + x) : (c.slice(1).match(/../g) ?? []);
        const n = h.map(x => parseInt(x, 16));
        return [n[0], n[1], n[2], n.length > 3 ? n[3] / 255 : 1];
      }
      const m = c.match(/^([a-z-]+)\((.*)\)$/);
      if (!m) return null;
      const [, fn, cuerpo] = m;
      // `none` vale 0 (CSS Color 4). La alfa va tras `/` o como 4º argumento.
      const partes = cuerpo.replace(/,/g, ' ').replace('/', ' / ').split(/\s+/).filter(Boolean);
      const barra = partes.indexOf('/');
      const alfaTok = barra >= 0 ? partes[barra + 1] : undefined;
      const toks = barra >= 0 ? partes.slice(0, barra) : partes;
      const val = (t: string | undefined, escalaPct: number) => {
        if (t === undefined || t === 'none') return 0;
        return t.endsWith('%') ? (parseFloat(t) / 100) * escalaPct : parseFloat(t);
      };
      const alfa = (t: string | undefined) => (t === undefined ? 1 : val(t, 1));
      if (fn === 'rgb' || fn === 'rgba') {
        return [val(toks[0], 255), val(toks[1], 255), val(toks[2], 255), alfa(alfaTok ?? toks[3])];
      }
      if (fn === 'oklab') return deOklab(val(toks[0], 1), val(toks[1], 0.4), val(toks[2], 0.4), alfa(alfaTok));
      if (fn === 'oklch') {
        const C = val(toks[1], 0.4), h = (val(toks[2], 1) * Math.PI) / 180;
        return deOklab(val(toks[0], 1), C * Math.cos(h), C * Math.sin(h), alfa(alfaTok));
      }
      if (fn === 'lab') return deLab(val(toks[0], 100), val(toks[1], 125), val(toks[2], 125), alfa(alfaTok));
      if (fn === 'lch') {
        const C = val(toks[1], 150), h = (val(toks[2], 1) * Math.PI) / 180;
        return deLab(val(toks[0], 100), C * Math.cos(h), C * Math.sin(h), alfa(alfaTok));
      }
      if (fn === 'color') {
        const [espacio, ...xs] = toks;
        const n = xs.map(x => val(x, 1));
        if (espacio === 'srgb') return [clamp(n[0] * 255), clamp(n[1] * 255), clamp(n[2] * 255), alfa(alfaTok)];
        if (espacio === 'srgb-linear') return [deLineal(n[0]), deLineal(n[1]), deLineal(n[2]), alfa(alfaTok)];
      }
      return null;
    }
    const leer = (css: string, donde: string): RGBA => {
      const c = aRGBA(css);
      if (c) return c;
      sinLeer.push(`${donde}: ${css}`);
      return [0, 0, 0, 0];
    };

    const sobre = (f: RGBA, b: RGBA): RGBA =>
      [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1) as RGBA;
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a: RGBA, b: RGBA) => {
      const x = lum(a), y = lum(b);
      return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
    };

    /** El fondo que se ve detrás de `el`: capas translúcidas apiladas hasta una opaca. */
    function fondoDe(el: Element | null): RGBA {
      const capas: RGBA[] = [];
      for (let n = el; n; n = n.parentElement) {
        const c = leer(getComputedStyle(n).backgroundColor, 'fondo');
        if (c[3] === 0) continue;
        capas.push(c);
        if (c[3] >= 1) break;
      }
      return capas.reverse().reduce<RGBA>((acc, c) => sobre(c, acc), [255, 255, 255, 1]);
    }
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    /** Opacidad acumulada: algo a medio fundir no es un color de nadie. */
    const opacidad = (el: Element) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o;
    };
    const nombre = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id ?? '').trim()
      || (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      || el.tagName.toLowerCase();

    const raiz = document.querySelector('[data-tour="configuracion-vista"]');
    if (!raiz) return { tarjetas: [], campos: [], interruptores: [], estados: [], textos: [], botonesApagados: [], rail: null, sinLeer: ['sin raíz'] };

    // ── Tarjetas contra el fondo de la página ──
    const cajas = [...raiz.querySelectorAll('[data-tarjeta-ajuste], section[id^="integracion-"], nav[aria-label="Secciones de Configuración"] > ul')]
      .filter(el => visible(el) && parseFloat(getComputedStyle(el).borderTopWidth) > 0);
    const tarjetas = cajas.map(el => {
      const cs = getComputedStyle(el);
      const suelo = fondoDe(el.parentElement);
      const propio = sobre(leer(cs.backgroundColor, 'tarjeta'), suelo);
      const borde = sobre(leer(cs.borderTopColor, 'borde tarjeta'), propio);
      return { que: el.id || el.tagName.toLowerCase(), ratio: Math.max(ratio(propio, suelo), ratio(borde, suelo)) };
    });

    // ── Bordes de campo contra su tarjeta ──
    const sinTexto = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'button', 'submit', 'reset', 'image']);
    const campos = [...raiz.querySelectorAll<HTMLElement>('input, select, textarea')]
      .filter(el => visible(el) && !(el instanceof HTMLInputElement && sinTexto.has(el.type)) && !(el as HTMLInputElement).disabled
        && !el.closest('[data-vista-previa]') && parseFloat(getComputedStyle(el).borderTopWidth) > 0 && opacidad(el) === 1)
      .map(el => {
        const suelo = fondoDe(el.parentElement);
        const borde = sobre(leer(getComputedStyle(el).borderTopColor, 'borde campo'), suelo);
        return { que: nombre(el), ratio: ratio(borde, suelo) };
      });

    // ── Interruptores: pista (relleno o contorno) contra la tarjeta, y bola contra la pista ──
    const interruptores = [...raiz.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
      .filter(el => visible(el) && !el.disabled && opacidad(el) === 1)
      .map(el => {
        const cs = getComputedStyle(el);
        const suelo = fondoDe(el.parentElement);
        const pista = sobre(leer(cs.backgroundColor, 'pista'), suelo);
        const conBorde = parseFloat(cs.borderTopWidth) > 0;
        const borde = sobre(leer(cs.borderTopColor, 'borde pista'), pista);
        const contorno = Math.max(ratio(pista, suelo), conBorde ? ratio(borde, suelo) : 0);
        const bolaEl = [...el.querySelectorAll('*')].find(n => visible(n) && leer(getComputedStyle(n).backgroundColor, 'bola')[3] > 0);
        const bola = bolaEl ? ratio(sobre(leer(getComputedStyle(bolaEl).backgroundColor, 'bola'), pista), pista) : 0;
        return { que: nombre(el), on: el.getAttribute('aria-checked') === 'true', ratio: contorno, bola };
      });

    // ── Pastillas de estado ──
    const ETIQUETAS = /^(Conectado|No conectado|Con problemas|Pendiente|Próximamente|No disponible todavía|Como viene de fábrica|Se guarda al momento|Apagado)$/;
    const pastillas = new Set<Element>([
      ...raiz.querySelectorAll('[data-estado-ajuste]'),
      ...[...raiz.querySelectorAll('span')].filter(s => ETIQUETAS.test((s.textContent ?? '').trim())),
    ]);
    const estados = [...pastillas].filter(el => visible(el) && !el.closest('[data-vista-previa]')).map(el => {
      const cs = getComputedStyle(el);
      const suelo = fondoDe(el);
      return { que: (el.textContent ?? '').trim(), ratio: ratio(sobre(leer(cs.color, 'estado'), suelo), suelo), px: parseFloat(cs.fontSize) };
    });

    // ── Letra pequeña dentro de las tarjetas (ayudas, notas, avisos) ──
    const fuera = 'button, a, [role="switch"], [data-estado-ajuste], input, select, textarea, [data-vista-previa], iframe, svg, [aria-hidden="true"], .sr-only, [disabled]';
    const textos: (Medida & { px: number })[] = [];
    for (const caja of cajas.filter(c => c.tagName !== 'UL')) {
      for (const el of caja.querySelectorAll<HTMLElement>('*')) {
        if (el.closest(fuera) || pastillas.has(el) || !visible(el)) continue;
        const propio = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 1);
        if (!propio) continue;
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize);
        if (px >= 14 || opacidad(el) < 1) continue;
        const suelo = fondoDe(el);
        textos.push({ que: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50), ratio: ratio(sobre(leer(cs.color, 'texto'), suelo), suelo), px });
      }
    }

    // ── Botones deshabilitados: se tiene que leer qué dicen ──
    const botonesApagados = [...raiz.querySelectorAll<HTMLButtonElement>('button:disabled')]
      .filter(el => visible(el) && el.getAttribute('role') !== 'switch' && (el.textContent ?? '').trim().length > 1)
      .map(el => {
        const cs = getComputedStyle(el);
        const o = opacidad(el);
        const suelo = fondoDe(el.parentElement);
        const bg = leer(cs.backgroundColor, 'botón');
        const tx = leer(cs.color, 'texto botón');
        const fondoVisto = sobre([bg[0], bg[1], bg[2], bg[3] * o], suelo);
        const textoVisto = sobre([tx[0], tx[1], tx[2], tx[3] * o], fondoVisto);
        return { que: (el.textContent ?? '').trim(), ratio: ratio(textoVisto, fondoVisto) };
      });

    // ── Rail: la fila activa contra una inactiva ──
    let rail: Resultado['rail'] = null;
    const navRail = [...raiz.querySelectorAll('nav[aria-label="Secciones de Configuración"]')].find(visible);
    const activa = navRail?.querySelector<HTMLElement>('a[aria-current="page"]');
    const inactiva = navRail?.querySelector<HTMLElement>('ul a:not([aria-current])');
    if (activa && inactiva && visible(activa)) {
      const cs = getComputedStyle(activa);
      const suelo = fondoDe(activa.parentElement);
      const filaActiva = sobre(leer(cs.backgroundColor, 'fila activa'), suelo);
      const filaInactiva = fondoDe(inactiva);
      const borde = parseFloat(cs.borderTopWidth) > 0 ? ratio(sobre(leer(cs.borderTopColor, 'borde fila'), filaActiva), filaInactiva) : 0;
      rail = { fila: Math.max(ratio(filaActiva, filaInactiva), borde), texto: ratio(sobre(leer(cs.color, 'texto fila'), filaActiva), filaActiva) };
    }

    return { tarjetas, campos, interruptores, estados, textos, botonesApagados, rail, sinLeer };
  }) as Promise<Resultado>;
}

async function abrir(page: Page, ruta: string, tituloSeccion: string | null) {
  await ir(page, ruta);
  const raiz = page.locator('[data-tour="configuracion-vista"]');
  await expect(raiz).toBeAttached({ timeout: 60_000 });
  if (tituloSeccion) {
    await expect(page.getByRole('heading', { level: 2, name: tituloSeccion, exact: true })).toBeVisible({ timeout: 30_000 });
  } else {
    // El inicio: sus filas, y ya con el valor de cada sección (datos cargados).
    await expect(page.locator('#inicio-seccion-estudio [data-resumen="valor"]')).toBeVisible({ timeout: 30_000 });
  }
  await page.waitForFunction(() => !document.querySelector('[data-tour="configuracion-vista"] .animate-pulse'), null, { timeout: 15_000 }).catch(() => {});
  // El fundido de entrada de la sección: a mitad, los colores son mezclas.
  await page.waitForFunction(
    () => [...document.querySelectorAll('.tab-content-in, .panel-page-in')].flatMap(el => el.getAnimations())
      .every(a => a.playState === 'finished' || a.playState === 'idle'),
    null, { timeout: 5_000 },
  ).catch(() => {});
  await page.waitForTimeout(400);
}

const peor = (xs: Medida[]) => xs.reduce<Medida | null>((p, x) => (!p || x.ratio < p.ratio ? x : p), null);

const VISTAS = [
  { id: 'móvil 375×812 claro', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, oscuro: false, rail: false },
  { id: 'móvil 375×812 oscuro', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, oscuro: true, rail: false },
  { id: 'portátil 1024×768 claro', uso: { viewport: { width: 1024, height: 768 } }, oscuro: false, rail: true },
  { id: 'portátil 1024×768 oscuro', uso: { viewport: { width: 1024, height: 768 } }, oscuro: true, rail: true },
] as const;

const PANTALLAS = [
  { ruta: 'configuracion', titulo: null },
  { ruta: 'configuracion?tab=cobros', titulo: 'Cobros y facturas' },
  { ruta: 'configuracion?tab=comunicacion', titulo: 'Cómo me comunico' },
  { ruta: 'configuracion?tab=reservas', titulo: 'Cómo reservan mis alumnas' },
] as const;

for (const vista of VISTAS) {
  test.describe(`Contraste de Configuración en ${vista.id}`, () => {
    test.use(vista.uso);

    test('tarjetas, campos, fila activa, interruptores, estados y ayudas se distinguen', async ({ page }, info) => {
      test.setTimeout(240_000);
      await panel(page, vista.oscuro);

      const todo: Resultado = { tarjetas: [], campos: [], interruptores: [], estados: [], textos: [], botonesApagados: [], rail: null, sinLeer: [] };
      const rails: NonNullable<Resultado['rail']>[] = [];
      for (const p of PANTALLAS) {
        await abrir(page, p.ruta, p.titulo);
        const r = await medir(page);
        const aqui = (xs: Medida[]) => xs.map(x => ({ ...x, que: `${p.ruta.replace('configuracion?tab=', '')} · ${x.que}` }));
        todo.tarjetas.push(...aqui(r.tarjetas));
        todo.campos.push(...aqui(r.campos));
        todo.interruptores.push(...r.interruptores.map(x => ({ ...x, que: `${p.ruta} · ${x.que}` })));
        todo.estados.push(...r.estados.map(x => ({ ...x, que: `${p.ruta} · ${x.que}` })));
        todo.textos.push(...r.textos.map(x => ({ ...x, que: `${p.ruta} · ${x.que}` })));
        todo.botonesApagados.push(...aqui(r.botonesApagados));
        todo.sinLeer.push(...r.sinLeer);
        if (r.rail) rails.push(r.rail);
      }

      const on = todo.interruptores.filter(x => x.on);
      const off = todo.interruptores.filter(x => !x.on);
      const resumen = {
        tarjeta: peor(todo.tarjetas),
        campo: peor(todo.campos),
        interruptorEncendido: peor(on),
        interruptorApagado: peor(off),
        bola: peor(todo.interruptores.map(x => ({ que: x.que, ratio: x.bola }))),
        estado: peor(todo.estados),
        ayuda: peor(todo.textos),
        botonApagado: peor(todo.botonesApagados),
        railFila: rails.length ? Math.min(...rails.map(r => r.fila)) : null,
        railTexto: rails.length ? Math.min(...rails.map(r => r.texto)) : null,
        letraMasPequena: Math.min(...todo.textos.map(t => t.px), ...todo.estados.map(t => t.px)),
      };
      // A la vista en el log: es la tabla antes/después del PR.
      console.log(`[contraste] ${vista.id} ${JSON.stringify(resumen)}`);
      await info.attach('contraste.json', { body: JSON.stringify({ resumen, todo }, null, 2), contentType: 'application/json' });

      expect(todo.sinLeer, 'colores que el medidor no sabe leer').toEqual([]);

      // Que haya medido algo de cada familia.
      expect(todo.tarjetas.length, 'tarjetas medidas').toBeGreaterThan(3);
      expect(todo.campos.length, 'campos medidos').toBeGreaterThan(2);
      expect(on.length, 'interruptores encendidos medidos').toBeGreaterThan(0);
      expect(off.length, 'interruptores apagados medidos').toBeGreaterThan(0);
      expect(todo.estados.length, 'estados medidos').toBeGreaterThan(1);
      expect(todo.textos.length, 'ayudas medidas').toBeGreaterThan(5);
      if (vista.rail) expect(rails.length, 'rail medido').toBeGreaterThan(0);

      const bajo = (xs: Medida[], min: number) => xs.filter(x => x.ratio < min).map(x => `${x.que} ${x.ratio}:1`);
      expect.soft(bajo(todo.tarjetas, UMBRAL.tarjeta), `tarjeta contra el fondo < ${UMBRAL.tarjeta}:1`).toEqual([]);
      expect.soft(bajo(todo.campos, UMBRAL.control), `borde de campo < ${UMBRAL.control}:1`).toEqual([]);
      expect.soft(bajo(todo.interruptores, UMBRAL.control), `pista del interruptor < ${UMBRAL.control}:1`).toEqual([]);
      expect.soft(bajo(todo.interruptores.map(x => ({ que: x.que, ratio: x.bola })), UMBRAL.control), `bola contra la pista < ${UMBRAL.control}:1`).toEqual([]);
      expect.soft(bajo(todo.estados, UMBRAL.texto), `texto de estado < ${UMBRAL.texto}:1`).toEqual([]);
      expect.soft(bajo(todo.textos, UMBRAL.texto), `ayuda < ${UMBRAL.texto}:1`).toEqual([]);
      expect.soft(bajo(todo.botonesApagados, UMBRAL.texto), `botón deshabilitado ilegible < ${UMBRAL.texto}:1`).toEqual([]);
      expect.soft(
        [...todo.textos, ...todo.estados].filter(t => t.px < UMBRAL.letraMinima).map(t => `${t.que} ${t.px}px`),
        `letra por debajo de ${UMBRAL.letraMinima} px`,
      ).toEqual([]);
      for (const r of rails) {
        expect.soft(r.fila, 'fila activa del rail contra una inactiva').toBeGreaterThanOrEqual(UMBRAL.control);
        expect.soft(r.texto, 'texto de la fila activa').toBeGreaterThanOrEqual(UMBRAL.texto);
      }
    });
  });
}
