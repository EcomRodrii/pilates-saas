import { test, expect } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Barrido de contraste del panel — la auditoría visual, hecha máquina.
//
// Nació de mirar una pantalla: en Paquetes, la pestaña activa medía 3,29:1. El
// gate que debía impedirlo (`colorLegibleSobreClaro`) sí existía, pero medía
// contra BLANCO PURO y con el umbral de TEXTO GRANDE, y ninguna de las dos
// cosas se parecía a la pantalla — ese color se pinta en 11-14 px sobre un
// tinte de marca. Un test de "que no vuelva este hex" habría tapado ese caso y
// ninguno más; esto comprueba la propiedad de verdad, en los dos modos.
//
// El modo OSCURO va aquí a propósito: nunca se había mirado, y es donde
// aparecen los colores elegidos a ojo para fondo claro. Encontró dos —«Fallido»
// en el dashboard y «No se pudo cobrar» en Cobros, los dos en 1,47:1, que es
// el aviso de que un cobro ha fallado siendo el único ilegible de la lista.
//
// ⚠️ Lo que este barrido NO ve: texto sobre imagen o degradado (no hay un
// "color de fondo" que medir), y cualquier cosa detrás de un clic. Sigue
// haciendo falta mirar.
// ─────────────────────────────────────────────────────────────────────────────

// Cada test carga una pantalla ENTERA del panel. Los 30 s por defecto de
// Playwright se quedan cortos cuando el servidor va cargado (varios workers, o
// una máquina compartida con otra compilación), y entonces el test muere sin
// haber medido nada — que es peor que tardar.
test.describe.configure({ timeout: 60_000 });

const RUTAS = [
  'dashboard', 'cobros', 'productos', 'clientas', 'informes', 'equipo',
  'centro-de-control', 'calendario', 'citas', 'configuracion',
  'automatizaciones', 'cierre', 'comunidad', 'explorar-funciones',
  'libreta', 'mensajeria', 'mi-perfil', 'migracion',
  'notificaciones', 'primeros-pasos', 'primeros-pasos/tu-horario', 'sustituciones', 'network/buscar',
];

// ⚠️ Fuera de la lista, y no por descuido: /facturas, /pagos, /socios y
// /transacciones NO son pantallas — son redirecciones a /cobros, y /contenido
// y /marketing lo son a /dashboard mientras el módulo está apagado. Medirlas
// no añade nada (mide dos veces la misma pantalla) y además encadena DOS
// transiciones de página: la primera vez que estuvieron aquí, el barrido cazó
// 18 «fallos» de contraste en /facturas que eran los colores a medio fundir de
// la animación de entrada de /cobros, no un color de nadie.

interface Fallo { ruta: string; texto: string; ratio: number; color: string; fondo: string; px: number }

/**
 * Recorre el DOM buscando texto ilegible sobre su propio fondo.
 *
 * Se ejecuta dentro de la página (no hay forma de leer estilos calculados
 * desde fuera) y devuelve solo los incumplimientos, no los ~2.000 nodos.
 */
