import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Felicitar el cumpleaños» (P3.10) es una regla OPCIONAL de Automatizaciones:
// solo existe donde el servidor la tiene encendida para el estudio
// (`/api/automatizaciones/disponibles`). Lo que fija este test:
//
//   · apagada (o si la sonda falla), la pantalla es la de siempre;
//   · encendida, se ofrece aparte y «Añadir» la crea APAGADA, comprobando lo
//     que contesta la base de datos (un fallo no se pinta como hecho);
//   · encenderla pide permiso con la cifra que da el servidor, no una cuenta
//     del panel (que no tiene ni el año de nacimiento ni el consentimiento).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

const reglaCumple = (activa: boolean) => ({
  id: 'rule-cumple', studio_id: STUDIO_ID, nombre: 'Felicitar el cumpleaños',
  descripcion: 'El día de su cumpleaños le manda un correo de felicitación en nombre de tu estudio.',
  icono: '🎂', trigger: 'CUMPLEANOS', condicion: {}, pasos: [],
  activa, ejecutada_veces: 0, ultima_ejecucion: null, creada_en: '2026-01-01T00:00:00Z',
});

type Sonda = { status: number; body: unknown } | 'red';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Dos fotogramas: lo que la página hace con una respuesta ya está pintado.
const dosFotogramas = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function montar(page: Page, opts: {
  sonda: Sonda; reglas?: unknown[];
  insertar?: { status: number; body: unknown };
  actualizar?: { status: number; body: unknown };
}) {
  const cuenta = { sonda: 0, inserciones: [] as Record<string, unknown>[], cambios: [] as Record<string, unknown>[] };
  // Resuelve cuando la sonda ha contestado (o ha fallado por red): una
  // comprobación de «no se ve» antes de eso pasaría sin probar nada.
  const sondaHecha = new Promise<void>(resolve => {
    const esSonda = (url: string) => url.includes('/api/automatizaciones/disponibles');
    page.on('response', r => { if (esSonda(r.url())) resolve(); });
    page.on('requestfailed', r => { if (esSonda(r.url())) resolve(); });
  });
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // Playwright resuelve las rutas en orden INVERSO al de registro: comodines
  // primero, específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/automatizaciones/disponibles', route => {
    cuenta.sonda++;
    if (opts.sonda === 'red') return route.abort('failed');
    return json(route, opts.sonda.body, opts.sonda.status);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/automation_rules**', route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, opts.reglas ?? []);
    if (req.method() === 'POST') {
      cuenta.inserciones.push(req.postDataJSON() as Record<string, unknown>);
      const r = opts.insertar ?? { status: 201, body: [] };
      return json(route, r.body, r.status);
    }
    if (req.method() === 'PATCH') {
      cuenta.cambios.push(req.postDataJSON() as Record<string, unknown>);
      const r = opts.actualizar ?? { status: 200, body: [] };
      return json(route, r.body, r.status);
    }
    return json(route, []);
  });

  await page.goto('/automatizaciones');
  await page.getByRole('button', { name: 'Reglas', exact: true }).click({ timeout: 30_000 });
  return { cuenta, sondaHecha };
}

const SIN_PERMISO = { message: 'permission denied for table automation_rules', code: '42501' };

const ALCANCE = { activas: 40, conFecha: 6, conConsentimiento: 9, alcanzables: 3 };

