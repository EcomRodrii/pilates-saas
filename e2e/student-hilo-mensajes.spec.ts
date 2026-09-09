import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, sembrarSociaLista } from './socia-lista';

// El hilo de mensajes con el estudio.
//
// ⚠️ Existe por un fallo de ALTO que ningún test funcional podía ver: el
// contenedor del hilo pedía `height: 100%` y el porcentaje no resolvía —
// `.page` no declara `height`, el suyo sale de `flex: 1`. Medido en el
// navegador: `.page` 844 px y la columna 472, o sea el alto del contenido. Con
// pocos mensajes —el caso NORMAL de una conversación recién abierta desde
// «Escribir al estudio»— el compositor se quedaba flotando a media altura con
// 600 px de crema muerta debajo, y la pantalla parecía a medio cargar.

const YO = 'auth-e2e';
const ELLA = 'auth-mostrador';
const CONV = 'conv-1';

const conversacion = {
  id: CONV, studio_id: STUDIO_ID, tipo: 'ALUMNA_MOSTRADOR', titulo: null,
  ancla_sesion_id: null, ancla_reserva_id: null,
  creado_en: '2026-08-05T10:00:00Z', ultimo_mensaje_en: '2026-08-12T07:30:00Z',
  mostrador_leido_hasta: '2026-08-12T07:40:00Z',
  leido_hasta: '2026-08-12T07:40:00Z', leido_hasta_otros: '2026-08-12T07:40:00Z',
  ultimo_cuerpo: 'Perfecto, te guardo el sitio.', ultimo_remitente_auth_user_id: ELLA,
};

const mensajes = [
  { id: 'm1', conversacion_id: CONV, studio_id: STUDIO_ID, remitente_auth_user_id: YO, cuerpo: '¿Queda sitio en la de mañana a las 10?', creado_en: '2026-08-11T18:02:00Z' },
  { id: 'm2', conversacion_id: CONV, studio_id: STUDIO_ID, remitente_auth_user_id: ELLA, cuerpo: 'Sí, quedan dos. ¿Te la reservo?', creado_en: '2026-08-11T18:20:00Z' },
];

async function montar(page: Page, o: { vacia?: boolean } = {}) {
  await sembrarSociaLista(page);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname.endsWith('/mensajes'), (r) => r.fulfill(json({ mensajes: o.vacia ? [] : mensajes })));
  await page.route((u) => u.pathname.endsWith('/leido'), (r) => r.fulfill(json({ ok: true })));
  await page.route((u) => u.pathname === '/api/public/mensajeria/conversaciones', (r) => r.fulfill(json({ conversaciones: [conversacion] })));
  // ⚠️ Va DESPUÉS de `sembrarSociaLista` a propósito: registrar rutas por
  // predicado detrás de sus globs dejaba `/api/public/session` sin contestar y
  // la guardia de sesión se quedaba en «Cargando…» para siempre. Explícita aquí.
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

/** El hueco entre el compositor y el borde de abajo de la pantalla. */
async function huecoBajoElCompositor(page: Page) {
  return page.evaluate(() => {
    const ta = document.querySelector('textarea');
    const caja = ta?.closest('div[style*="border-top"]') as HTMLElement | null;
    if (!caja) return null;
    return Math.round(window.innerHeight - caja.getBoundingClientRect().bottom);
  });
}

test.describe('Student PWA · hilo de mensajes', () => {
  test.describe.configure({ timeout: 120_000 });
  // ⚠️ Zona horaria fijada A PROPÓSITO. `horaCorta` usa
  // `toLocaleTimeString` SIN `timeZone`, o sea la hora del DISPOSITIVO — que es
  // lo correcto en un chat (ninguna app de mensajería te enseña la hora del
  // servidor) y distinto de cómo la app trata las FECHAS de clase, que sí van
  // ancladas a Madrid. Sin fijarla aquí, el test pasaba en mi Mac (Madrid) y
  // fallaba en CI (UTC): 20:02 contra 18:02. El fallo era del test, no de la app.
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });

  test('se ve la conversación, con quién habla y qué se dijo', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('¿Queda sitio en la de mañana a las 10?')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible();
    // 18:02Z son las 20:02 en el navegador, que va fijado a Madrid arriba.
    // (La hora del chat es la del DISPOSITIVO, no la del estudio — ver la nota.)
    await expect(page.getByText('20:02')).toBeVisible();
  });

  test('el compositor queda ABAJO aunque la conversación esté vacía', async ({ page }) => {
    await montar(page, { vacia: true });
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toBeVisible({ timeout: 30_000 });
    const hueco = await huecoBajoElCompositor(page);
    expect(hueco, 'el compositor flota a media altura y deja crema muerta debajo').not.toBeNull();
    expect(hueco!, `quedan ${hueco}px muertos bajo el compositor`).toBeLessThanOrEqual(8);
  });

  test('y también con una conversación corta', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toBeVisible({ timeout: 30_000 });
    const hueco = await huecoBajoElCompositor(page);
    expect(hueco!, `quedan ${hueco}px muertos bajo el compositor`).toBeLessThanOrEqual(8);
  });
});
