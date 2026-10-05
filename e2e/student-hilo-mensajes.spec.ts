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

async function montar(page: Page, o: { vacia?: boolean; conInstructora?: boolean } = {}) {
  await sembrarSociaLista(page);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname.endsWith('/mensajes'), (r) => r.fulfill(json({ mensajes: o.vacia ? [] : mensajes })));
  await page.route((u) => u.pathname.endsWith('/leido'), (r) => r.fulfill(json({ ok: true })));
  await page.route((u) => u.pathname === '/api/public/mensajeria/conversaciones', (r) => r.fulfill(json({
    conversaciones: [o.conInstructora
      ? { ...conversacion, tipo: 'ALUMNA_INSTRUCTORA', interlocutor: { nombre: 'Laura M.', fotoUrl: null } }
      : conversacion],
  })));
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
    // Con el estudio no hay nadie más leyendo: sin aviso.
    await expect(page.getByTestId('aviso-hilo')).toHaveCount(0);
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

test.describe('Student PWA · hilo que ya no admite mensajes', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });

  // El estudio cerró el hilo, o hay un bloqueo (moderación): el servidor responde 409.
  test('al enviar, lo dice, el borrador se queda y no se pinta la burbuja', async ({ page }) => {
    await montar(page, { conInstructora: true });
    let intentos = 0;
    // Registrada DESPUÉS del arnés: Playwright prueba las rutas de la última a la primera.
    await page.route(
      (u) => u.pathname === `/api/public/mensajeria/conversaciones/${CONV}/mensajes`,
      (r) => {
        if (r.request().method() !== 'POST') return r.fallback();
        intentos++;
        return r.fulfill({
          status: 409, contentType: 'application/json',
          body: JSON.stringify({ error: 'Esta conversación ya no admite mensajes.', estado: 'NO_ADMITE' }),
        });
      },
    );
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Escribe un mensaje…').fill('¿Y el jueves?');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Esta conversación ya no admite mensajes.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('¿Y el jueves?');
    await expect(page.getByTestId('mensaje').filter({ hasText: '¿Y el jueves?' })).toHaveCount(0);
    expect(intentos).toBe(1);
  });
});

test.describe('Student PWA · normas de la comunidad y filtro', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });

  /** El servidor pide las normas hasta que se aceptan; después guarda el mensaje. */
  async function montarNormas(page: Page, o: { filtro?: boolean } = {}) {
    await montar(page);
    const cuenta = { envios: 0, aceptar: 0 };
    let aceptadas = false;
    const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
    await page.route((u) => u.pathname === '/api/public/normas-comunidad', (r) => {
      cuenta.aceptar++;
      aceptadas = true;
      return r.fulfill(json({ version: '2026-10-05', aceptadas: true }));
    });
    await page.route((u) => u.pathname === `/api/public/mensajeria/conversaciones/${CONV}/mensajes`, (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      cuenta.envios++;
      if (o.filtro) return r.fulfill(json({ error: 'Tu mensaje tiene palabras que no se permiten en la comunidad. Cámbialo y vuelve a enviarlo.', codigo: 'FILTRO' }, 422));
      if (!aceptadas) return r.fulfill(json({ error: 'Antes de escribir, acepta las normas de la comunidad.', codigo: 'NORMAS_PENDIENTES', version: '2026-10-05' }, 409));
      const { cuerpo } = r.request().postDataJSON() as { cuerpo: string };
      return r.fulfill(json({ mensaje: { id: 'm-nuevo', conversacion_id: CONV, studio_id: STUDIO_ID, remitente_auth_user_id: YO, cuerpo, creado_en: new Date().toISOString() } }));
    });
    return cuenta;
  }

  test('la primera vez enseña las normas; al aceptarlas, el mismo mensaje se envía', async ({ page }) => {
    const cuenta = await montarNormas(page);
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Escribe un mensaje…').fill('Perfecto, gracias');
    await page.getByRole('button', { name: 'Enviar' }).click();

    const hoja = page.getByTestId('hoja-normas');
    await expect(hoja).toBeInViewport({ timeout: 15_000 });
    await expect(hoja).toContainText('Tolerancia cero');
    await hoja.getByRole('button', { name: 'Acepto las normas' }).click();
    await expect(page.getByTestId('mensaje').filter({ hasText: 'Perfecto, gracias' })).toHaveCount(1, { timeout: 15_000 });
    expect(cuenta).toEqual({ envios: 2, aceptar: 1 });
  });

  test('si no las acepta, no se envía nada más y el borrador se queda', async ({ page }) => {
    const cuenta = await montarNormas(page);
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Escribe un mensaje…').fill('Perfecto, gracias');
    await page.getByRole('button', { name: 'Enviar' }).click();
    const hoja = page.getByTestId('hoja-normas');
    await expect(hoja).toBeInViewport({ timeout: 15_000 });
    await hoja.getByRole('button', { name: 'Ahora no' }).click();
    await expect(hoja).not.toBeInViewport();
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('Perfecto, gracias');
    await expect(page.getByTestId('mensaje').filter({ hasText: 'Perfecto, gracias' })).toHaveCount(0);
    expect(cuenta).toEqual({ envios: 1, aceptar: 0 });
  });

  test('con palabras no permitidas, lo dice y el borrador se queda', async ({ page }) => {
    const cuenta = await montarNormas(page, { filtro: true });
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Escribe un mensaje…').fill('algo feo');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/palabras que no se permiten/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('algo feo');
    expect(cuenta.envios).toBe(1);
  });
});