test.describe('Felicitar el cumpleaños (regla opcional)', () => {
  test('apagada para el estudio: la pantalla es la de siempre y no se ofrece', async ({ page }) => {
    const { cuenta, sondaHecha } = await montar(page, { sonda: { status: 200, body: { cumpleanos: null } } });
    // Las sugeridas de siempre se ven: la pantalla ha cargado.
    await expect(page.getByText('Clienta ausente').first()).toBeVisible({ timeout: 30_000 });
    await sondaHecha;
    await dosFotogramas(page);
    expect(cuenta.sonda).toBeGreaterThan(0);
    await expect(page.getByText('Felicitar el cumpleaños')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'También puedes añadir' })).toHaveCount(0);
  });

  for (const [caso, sonda] of [['un 500', { status: 500, body: { error: 'x' } }], ['la red caída', 'red']] as const) {
    test(`si la sonda falla (${caso}) no se ofrece nada y la pantalla sigue entera`, async ({ page }) => {
      const { cuenta, sondaHecha } = await montar(page, { sonda });
      await expect(page.getByText('Clienta ausente').first()).toBeVisible({ timeout: 30_000 });
      await sondaHecha;
      await dosFotogramas(page);
      expect(cuenta.sonda).toBeGreaterThan(0);
      await expect(page.getByText('Felicitar el cumpleaños')).toHaveCount(0);
    });
  }

  test('encendida: se ofrece aparte, se lee qué envía y «Añadir» la crea apagada', async ({ page }) => {
    const { cuenta } = await montar(page, { sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } } });
    const opcional = page.getByRole('region', { name: 'También puedes añadir' });
    await expect(opcional).toBeVisible({ timeout: 30_000 });
    await expect(opcional).toContainText('Felicitar el cumpleaños');
    await expect(opcional).toContainText('No regala ni descuenta nada');

    // Qué hace y qué le llega, antes de añadir nada.
    await opcional.getByRole('button', { name: 'Expandir detalles' }).click();
    await expect(opcional).toContainText('El día de su cumpleaños, por la mañana. Una vez al año');
    await expect(opcional).toContainText('¡Feliz cumpleaños, Elena!');

    await opcional.getByRole('button', { name: 'Añadir esta regla' }).click();
    await expect.poll(() => cuenta.inserciones.length).toBe(1);
    expect(cuenta.inserciones[0]).toMatchObject({ trigger: 'CUMPLEANOS', activa: false });

    // Ya es una regla del estudio, apagada, en su misma sección (que pasa a
    // llamarse «Cumpleaños»), y el foco va a su interruptor: el botón pulsado ya
    // no existe.
    const seccion = page.getByRole('region', { name: 'Cumpleaños' });
    const interruptor = seccion.getByRole('switch', { name: /Activar la automatización Felicitar el cumpleaños/ });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(interruptor).toBeFocused();
    await expect(seccion.getByRole('button', { name: 'Añadir esta regla' })).toHaveCount(0);
    await expect(page.getByText('Añadida. Está apagada: enciéndela cuando quieras.')).toBeVisible();
    // Las sugeridas siguen ahí: añadir el cumpleaños no cambia el resto de la pantalla.
    await expect(page.getByRole('button', { name: /Añadir estas \d+ reglas/ })).toBeVisible();
  });

  test('si la base de datos no la guarda, lo dice y no la pinta como añadida', async ({ page }) => {
    const { cuenta } = await montar(page, {
      sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } },
      insertar: { status: 403, body: SIN_PERMISO },
    });
    const opcional = page.getByRole('region', { name: 'También puedes añadir' });
    await opcional.getByRole('button', { name: 'Añadir esta regla' }).click({ timeout: 30_000 });
    await expect.poll(() => cuenta.inserciones.length).toBeGreaterThan(0);
    // Primero la prueba de que la respuesta llegó (el error en rojo y el botón
    // de vuelta), y solo entonces lo que NO debe estar.
    await expect(page.getByRole('alert').filter({ hasText: /no tienes permiso/i }).first()).toBeVisible();
    await expect(opcional.getByRole('button', { name: 'Añadir esta regla' })).toBeEnabled();
    await expect(page.getByRole('switch', { name: /Activar la automatización Felicitar el cumpleaños/ })).toHaveCount(0);
    await expect(page.getByText('Añadida. Está apagada')).toHaveCount(0);
  });

  test('encenderla pide permiso con la cifra del servidor', async ({ page }) => {
    await montar(page, { sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } }, reglas: [reglaCumple(false)] });
    const interruptor = page.getByRole('switch', { name: /Felicitar el cumpleaños/ });
    await interruptor.click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Esto va a escribir a tus clientas');
    await expect(dialogo).toContainText('llegaría a 3 de tus 40 clientas');
    // Y un lector de pantalla lo lee al abrirse (el foco cae en un botón).
    await expect(dialogo).toHaveAccessibleDescription(/llegaría a 3 de tus 40 clientas/);
    // No es la cuenta del panel («email o teléfono»), que aquí sería otra cifra.
    await expect(dialogo).not.toContainText('email o teléfono');
    await dialogo.getByRole('button', { name: 'No, dejarla pausada' }).click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  });

  test('si no llegaría a nadie, lo dice y por qué', async ({ page }) => {
    await montar(page, {
      sonda: { status: 200, body: { cumpleanos: { alcance: { activas: 363, conFecha: 0, conConsentimiento: 13, alcanzables: 0 } } } },
      reglas: [reglaCumple(false)],
    });
    await page.getByRole('switch', { name: /Felicitar el cumpleaños/ }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('no felicitaría a nadie');
    await expect(dialogo).toContainText('de tus 363 clientas, ninguna tiene guardada su fecha de nacimiento y 13 han aceptado recibir novedades');
    await expect(dialogo).toContainText('Hacen falta las dos cosas');
    await expect(dialogo).toContainText('al apuntarse desde tu web o al firmar su ficha de salud, o si la importas');
  });

  test('si el servidor no ha podido contar, lo dice en vez de inventar un cero', async ({ page }) => {
    await montar(page, { sonda: { status: 200, body: { cumpleanos: { alcance: null } } }, reglas: [reglaCumple(false)] });
    await page.getByRole('switch', { name: /Felicitar el cumpleaños/ }).click({ timeout: 30_000 });
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Tentare no ha podido contar a cuántas llegaría');
    await expect(dialogo).not.toContainText('no felicitaría a nadie');
  });

  test('apagada para el estudio: una regla ya encendida se sigue viendo para poder apagarla', async ({ page }) => {
    const { cuenta } = await montar(page, { sonda: { status: 200, body: { cumpleanos: null } }, reglas: [reglaCumple(true)] });
    const interruptor = page.getByRole('switch', { name: /Felicitar el cumpleaños/ });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await interruptor.click();
    // Apagar no pregunta, y llega a la base de datos.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => cuenta.cambios.length).toBeGreaterThan(0);
    expect(cuenta.cambios[0]).toMatchObject({ activa: false });
    // Apagada y sin interruptor, deja de enseñarse (como «Recordatorio de clase»).
    await expect(interruptor).toHaveCount(0);
  });

  test('apagada para el estudio y la regla apagada: no se enseña', async ({ page }) => {
    const { cuenta, sondaHecha } = await montar(page, { sonda: { status: 200, body: { cumpleanos: null } }, reglas: [reglaCumple(false), {
      id: 'rule-aus', studio_id: STUDIO_ID, nombre: 'Clienta ausente', descripcion: 'x', icono: '👤', trigger: 'AUSENCIA_DIAS',
      condicion: {}, pasos: [], activa: false, ejecutada_veces: 0, ultima_ejecucion: null, creada_en: '2026-01-01T00:00:00Z',
    }] });
    await expect(page.getByRole('switch', { name: /Clienta ausente/ })).toBeVisible({ timeout: 30_000 });
    await sondaHecha;
    await dosFotogramas(page);
    expect(cuenta.sonda).toBeGreaterThan(0);
    await expect(page.getByRole('switch', { name: /Felicitar el cumpleaños/ })).toHaveCount(0);
  });

  test('«Sí, activarla» guarda el cambio y se ve encendida', async ({ page }) => {
    const { cuenta } = await montar(page, { sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } }, reglas: [reglaCumple(false)] });
    const interruptor = page.getByRole('switch', { name: /Felicitar el cumpleaños/ });
    await interruptor.click({ timeout: 30_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, activarla' }).click();
    await expect.poll(() => cuenta.cambios.length).toBe(1);
    expect(cuenta.cambios[0]).toMatchObject({ activa: true });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  });

  test('si la base de datos no deja encenderla, sigue apagada y lo dice', async ({ page }) => {
    const { cuenta } = await montar(page, {
      sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } }, reglas: [reglaCumple(false)],
      actualizar: { status: 403, body: SIN_PERMISO },
    });
    const interruptor = page.getByRole('switch', { name: /Felicitar el cumpleaños/ });
    await interruptor.click({ timeout: 30_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, activarla' }).click();
    await expect.poll(() => cuenta.cambios.length).toBeGreaterThan(0);
    await expect(page.getByText(/no tienes permiso/i).first()).toBeVisible();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  });

  test('con dos reglas de cumpleaños (dos pestañas), se ven las dos y cada una se puede apagar', async ({ page }) => {
    const { cuenta } = await montar(page, {
      sonda: { status: 200, body: { cumpleanos: { alcance: ALCANCE } } },
      reglas: [reglaCumple(true), { ...reglaCumple(true), id: 'rule-cumple-2' }],
    });
    const interruptores = page.getByRole('switch', { name: /Felicitar el cumpleaños/ });
    await expect(interruptores).toHaveCount(2, { timeout: 30_000 });
    await interruptores.nth(0).click();
    await interruptores.nth(1).click();
    await expect.poll(() => cuenta.cambios.length).toBe(2);
    await expect(interruptores.nth(0)).toHaveAttribute('aria-checked', 'false');
    await expect(interruptores.nth(1)).toHaveAttribute('aria-checked', 'false');
  });
});
