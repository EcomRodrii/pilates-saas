import { test, expect, type Page } from '@playwright/test';
import { SLUG, sembrarSociaCompleta, type OpcionesSocia } from './socia-completa';

// Contraste AA del texto de la app de la alumna, medido en el navegador.
//
// ⚠️ Este guardia nace de un fallo que un token NO puede tener solo: el que
// aparece al ponerlo sobre otra superficie. `--subtle-foreground` está
// calibrado contra el crema del fondo (4,55:1) y la tarjeta blanca (4,80), y
// sobre `--accent-soft` cae a **3,97–4,15:1 según la marca del estudio** — un
// fallo que solo existe en marca blanca y que ninguna revisión del token, mirado
// solo, podría encontrar. Ya se había topado con él el conmutador de Mis clases
// (contra `--muted`, 4,09:1) y se arregló allí; la hora del aviso sin leer se
// quedó fuera.
//
// ⚠️ **Se excluye a propósito el texto sobre FOTO.** El fondo declarado de un
// badge del héroe es un velo crema al 20 %, y medir contra eso da 1,05:1 —
// falso. Lo que decide ahí es la foto y el degradado, y eso hay que medirlo
// fotografiando los píxeles con el texto oculto, no leyendo estilos. Medirlo
// mal es peor que no medirlo: llena el guardia de rojos que nadie puede
// arreglar y enseña a ignorarlo.

const base = `/portal/${SLUG}`;

const PANTALLAS: Array<[string, string, OpcionesSocia]> = [
  ['inicio', '', { reservada: true }],
  ['reservar', '/reservar', {}],
  ['mis-reservas', '/mis-reservas', { reservada: true }],
  ['bonos', '/bonos', {}],
  ['pagos', '/pagos', { recibos: 2 }],
  ['comprar', '/comprar', {}],
  ['perfil', '/perfil', {}],
  ['preferencias', '/perfil/preferencias', {}],
  ['notificaciones', '/notificaciones', { avisos: [
    { id: 'n1', title: 'Tu reserva se ha cancelado', body: 'La clase de hoy a las 10:00', category: 'reservas', eventType: 'reserva.cancelada' },
    { id: 'n2', title: 'Bono a punto de caducar', body: 'Te quedan 5 sesiones', category: 'pagos', eventType: 'bono.por_caducar', leido: true },
  ] }],
  ['mensajes', '/mensajes', { conversaciones: 1 }],
];

const MEDIR = `
(() => {
  const lum = (c) => { const [r,g,b] = c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
  const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  // Fondo efectivo. Devuelve null —«aquí no se puede medir»— en cuanto aparece
  // algo que los estilos no bastan para resolver.
  //
  // ⚠️ Lo importante es la comprobación de CAPAS HERMANAS. La tarjeta de próxima
  // clase pone su foto en un <div> absoluto HERMANO del texto, no en un
  // ancestro: subiendo por los padres no se ve ninguna imagen, se aterriza en el
  // crema del fondo y sale que el texto claro tiene 1,00:1 contra sí mismo.
  // Es falso, y un guardia que grita donde no hay nada que arreglar enseña a
  // ignorar el rojo, que es peor que no tenerlo.
  const cubre = (capa, r) => {
    const c = capa.getBoundingClientRect();
    return c.left <= r.left + 1 && c.top <= r.top + 1 && c.right >= r.right - 1 && c.bottom >= r.bottom - 1;
  };
  const fondo = (el) => {
    const r = el.getBoundingClientRect();
    let n = el;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      // ¿Alguna capa absoluta de este contenedor tapa el texto?
      for (const hijo of n.children) {
        if (hijo === el || hijo.contains(el)) continue;
        const hs = getComputedStyle(hijo);
        if (hs.position !== 'absolute' && hs.position !== 'fixed') continue;
        const pinta = (hs.backgroundImage && hs.backgroundImage !== 'none')
          || (hs.backgroundColor && !hs.backgroundColor.startsWith('rgba(0, 0, 0, 0)'));
        if (pinta && cubre(hijo, r)) return null;
      }
      if (s.backgroundColor && !s.backgroundColor.startsWith('rgba(0, 0, 0, 0)')) {
        // Un fondo translúcido tampoco vale: lo que se ve es lo de detrás.
        const a = s.backgroundColor.match(/[\\d.]+/g);
        if (a && a.length > 3 && Number(a[3]) < 0.95) return null;
        return s.backgroundColor;
      }
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const malos = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 140) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const bg = fondo(el);
    if (!bg) continue;
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    const c = ratio(s.color, bg);
    if (c < minimo) malos.push({ txt: t.slice(0,44), ratio: +c.toFixed(2), minimo, px, tinta: s.color, fondo: bg });
  }
  return malos;
})()
`;

test.describe('Student PWA · contraste', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [nombre, ruta, opts] of PANTALLAS) {
    test(`${nombre}: todo el texto sobre color plano llega a AA`, async ({ page }: { page: Page }) => {
      const and = await sembrarSociaCompleta(page, opts);
      await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);

      const texto = await page.locator('body').innerText();
      expect(texto, 'la pantalla no ha cargado').not.toContain('Esta página no existe');
      // Sin esto, una pantalla que no carga sale VERDE por no tener texto que medir.
      expect(texto.length, 'no hay texto que medir').toBeGreaterThan(40);
      expect([...new Set(and.sinMockear())], 'andamiaje incompleto: el resultado no vale').toEqual([]);

      const malos = await page.evaluate(MEDIR);
      expect(malos, `texto por debajo de AA:\n${JSON.stringify(malos, null, 2)}`).toEqual([]);
    });
  }
});
