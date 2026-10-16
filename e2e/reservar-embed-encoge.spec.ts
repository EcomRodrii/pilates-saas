import { test as base, expect, type Page } from '@playwright/test';
import { scriptSnippetIframe } from '../lib/reservar/snippet-embed.ts';
import { sembrarSociaLista, SLUG } from './socia-lista.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El iframe del widget, pegado en la web del estudio, ENCOGE cuando su
// contenido encoge (01b-auditoría de widgets, hallazgo #3).
//
// La página incrustada anuncia su alto (`tentareEmbedAltura`) y el snippet lo
// pone en el iframe. Hasta el 16-oct-2026 anunciaba
// `documentElement.scrollHeight` con la raíz a `min-height: 100dvh`: las dos
// cosas miden COMO MÍNIMO el alto del propio iframe, así que solo podía crecer.
// Abrir una pantalla larga y volver dejaba en su web un hueco en blanco.
// ─────────────────────────────────────────────────────────────────────────────

// Chromium bloquea que una página enmarque la red local (Local Network Access): aquí el servidor ES
// localhost. Se apaga solo ese control y solo en Chromium (WebKit no conoce la opción); en producción no aplica.
const test = base.extend<object, object>({
  launchOptions: [async ({ browserName, launchOptions }, use) => {
    await use(browserName === 'chromium'
      ? { ...launchOptions, args: [...(launchOptions.args ?? []), '--disable-features=LocalNetworkAccessChecks'] }
      : launchOptions);
  }, { scope: 'worker' }],
});
test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const PORT = process.env.E2E_PORT ?? '3000';
const APP = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// Otro puerto de localhost: cross-origin de verdad para el `e.origin` del snippet.
const HOST = 'http://localhost:4499';
const ID = `tentare-widget-${SLUG}-reservas`;

async function montar(page: Page, altoInicial: number) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:sans-serif">
<div style="height:300px;background:#eee">La web del estudio</div>
<iframe id="${ID}" src="${APP}/reservar/${SLUG}?embed=1&tab=clases" style="width:100%;height:${altoInicial}px;border:0" title="Reservas"></iframe>
${scriptSnippetIframe({ origen: APP, slug: SLUG, iframeId: ID })}
<div style="height:600px;background:#ddd">Pie de la web del estudio</div>
</body></html>`;
  await page.route(`${HOST}/`, r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${HOST}/`);
  await page.frameLocator(`#${ID}`).locator('#horario').waitFor({ timeout: 150_000 });
}
const alto = (page: Page) => page.locator(`#${ID}`).evaluate(el => el.getBoundingClientRect().height);

test('pegado con un alto de más, el iframe baja hasta lo que mide su contenido', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await sembrarSociaLista(page, { relojMadrid: true });
  await montar(page, 4000);
  // Una clase, sin nada más largo: muy por debajo de los 4.000 px con los que se pegó.
  await expect.poll(() => alto(page), { timeout: 30_000 }).toBeLessThan(3000);
  const contenido = await page.frameLocator(`#${ID}`).locator('body').evaluate(b => b.scrollHeight);
  expect(Math.abs((await alto(page)) - contenido)).toBeLessThanOrEqual(2);
});

test('encoge al pasar a una pantalla más corta (la ficha de la clase) y vuelve a crecer al volver', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sembrarSociaLista(page, { relojMadrid: true });
  await montar(page, 600);
  const marco = page.frameLocator(`#${ID}`);
  // Crece hasta lo que mide el horario (con su «cómo funciona» y su pie, más que la ficha).
  await expect.poll(() => alto(page), { timeout: 30_000 }).toBeGreaterThan(800);
  await page.waitForTimeout(1500);
  const horario = await alto(page);
  // La ficha sustituye al horario y es más corta: antes el iframe se quedaba con el alto del horario
  // y dejaba un hueco en blanco debajo, en la web del estudio.
  await marco.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(marco.getByRole('button', { name: /^Reservar$/ })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => alto(page), { timeout: 15_000 }).toBeLessThan(horario - 40);
  const ficha = await alto(page);
  const contenido = await marco.locator('body').evaluate(b => b.scrollHeight);
  expect(Math.abs(ficha - contenido)).toBeLessThanOrEqual(2);
  // Y de vuelta al horario, crece otra vez.
  await marco.getByRole('button', { name: 'Volver a las clases' }).click();
  await expect.poll(() => alto(page), { timeout: 15_000 }).toBeGreaterThan(ficha + 40);
});