async function medir(page: import('@playwright/test').Page, ruta: string): Promise<{ revisados: number; panel: boolean; fallos: Fallo[] }> {
  return page.evaluate((rutaActual) => {
    // ⚠️ Esto solo entendía `rgb()`/`rgba()` y devolvía `null` para todo lo
    // demás — y «todo lo demás» son los colores DEL PROPIO PANEL: Tailwind 4
    // emite `oklab(...)` y `lab(...)`. Con `null`, el fondo del elemento se
    // ignoraba y se seguía subiendo por los ancestros, así que se medía la
    // tinta contra un fondo que no es el suyo.
    //
    // Se vio al sembrar los datos del panel: el contador rojo de la campana
    // —blanco sobre `lab(55.48 75.07 48.85)`, perfectamente legible— salía como
    // **1,16:1**, porque el rojo era invisible para el parser y se comparaba
    // contra el crema de la barra. Un fallo que solo aparece cuando hay datos,
    // en un guardia que llevaba corriendo sobre pantallas vacías.
    //
    // La conversión la hace el NAVEGADOR sobre un lienzo de 1×1: así vale
    // cualquier formato que el CSS acepte hoy o mañana, sin ir añadiendo
    // expresiones regulares.
    const lienzo = document.createElement('canvas');
    lienzo.width = 1; lienzo.height = 1;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    const rgb = (s: string): [number, number, number, number] | null => {
      if (!s || s === 'transparent' || s === 'none') return null;
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map((x) => parseFloat(x));
        return [p[0], p[1], p[2], p[3] ?? 1];
      }
      if (!ctx) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      // Alfa 0 con el lienzo limpio = el navegador no entendió el color.
      if (d[3] === 0) return null;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Fondo efectivo: el primer ancestro con color de fondo opaco. Un fondo
    // semitransparente se compone sobre el que venga detrás.
    const fondoDe = (el: Element): number[] => {
      let capa: Element | null = el;
      let acc: number[] | null = null;
      while (capa) {
        const c = rgb(getComputedStyle(capa).backgroundColor);
        if (c && c[3] > 0) {
          acc = acc ? acc : null;
          if (!acc) acc = [c[0], c[1], c[2]];
          else break;
          if (c[3] >= 0.999) return acc;
          // Semitransparente: seguir subiendo y componer.
          const debajo = (() => {
            let p = capa!.parentElement;
            while (p) {
              const d = rgb(getComputedStyle(p).backgroundColor);
              if (d && d[3] >= 0.999) return [d[0], d[1], d[2]];
              p = p.parentElement;
            }
            return [255, 255, 255];
          })();
          return [0, 1, 2].map((i) => c[i] * c[3] + debajo[i] * (1 - c[3]));
        }
        capa = capa.parentElement;
      }
      return [255, 255, 255];
    };

    const fallos: Fallo[] = [];
    let revisados = 0;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      // Solo hojas con texto propio: si tiene hijos-elemento, el texto es de
      // ellos y se mediría dos veces (y con el fondo equivocado).
      const propio = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!propio) continue;

      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.9) continue;
      if (el.closest('[aria-hidden="true"],[disabled],[aria-disabled="true"]')) continue;
      const caja = el.getBoundingClientRect();
      if (caja.width < 2 || caja.height < 2) continue;

      const tinta = rgb(s.color);
      if (!tinta || tinta[3] < 0.9) continue;
      revisados++;
      const fondo = fondoDe(el);
      const px = parseFloat(s.fontSize);
      const peso = parseInt(s.fontWeight, 10) || 400;
      // WCAG: "texto grande" = ≥24px, o ≥18.66px en negrita.
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const umbral = grande ? 3 : 4.5;
      const r = ratio([tinta[0], tinta[1], tinta[2]], fondo);
      if (r < umbral) {
        fallos.push({
          ruta: rutaActual,
          texto: propio.slice(0, 40),
          ratio: Math.round(r * 100) / 100,
          color: s.color,
          fondo: `rgb(${fondo.map((n) => Math.round(n)).join(', ')})`,
          px,
        });
      }
    }
    // ¿Se ha pintado el PANEL? `#panel-portal-host` es la señal: lo pinta
    // `DashboardShell` en TODAS sus pantallas —incluidos los estados de error y
    // los vacíos— y el 404 no lo tiene, porque vive en la raíz, fuera de ese
    // layout. Contar texto no servía: /notificaciones cargada mide 8 nodos y un
    // 404 mide 4, demasiado cerca para separarlos por volumen. Y un enlace
    // concreto del menú tampoco: el menú es configurable por estudio.
    const panel = Boolean(document.querySelector('#panel-portal-host'));
    return { revisados, fallos, panel };
  }, ruta);
}

const informe = (f: Fallo[]) =>
  f.map((x) => `  ${x.ruta} · "${x.texto}" ${x.ratio}:1 (${x.px}px, ${x.color} sobre ${x.fondo})`).join('\n');

// ⚠️ Rojos CONOCIDOS, no excusados. `test.fail()` exige que sigan fallando: el
// día que alguien los arregle, la suite avisa de que hay que quitar el marcador.
// Se prefiere esto a sacar la ruta del barrido, que es como se pierde una deuda.
//
// Salieron al sembrar datos Y al arreglar el parser de color. Cuatro de los
// hallazgos ya están arreglados en este mismo cambio (el tono `aviso` al 12 %,
// el aforo con la tinta del chip, y los dos rótulos «Sin clases»/«Cerrado» que
// usaban `--border` como tinta). Quedan tres, y cada uno pide criterio propio:
//
//  · `calendario` — **el nombre de la instructora**: `--muted-foreground` sobre
//    el chip teñido con el color del tipo de clase, a 9 px. Mide 2,61–3,94:1
//    según el color. Este SÍ es el caso difícil: el fondo es
//    `color-mix(tipo.color 50%, --card)` con un color que elige el estudio, así
//    que ninguna tinta fija sirve. Salidas: bajar `--calendario-tinte-clase`
//    (su comentario en globals.css dice que al 50 % el peor caso queda en 5,1,
//    pero eso se midió contra `--foreground`, no contra `--muted-foreground`),
//    o derivar la tinta con `colorLegibleSobre` de `lib/color-utils.ts` — que
//    existe y hace exactamente esto.
//  · `calendario` — «10», el número del día: blanco sobre #A8B37A, **2,24:1**.
//  · `calendario` — «Ver 09:00»: blanco sobre #E08A6B, **2,62:1**.
//  · `mensajeria` (oscuro) — el desplegable de avisos. Medido en el DOM: la
//    tarjeta es `bg-card` (#1E1E22, oscura) pero cada `<li>` lleva
//    `rgb(250,251,255)` fija, así que en oscuro queda tinta clara sobre fila
//    clara: **1,14:1** en los títulos.
const ROJOS_CONOCIDOS = new Set(['claro—calendario', 'oscuro—calendario', 'oscuro—mensajeria']);

