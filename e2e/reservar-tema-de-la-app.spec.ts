import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// /reservar toma el estilo de la app de la alumna (decisión del fundador,
// 27-sep-2026), y dentro de la web del estudio el widget sigue ganando.
//
// ⚠️ El estilo se resuelve en el SERVIDOR (el layout inyecta un `<style>` en
// `:root` y los tokens por prop), así que `page.route` no llega: el estudio de
// prueba lleva la apariencia por SLUG (`tentare-carbon`, lib/studio-seo.ts) —
// Carbón + Editorial (Libre Caslon · Figtree) + marca fiel. Con `tentare` va la
// de por defecto, que tiene que ser exactamente la de antes.
//
// Las fuentes NO se comparan contra un nombre escrito aquí: next/font/local
// nombra cada familia a su manera, y atar el test a ese nombre lo rompería al
// cambiar de cargador. Se compara con una SONDA — un elemento con
// `font-family: var(--font-figtree)` — que resuelve igual que la página.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';

function fx(slug: string) {
  const mk = (d: string, h: string, id: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sesiones: [mk('12', '10', 's1'), mk('12', '18', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [],
    challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function mocks(page: Page, slug: string) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx(slug)) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function abrir(page: Page, slug: string, q: string) {
  await page.setViewportSize({ width: 1000, height: 620 });
  await mocks(page, slug);
  await page.goto(`/reservar/${slug}?tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);
}

async function medir(page: Page) {
  return page.evaluate(() => {
    // La raíz de la página es la que lleva `min-height: 100dvh` en línea. No
    // vale `div[style*="min-height"]` a secas: en la página suelta el propio
    // #horario lleva `min-height: 1px` y `closest` empieza por él.
    const raiz = document.querySelector('#horario')!.closest('div[style*="100dvh"]') as HTMLElement;
    const primera = (f: string) => f.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    const sonda = (pila: string) => {
      const el = document.createElement('span');
      el.style.fontFamily = pila;
      document.body.appendChild(el);
      const f = getComputedStyle(el).fontFamily;
      el.remove();
      return primera(f);
    };
    // Un titular real: su style en línea USA la variable (la raíz, si acaso, la define).
    const titular = document.querySelector('[style*="var(--portal-heading-font"]') as HTMLElement | null;
    const cs = getComputedStyle(raiz);
    const html = getComputedStyle(document.documentElement);
    return {
      fondo: cs.backgroundColor,
      tinta: cs.color,
      familiaRaiz: cs.fontFamily,
      cuerpo: primera(cs.fontFamily),
      titular: titular ? getComputedStyle(titular).fontFamily : null,
      titularPrimera: titular ? primera(getComputedStyle(titular).fontFamily) : null,
      jakarta: sonda('var(--font-jakarta)'),
      figtree: sonda('var(--font-figtree)'),
      caslon: sonda('var(--font-libre-caslon)'),
      esquema: html.colorScheme,
      pesoTitularRaiz: cs.getPropertyValue('--reservar-heading-weight').trim(),
      pesoTitularHtml: html.getPropertyValue('--reservar-heading-weight').trim(),
      marcaRaiz: cs.getPropertyValue('--portal-brand').trim(),
      marcaEstudio: html.getPropertyValue('--portal-brand-estudio').trim(),
      estiloRaiz: raiz.getAttribute('style') ?? '',
      estiloTema: document.getElementById('reservar-tema')?.textContent ?? null,
    };
  });
}

/** Superficies CLARAS (mismo barrido que reservar-acoplar-widget.spec.ts). Devuelve las culpables. */
async function superficiesClaras(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      const caja = el.getBoundingClientRect();
      if (caja.width < 40 || caja.height < 20) continue;
      const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s.backgroundColor);
      if (!m) continue;
      const alfa = m[4] === undefined ? 1 : Number(m[4]);
      if (alfa > 0.3 && Number(m[1]) > 200 && Number(m[2]) > 200 && Number(m[3]) > 200) {
        out.push(`${s.backgroundColor} <${el.tagName.toLowerCase()}> ${(el.getAttribute('style') ?? '').slice(0, 90)}`);
      }
    }
    return out;
  });
}

test('sin estilo elegido, /reservar se ve exactamente como antes: crema y Jakarta', async ({ page }) => {
  await abrir(page, 'tentare', '');
  const r = await medir(page);
  expect(r.estiloTema, 'el <style id="reservar-tema"> tiene que estar').not.toBeNull();
  // Ni un color del estilo: solo la fuente de siempre y la marca de respaldo.
  expect(r.estiloTema).not.toContain('--portal-bg');
  expect(r.estiloTema).not.toContain('--portal-brand:');
  expect(r.fondo).toBe('rgb(250, 249, 245)');
  expect(r.cuerpo).toBe(r.jakarta);
  expect(r.titularPrimera).toBe(r.jakarta);
  expect(r.esquema).not.toBe('dark');
});

test('con Carbón + Editorial, la página suelta es oscura, en Figtree y con titulares en Libre Caslon', async ({ page }) => {
  await abrir(page, 'tentare-carbon', '');
  const r = await medir(page);
  expect(r.fondo).toBe('rgb(23, 24, 27)');
  expect(r.tinta).toBe('rgb(242, 243, 245)');
  expect(r.cuerpo).toBe(r.figtree);
  expect(r.titularPrimera).toBe(r.caslon);
  // Las barras de desplazamiento y los controles nativos, también oscuros.
  expect(r.esquema).toBe('dark');
  // El peso de titular de la pareja (Libre Caslon no tiene 800).
  expect(r.pesoTitularHtml).toBe('700');
});

test('incrustada sin parámetros, hereda Carbón entero: ninguna superficie clara', async ({ page }) => {
  await abrir(page, 'tentare-carbon', '&embed=1');
  const r = await medir(page);
  expect(r.fondo).toBe('rgb(23, 24, 27)');
  expect(r.cuerpo).toBe(r.figtree);
  // Nada en línea: hereda `:root`, que es lo que deja que el tema llegue.
  expect(r.estiloRaiz).not.toMatch(/--portal-bg\s*:/);
  expect(r.estiloRaiz).not.toMatch(/--font-ui\s*:/);
  // Y los colores que viajan por PROP (calendario, tarjetas) también son de
  // Carbón: si se quedaran en el día de siempre, aquí saldrían blancos.
  const claras = await superficiesClaras(page);
  expect(claras, `superficies claras en un widget que hereda Carbón:\n${claras.join('\n')}`).toEqual([]);
});

test('⚠️ incrustada con parámetros, gana el widget ENTERO sobre Carbón: su fondo, su letra y la marca del estudio', async ({ page }) => {
  await abrir(page, 'tentare-carbon', '&embed=1&fuente=Lobster&fondo=%23ffffff&texto=oscuro');
  const r = await medir(page);
  expect(r.fondo).toBe('rgb(255, 255, 255)');
  // La tinta de día, no la clara de Carbón: sobre blanco tiene que leerse.
  const [tr, tg, tb] = r.tinta.match(/\d+/g)!.map(Number);
  expect((tr + tg + tb) / 3).toBeLessThan(80);
  expect(r.familiaRaiz).toContain('Lobster');
  expect(r.titular).toContain('Lobster');
  // El peso de titular de la pareja de la app no se cuela en la fuente del widget.
  expect(r.pesoTitularRaiz).toBe('');
  // La marca vuelve a la del estudio tal cual (el acento aclarado de Carbón no
  // se lee sobre blanco).
  expect(r.marcaEstudio).not.toBe('');
  expect(r.marcaRaiz).toBe(r.marcaEstudio);
  // Y la tarjeta de clase (colores por prop) es la de día, no la de Carbón.
  await expect(page.locator('.reserva-slot-row', { hasText: 'Reformer' }).first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Correcciones de la revisión de F1 (28-sep-2026). Todo lo de abajo salió de
// leer el código, no de un test: los de arriba abren /reservar como página
// principal, nunca dentro de un iframe, y no medían contraste.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Textos por debajo de AA dentro de `selector`, con su fondo real (capas
 * translúcidas apiladas hasta una opaca). El medidor de
 * e2e/oscuro-contraste.spec.ts en pequeño: oklab a mano, y lo que no sabe leer
 * (una foto de fondo, un `color()`) no se mide en vez de adivinarse.
 */
async function ilegiblesEn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    type RGBA = [number, number, number, number];
    const gamma = (v: number) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    const deOklab = (L: number, a: number, b: number, alfa: number): RGBA => {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [
        gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
        alfa,
      ];
    };
    const aRGBA = (css: string): RGBA | null => {
      if (!css || css === 'transparent') return [0, 0, 0, 0];
      const toks = css.match(/-?[\d.]+%?/g) ?? [];
      const num = (i: number, pct = 1) => {
        const t = toks[i];
        if (t === undefined) return undefined;
        return t.endsWith('%') ? (parseFloat(t) / 100) * pct : parseFloat(t);
      };
      if (css.startsWith('oklab')) {
        const L = num(0), a = num(1, 0.4), b = num(2, 0.4);
        return L === undefined || a === undefined || b === undefined ? null : deOklab(L, a, b, num(3) ?? 1);
      }
      if (/^rgba?\(/.test(css)) {
        const n = toks.map(parseFloat);
        return n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
      }
      return null;
    };
    const sobre = (f: RGBA, b: RGBA): RGBA => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat(1) as RGBA;
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    // `null` = sobre una foto o un color que no se sabe leer: no se mide.
    const fondoDe = (el: HTMLElement): RGBA | null => {
      const capas: RGBA[] = [];
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage.startsWith('url(')) return null;
        const c = aRGBA(cs.backgroundColor);
        if (!c) return null;
        if (c[3] === 0) continue;
        capas.push(c);
        if (c[3] >= 0.999) break;
      }
      let base: RGBA = capas.length && capas[capas.length - 1][3] >= 0.999 ? capas.pop()! : [255, 255, 255, 1];
      for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
      return base;
    };
    const out: string[] = [];
    let medidos = 0;
    for (const raiz of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))]) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.3) continue;
        const propio = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
        if (!propio) continue;
        const caja = el.getBoundingClientRect();
        if (caja.width < 6 || caja.height < 6) continue;
        const tinta = aRGBA(cs.color);
        const fondo = fondoDe(el);
        if (!tinta || !fondo) continue;
        medidos += 1;
        const px = parseFloat(cs.fontSize);
        const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        const c = ratio(lum(sobre(tinta, fondo)), lum(fondo));
        if (c < (grande ? 3 : 4.5)) out.push(`${c.toFixed(2)}:1 «${propio.slice(0, 40)}» ${cs.color} sobre rgb(${fondo.slice(0, 3).join(',')})`);
      }
    }
    return { out, medidos };
  }, selector);
}

test('⚠️ en un iframe DE VERDAD, «transparente» sobre Carbón deja ver la web del estudio (sin lienzo opaco)', async ({ page }) => {
  // Carbón pone `color-scheme: dark` en la raíz. Un iframe con la raíz en
  // oscuro dentro de una web en claro se pinta sobre un lienzo OPACO oscuro
  // (CSS Color Adjust §2.2): la losa negra que «transparente» existe para
  // quitar. Solo pasa dentro de un iframe; como página principal no se ve.
  await page.setViewportSize({ width: 1000, height: 760 });
  await mocks(page, 'tentare-carbon');
  await page.route('**/host-widget-e2e', r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0;background:#ffffff">
      <iframe id="w" src="/reservar/tentare-carbon?tab=clases&embed=1&fondo=transparente" style="border:0;width:900px;height:700px"></iframe>
    </body></html>`,
  }));
  await page.goto('/host-widget-e2e');
  await page.frameLocator('#w').locator('#horario').waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);

  const frame = page.frames().find(f => f.url().includes('/reservar/tentare-carbon'))!;
  const dentro = await frame.evaluate(() => ({
    esquema: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(dentro.esquema).toBe('normal');
  expect(dentro.body).toBe('rgba(0, 0, 0, 0)');

  // Y lo que de verdad importa: lo que se ve. Con el lienzo opaco, el recuadro
  // sale IDÉNTICO con la web del estudio en blanco o en amarillo.
  const iframe = page.locator('#w');
  const enBlanco = await iframe.screenshot({ animations: 'disabled' });
  await page.evaluate(() => { document.body.style.background = '#ffd60a'; });
  const enAmarillo = await iframe.screenshot({ animations: 'disabled' });
  expect(enBlanco.equals(enAmarillo), 'el iframe tapa la web del estudio: lienzo opaco').toBe(false);
});

test('⚠️ `marca=` suelta sobre Carbón: el widget pasa al día ENTERO, con su marca encima', async ({ page }) => {
  // El constructor emite `marca` siempre que la identidad es «propia», pensada
  // para una web clara. Heredando Carbón, un `#1A1A1A` como texto (contadores,
  // «Ver más») era invisible sobre la tarjeta oscura, y las píldoras
  // «Reservar» no se distinguían del fondo.
  await abrir(page, 'tentare-carbon', '&embed=1&marca=%231A1A1A');
  const r = await medir(page);
  expect(r.fondo).toBe('rgb(250, 249, 245)');
  expect(r.marcaRaiz.toUpperCase()).toBe('#1A1A1A');
  // La raíz del documento, de vuelta a `normal` (ver el test del iframe).
  expect(r.esquema).toBe('normal');
  await expect(page.locator('.reserva-slot-row', { hasText: 'Reformer' }).first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('la página suelta en Carbón: el aviso de vuelta del pago y las tarjetas de clase se leen', async ({ page }) => {
  // El aviso usaba `text-muted-foreground bg-muted/50` del PANEL (~1,5:1 sobre
  // Carbón), y las plazas, `semantic.warning.text`, fijado para fondo claro.
  await abrir(page, 'tentare-carbon', '&compra=cancelada');
  await expect(page.getByText('Pago cancelado', { exact: false })).toBeVisible({ timeout: 15_000 });
  const aviso = await ilegiblesEn(page, 'div:has(> button[aria-label="Cerrar aviso"])');
  expect(aviso.medidos).toBeGreaterThan(0);
  expect(aviso.out, aviso.out.join('\n')).toEqual([]);
  const tarjetas = await ilegiblesEn(page, '.reserva-slot-row');
  expect(tarjetas.medidos).toBeGreaterThan(0);
  expect(tarjetas.out, tarjetas.out.join('\n')).toEqual([]);
});

test('la página suelta en Carbón: la hoja «Confirmar cita» se lee (era blanca, con la caja interior oscura y la letra del panel)', async ({ page }) => {
  const HUECO = { inicio: '2026-08-12T11:00:00', fin: '2026-08-12T11:50:00' };
  await page.setViewportSize({ width: 1000, height: 760 });
  await mocks(page, 'tentare-carbon');
  await page.route('**/api/public/studio-data', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ...fx('tentare-carbon'),
      citasServicios: [{
        id: 'serv-1', studioId: S, nombre: 'Evaluación inicial', tipo: 'EVALUACION', duracionMin: 50, precio: 45,
        autoReservable: true, color: null, descripcion: null, activo: true, orden: 0, creadoEn: '2026-01-01T00:00:00Z',
      }],
      // El 12 de agosto de 2026 es miércoles.
      citasDisponibilidad: [{
        id: 'disp-1', studioId: S, instructorId: 'ins-1', diaSemana: 3, horaInicio: '09:00', horaFin: '18:00', creadoEn: '2026-01-01T00:00:00Z',
      }],
    }),
  }));
  let pedidas = 0;
  await page.route('**/api/public/citas**', (r) => {
    pedidas += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ huecos: [HUECO] }) });
  });
  await page.goto('/reservar/tentare-carbon?tab=citas');
  await page.getByRole('button', { name: 'Reservar cita', exact: true }).click({ timeout: 150_000 });
  await page.getByRole('button', { name: /Ana/ }).click();
  const hora = new Date(HUECO.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  await page.getByRole('button', { name: hora }).click();
  await page.getByRole('button', { name: /^Continuar/ }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar cita' })).toBeVisible({ timeout: 15_000 });
  // Se pidieron los huecos de verdad: la hoja no es un estado vacío.
  expect(pedidas).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  const { out, medidos } = await ilegiblesEn(page, '[role="dialog"][aria-label="Confirmar cita"]');
  expect(medidos).toBeGreaterThan(2);
  expect(out, out.join('\n')).toEqual([]);
});