test.describe('Student PWA · hilo con su instructora', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });

  test('la cabecera dice con qué instructora habla, no «Tu instructora»', async ({ page }) => {
    await montar(page, { conInstructora: true });
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Laura M.' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu instructora')).toHaveCount(0);
    await expect(page.getByTestId('aviso-hilo')).toHaveText('El estudio también puede leer esta conversación.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// «Sin leer» y avisos: el punto de la lista lo decide el servidor (`sin_leer`),
// abrir el hilo apaga la campana SOLO si el servidor confirma el «leído», y el
// aviso de un mensaje abre el hilo.
//
// ⚠️ Cada «no se apagó» va con un contador de «sí se intentó» (`leido > 0`): sin
// él, «la campana sigue encendida» sería verdad también si el hilo nunca llegó a
// pedir el «leído» (tentare-os.md, punto ciego (1)).
// ─────────────────────────────────────────────────────────────────────────────

interface Cuenta { leido: number; conteos: number; conteosTrasLeido: number; lista: number; hasta: unknown[] }

async function montarLectura(
  page: Page,
  o: { sinLeer?: boolean; leido?: 'ok' | 'falla' | 'cae'; avisos?: unknown[] } = {},
): Promise<Cuenta> {
  await sembrarSociaLista(page);
  const cuenta: Cuenta = { leido: 0, conteos: 0, conteosTrasLeido: 0, lista: 0, hasta: [] };
  // Lo que el servidor sabe: hasta que el «leído» no se confirma, hay 1 aviso sin
  // leer y el hilo sale sin leer.
  let leidoHecho = false;
  const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

  // En los modos de fallo, la campana del mock baja a 0 en cuanto se INTENTA el
  // «leído»: así una relectura indebida (la app apagándola sin que el servidor
  // lo confirme) se vería en el badge, en vez de pasar en verde por casualidad.
  const apagada = () => leidoHecho || (o.leido !== undefined && o.leido !== 'ok' && cuenta.leido > 0);
  await page.route((u) => u.pathname === '/api/notifications', (r) => {
    if (new URL(r.request().url()).searchParams.get('soloConteo') === '1') {
      cuenta.conteos++;
      if (cuenta.leido > 0) cuenta.conteosTrasLeido++;
      return r.fulfill(json({ unread: apagada() ? 0 : 1 }));
    }
    return r.fulfill(json({ items: o.avisos ?? [], unread: leidoHecho ? 0 : 1 }));
  });
  // Solo la API: un predicado por `endsWith('/mensajes')` se comería también la
  // PÁGINA `/portal/<slug>/mensajes` y la contestaría con JSON.
  await page.route(
    (u) => u.pathname.startsWith('/api/public/mensajeria/conversaciones/') && u.pathname.endsWith('/mensajes'),
    (r) => r.fulfill(json({ mensajes })),
  );
  await page.route((u) => u.pathname === `/api/public/mensajeria/conversaciones/${CONV}/leido`, (r) => {
    cuenta.leido++;
    cuenta.hasta.push((r.request().postDataJSON() as { hasta?: unknown } | null)?.hasta);
    if (o.leido === 'cae') return r.abort('failed');
    if (o.leido === 'falla') return r.fulfill(json({ error: 'No se ha podido marcar como leído.' }, 500));
    leidoHecho = true;
    return r.fulfill({ status: 204 });
  });
  await page.route((u) => u.pathname === '/api/public/mensajeria/conversaciones', (r) => {
    cuenta.lista++;
    return r.fulfill(json({ conversaciones: [{ ...conversacion, sin_leer: Boolean(o.sinLeer) && !leidoHecho }] }));
  });
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  return cuenta;
}

test.describe('Student PWA · mensajes sin leer y sus avisos', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Madrid' });

  test('el punto de la lista lo decide el servidor: sin `sin_leer`, no hay punto', async ({ page }) => {
    const cuenta = await montarLectura(page, { sinLeer: false });
    await page.goto(`/portal/${SLUG}/mensajes`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Perfecto, te guardo el sitio.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Sin leer', { exact: true })).toHaveCount(0);
    expect(cuenta.lista).toBeGreaterThan(0);
  });

  test('con `sin_leer` hay punto, y al volver del hilo se ha apagado', async ({ page }) => {
    const cuenta = await montarLectura(page, { sinLeer: true });
    await page.goto(`/portal/${SLUG}/mensajes`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Sin leer', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByText('Perfecto, te guardo el sitio.').click();
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => cuenta.leido, { timeout: 15_000 }).toBe(1);

    await page.goBack();
    await expect(page.getByText('Perfecto, te guardo el sitio.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Sin leer', { exact: true })).toHaveCount(0);
  });

  test('abrir el hilo apaga la campana: «leído» confirmado y la campana se relee', async ({ page }) => {
    const cuenta = await montarLectura(page, { leido: 'ok' });
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });

    await expect.poll(() => cuenta.leido, { timeout: 15_000 }).toBe(1);
    // Hasta el último mensaje que ha pintado, no «hasta ahora»: uno que llegue
    // después de cargar no se ha visto.
    expect(cuenta.hasta).toEqual(['m2']);
    // Una para pintar la campana al montar y otra DESPUÉS del «leído»: sin
    // relectura, el caché de 60 s la dejaba encendida.
    await expect.poll(() => cuenta.conteosTrasLeido, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(cuenta.conteos).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('link', { name: 'Notificaciones', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('si el servidor dice que no (500), la campana sigue encendida', async ({ page }) => {
    const cuenta = await montarLectura(page, { leido: 'falla' });
    // Se espera a que el 500 LLEGUE a la página, no solo a que salga la petición.
    const respuesta = page.waitForResponse((r) => r.url().endsWith(`/conversaciones/${CONV}/leido`));
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });

    expect((await respuesta).status()).toBe(500);
    expect(cuenta.leido).toBeGreaterThan(0);
    // Un margen para que una relectura indebida, si la hubiera, llegue a pasar:
    // el mock ya contestaría 0 y el badge se apagaría.
    await page.waitForTimeout(1500);
    await expect(page.getByRole('link', { name: 'Notificaciones, 1 sin leer' })).toBeVisible();
    // Sin confirmación no se da por leído: ni se relee la campana.
    expect(cuenta.conteosTrasLeido).toBe(0);
  });

  test('si se cae la red al marcar leído, la campana sigue encendida', async ({ page }) => {
    const cuenta = await montarLectura(page, { leido: 'cae' });
    const caida = page.waitForEvent('requestfailed', (r) => r.url().endsWith(`/conversaciones/${CONV}/leido`));
    await page.goto(`/portal/${SLUG}/mensajes/${CONV}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });

    await caida;
    expect(cuenta.leido).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await expect(page.getByRole('link', { name: 'Notificaciones, 1 sin leer' })).toBeVisible();
    expect(cuenta.conteosTrasLeido).toBe(0);
  });

  test('en Avisos, tocar «Nuevo mensaje» abre el hilo, y el aviso no lleva el texto', async ({ page }) => {
    const cuenta = await montarLectura(page, {
      avisos: [{
        id: 'n-1', title: 'Nuevo mensaje', body: 'Pilates Luz te ha escrito.',
        deepLink: `/portal/${SLUG}/mensajes/${CONV}`, category: 'mensajeria', eventType: 'mensaje.recibido',
        priority: 'MEDIA', readAt: null, createdAt: '2026-08-12T07:30:00Z', studioId: STUDIO_ID,
      }],
    });
    await page.goto(`/portal/${SLUG}/notificaciones`, { waitUntil: 'domcontentloaded' });
    const aviso = page.getByRole('link', { name: /Pilates Luz te ha escrito\./ });
    await expect(aviso).toHaveAttribute('href', `/portal/${SLUG}/mensajes/${CONV}`, { timeout: 30_000 });

    await aviso.click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/mensajes/${CONV}$`), { timeout: 30_000 });
    await expect(page.getByText('Sí, quedan dos. ¿Te la reservo?')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => cuenta.leido, { timeout: 15_000 }).toBe(1);
  });
});
