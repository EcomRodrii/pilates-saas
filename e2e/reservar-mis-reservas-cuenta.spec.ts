import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// F5 del rediseño de /reservar (29-sep-2026): «Mis reservas» y «Mi cuenta»
// (bonos y perfil) con el lenguaje de la app de la alumna — tarjetas con el
// cuándo en el color de la marca y acciones en píldora, el segmentado de la
// app, «Te quedan 5 de 8 sesiones» y el perfil en grupos.
//
// Lo medible que se pidió:
//   · A 390×844, al abrir «Mis reservas», la primera reserva y su «Cancelar
//     reserva» están a la vista sin hacer scroll.
//   · Cancelar sigue pidiendo confirmación en línea, y «No, mantener» la cierra
//     sin mandar nada al servidor.
//   · En «Mi cuenta → Bonos» se lee «Te quedan 5 de 8 sesiones».
//   · Contraste AA en Carbón.
//   · Incrustada (`embed=1`), `tab=misreservas` y `tab=cuenta` siguen saliendo.
// El camino de fallo de cancelar ya lo cubre reservar-cancelar-reserva.spec.ts.
//
// Andamiaje de e2e/reservar-ficha-datos-pago.spec.ts: los dos estudios
// sembrados en el servidor (lib/studio-seo.ts), `tentare` (la apariencia de
// siempre) y `tentare-carbon` (Carbón + Editorial, oscuro), y las horas con su
// zona (+02:00) para que no dependan del reloj del runner.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';
const SOCIO_ID = 'socio-e2e-f5';

type Tamano = { width: number; height: number };
const MOVIL: Tamano = { width: 390, height: 844 };
const ESCRITORIO: Tamano = { width: 1280, height: 800 };

function sesion(id: string, dia: string, hora: string, tipo: 'tc-r' | 'tc-m', ins: string, aforo = 10) {
  const [h, m] = hora.split(':').map(Number);
  const finMin = h * 60 + m + 50;
  const fin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
  return {
    id, studioId: S, tipoClaseId: tipo, salaId: tipo === 'tc-r' ? 'sala-1' : 'sala-2', instructorId: ins,
    inicio: `2026-08-${dia}T${hora}:00+02:00`, fin: `2026-08-${dia}T${fin}:00+02:00`, aforoMaximo: aforo, cancelada: false,
  };
}

// El 12 de agosto de 2026 (miércoles), a las 08:00 de Madrid.
const AHORA = '2026-08-12T08:00:00+02:00';

const reserva = (id: string, sesionId: string, estado: string, posicionEspera: number | null = null) => ({
  id, studioId: S, socioId: SOCIO_ID, sesionId, estado, spotId: null, posicionEspera,
  ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-08-01T09:00:00Z',
});

