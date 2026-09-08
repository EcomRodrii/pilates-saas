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

const RUTAS = ['dashboard', 'cobros', 'productos', 'clientas', 'informes', 'equipo'];

interface Fallo { ruta: string; texto: string; ratio: number; color: string; fondo: string; px: number }

/**
 * Recorre el DOM buscando texto ilegible sobre su propio fondo.
 *
 * Se ejecuta dentro de la página (no hay forma de leer estilos calculados
 * desde fuera) y devuelve solo los incumplimientos, no los ~2.000 nodos.
 */
async function medir(page: import('@playwright/test').Page, ruta: string): Promise<{ revisados: number; fallos: Fallo[] }> {
  return page.evaluate((rutaActual) => {
    const rgb = (s: string): [number, number, number, number] | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p[3] ?? 1];
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
    return { revisados, fallos };
  }, ruta);
}

const informe = (f: Fallo[]) =>
  f.map((x) => `  ${x.ruta} · "${x.texto}" ${x.ratio}:1 (${x.px}px, ${x.color} sobre ${x.fondo})`).join('\n');

for (const modo of ['claro', 'oscuro'] as const) {
  for (const ruta of RUTAS) {
    test(`contraste ${modo} — ${ruta}`, async ({ page }) => {
      await montar(page);
      if (modo === 'oscuro') await enOscuro(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await ir(page, ruta);

      const { revisados, fallos } = await medir(page, ruta);
      // ⚠️ Sin esto el test se pone verde por VACÍO: si la pantalla no llegó a
      // pintarse no hay texto que medir, no hay fallos, y pasa sin haber mirado
      // nada. Pasó dos veces mientras se escribía esto: /clientas quedándose en
      // su esqueleto (0 nodos) y el `next dev` local devolviendo 404 a todo tras
      // una tanda con --repeat-each (4 nodos, los de la página de error). El
      // suelo va en 15 porque la pantalla más escueta de la lista, /productos,
      // mide 21 — por encima de los dos casos malos y por debajo del real.
      expect(revisados, `${ruta} (${modo}) no llegó a pintar texto: se midieron ${revisados} nodos`).toBeGreaterThan(15);
      expect(fallos, `texto por debajo de AA:\n${informe(fallos)}`).toEqual([]);
    });
  }
}
