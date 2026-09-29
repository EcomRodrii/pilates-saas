import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// F4 del rediseño de /reservar (29-sep-2026): la ficha de la clase, «Tus
// datos» y el pago, con el lenguaje de la app de la alumna — foto con velo y
// encima el nombre y los chips, la fila «plazas · coste», la instructora y las
// filas Cuándo / Dónde / Capacidad / Cancelación.
//
// Lo medible que se pidió:
//   · En la ficha, a 390×844, «Reservar» está a la vista sin hacer scroll. Antes
//     no lo estaba: el pie «pegado» no se pegaba (la raíz de la página lleva
//     `overflow: hidden`) y el botón nacía por debajo del borde.
//   · En «Tus datos», a 390×844, el título y el primer campo están en la
//     primera pantalla. Antes la foto 5:4 y los detalles de la clase empujaban
//     el formulario a y≈750.
//   · Incrustada (`embed=1`), la ficha y «Tus datos» siguen saliendo.
//
// Con los dos estudios sembrados en el servidor (lib/studio-seo.ts): `tentare`
// (la apariencia de siempre) y `tentare-carbon` (Carbón + Editorial, oscuro).
// Horas con su zona (+02:00), para que no dependan del reloj del runner.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';
const SOCIO_ID = 'socio-e2e-f4';

type Tamano = { width: number; height: number };
const MOVIL: Tamano = { width: 390, height: 844 };
const ESCRITORIO: Tamano = { width: 1280, height: 800 };

function sesion(id: string, hora: string, tipo: 'tc-r' | 'tc-m', ins: string, aforo = 10) {
  const [h, m] = hora.split(':').map(Number);
  const finMin = h * 60 + m + 50;
  const fin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
  return {
    id, studioId: S, tipoClaseId: tipo, salaId: tipo === 'tc-r' ? 'sala-1' : 'sala-2', instructorId: ins,
    inicio: `2026-08-12T${hora}:00+02:00`, fin: `2026-08-12T${fin}:00+02:00`, aforoMaximo: aforo, cancelada: false,
  };
}