function fx(slug: string, conSocia: boolean) {
  const sesiones = [
    sesion('ses-10', '12', '10:00', 'tc-r', 'ins-1'),
    sesion('ses-20', '13', '09:00', 'tc-r', 'ins-2'),
    sesion('ses-p1', '10', '18:00', 'tc-m', 'ins-2', 12),
    sesion('ses-p2', '05', '19:00', 'tc-r', 'ins-1'),
  ];
  const reservas = [
    reserva('res-1', 'ses-10', 'CONFIRMADA'),
    reserva('res-2', 'ses-20', 'LISTA_ESPERA', 2),
    reserva('res-3', 'ses-p1', 'ASISTIDA'),
    // Confirmada de una clase que ya pasó y en la que nadie pasó lista: no es
    // una cancelación (antes la insignia decía «Cancelada»).
    reserva('res-4', 'ses-p2', 'CONFIRMADA'),
  ];
  // Las de la socia van TAMBIÉN en el aforo, con el mismo id: el contexto parte
  // del aforo y solo sustituye por id (lib/studio-context.tsx).
  const aforoReservas = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `ar-10-${i}`, sesion_id: 'ses-10', estado: 'CONFIRMADA' })),
    ...(conSocia ? reservas.map(r => ({ id: r.id, sesion_id: r.sesionId, estado: r.estado })) : []),
  ];
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Pilates en grupos pequeños.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracionMinutos: 50, ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat Pilates', color: '#5E7A6B', nivel: 'PRINCIPIANTE', duracionMinutos: 50, ventanaCancelacionHoras: null },
    ],
    salas: [
      { id: 'sala-1', studioId: S, nombre: 'Sala Reformer', capacidad: 10 },
      { id: 'sala-2', studioId: S, nombre: 'Sala Mat', capacidad: 12 },
    ],
    instructores: [
      { id: 'ins-1', studioId: S, nombre: 'Marta Vidal', rol: 'INSTRUCTOR', activo: true },
      { id: 'ins-2', studioId: S, nombre: 'Lucía Ortega', rol: 'INSTRUCTOR', activo: true },
    ],
    spots: [],
    planesTarifa: [
      { id: 'plan-suelto', studioId: S, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 18, sesiones: 1, activo: true },
      { id: 'plan-bono', studioId: S, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
    ],
    sesiones,
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [],
    challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas,
    socia: conSocia ? {
      socio: {
        id: SOCIO_ID, studioId: S, nombre: 'Socia', apellidos: 'Prueba', email: 'socia-f5@example.com', telefono: '+34 600 000 111',
        aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null },
      },
      reservas, plazasFijas: [], recibos: [],
      suscripciones: [{ id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' }],
    } : null,
  };
}

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page, slug: string, tamano: Tamano, conSocia = true) {
  await page.setViewportSize(tamano);
  await page.clock.install({ time: new Date(AHORA) });
  const f = fx(slug, conSocia);
  // La red de seguridad PRIMERO: Playwright resuelve la ruta registrada más
  // recientemente, así que las de abajo ganan a esta.
  await page.route('**/api/**', (r) => r.fulfill(json({})));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ ...json({ id: S }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/theme**', (r) => r.fulfill(json({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 })));
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: f.sesiones.map(s => s.id), aforoReservas: f.aforoReservas })));
  if (conSocia) {
    await page.addInitScript(() => {
      localStorage.setItem('sb-portal-auth', JSON.stringify({
        access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
        user: { id: 'auth-e2e', email: 'socia-f5@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    });
    await page.route('**/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Socia Prueba', email: 'socia-f5@example.com' })));
  } else {
    await page.route('**/api/public/session', (r) => r.fulfill(json({ error: 'sin sesión' }, 404)));
  }
  // Toda petición de cancelar, contada: «No, mantener» no puede mandar ninguna.
  // Después del andamiaje: registrada antes, la red de seguridad la taparía.
  const cancelaciones: unknown[] = [];
  await page.route('**/api/public/reserva', (r) => {
    cancelaciones.push(r.request().postDataJSON());
    return r.fulfill(json({ ok: true }));
  });
  return { cancelaciones };
}

async function abrirHorario(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#horario').waitFor({ state: 'attached', timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 60_000 });
  // Las tarjetas entran subiendo (`reserva-card-in`, .35 s): se pulsan quietas.
  await page.waitForTimeout(900);
}

/** «Mis reservas» desde la cabecera: en el móvil vive en el menú, en escritorio en la barra. */
async function abrirMisReservas(page: Page, tamano: Tamano) {
  const cabecera = page.getByRole('banner');
  if (tamano.width < 640) {
    await cabecera.getByRole('button', { name: 'Más secciones' }).click();
    await page.getByRole('menu', { name: 'Más secciones' }).getByRole('menuitem', { name: /Mis reservas/ }).click();
  } else {
    await cabecera.getByRole('button', { name: /Mis reservas/ }).click();
  }
  const hoja = page.getByRole('dialog', { name: 'Mis reservas' });
  await expect(hoja.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });
  // La entrada de la hoja y de las tarjetas: se mide quieto.
  await page.waitForTimeout(900);
  return hoja;
}

async function abrirCuenta(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 2, name: 'Mi cuenta' })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText('Te quedan', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
}

