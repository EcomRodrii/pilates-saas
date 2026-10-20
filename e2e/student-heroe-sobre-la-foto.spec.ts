import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// El texto sobre FOTO de Inicio, medido sobre la foto de verdad.
//
// Desde la maqueta de oct-2026 (copiada tal cual por decisión del fundador) Inicio no tiene portada: el único texto
// sobre foto es la tarjeta «Próxima clase» (hora, nombre y la fila de duración · sala · instructora), sobre la foto de
// la clase con su velo negro (`.velo-foto`). El nombre del fichero se queda porque el proyecto WebKit lo lista.
//
// ⚠️ Esto no lo cubre `student-contraste`, que resuelve el fondo leyendo estilos y se salta el texto sobre foto a
// propósito — medirlo así da números falsos.
//
// Aquí se mide lo que de verdad decide: la foto por defecto de Reformer (`public/por-defecto/`) con su velo encima,
// ocultando SOLO el texto (nunca el velo) y comparando la tinta con el PEOR píxel de debajo.

const base = `/portal/${SLUG}`;

function lum(r: number, g: number, b: number) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

test.describe('Student PWA · el texto sobre la foto de Inicio', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('la hora, el nombre y la fila de la próxima clase llegan a AA sobre su foto', async ({ page }) => {
    await sembrarSociaCompleta(page, { reservada: true });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const tarjeta = page.getByTestId('clase-del-momento');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    // Que la foto haya pintado: sin ella se mediría contra el color de fondo y saldría verde sin probar nada.
    await expect.poll(() => tarjeta.locator('.tarjeta-proxima__foto img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(800);

    const piezas = await page.evaluate(() => {
      const sec = document.querySelector('[data-testid="clase-del-momento"]')!;
      const out: { nombre: string; tinta: string; px: number; peso: number; x: number; y: number; width: number; height: number }[] = [];
      const añade = (nombre: string, el: Element | null) => {
        if (!el) return;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2) return;
        out.push({ nombre, tinta: cs.color, px: parseFloat(cs.fontSize), peso: Number(cs.fontWeight) || 400,
          x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
      };
      añade('hora', sec.querySelector('.tarjeta-proxima__hora'));
      añade('nombre', sec.querySelector('.tarjeta-proxima__nombre'));
      añade('fila', sec.querySelector('.fila-meta-foto'));
      sec.querySelectorAll('.tarjeta-proxima__hora, .tarjeta-proxima__nombre, .fila-meta-foto').forEach((n) => ((n as HTMLElement).style.visibility = 'hidden'));
      return out;
    });

    expect(piezas.length, 'las tres piezas de texto sobre la foto').toBe(3);

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
