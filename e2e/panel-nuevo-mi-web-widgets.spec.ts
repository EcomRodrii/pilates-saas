import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración › Mi app y mi web › Widgets con el panel nuevo (15-oct-2026):
// la línea de pasos, el título-objetivo de cada paso, la vista previa sobre su
// panel de color y Atrás/Siguiente con las piezas del panel nuevo. Lo de dentro
// (el código, los ajustes, las reglas) es lo de siempre: lo vigila
// `widget-builder.spec.ts`, que sigue probando el constructor SIN el panel nuevo.
//
// Mocks de red registrados DESPUÉS del andamiaje (`**/api/**` primero). No hay
// escritura nueva en esta pantalla: nada que contar en un camino de fallo.
// Con CAPTURAS=<carpeta> guarda una captura por vista (la verificación visual).
// ─────────────────────────────────────────────────────────────────────────────

test.use({
  timezoneId: 'Europe/Madrid',
  // Solo para las capturas: ANCHO/ALTO prueban tableta y móvil; OSCURO=1, el modo oscuro del panel.
  ...(process.env.ANCHO ? { viewport: { width: Number(process.env.ANCHO), height: Number(process.env.ALTO ?? 900) } } : {}),
});
test.setTimeout(120_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const SLUG = 'pilates-centro';
const STORAGE_KEY = 'sb-example-auth-token';
const CAPTURAS = process.env.CAPTURAS;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function montar(page: Page, opts: { panelNuevo: boolean; plataforma?: string; slug?: string | null; copiados?: boolean; destino?: string }) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: opts.slug === undefined ? SLUG : opts.slug, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825',
    widget_dominios_autorizados: ['https://midominio.com'],
    widget_builder: {
      ...(opts.plataforma ? { _web: { plataforma: opts.plataforma } } : {}),
      ...(opts.copiados ? { horario: { copiado: { firma: 'a1b2c3d4', en: new Date().toISOString(), metodo: 'iframe' } } } : {}),
    },
  };
  if (process.env.OSCURO === '1') await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/api/billing/estado**', r => json(r, { bloqueado: false }));
  await page.route('**/api/billing/status**', r => json(r, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', r => json(r, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/api/oauth/consentimientos**', r => json(r, { apps: [] }));
  await page.route('**/api/public/session**', r => json(r, { error: 'no' }, 404));
  // Los datos públicos que pinta la vista previa (sin ellos enseña «No hemos podido cargar el horario»).
  const manana = (h: number) => { const d = new Date(Date.now() + 86_400_000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00:00`; };
  await page.route('**/api/public/studio-data**', r => json(r, {
    studio: { id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, colorPrimario: '#343825' },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [{ id: 'p1', studioId: STUDIO_ID, tipo: 'PUNTUAL', activo: true, precio: 15, sesiones: 1, nombre: 'Clase suelta' }],
    citasServicios: [], citasDisponibilidad: [], sustitucionesConfirmadas: [],
    sesiones: [
      { id: 's1', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: manana(10), fin: manana(11), aforoMaximo: 8, cancelada: false },
      { id: 's2', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: manana(18), fin: manana(19), aforoMaximo: 8, cancelada: false },
    ],
    aforoReservas: [], socia: null,
  }));
  await page.route(u => u.pathname === '/api/estudio/interruptores', r => json(r, { panelNuevo: opts.panelNuevo }));
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/rest/v1/studios**', r => (r.request().method() === 'PATCH' ? json(r, [{ id: STUDIO_ID }]) : json(r, studioRow)));
  await page.route('**/rest/v1/rpc/current_studio_id', r => json(r, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', r => json(r, [{ id: 'tc-r', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracion_min: 50 }]));
  await page.route('**/rest/v1/instructores**', r => json(r, [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Ana Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#7C6A52' }]));

  await page.goto(opts.destino ?? '/configuracion?tab=web&abrir=widgets');
}

async function captura(page: Page, nombre: string) {
  // En las capturas, que la vista previa (la página real de reservas, lenta en dev) haya cargado.
  if (CAPTURAS) await page.waitForTimeout(16_000);
  // Que la captura no salga con la página desplazada o a medio asentar.
  if (CAPTURAS) await sinDesborde(page, nombre);
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
}

test('panel nuevo: la web ya contestada abre «Qué y dónde» con su línea de pasos, su título y la vista previa en su panel', async ({ page }) => {
  await montar(page, { panelNuevo: true, plataforma: 'wordpress' });
  const pasos = page.getByRole('list', { name: 'Pasos' });
  await expect(pasos).toBeVisible({ timeout: 60_000 });
  await expect(pasos.getByRole('button')).toHaveText([/Qué y dónde/, /Cómo se ve/, /Ponlo en tu web/]);
  await expect(pasos.getByRole('button', { name: 'Qué y dónde' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' })).toBeVisible();
  // El widget real sigue ahí: «Así lo verá tu alumna» y el cambio de dispositivo.
  await expect(page.getByRole('heading', { name: 'Así lo verá tu alumna' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dispositivo de la vista previa' }).getByRole('button')).toHaveText(['Ordenador', 'Móvil']);
  // «Primeros pasos» flota abajo a la derecha y taparía la vista previa: mientras se ve, se esconde.
  await expect(page.locator('[data-primeros-pasos]:visible')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' })).toBeVisible();
  await captura(page, 'widgets-1-que');

  await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
  await expect(pasos.getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Cómo se ve', exact: true })).toBeVisible();
  await expect(page.getByText('¿Cómo quieres que se vea?')).toBeVisible();
  await captura(page, 'widgets-2-como');

  await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
  await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
  // El código sigue en el DOM (los tres pasos siempre montados).
  await expect(page.locator('pre')).toHaveCount(1);
  await expect(page.locator('pre')).toContainText(`/reservar/${SLUG}`);
  await captura(page, 'widgets-3-ponlo');

  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(pasos.getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
});

test('panel nuevo: las dos vistas se cambian con las píldoras y la primera pregunta (con qué está hecha tu web) sigue ahí', async ({ page }) => {
  await montar(page, { panelNuevo: true });
  const pregunta = page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' });
  await expect(pregunta).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Pasos' })).toHaveCount(0);
  await captura(page, 'widgets-0-plataforma');
  await pregunta.getByRole('radio', { name: /Wix/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('list', { name: 'Pasos' })).toBeVisible();
  const vistas = page.getByRole('group', { name: 'Qué ver' });
  await vistas.getByRole('button', { name: 'Cómo le va a tu página' }).click();
  await expect(vistas.getByRole('button', { name: 'Cómo le va a tu página' })).toHaveAttribute('aria-pressed', 'true');
  await captura(page, 'widgets-4-como-le-va');
});

test('panel nuevo: con algo copiado, la portada «Lo que tienes en tu web» y su botón para poner otra cosa', async ({ page }) => {
  await montar(page, { panelNuevo: true, plataforma: 'wordpress', copiados: true });
  const portada = page.getByRole('region', { name: 'Lo que tienes en tu web' });
  await expect(portada).toBeVisible({ timeout: 60_000 });
  await expect(portada.getByRole('button', { name: 'Poner otra cosa en tu web' })).toBeVisible();
  await captura(page, 'widgets-5-tienes');
});

test('panel nuevo: sin dirección de página la pantalla ya no se queda en blanco', async ({ page }) => {
  await montar(page, { panelNuevo: true, slug: null });
  await expect(page.getByRole('heading', { name: 'Primero, la dirección de tu página' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: /Poner mi dirección/ })).toHaveAttribute('href', /tab=web/);
  await captura(page, 'widgets-6-sin-direccion');
});

test('sin el panel nuevo: el constructor es el de siempre (navegación «Pasos», sin título-objetivo)', async ({ page }) => {
  await montar(page, { panelNuevo: false, plataforma: 'wordpress' });
  await expect(page.getByRole('navigation', { name: 'Pasos' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Pasos' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' })).toHaveCount(0);
  await captura(page, 'widgets-antes-que');
});

test('panel nuevo: «Contenido de tu app» con el marco del panel nuevo y sus textos de siempre', async ({ page }) => {
  await page.setViewportSize({ width: Number(process.env.ANCHO ?? 1440), height: Number(process.env.ALTO ?? 900) });
  await montar(page, { panelNuevo: true, plataforma: 'wordpress', destino: '/configuracion?tab=web&abrir=contenido-de-tu-app' });
  await expect(page.getByText(/Si no publicas ninguna tarjeta/)).toBeVisible({ timeout: 60_000 });
  await captura(page, 'contenido-de-tu-app');
});

// ─── Nada se desborda ni queda bajo el menú lateral ──────────────────────────
// Una captura de la pantalla salió con toda la columna principal ~90 px a la
// izquierda, por debajo del menú. Esto mide, en cada paso de Widgets y con la
// vista previa ya cargada, que la página y el contenedor principal no son más
// anchos que su hueco, que nada está desplazado a un lado y que el contenido
// empieza a la derecha del menú (a partir de `lg`, donde el menú es lateral).
async function sinDesborde(page: Page, donde: string) {
  await expect.poll(() => page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('main');
    const lateral = document.querySelector('aside');
    const titulo = document.querySelector('#herramienta-titulo');
    const movidos = Array.from(document.querySelectorAll('*')).filter(e => e.scrollLeft > 0).length;
    const ancho = de.clientWidth >= 1024;
    const bajoMenu = ancho && lateral && titulo ? titulo.getBoundingClientRect().left < lateral.getBoundingClientRect().right : false;
    return {
      pagina: de.scrollWidth - de.clientWidth,
      principal: main ? main.scrollWidth - main.clientWidth : 0,
      movidos,
      bajoMenu,
      relleno: main ? getComputedStyle(main).paddingLeft : null,
    };
  }), { message: `${donde}: desborde o contenido bajo el menú`, timeout: 8_000 })
    .toMatchObject({ pagina: 0, principal: 0, movidos: 0, bajoMenu: false });
}

async function previaCargada(page: Page) {
  await expect(page.frameLocator('iframe[title^="Vista previa"]').locator('body')).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
}

const TAMANOS = [
  { ancho: 1280, alto: 800 }, { ancho: 1440, alto: 900 }, { ancho: 768, alto: 1024 }, { ancho: 375, alto: 812 },
] as const;

for (const t of TAMANOS) {
  for (const oscuro of [false, true]) {
    test(`panel nuevo: sin desbordes en los pasos de Widgets a ${t.ancho} px ${oscuro ? 'en oscuro' : 'en claro'}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: t.ancho, height: t.alto });
      if (oscuro) await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
      await montar(page, { panelNuevo: true, plataforma: 'wordpress', copiados: true });
      // 5 · lo que tienes (portada)
      await expect(page.getByRole('region', { name: 'Lo que tienes en tu web' })).toBeVisible({ timeout: 90_000 });
      await sinDesborde(page, 'lo que tienes');
      // 1 · qué y dónde
      await page.getByRole('button', { name: 'Poner otra cosa en tu web' }).click();
      await expect(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' })).toBeVisible();
      await previaCargada(page);
      await sinDesborde(page, 'qué y dónde');
      // 2 · cómo se ve
      await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
      await expect(page.getByText('¿Cómo quieres que se vea?')).toBeVisible();
      await previaCargada(page);
      await sinDesborde(page, 'cómo se ve');
      // 3 · ponlo en tu web
      await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
      await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
      await previaCargada(page);
      await sinDesborde(page, 'ponlo en tu web');
      // 4 · cómo le va
      const vistas = page.getByRole('group', { name: 'Qué ver' });
      await vistas.getByRole('button', { name: 'Cómo le va a tu página' }).click();
      await sinDesborde(page, 'cómo le va');
      await vistas.getByRole('button', { name: 'Widgets', exact: true }).click();
      // 0 · con qué está hecha tu web
      await page.getByRole('button', { name: 'Cambiar con qué está hecha tu web' }).click();
      await expect(page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' })).toBeVisible();
      await sinDesborde(page, 'con qué está hecha tu web');
    });
  }
}