function fx(slug: string, conSocia: boolean) {
  const sesiones = [
    sesion('ses-10', '10:00', 'tc-r', 'ins-1'),
    sesion('ses-11', '12:30', 'tc-m', 'ins-2', 12),
  ];
  const aforoReservas = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `ar-10-${i}`, sesion_id: 'ses-10', estado: 'CONFIRMADA' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `ar-11-${i}`, sesion_id: 'ses-11', estado: 'CONFIRMADA' })),
  ];
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Pilates en grupos pequeños.', anioFundacion: 2016, colorPrimario: '#2C352C',
      // Lo que abre el pago sin cuenta para la invitada (docs/reserva-sin-login-diseno.md).
      reservaExigirPlan: true, stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracionMinutos: 50, ventanaCancelacionHoras: null, descripcion: 'Máquina, muelles y control.' },
      { id: 'tc-m', studioId: S, nombre: 'Mat Pilates', color: '#5E7A6B', nivel: 'PRINCIPIANTE', duracionMinutos: 50, ventanaCancelacionHoras: null, descripcion: 'En esterilla, con accesorios. Ideal para empezar.' },
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
        id: SOCIO_ID, studioId: S, nombre: 'Socia Prueba', email: 'socia-f4@example.com', telefono: '+34 600 000 111',
        aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null },
      },
      reservas: [], plazasFijas: [], recibos: [],
      suscripciones: [{ id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' }],
    } : null,
  };
}

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page, slug: string, tamano: Tamano, conSocia: boolean) {
  await page.setViewportSize(tamano);
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  const f = fx(slug, conSocia);
  // La red de seguridad PRIMERO: Playwright resuelve la ruta registrada más
  // recientemente, así que las de abajo ganan a esta.
  await page.route('**/api/**', (r) => r.fulfill(json({})));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ ...json({ id: S }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/theme**', (r) => r.fulfill(json({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 })));
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: f.sesiones.map(s => s.id), aforoReservas: f.aforoReservas })));
  await page.route('**/api/public/checkout-embebido', (r) => r.fulfill(json({ clientSecret: 'pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000' })));
  if (conSocia) {
    await page.addInitScript(() => {
      localStorage.setItem('sb-portal-auth', JSON.stringify({
        access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
        user: { id: 'auth-e2e', email: 'socia-f4@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    });
    await page.route('**/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Socia Prueba', email: 'socia-f4@example.com' })));
  } else {
    await page.route('**/api/public/session', (r) => r.fulfill(json({ error: 'sin sesión' }, 404)));
  }
}

async function abrir(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#horario').waitFor({ state: 'attached', timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 60_000 });
  // Las tarjetas entran subiendo (`reserva-card-in`, .35 s): se pulsan quietas.
  await page.waitForTimeout(900);
}

/** La ficha de la clase de Mat de las 12:30, como socia con bono. */
async function abrirFicha(page: Page, slug: string, tamano: Tamano, q = '') {
  await montar(page, slug, tamano, true);
  await abrir(page, `/reservar/${slug}?tab=clases${q}`);
  await page.getByRole('button', { name: /Mat Pilates a las 12:30/ }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Mat Pilates' })).toBeVisible({ timeout: 30_000 });
  // La entrada de la ficha (`paso-anim`, .2 s) y la medida de la barra.
  await page.waitForTimeout(600);
}

/** «Tus datos» de la clase de Reformer de las 10:00, como invitada. */
async function abrirDatos(page: Page, slug: string, tamano: Tamano, q = '') {
  await montar(page, slug, tamano, false);
  await abrir(page, `/reservar/${slug}?tab=clases${q}`);
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
}

/**
 * Textos por debajo de AA dentro de `selector`, con su fondo real (capas
 * translúcidas apiladas hasta una opaca). El mismo medidor de
 * e2e/reservar-tema-de-la-app.spec.ts: lo que no sabe leer no lo mide.
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

// ── La ficha ────────────────────────────────────────────────────────────────

for (const slug of ['tentare', 'tentare-carbon']) {
  test(`${slug}, móvil (390×844): la ficha tiene el lenguaje de la app y «Reservar» está a la vista sin hacer scroll`, async ({ page }) => {
    await abrirFicha(page, slug, MOVIL);
    // Sin trampa: la ficha lleva la página arriba del todo al abrirse.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const reservar = page.getByRole('button', { name: /^Reservar$/ });
    await expect(reservar).toBeInViewport();
    const caja = (await reservar.boundingBox())!;
    expect(caja.y + caja.height, `«Reservar» acaba en y=${Math.round(caja.y + caja.height)}`).toBeLessThanOrEqual(MOVIL.height);
    // Una sola acción principal: el botón de la barra, no uno en el cuerpo y otro abajo.
    await expect(reservar).toHaveCount(1);

    // Lo que cuenta la app: el nivel y los chips sobre la foto, la fila de
    // plazas y coste, la instructora y las cuatro filas.
    await expect(page.getByText('Iniciación', { exact: true })).toBeVisible();
    await expect(page.getByText('Hoy · 12:30', { exact: true })).toBeVisible();
    await expect(page.getByText('9 plazas libres', { exact: true })).toBeVisible();
    await expect(page.getByText('Con tu bono · 1 sesión', { exact: true })).toBeVisible();
    await expect(page.getByText('Lucía Ortega', { exact: true })).toBeVisible();
    for (const clave of ['Cuándo', 'Dónde', 'Capacidad', 'Cancelación']) {
      await expect(page.getByText(clave, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Hoy · 12:30 – 13:20', { exact: true })).toBeVisible();
    await expect(page.getByText('Calle Larios 1 · Sala Mat', { exact: true })).toBeVisible();
    await expect(page.getByText('12 personas · 9 libres', { exact: true })).toBeVisible();
    await expect(page.getByText('Gratis hasta 12 h antes', { exact: true })).toBeVisible();
    // De qué bono sale y cuánto queda: una vez, no repetido en la fila.
    await expect(page.getByText(/Descuenta 1 sesión de tu Bono 8 sesiones · te quedarán 4/)).toHaveCount(1);

    // Nada se sale por el lado (la foto va a todo el ancho de la columna).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);

    // Todo lo que no va sobre la foto se lee, en los dos estilos.
    const { out, medidos } = await ilegiblesEn(page, '.paso-anim');
    expect(medidos).toBeGreaterThan(8);
    expect(out, out.join('\n')).toEqual([]);
  });
}

test('móvil: «Volver a las clases» sobre la foto devuelve al horario', async ({ page }) => {
  await abrirFicha(page, 'tentare', MOVIL);
  await page.getByRole('button', { name: 'Volver a las clases' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Mat Pilates' })).toHaveCount(0);
  await expect(page.locator('.reserva-slot-row').first()).toBeVisible();
  // La barra fija se va con la ficha: no se queda un «Reservar» flotando sobre el horario.
  await expect(page.getByRole('button', { name: /^Reservar$/ })).toHaveCount(0);
});

test('escritorio (1280×800): la ficha en su columna, en dos columnas, y «Reservar» a la vista', async ({ page }) => {
  await abrirFicha(page, 'tentare', ESCRITORIO);
  const ficha = (await page.locator('.paso-anim').first().boundingBox())!;
  expect(ficha.width).toBeLessThanOrEqual(760);

  const reservar = page.getByRole('button', { name: /^Reservar$/ });
  await expect(reservar).toBeInViewport();
  // El botón mide lo que la columna de la ficha, no la ventana entera.
  const boton = (await reservar.boundingBox())!;
  expect(Math.abs(boton.x - ficha.x)).toBeLessThan(2);
  expect(Math.abs(boton.width - ficha.width)).toBeLessThan(2);

  // Las filas Cuándo / Dónde… van a la derecha de la instructora: dos columnas.
  const instructora = (await page.getByText('Lucía Ortega', { exact: true }).boundingBox())!;
  const cuando = (await page.getByText('Cuándo', { exact: true }).boundingBox())!;
  expect(cuando.x).toBeGreaterThan(instructora.x + 200);
});

// ── «Tus datos» y el pago ───────────────────────────────────────────────────

for (const slug of ['tentare', 'tentare-carbon']) {
  test(`${slug}, móvil (390×844): «Tus datos» y el primer campo están en la primera pantalla`, async ({ page }) => {
    await abrirDatos(page, slug, MOVIL);
    // Medido desde arriba del todo: lo que se ve al abrir, sin que el foco
    // automático del primer campo haya tenido que mover nada.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const titulo = (await page.getByRole('heading', { name: 'Tus datos' }).boundingBox())!;
    expect(titulo.y).toBeGreaterThanOrEqual(0);
    expect(titulo.y + titulo.height, `«Tus datos» acaba en y=${Math.round(titulo.y + titulo.height)}`).toBeLessThanOrEqual(MOVIL.height);
    const campo = (await page.getByPlaceholder('Nombre y apellido').boundingBox())!;
    expect(campo.y + campo.height, `el primer campo acaba en y=${Math.round(campo.y + campo.height)}`).toBeLessThanOrEqual(MOVIL.height);

    // La clase, arriba: su nombre es el título de la pantalla, sobre la foto.
    await expect(page.getByRole('heading', { level: 1, name: 'Reformer' })).toBeVisible();
    // Y sus detalles siguen ahí, detrás del formulario.
    await expect(page.getByText('Marta Vidal', { exact: true })).toBeVisible();
    await expect(page.getByText('Calle Larios 1', { exact: false }).first()).toBeVisible();

    // Lo que se compra, como opciones de la app: una elegida.
    const opciones = page.getByRole('radiogroup', { name: 'Qué compras para reservar esta clase' }).getByRole('radio');
    await expect(opciones).toHaveCount(2);
    await expect(opciones.filter({ hasText: 'Clase suelta' })).toHaveAttribute('aria-checked', 'true');

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);

    const { out, medidos } = await ilegiblesEn(page, '.pantalla-reserva-tarjeta');
    expect(medidos).toBeGreaterThan(8);
    expect(out, out.join('\n')).toEqual([]);
  });
}

test('móvil: las flechas mueven la opción de lo que se compra (patrón «radio group»)', async ({ page }) => {
  await abrirDatos(page, 'tentare', MOVIL);
  const grupo = page.getByRole('radiogroup', { name: 'Qué compras para reservar esta clase' });
  await grupo.getByRole('radio', { name: /Clase suelta/ }).focus();
  await page.keyboard.press('ArrowDown');
  const bono = grupo.getByRole('radio', { name: /Bono 8 sesiones/ });
  await expect(bono).toHaveAttribute('aria-checked', 'true');
  await expect(bono).toBeFocused();
  // Y el total lo sigue: es el precio de lo elegido.
  await expect(page.getByText('96 €', { exact: true }).last()).toBeVisible();
});

test('móvil: el total y «Continuar al pago» se quedan a la vista al bajar por «Tus datos»', async ({ page }) => {
  // Estaban pensados para ir pegados al pie (`.pantalla-reserva-cta-pegada`),
  // pero la raíz de /reservar llevaba `overflow: hidden` y ningún `sticky` de
  // dentro se pegaba: el botón se quedaba al final de la tarjeta, bajo el borde.
  await abrirDatos(page, 'tentare', MOVIL);
  const boton = page.getByRole('button', { name: 'Continuar al pago' });
  await page.getByRole('heading', { name: 'Tus datos' }).scrollIntoViewIfNeeded();
  await expect(boton).toBeInViewport();
  await expect(page.getByText('Total a pagar')).toBeInViewport();
  const caja = (await boton.boundingBox())!;
  expect(caja.y + caja.height, `«Continuar al pago» acaba en y=${Math.round(caja.y + caja.height)}`).toBeLessThanOrEqual(MOVIL.height);
});

test('escritorio (1280×800): la clase a la izquierda y los datos a la derecha', async ({ page }) => {
  await abrirDatos(page, 'tentare', ESCRITORIO);
  const foto = (await page.getByRole('heading', { level: 1, name: 'Reformer' }).boundingBox())!;
  const titulo = (await page.getByRole('heading', { name: 'Tus datos' }).boundingBox())!;
  expect(titulo.x).toBeGreaterThan(foto.x + 300);
  // Y los dos empiezan arriba, en la primera pantalla.
  expect(titulo.y + titulo.height).toBeLessThanOrEqual(ESCRITORIO.height);
});

test('móvil: el pago empieza justo debajo de la foto', async ({ page }) => {
  await abrirDatos(page, 'tentare', MOVIL);
  await page.getByPlaceholder('Nombre y apellido').fill('Nueva Alumna');
  await page.getByPlaceholder('Email').fill('nueva@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await expect(page.getByRole('button', { name: 'Pagar 18 € y reservar' })).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  // El resumen del pago (dentro de CheckoutEmbebido) arranca en la primera
  // pantalla, no detrás de toda la ficha de la clase.
  const resumen = (await page.getByText('Confirmar reserva', { exact: true }).boundingBox())!;
  expect(resumen.y + resumen.height, `el pago empieza en y=${Math.round(resumen.y)}`).toBeLessThanOrEqual(MOVIL.height);
  await expect(page.getByRole('button', { name: 'Editar mis datos' })).toBeVisible();
});

// ── Incrustada (embed=1) ────────────────────────────────────────────────────

test('incrustada (embed=1): la ficha sigue saliendo, con su «Reservar» dentro del widget', async ({ page }) => {
  await abrirFicha(page, 'tentare', MOVIL, '&embed=1');
  const reservar = page.getByRole('button', { name: /^Reservar$/ });
  await expect(reservar).toHaveCount(1);
  await reservar.scrollIntoViewIfNeeded();
  await expect(reservar).toBeVisible();
  // En el iframe no hay barra fija (su «ventana» es el iframe entero): el
  // botón vive dentro de la ficha.
  await expect(page.locator('.paso-anim').getByRole('button', { name: /^Reservar$/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Volver a las clases' })).toBeVisible();
});

test('incrustada (embed=1): «Tus datos» sigue saliendo', async ({ page }) => {
  await abrirDatos(page, 'tentare', MOVIL, '&embed=1');
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  await expect(page.getByPlaceholder('Nombre y apellido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a la clase' })).toBeVisible();
});