/**
 * Textos por debajo de AA dentro de `selector`, con su fondo real (capas
 * translúcidas apiladas hasta una opaca). El mismo medidor de
 * e2e/reservar-ficha-datos-pago.spec.ts: lo que no sabe leer no lo mide.
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

const HOJA = '[role="dialog"][aria-label="Mis reservas"]';

// ── «Mis reservas» ──────────────────────────────────────────────────────────

for (const slug of ['tentare', 'tentare-carbon']) {
  test(`${slug}, móvil (390×844): al abrir «Mis reservas», la primera reserva y su «Cancelar reserva» están a la vista`, async ({ page }) => {
    await montar(page, slug, MOVIL);
    await abrirHorario(page, `/reservar/${slug}?tab=clases`);
    const hoja = await abrirMisReservas(page, MOVIL);

    // A sangre, como la ficha de la clase: de borde a borde y pegada abajo.
    const caja = (await hoja.boundingBox())!;
    expect(Math.round(caja.x)).toBe(0);
    expect(Math.round(caja.width)).toBe(MOVIL.width);
    expect(Math.abs(caja.y + caja.height - MOVIL.height)).toBeLessThanOrEqual(1);

    // La primera tarjeta: la clase de hoy, con el cuándo de la app.
    const primera = hoja.getByRole('listitem').first();
    await expect(primera.getByRole('heading', { level: 3, name: 'Reformer' })).toBeVisible();
    await expect(primera.getByText('Hoy · 10:00', { exact: true })).toBeVisible();
    await expect(primera.getByText('Reservada', { exact: true })).toBeVisible();
    await expect(primera.getByText('con Marta Vidal · Sala Reformer', { exact: true })).toBeVisible();

    const cancelar = primera.getByRole('button', { name: 'Cancelar reserva' });
    await expect(cancelar).toBeInViewport();
    const boton = (await cancelar.boundingBox())!;
    expect(boton.y + boton.height, `«Cancelar reserva» acaba en y=${Math.round(boton.y + boton.height)}`).toBeLessThanOrEqual(MOVIL.height);
    // 44 px de zona táctil, aunque la píldora se vea de 36.
    expect(boton.height).toBeGreaterThanOrEqual(44);

    // La lista de espera, con su posición; y nada se sale por el lado.
    await expect(hoja.getByText('Lista de espera · 2ª', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);
  });
}

test('móvil: cancelar pide confirmación en línea, y «No, mantener» la cierra sin mandar nada', async ({ page }) => {
  const { cancelaciones } = await montar(page, 'tentare', MOVIL);
  await abrirHorario(page, '/reservar/tentare?tab=clases');
  const hoja = await abrirMisReservas(page, MOVIL);
  const primera = hoja.getByRole('listitem').first();

  await primera.getByRole('button', { name: 'Cancelar reserva' }).click();
  // Dentro de la misma tarjeta, no en un modal aparte. La clase es a las 10:00
  // y son las 08:00: dentro de las 12 h, así que avisa de que la sesión del
  // bono no vuelve (el texto de siempre, sin tocar).
  await expect(primera.getByText(/¿Quieres cancelar esta reserva\? Con menos de 12h de antelación no se te devolverá la sesión del bono\./)).toBeVisible();
  await expect(primera.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible();
  // Mientras se decide, la acción de la tarjeta se retira: no hay dos «cancelar».
  await expect(primera.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);

  await primera.getByRole('button', { name: 'No, mantener' }).click();
  await expect(primera.getByText(/¿Quieres cancelar esta reserva\?/)).toHaveCount(0);
  await expect(primera.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
  await expect(primera.getByText('Reservada', { exact: true })).toBeVisible();
  expect(cancelaciones).toEqual([]);
});

test('móvil: «Pasadas» dice lo que dice el registro — una confirmada que ya pasó no es «Cancelada»', async ({ page }) => {
  await montar(page, 'tentare', MOVIL);
  await abrirHorario(page, '/reservar/tentare?tab=clases');
  const hoja = await abrirMisReservas(page, MOVIL);

  const pasadas = hoja.getByRole('button', { name: 'Pasadas' });
  await pasadas.click();
  await expect(pasadas).toHaveAttribute('aria-pressed', 'true');
  await expect(hoja.getByRole('button', { name: 'Próximas' })).toHaveAttribute('aria-pressed', 'false');

  const mat = hoja.getByRole('listitem').filter({ hasText: 'Mat Pilates' });
  await expect(mat.getByText('Asistida', { exact: true })).toBeVisible();
  const reformer = hoja.getByRole('listitem').filter({ hasText: 'Reformer' });
  await expect(reformer.getByText('Reservada', { exact: true })).toBeVisible();
  await expect(hoja.getByText('Cancelada', { exact: true })).toHaveCount(0);
  // Lo pasado no se cancela.
  await expect(hoja.getByRole('button', { name: /Cancelar reserva|Salir de la lista/ })).toHaveCount(0);

  // Y la hoja se cierra con su botón, no solo tocando el velo.
  await hoja.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Mis reservas' })).toHaveCount(0);
});

test('tentare-carbon: «Mis reservas» pasa AA, también con la confirmación abierta', async ({ page }) => {
  await montar(page, 'tentare-carbon', ESCRITORIO);
  await abrirHorario(page, '/reservar/tentare-carbon?tab=clases');
  const hoja = await abrirMisReservas(page, ESCRITORIO);

  const lista = await ilegiblesEn(page, HOJA);
  expect(lista.medidos).toBeGreaterThan(8);
  expect(lista.out, lista.out.join('\n')).toEqual([]);

  await hoja.getByRole('listitem').first().getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(hoja.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible();
  await page.waitForTimeout(500);
  const confirmacion = await ilegiblesEn(page, HOJA);
  expect(confirmacion.out, confirmacion.out.join('\n')).toEqual([]);

  await hoja.getByRole('button', { name: 'Pasadas' }).click();
  await page.waitForTimeout(700);
  const pasadas = await ilegiblesEn(page, HOJA);
  expect(pasadas.out, pasadas.out.join('\n')).toEqual([]);
});

test('sin haber entrado, «Mis reservas» invita a acceder', async ({ page }) => {
  await montar(page, 'tentare', MOVIL, false);
  await abrirHorario(page, '/reservar/tentare?tab=clases');
  const hoja = await abrirMisReservas(page, MOVIL);
  await expect(hoja.getByRole('heading', { name: 'Identifícate para ver tus reservas' })).toBeVisible();
  await expect(hoja.getByRole('button', { name: 'Acceder' })).toBeVisible();
  // Sin sesión no hay nada que partir en próximas y pasadas.
  await expect(hoja.getByRole('button', { name: 'Pasadas' })).toHaveCount(0);
});

// ── «Mi cuenta» ─────────────────────────────────────────────────────────────

for (const slug of ['tentare', 'tentare-carbon']) {
  test(`${slug}, móvil (390×844): «Mi cuenta → Bonos» dice «Te quedan 5 de 8 sesiones», y pasa AA`, async ({ page }) => {
    await montar(page, slug, MOVIL);
    await abrirCuenta(page, `/reservar/${slug}?tab=cuenta`);

    // La barra de pestañas de antes (titulares de 27 px que se salían por la
    // derecha) ya no está: la navegación es la cabecera.
    await expect(page.locator('#horario button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);

    const bono = page.getByRole('article').filter({ hasText: 'Te quedan' });
    await expect(bono).toHaveCount(1);
    await expect(bono.getByRole('heading', { name: 'Bono 8 sesiones' })).toBeVisible();
    await expect(bono).toContainText('Te quedan 5 de 8 sesiones');
    await expect(bono.getByText('caduca jue 31 dic', { exact: true })).toBeVisible();
    await expect(bono.getByText('Activo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reservar una clase' })).toBeVisible();

    const bonos = await ilegiblesEn(page, 'main');
    expect(bonos.medidos).toBeGreaterThan(6);
    expect(bonos.out, bonos.out.join('\n')).toEqual([]);

    // Perfil: quién es, sus datos en grupo y cerrar sesión.
    const perfil = page.getByRole('button', { name: 'Perfil', exact: true });
    await perfil.click();
    await expect(perfil).toHaveAttribute('aria-pressed', 'true');
    const principal = page.getByRole('main');
    await expect(principal.getByText('Socia Prueba', { exact: true })).toBeVisible();
    await expect(principal.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
    await expect(principal.getByLabel('Teléfono')).toHaveValue('+34 600 000 111');
    // Sin cambios, no hay nada que guardar.
    await expect(principal.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await expect(principal.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await page.waitForTimeout(500);
    const datos = await ilegiblesEn(page, 'main');
    expect(datos.out, datos.out.join('\n')).toEqual([]);
  });
}

test('escritorio (1280×800): «Mi cuenta» va en la columna del horario, alineada con la portada', async ({ page }) => {
  await montar(page, 'tentare', ESCRITORIO);
  await abrirCuenta(page, '/reservar/tentare?tab=cuenta');
  const titulo = (await page.getByRole('heading', { level: 2, name: 'Mi cuenta' }).boundingBox())!;
  const portada = (await page.locator('.reservar-portada h1').boundingBox())!;
  expect(Math.abs(titulo.x - portada.x), `«Mi cuenta» empieza en x=${Math.round(titulo.x)}`).toBeLessThan(2);
  const bono = (await page.getByRole('article').filter({ hasText: 'Te quedan' }).boundingBox())!;
  expect(bono.width).toBeLessThanOrEqual(720);
});

// ── Incrustada (embed=1) ────────────────────────────────────────────────────

test('incrustada (embed=1&tab=misreservas): sigue saliendo, sin la píldora que repetía el título', async ({ page }) => {
  await montar(page, 'tentare', MOVIL);
  await page.goto('/reservar/tentare?embed=1&tab=misreservas');
  await expect(page.getByRole('heading', { level: 2, name: 'Mis reservas' })).toBeVisible({ timeout: 150_000 });
  // Dos reservas de Reformer (hoy, y mañana en lista de espera): se mira la de hoy.
  const deHoy = page.getByRole('article').filter({ hasText: 'Hoy · 10:00' });
  await expect(deHoy.getByRole('heading', { level: 3, name: 'Reformer' })).toBeVisible({ timeout: 30_000 });
  await expect(deHoy.getByText('Reservada', { exact: true })).toBeVisible();
  await expect(deHoy.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
  // Un widget de un solo propósito: ni cabecera de la página ni barra.
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.locator('#horario button')).toHaveCount(0);
  // «+ Calendario» sí se ofrece también incrustada: es de la reserva, no de la
  // página.
  await expect(page.getByRole('button', { name: 'Añadir al calendario' })).toBeVisible();
});

test('incrustada (embed=1&tab=cuenta): sigue saliendo con los bonos, y sin «Reservar una clase»', async ({ page }) => {
  await montar(page, 'tentare', MOVIL);
  await page.goto('/reservar/tentare?embed=1&tab=cuenta');
  await expect(page.getByRole('heading', { level: 2, name: 'Mi cuenta' })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole('article').filter({ hasText: 'Te quedan' })).toContainText('Te quedan 5 de 8 sesiones', { timeout: 30_000 });
  // El widget de un solo propósito no lleva al horario (no hay «Clases» en él).
  await expect(page.getByRole('button', { name: 'Reservar una clase' })).toHaveCount(0);
  await expect(page.locator('#horario button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
});
