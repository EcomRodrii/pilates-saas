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
