import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// El texto del héroe de Inicio, medido sobre LA FOTO DE VERDAD.
//
// ⚠️ Esto no lo cubre `student-contraste`, que resuelve el fondo leyendo
// estilos y se salta el texto sobre foto a propósito — medirlo así da números
// falsos. Y tampoco `student-cabecera-sobre-foto`, que sustituye la portada por
// un color plano para probar el velo de la BARRA.
//
// Aquí se mide lo que de verdad decide: la portada por defecto del repo
// (`public/por-defecto/estudio-hero.webp`) con su velo encima. Nace de cambiar
// esa foto por una más luminosa: con el velo que había, el kicker cayó a
// **3,73:1** donde hacen falta 4,5. Nada más lo habría dicho.
//
// ⚠️ Se ocultan las HOJAS de texto, nunca su contenedor: ese `div` es quien
// pinta el velo. Ocultándolo se mide la foto desnuda y sale 1,15:1 en un texto
// que se lee perfectamente — el error que ya documenta `velo-del-heroe`.

const base = `/portal/${SLUG}`;

function lum(r: number, g: number, b: number) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

test.describe('Student PWA · el héroe sobre la foto', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('kicker, saludo, subtítulo y carril llegan a AA sobre la portada por defecto', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    const piezas = await page.evaluate(() => {
      const sec = document.querySelector('main.page > section')!;
      const bloque = sec.querySelector('div.px')!;
      const out: { nombre: string; tinta: string; px: number; peso: number; x: number; y: number; width: number; height: number }[] = [];
      const añade = (nombre: string, el: Element | null) => {
        if (!el) return;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2) return;
        out.push({ nombre, tinta: cs.color, px: parseFloat(cs.fontSize), peso: Number(cs.fontWeight) || 400,
          x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
      };
      añade('kicker', bloque.querySelector('p.t-label'));
      añade('saludo', bloque.querySelector('h1'));
      añade('subtítulo', bloque.querySelectorAll('p')[1]);
      añade('carril', sec.querySelector('p[aria-hidden]'));
      bloque.querySelectorAll('p, h1, a').forEach((n) => ((n as HTMLElement).style.visibility = 'hidden'));
      (sec.querySelector('p[aria-hidden]') as HTMLElement | null)?.style.setProperty('visibility', 'hidden');
      return out;
    });

    expect(piezas.length, 'las cuatro piezas del héroe').toBe(4);

    for (const p of piezas) {
      const buf = await page.screenshot({ clip: { x: p.x, y: p.y, width: p.width, height: p.height } });
      const datos: number[] = await page.evaluate(async ([b, w, h]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
        const c = document.createElement('canvas'); c.width = w as number; c.height = h as number;
        const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
        return Array.from(ctx.getImageData(0, 0, w as number, h as number).data);
      }, [buf.toString('base64'), p.width, p.height] as const);

      // La tinta puede llevar alfa: se compone sobre lo que hay detrás, que es
      // como se ve de verdad.
      const m = p.tinta.match(/[\d.]+/g)!.map(Number);
      const alfa = m.length > 3 ? m[3] : 1;
      let peor = 99;
      for (let i = 0; i < datos.length; i += 4) {
        const lf = lum(datos[i], datos[i + 1], datos[i + 2]);
        const comp = [0, 1, 2].map((k) => m[k] * alfa + datos[i + k] * (1 - alfa));
        const [a, b2] = [lum(comp[0], comp[1], comp[2]), lf].sort((x, y) => y - x);
        peor = Math.min(peor, (a + 0.05) / (b2 + 0.05));
      }
      const grande = p.px >= 24 || (p.px >= 18.66 && p.peso >= 700);
      expect(+peor.toFixed(2), `${p.nombre} (${p.px}px, peso ${p.peso})`).toBeGreaterThanOrEqual(grande ? 3 : 4.5);
    }
  });
});