// ─── Al cambiar de paso, el título del paso queda a la vista ─────────────────
// «Siguiente» (o un paso de la línea de pasos) dejaba la página a media pantalla,
// como si no hubiera hecho nada: en «Cómo se ve» se aterrizaba en «Color de los
// botones». Ahora se lleva el scroll al título, descontando la barra de arriba
// (sticky y translúcida, que tapa lo que pasa por debajo). Se mide con
// `elementFromPoint`: el título está a la vista si lo que hay en su propio punto es
// él y no una barra.
async function tituloALaVista(titulo: Locator, donde: string) {
  await expect(titulo, donde).toBeVisible();
  await expect.poll(() => titulo.evaluate(el => {
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 40);
    const y = r.top + r.height / 2;
    const encima = document.elementFromPoint(x, y);
    return {
      dentro: r.top >= 0 && r.bottom <= window.innerHeight,
      destapado: !!encima && (el === encima || el.contains(encima)),
    };
  }), { message: `${donde}: el título del paso queda a la vista y sin la barra encima`, timeout: 6_000 }).toEqual({ dentro: true, destapado: true });
}

for (const t of [{ ancho: 1440, alto: 900 }, { ancho: 375, alto: 812 }]) {
  test(`panel nuevo: tras «Siguiente» o un paso de la línea, el título del paso queda a la vista (${t.ancho} px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: t.ancho, height: t.alto });
    await montar(page, { panelNuevo: true, plataforma: 'wordpress', copiados: true });
    const abajo = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // 5 · portada → 1 · qué y dónde
    await expect(page.getByRole('region', { name: 'Lo que tienes en tu web' })).toBeVisible({ timeout: 90_000 });
    await abajo();
    await page.getByRole('button', { name: 'Poner otra cosa en tu web' }).click();
    await tituloALaVista(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' }), 'qué y dónde');
    // 2 · cómo se ve (con «Siguiente», al final de la página)
    await abajo();
    await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
    await tituloALaVista(page.getByRole('heading', { name: 'Cómo se ve', exact: true }), 'cómo se ve');
    // 3 · ponlo en tu web
    await abajo();
    await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
    await tituloALaVista(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true }), 'ponlo en tu web');
    // Un paso de la línea de pasos, desde abajo
    await abajo();
    await page.getByRole('list', { name: 'Pasos' }).getByRole('button', { name: 'Cómo se ve' }).click();
    await tituloALaVista(page.getByRole('heading', { name: 'Cómo se ve', exact: true }), 'línea de pasos → cómo se ve');
    // 0 · con qué está hecha tu web
    await abajo();
    await page.getByRole('button', { name: 'Cambiar con qué está hecha tu web' }).click();
    await tituloALaVista(page.getByRole('heading', { name: '¿Con qué está hecha tu web?' }), 'con qué está hecha tu web');
  });
}