for (const modo of ['claro', 'oscuro'] as const) {
  for (const ruta of RUTAS) {
    test(`contraste ${modo} — ${ruta}`, async ({ page }) => {
      if (ROJOS_CONOCIDOS.has(`${modo}—${ruta}`)) {
        test.fail(true, 'rojo conocido — ver ROJOS_CONOCIDOS arriba');
      }
      await montar(page);
      if (modo === 'oscuro') await enOscuro(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await ir(page, ruta);

      const { revisados, panel, fallos } = await medir(page, ruta);
      // ⚠️ Sin esto el test se pone verde por VACÍO: si la pantalla no llegó a
      // pintarse no hay texto que medir, no hay fallos, y pasa sin haber mirado
      // nada. Pasó dos veces mientras se escribía esto: /clientas quedándose en
      // su esqueleto y el `next dev` local devolviendo 404 a todo.
      //
      // El guardia mira si el PANEL se ha montado, no cuánta letra hay. Un
      // umbral de volumen no distingue las dos cosas que hay que distinguir:
      // /notificaciones cargada —un estado vacío legítimo, con su cartelito y
      // poco más— mide 8 nodos, y la página 404 mide 4.
      expect(panel, `${ruta} (${modo}) no llegó a pintar el panel: ¿404 o esqueleto?`).toBe(true);
      expect(revisados, `${ruta} (${modo}) pintó el panel pero ni una línea de texto`).toBeGreaterThan(3);
      expect(fallos, `texto por debajo de AA:\n${informe(fallos)}`).toEqual([]);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// El botón PRIMARIO en oscuro: que se vea el botón, no solo su letra.
//
// El barrido de arriba mide texto contra su fondo, y con eso un `bg-primary`
// pasaba de sobra en oscuro: `.dark` no redefinía `--primary`, así que la letra
// blanca sobre #131313 daba 18:1. Lo que no se veía era el BOTÓN — #131313
// sobre la tarjeta #1E1E22, 1,1:1: un rótulo flotando sin control alrededor, en
// Inicio, en Clientas y en cualquier pantalla con una acción principal.
//
// Por eso aquí se miden las DOS cosas: la letra contra el relleno (4,5:1, WCAG
// 1.4.3) y el relleno —o el borde, si lo tiene— contra lo que hay detrás
// (3:1, WCAG 1.4.11: el contorno de un control).
//
// ⚠️ Los colores se leen igual que en `oscuro-contraste.spec.ts`: oklab/oklch a
// mano, porque `bg-primary/90` sale como `oklab(...)`. Lo que no se sabe leer
// se cuenta y hace fallar — medir mal es peor que no medir.
// ─────────────────────────────────────────────────────────────────────────────

interface BotonPrimario { texto: string; letra: number | null; contorno: number; relleno: string; detras: string }

async function medirPrimarios(page: import('@playwright/test').Page): Promise<{ botones: BotonPrimario[]; sinLeer: string[] }> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const sinLeer: string[] = [];
    const gamma = (v: number) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    function deOklab(L: number, a: number, b: number, alfa: number): RGBA {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [
        gamma(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
        alfa,
      ];
    }
    function aRGBA(css: string): RGBA | null {
      const c = css.trim();
      if (!c || c === 'transparent') return [0, 0, 0, 0];
      const m = c.match(/^([a-z]+)\((.*)\)$/);
      if (!m) return null;
      const [, fn, cuerpo] = m;
      const partes = cuerpo.replace(/,/g, ' ').replace('/', ' / ').split(/\s+/).filter(Boolean);
      const barra = partes.indexOf('/');
      const toks = barra >= 0 ? partes.slice(0, barra) : partes;
      const alfaTok = barra >= 0 ? partes[barra + 1] : toks[3];
      // ⚠️ Con su `%`: `oklab(56.4% …)` leído sin él mete una L de 56,4.
      const val = (t: string | undefined, escalaPct: number) =>
        t === undefined || t === 'none' ? 0 : t.endsWith('%') ? (parseFloat(t) / 100) * escalaPct : parseFloat(t);
      const alfa = alfaTok === undefined ? 1 : val(alfaTok, 1);
      if (fn === 'rgb' || fn === 'rgba') return [val(toks[0], 255), val(toks[1], 255), val(toks[2], 255), alfa];
      if (fn === 'oklab') return deOklab(val(toks[0], 1), val(toks[1], 0.4), val(toks[2], 0.4), alfa);
      if (fn === 'oklch') {
        const C = val(toks[1], 0.4), h = (val(toks[2], 1) * Math.PI) / 180;
        return deOklab(val(toks[0], 1), C * Math.cos(h), C * Math.sin(h), alfa);
      }
      if (fn === 'color' && toks[0] === 'srgb') {
        return [val(toks[1], 1) * 255, val(toks[2], 1) * 255, val(toks[3], 1) * 255, alfa];
      }
      return null;
    }
    const leer = (css: string): RGBA => {
      const c = aRGBA(css);
      if (c) return c;
      sinLeer.push(css);
      return [0, 0, 0, 0];
    };
    const sobre = (f: RGBA, b: RGBA): RGBA => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1) as RGBA;
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a: RGBA, b: RGBA) => {
      const [x, y] = [lum(a), lum(b)];
      return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
    };
    // Lo que hay detrás: capas translúcidas apiladas hasta dar con una opaca.
    function fondoDe(el: HTMLElement | null): RGBA {
      const capas: RGBA[] = [];
      for (let n = el; n; n = n.parentElement) {
        const c = leer(getComputedStyle(n).backgroundColor);
        if (c[3] === 0) continue;
        capas.push(c);
        if (c[3] >= 0.999) break;
      }
      let base: RGBA = capas.length && capas[capas.length - 1][3] >= 0.999 ? capas.pop()! : [255, 255, 255, 1];
      for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
      return base;
    }
    const css = (c: RGBA) => `rgb(${c.slice(0, 3).map(Math.round).join(', ')})`;

    const botones: BotonPrimario[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[class~="bg-primary"]'))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // Un punto de 8 px (el indicador de una opción elegida) no es un control.
      if (cs.visibility === 'hidden' || cs.display === 'none' || r.width < 20 || r.height < 20) continue;
      const detras = fondoDe(el.parentElement);
      const relleno = sobre(leer(cs.backgroundColor), detras);
      let contorno = ratio(relleno, detras);
      if (parseFloat(cs.borderTopWidth) >= 1) {
        contorno = Math.max(contorno, ratio(sobre(leer(cs.borderTopColor), detras), detras));
      }
      const texto = (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      botones.push({
        texto,
        letra: texto ? ratio(sobre(leer(cs.color), relleno), relleno) : null,
        contorno,
        relleno: css(relleno),
        detras: css(detras),
      });
    }
    return { botones, sinLeer };
  });
}

test.describe('botón primario en oscuro — se ve el botón, no solo la letra', () => {
  for (const ruta of ['dashboard', 'clientas']) {
    test(ruta, async ({ page }) => {
      await montar(page);
      await enOscuro(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await ir(page, ruta);
      // Bajo carga, `ir` puede volver con la cabecera aún sin pintar: se espera
      // al botón, y si no llega, el `toBeGreaterThan(0)` de abajo lo dice.
      await page.locator('[class~="bg-primary"]:visible').first().waitFor({ timeout: 30_000 }).catch(() => {});

      const { botones, sinLeer } = await medirPrimarios(page);
      // La captura, con un botón primario a la vista: en Inicio quedan bajo el pliegue.
      await page.locator('[class~="bg-primary"]:visible').filter({ hasText: /\S/ }).first()
        .scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: `test-results/primario-oscuro-${ruta}.png` });
      console.log(`${ruta} (oscuro):\n` + botones.map(b =>
        `  «${b.texto}» letra ${b.letra ?? '—'}:1 · contorno ${b.contorno}:1 (${b.relleno} sobre ${b.detras})`).join('\n'));

      // Sin esto el test pasa en verde por no haber encontrado ningún botón.
      expect(botones.length, `${ruta}: ningún bg-primary visible que medir`).toBeGreaterThan(0);
      expect(sinLeer, 'colores que el medidor no sabe convertir').toEqual([]);
      const conTexto = botones.filter(b => b.letra !== null);
      expect(conTexto.length, `${ruta}: ningún botón primario con texto`).toBeGreaterThan(0);
      for (const b of botones) {
        expect(b.contorno, `«${b.texto}»: el botón no se distingue de lo que tiene detrás`).toBeGreaterThanOrEqual(3);
        if (b.letra !== null) expect(b.letra, `«${b.texto}»: la letra no se lee sobre el botón`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
