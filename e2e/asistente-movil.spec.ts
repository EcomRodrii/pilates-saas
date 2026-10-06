import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ir, enOscuro } from './panel-sembrado';
import { chat, campoChat, conAsistente, json, LISTA, ndjson, RESPUESTA, SEGUNDA, sugerencia } from './asistente-andamiaje';

// ─────────────────────────────────────────────────────────────────────────────
// «Pregúntale a Tentare» en el iPhone (proyecto `webkit-publico`, iPhone 13).
//
// El fundador, desde su iPhone (6-oct-2026): «le das a escribir y se hace zoom,
// le das a cualquier lado zoom, es 0 responsive». Lo que se vigila:
//   · ningún desbordamiento horizontal (lo que obliga a Safari a encoger la
//     página) ni vacío, ni con tarjetas de clases y de recibos, ni con el
//     cajón de conversaciones abierto;
//   · el campo de escribir a 16 px o más (por debajo, Safari amplía al
//     enfocarlo y no vuelve), y la regla del panel con el dedo en la hoja;
//   · el campo abajo, por encima de la barra del panel, y nada flotando encima.
//
// ⚠️ WebKit de Playwright NO es Safari de iOS: comparte motor, pero aquí no hay
// teclado virtual ni zoom al enfocar. Lo que se prueba es la CAUSA (tamaños y
// anchos), no el síntoma; el teclado (lib/asistente/teclado.ts) se ha de mirar
// en un iPhone de verdad.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 150_000 });

const CAPTURAS = process.env.ASISTENTE_CAPTURAS;

async function captura(page: Page, nombre: string) {
  await page.waitForTimeout(500); // las animaciones de entrada
  const png = await page.screenshot();
  await test.info().attach(nombre, { body: png, contentType: 'image/png' });
  if (CAPTURAS) {
    mkdirSync(CAPTURAS, { recursive: true });
    await page.screenshot({ path: join(CAPTURAS, `movil-${nombre}.png`) });
  }
}

/** Lo que se sale por la derecha: la página entera y, dentro del chat, cualquier caja que no haga su propio scroll. */
async function desbordes(page: Page) {
  return page.evaluate(() => {
    const ancho = window.innerWidth;
    const fuera: string[] = [];
    const chat = document.querySelector('[data-testid="chat-asistente"]');
    for (const el of Array.from(chat?.querySelectorAll('*') ?? [])) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= ancho + 1) continue;
      // Dentro de una caja con scroll horizontal propio, salirse es lo esperado.
      let p = el.parentElement;
      let dentroDeScroll = false;
      while (p && p !== chat) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') && p.getBoundingClientRect().right <= ancho + 1) { dentroDeScroll = true; break; }
        p = p.parentElement;
      }
      if (!dentroDeScroll) fuera.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')} → ${Math.round(r.right)}px`);
    }
    return {
      ancho,
      pagina: document.documentElement.scrollWidth,
      cuerpo: document.body.scrollWidth,
      fuera: fuera.slice(0, 8),
    };
  });
}

async function sinDesborde(page: Page, momento: string) {
  const d = await desbordes(page);
  expect(d.pagina, `${momento}: la página mide ${d.pagina}px en un iPhone de ${d.ancho}px`).toBeLessThanOrEqual(d.ancho);
  expect(d.cuerpo, `${momento}: el body se sale`).toBeLessThanOrEqual(d.ancho);
  expect(d.fuera, `${momento}: cajas que se salen por la derecha`).toEqual([]);
}

