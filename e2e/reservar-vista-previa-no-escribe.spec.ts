import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaLista, fixtureSociaLista, pulsarReservar, SLUG, STUDIO_ID } from './socia-lista.ts';
import { fixtureClaseConPlanPuntual, AHORA as AHORA_SIN_CUENTA } from './reservar-sin-cuenta.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La vista previa del constructor de widgets NO reserva, ni paga, ni manda
// correos de verdad (01b-auditoría de widgets, hallazgo #4;
// lib/reservar/vista-previa-sin-escrituras.ts).
//
// Hasta el 16-oct-2026, dentro de la vista previa del panel todo pasaba de
// verdad, y un pago hacía `window.top.location = Stripe`: sacaba el PANEL entero
// a Stripe y se perdía el borrador del estilo.
//
// ⚠️ Cada test de «no escribió» tiene su CONTROL: el mismo flujo sin
// `vista-previa=1` hace la petición (`> 0`). Sin él, «0 peticiones» sería
// verdad también con un andamiaje que no llega a intentar nada
// (.claude/tentare-os.md, la trampa de `handleReservarCalendario`).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const MENSAJE = 'En la vista previa no se reserva de verdad';
const PREVIA = 'embed=1&vista-previa=1';

/** Abre /reservar con `extra` en la URL, con reintento: en frío el servidor de desarrollo compila. */
async function abrir(page: Page, extra: string) {
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases${extra ? `&${extra}` : ''}`);
    if (await page.locator('#horario').waitFor({ timeout: 40_000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error('el horario no llegó a cargar');
}

// ── 1. Reservar con la sesión de una socia lista (la escritura sale de verdad sin la vista previa) ──
for (const caso of [{ previa: true }, { previa: false }]) {
  test(`reservar una clase ${caso.previa ? 'en la vista previa: 0 peticiones y lo dice' : '(control, sin vista previa): la petición sale'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await sembrarSociaLista(page, { relojMadrid: true });
    let intentos = 0;
    await page.route('**/api/public/reserva', (r) => {
      intentos += 1;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-e2e' }) });
    });
    await abrir(page, caso.previa ? PREVIA : '');
    await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
    await expect(page.getByRole('button', { name: /^Reservar$/ })).toBeVisible({ timeout: 30_000 });
    await pulsarReservar(page);
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => document.body.innerText);
    if (caso.previa) {
      expect(intentos, 'la vista previa reservó de verdad').toBe(0);
      expect(txt).toContain(MENSAJE);
      expect(txt).not.toContain('¡Reserva confirmada!');
    } else {
      expect(intentos, 'el control no llegó a reservar: el test de la vista previa no probaría nada').toBeGreaterThan(0);
      expect(txt).not.toContain(MENSAJE);
    }
  });
}

// ── 2. Pagar y reservar sin cuenta (el checkout embebido crea un cobro de verdad) ──
for (const caso of [{ previa: true }, { previa: false }]) {
  test(`pagar sin cuenta ${caso.previa ? 'en la vista previa: no se crea ningún cobro' : '(control): se pide el cobro'}`, async ({ page }) => {
    await page.clock.install({ time: new Date(`${AHORA_SIN_CUENTA}+02:00`) });
    await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
    await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureClaseConPlanPuntual()) }));
    await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
    let cobros = 0;
    await page.route('**/api/public/checkout-embebido', (r) => {
      cobros += 1;
      // Un «no» del servidor: así el control no necesita montar Stripe para contar.
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Esta clase ya ha empezado' }) });
    });
    await abrir(page, caso.previa ? PREVIA : '');
    await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Nombre y apellido').fill('Marta Ruiz');
    await page.getByPlaceholder('Email').fill('marta.ruiz@example.com');
    await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
    await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
    await page.getByRole('button', { name: /Continuar al pago/ }).click();
    await page.waitForTimeout(1500);
    if (caso.previa) {
      expect(cobros, 'la vista previa pidió un cobro de verdad').toBe(0);
      await expect(page.getByText(MENSAJE)).toBeVisible();
    } else {
      expect(cobros, 'el control no llegó a pedir el cobro').toBeGreaterThan(0);
      await expect(page.getByText('Esta clase ya ha empezado')).toBeVisible();
    }
  });
}

// ── 3. El enlace de acceso (manda un correo y crea la cuenta si no existe) ──
for (const caso of [{ previa: true }, { previa: false }]) {
  test(`pedir el enlace para entrar ${caso.previa ? 'en la vista previa: no se manda ningún correo' : '(control): se pide el correo'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.clock.install({ time: new Date(`${AHORA_SIN_CUENTA}+02:00`) });
    const fixture = { ...fixtureSociaLista(), socia: null };
    await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
    await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
    await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    let correos = 0;
    await page.route('**/auth/v1/otp*', (r) => {
      correos += 1;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    });
    await abrir(page, caso.previa ? PREVIA : '');
    await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
    await expect(page.getByText('Entra para reservar')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/tu email/i).fill('amiga@example.com');
    await page.getByRole('button', { name: /Continuar/ }).click();
    if (caso.previa) {
      await expect(page.getByText(MENSAJE)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1000);
      expect(correos, 'la vista previa mandó un correo de verdad').toBe(0);
    } else {
      await expect.poll(() => correos, { timeout: 30_000 }).toBeGreaterThan(0);
    }
  });
}

// ── 4. Comprar un plan DENTRO del marco del panel: ni cobro ni el panel sacado a Stripe ──
function fixtureConPlanes() {
  return {
    ...fixtureSociaLista(),
    planesTarifa: [{ id: 'p-b10', studioId: STUDIO_ID, nombre: 'Bono 10', tipo: 'BONO', precio: 175, sesiones: 10, activo: true }],
  };
}

for (const caso of [{ previa: true }, { previa: false }]) {
  test(`comprar un plan dentro de un marco del panel ${caso.previa ? 'en la vista previa: 0 checkouts y el panel se queda donde está' : '(control): se pide el checkout'}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await sembrarSociaLista(page, { relojMadrid: true });
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureConPlanes()) }));
    let checkouts = 0;
    await page.route('**/api/stripe/checkout', (r) => {
      checkouts += 1;
      // Sin `url`: el control cuenta sin navegar a ningún sitio.
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'No se ha podido iniciar el pago.' }) });
    });
    // Una página del MISMO origen que hace de panel, con la vista previa dentro (como el constructor).
    const panel = '/e2e-panel-falso';
    const src = `/reservar/${SLUG}?tab=clases&embed=1${caso.previa ? '&vista-previa=1' : ''}`;
    await page.route(`**${panel}`, (r) => r.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><h1>Panel</h1><iframe id="previa" src="${src}" style="width:1100px;height:800px;border:0" title="Vista previa"></iframe></body></html>`,
    }));
    await page.goto(panel);
    const marco = page.frameLocator('#previa');
    await marco.locator('#horario').waitFor({ timeout: 150_000 });
    const boton = marco.getByRole('button', { name: /Bono 10|Contratar|Elegir/ }).first();
    await boton.scrollIntoViewIfNeeded();
    await boton.click({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    // El panel no se ha ido a ninguna parte.
    expect(new URL(page.url()).pathname).toBe(panel);
    if (caso.previa) {
      expect(checkouts, 'la vista previa pidió un checkout de verdad').toBe(0);
      await expect(marco.getByText(MENSAJE)).toBeVisible();
    } else {
      expect(checkouts, 'el control no llegó a pedir el checkout').toBeGreaterThan(0);
    }
  });
}
