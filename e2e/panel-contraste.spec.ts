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
  'notificaciones', 'primeros-pasos', 'sustituciones', 'network/buscar',
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