for (const tema of ['claro', 'oscuro'] as const) {
  test(`iPhone · ${tema}: sin scroll horizontal, el campo a 16 px abajo del todo y el cajón de conversaciones`, async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Es la prueba del iPhone: corre en el proyecto webkit-publico');
    if (tema === 'oscuro') await enOscuro(page);
    let vez = 0;
    const n = await conAsistente(page, {
      responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(vez++ === 0 ? RESPUESTA : SEGUNDA) }),
    });
    await page.route((u) => u.pathname === '/api/asistente/conversaciones', (r) => json(r, { conversaciones: LISTA }));

    // ── Vacío ──
    await ir(page, 'asistente');
    await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
    await sinDesborde(page, 'vacío');

    const campo = campoChat(page);
    const tamano = await campo.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(tamano, 'el campo del chat no baja de 16 px (Safari amplía la página por debajo)').toBeGreaterThanOrEqual(16);

    // La regla del panel con el dedo está en la hoja (un `@media` DE VERDAD, no un
    // texto que se parezca) y su valor se resuelve a 16 px aunque el campo lleve
    // `text-sm` y un `style` en línea más pequeño.
    const regla = await page.evaluate(() => {
      const media = Array.from(document.styleSheets)
        .flatMap((h) => { try { return Array.from(h.cssRules); } catch { return []; } })
        .find((r) => r.type === 4 && (r as CSSMediaRule).conditionText?.includes('coarse') && r.cssText.includes('.panel-app')
          && /font-size:\s*max\(16px,[^;]*\)\s*!important/.test(r.cssText)) as CSSMediaRule | undefined;
      const decl = Array.from(media?.cssRules ?? []).map((r) => (r as CSSStyleRule).style?.getPropertyValue('font-size')).find(Boolean) ?? '';
      const raiz = document.querySelector('.panel-app');
      let efectivo = 0;
      let conDedo = 0;
      if (raiz && decl) {
        const sonda = document.createElement('input');
        sonda.className = 'text-sm';
        sonda.style.setProperty('font-size', decl, 'important');
        raiz.appendChild(sonda);
        efectivo = parseFloat(getComputedStyle(sonda).fontSize);
        sonda.remove();
      }
      // Si este WebKit dice que el puntero es grueso, la regla tiene que estar aplicándose de verdad.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      if (raiz && coarse) {
        const pequeno = document.createElement('input');
        pequeno.className = 'text-sm';
        pequeno.style.fontSize = '13px';
        raiz.appendChild(pequeno);
        conDedo = parseFloat(getComputedStyle(pequeno).fontSize);
        pequeno.remove();
      }
      return { hay: Boolean(media), efectivo, coarse, conDedo };
    });
    expect(regla.hay, 'la hoja impone 16 px a los campos del panel con el dedo').toBe(true);
    expect(regla.efectivo).toBeGreaterThanOrEqual(16);
    if (regla.coarse) expect(regla.conDedo, 'con el dedo, un campo de 13 px en línea se queda en 16').toBeGreaterThanOrEqual(16);
    await captura(page, `${tema}-vacio`);

    // ── Una conversación con tarjetas: clases (tabla) y recibos ──
    await sugerencia(page, '¿Qué clases hay mañana?').click();
    await expect(chat(page).locator('[data-bloque="clases"]')).toBeVisible({ timeout: 30_000 });
    await campo.fill('¿Y qué pagos tengo pendientes?');
    await campo.press('Enter');
    await expect(chat(page).locator('[data-bloque="recibos"]')).toBeVisible({ timeout: 30_000 });
    await expect(chat(page).locator('[data-tenti-asistente]').last()).toHaveAttribute('data-momento', 'listo', { timeout: 15_000 });
    expect(n.preguntas, 'se preguntó de verdad').toBeGreaterThan(1);
    await sinDesborde(page, 'conversación con tarjetas');

    // El campo, abajo y por encima de la barra del panel (56 px), y nada flotando encima.
    const alto = page.viewportSize()!.height;
    const caja = await campo.boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto - 56);
    expect(caja!.y, 'el campo está en la mitad de abajo').toBeGreaterThan(alto / 2);
    const encima = await page.evaluate(() => {
      const enviar = document.querySelector('[data-testid="chat-asistente"] form button');
      if (!enviar) return 'sin botón';
      const r = enviar.getBoundingClientRect();
      const quien = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return quien && enviar.contains(quien) ? null : (quien?.outerHTML ?? '').slice(0, 120);
    });
    expect(encima, 'nada tapa el botón de enviar').toBeNull();

    await chat(page).getByTestId('chat-mensajes').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await captura(page, `${tema}-conversacion`);
    await chat(page).locator('[data-bloque="clases"]').scrollIntoViewIfNeeded();
    await captura(page, `${tema}-conversacion-clases`);

    // ── El cajón de conversaciones ──
    await chat(page).getByRole('button', { name: 'Tus conversaciones' }).click();
    const cajon = page.getByRole('dialog', { name: 'Tus conversaciones' });
    await expect(cajon).toBeVisible();
    await expect(cajon.getByRole('button', { name: 'Nueva conversación' })).toBeVisible();
    await sinDesborde(page, 'cajón abierto');
    const d = await cajon.evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { right: r.right, ancho: window.innerWidth, scroll: c.scrollWidth - c.clientWidth };
    });
    expect(d.right).toBeLessThanOrEqual(d.ancho + 1);
    expect(d.scroll, 'los títulos largos se cortan, no empujan el cajón').toBeLessThanOrEqual(0);
    await captura(page, `${tema}-cajon`);
  });
}
