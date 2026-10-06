import { test, expect, type Page } from '@playwright/test';
import { SLUG, SESION_ID, conBono, conSesiones, contarPost, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// El horario (P11 + P12, 5-oct-2026): la foto PROPIA de la clase en la fila y «Reservar» desde la fila cuando la hoja
// diría «No pagas nada hoy». El botón abre LA MISMA hoja que la ficha y va por el mismo POST, sin optimismo: la fila no
// dice «Reservada ✓» hasta que los datos lo dicen. Cada camino que escribe lleva su contador.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
type Fixture = Record<string, unknown>;

/** La clase del fixture a las 10:00 de Madrid (con zona) y el reloj a las 08:00 de Madrid. */
async function montar(page: Page, ajustar: (f: Fixture) => void = () => {}, o: { relectura?: (f: Fixture) => void; aforo?: unknown[] } = {}) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const f = conSesiones(fixtureSociaLista() as unknown as Fixture, [{ id: SESION_ID, hora: '10:00' }]);
  ajustar(f);
  let pedidas = 0;
  await page.route('**/api/public/studio-data', (r) => {
    pedidas += 1;
    // La relectura tras reservar puede traer la reserva o no (el servidor la escribió, la réplica aún no): la fila no
    // puede adelantarse a los datos.
    if (pedidas > 1 && o.relectura) { const g = structuredClone(f); o.relectura(g); return r.fulfill(json(g)); }
    return r.fulfill(json(f));
  });
  if (o.aforo) await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: o.aforo })));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  return { pedidas: () => pedidas };
}

const fila = (page: Page) => page.locator(`[data-testid="fila-horario"][data-clase="${SESION_ID}"]`);
const botonFila = (page: Page) => fila(page).getByRole('button', { name: 'Reservar Reformer a las 10:00' });

async function abrirHorario(page: Page) {
  await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
  await expect(fila(page)).toBeVisible({ timeout: 45_000 });
}

test.describe('Student PWA · horario: reservar desde la fila', () => {
  test.describe.configure({ timeout: 120_000 });
  // ⚠️ Sin service worker, como e2e/student-preguntas-alta.spec.ts: en el build de producción (el del CI) la app registra
  // `/sw.js`, y en WebKit una página ya controlada por él manda sus `fetch` a través del worker, así que `page.route` no
  // los ve y llegaban al servidor de verdad (la reserva volvía con 401, «Tu sesión ha caducado»).
  // En `next dev` no hay worker: por eso pasaba en local.
  // No cambia nada de lo que se prueba.
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('con bono: «Reservar» abre la misma hoja que la ficha, y nada se ha pedido aún', async ({ page }) => {
    await montar(page, (f) => conBono(f));
    const intentos = await contarPost(page, '**/api/public/reserva', (r) => r.fulfill(json({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' })));
    await abrirHorario(page);
    await expect(fila(page)).toContainText('1 sesión');
    await botonFila(page).click();
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja).toContainText('Se usará 1 sesión de tu bono 8 sesiones');
    await expect(hoja.getByRole('button', { name: 'Confirmar 10:00 con bono' })).toBeVisible();
    // Tocar el botón no abre la ficha.
    await expect(page).toHaveURL(new RegExp(`${base}/reservar$`));
    expect(intentos).toHaveLength(0);
  });

  test('confirmando: se dice, un doble toque es UNA petición, y la fila no se adelanta', async ({ page }) => {
    await montar(page, (f) => conBono(f));
    const intentos = await contarPost(page, '**/api/public/reserva', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1200));
      return r.fulfill(json({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }));
    });
    await abrirHorario(page);
    await botonFila(page).click();
    await page.getByRole('button', { name: 'Confirmar 10:00 con bono' }).dblclick();
    await expect(page.getByText('Confirmando con el estudio… no cierres la app.')).toBeVisible();
    await expect(fila(page)).not.toContainText('Reservada ✓');
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    expect(intentos, 'el doble toque mandó dos reservas').toHaveLength(1);
  });

  test('sin optimismo: si la relectura aún no trae la reserva, la fila ni dice «Reservada ✓» ni vuelve a ofrecerla', async ({ page }) => {
    const m = await montar(page, (f) => conBono(f));
    const intentos = await contarPost(page, '**/api/public/reserva', (r) => r.fulfill(json({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' })));
    await abrirHorario(page);
    await botonFila(page).click();
    await page.getByRole('button', { name: 'Confirmar 10:00 con bono' }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    expect(intentos.length, 'la reserva no llegó a pedirse').toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Seguir en el horario' }).click();
    await expect.poll(() => m.pedidas(), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(fila(page)).not.toContainText('Reservada ✓');
    await expect(botonFila(page)).toHaveCount(0);
  });

  test('cuando los datos traen la reserva, «Reservada ✓» y el borde de su clase', async ({ page }) => {
    const m = await montar(page, (f) => conBono(f), {
      relectura: (g) => {
        (g.socia as Fixture).reservas = [{ id: 'res-1', socioId: 'socio-e2e-1', sesionId: SESION_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-12T06:00:00Z' }];
        g.aforoReservas = [{ id: 'ar-1', sesion_id: SESION_ID, estado: 'CONFIRMADA' }];
      },
    });
    await contarPost(page, '**/api/public/reserva', (r) => r.fulfill(json({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' })));
    await abrirHorario(page);
    await botonFila(page).click();
    await page.getByRole('button', { name: 'Confirmar 10:00 con bono' }).click();
    await page.getByRole('button', { name: 'Seguir en el horario' }).click({ timeout: 30_000 });
    await expect.poll(() => m.pedidas(), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(fila(page)).toContainText('Reservada ✓', { timeout: 15_000 });
    await expect(botonFila(page)).toHaveCount(0);
  });

  for (const [nombre, status, cuerpo, espera] of [
    ['aforo-lleno: sin lista de espera, no se ofrece', 400, { error: 'Esta clase está completa', codigo: 'aforo-lleno' }, /esta clase no tiene lista de espera/],
    ['sin-plan: lleva a comprar, sin «Intentar de nuevo»', 400, { error: 'Necesitas un plan o bono activo', codigo: 'sin-plan' }, /Ver opciones/],
    ['el servidor se cae: no se usó ninguna sesión', 500, { error: 'boom' }, /no se ha usado ninguna sesión/],
    ['sesión caducada: «Iniciar sesión»', 401, {}, /Tu sesión ha caducado/],
  ] as const) {
    test(`fallo · ${nombre}`, async ({ page }) => {
      await montar(page, (f) => conBono(f));
      const intentos = await contarPost(page, '**/api/public/reserva', (r) => r.fulfill(json(cuerpo, status)));
      await abrirHorario(page);
      await botonFila(page).click();
      await page.getByRole('button', { name: 'Confirmar 10:00 con bono' }).click();
      await expect(page.getByText(espera).first()).toBeVisible({ timeout: 30_000 });
      expect(intentos.length, 'la reserva no llegó a pedirse').toBeGreaterThan(0);
      await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Unirme a la lista de espera/ })).toHaveCount(0);
      await expect(fila(page)).not.toContainText('Reservada ✓');
    });
  }

  test('fallo · sin red durante la petición: lo dice, sin cargo', async ({ page }) => {
    await montar(page, (f) => conBono(f));
    const intentos = await contarPost(page, '**/api/public/reserva', (r) => r.abort('failed'));
    await abrirHorario(page);
    await botonFila(page).click();
    await page.getByRole('button', { name: 'Confirmar 10:00 con bono' }).click();
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no se ha hecho ningún cargo/)).toBeVisible();
    expect(intentos.length).toBeGreaterThan(0);
  });

  test('con cuota: la fila dice «Cuota» (nunca «1 sesión») y la hoja, «con tu cuota»', async ({ page }) => {
    await montar(page, (f) => conBono(f, { cuota: true }));
    await abrirHorario(page);
    await expect(fila(page)).toContainText('Cuota');
    await expect(fila(page)).not.toContainText('1 sesión');
    await botonFila(page).click();
    await expect(page.getByText('Incluida en tu cuota. No pagas nada hoy.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar 10:00 con tu cuota' })).toBeVisible();
  });

  test('sin bono y sin precio suelto: «Sin pagar» si el estudio no exige plan (como la ficha); si lo exige, «Solo con bono»', async ({ page }) => {
    // El andamiaje no vende nada (`planesTarifa: []`): con «exigir plan» no hay nada que contratar y no bloquea, así que
    // el servidor la reserva sin cobrar (RESERVA_SIN_PAGAR). «Solo con bono» le decía que no podía.
    const { pedidas } = await montar(page);
    await abrirHorario(page);
    await expect(fila(page)).toContainText('Sin pagar');
    await expect(fila(page)).not.toContainText('Solo con bono');
    expect(pedidas()).toBeGreaterThan(0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const exige = await montar(page, (f) => {
      f.planesTarifa = [{ id: 'plan-bono', studioId: 'studio-test', nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    });
    await abrirHorario(page);
    await expect(fila(page)).toContainText('Solo con bono');
    await expect(fila(page)).not.toContainText('Sin pagar');
    expect(exige.pedidas()).toBeGreaterThan(0);
  });

  const SIN_BOTON: Array<[string, (f: Fixture) => void, unknown[]?]> = [
    ['sin bono', () => {}],
    ['con un bono de otro tipo', (f) => conBono(f, { tipos: ['tc-mat'] })],
    ['con el bono agotado', (f) => conBono(f, { restantes: 0 })],
    ['con la clase llena (con lista de espera)', (f) => { conBono(f); f.aforoReservas = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, sesion_id: SESION_ID, estado: 'CONFIRMADA' })); }, Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, sesion_id: SESION_ID, estado: 'CONFIRMADA' }))],
    ['con sitios que elegir en la sala', (f) => { conBono(f); f.spots = [{ id: 'sp-1', salaId: 'sala-1', nombre: 'R1', fila: 1, columna: 1 }]; }],
    ['si el tipo pide aprobación', (f) => { conBono(f); (f.tiposClase as Fixture[])[0].requiereAprobacion = true; }],
    ['si el estudio pide aprobación', (f) => { conBono(f); (f.studio as Fixture).requiereAprobacion = true; }],
    ['si el tipo pide autorización', (f) => { conBono(f); (f.tiposClase as Fixture[])[0].requiereAutorizacion = true; }],
    ['si aún no se abre la reserva', (f) => { conBono(f); (f.tiposClase as Fixture[])[0].reservaAntelacionMaximaDias = 0; (f.studio as Fixture).reservaAntelacionHora = '09:00'; }],
    ['si ya cerró por la antelación mínima', (f) => { conBono(f); (f.tiposClase as Fixture[])[0].reservaVentanaMinimaMinutos = 180; }],
  ];
  for (const [caso, ajustar, aforo] of SIN_BOTON) {
    test(`sin botón ${caso}: tocar la fila abre la ficha y no se pide nada`, async ({ page }) => {
      await montar(page, ajustar, { aforo });
      const intentos = await contarPost(page, '**/api/public/reserva', (r) => r.fulfill(json({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' })));
      await abrirHorario(page);
      await expect(fila(page).getByRole('button', { name: /^Reservar/ })).toHaveCount(0);
      await fila(page).getByRole('link').click();
      await expect(page).toHaveURL(new RegExp(`/reservar/${SESION_ID}$`), { timeout: 30_000 });
      expect(intentos).toHaveLength(0);
    });
  }

  test('sin botón con la clase en curso (y la fila lo dice)', async ({ page }) => {
    await montar(page, (f) => conBono(f));
    await page.clock.setFixedTime(new Date('2026-08-12T10:20:00+02:00'));
    await abrirHorario(page);
    await expect(fila(page).getByTestId('badge-en-curso')).toBeVisible();
    await expect(fila(page).getByRole('button', { name: /^Reservar/ })).toHaveCount(0);
  });

  // ── P11: la foto PROPIA de la clase ──
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  async function fotos(page: Page) {
    await page.route(/\/(tipo|sala)-propia\.png/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  }

  test('foto del tipo de clase en el cuadro, con el logo en una esquina', async ({ page }) => {
    await fotos(page);
    await montar(page, (f) => { const t = (f.tiposClase as Fixture[])[0]; t.fotoUrl = 'https://cdn.example.com/tipo-propia.png'; t.logoUrl = 'https://cdn.example.com/logo.png'; });
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase').locator('img')).toHaveAttribute('src', /tipo-propia\.png/);
    await expect(fila(page).getByTestId('logo-clase')).toBeVisible();
    await expect(fila(page).getByTestId('color-clase')).toHaveCount(0);
  });

  test('sin foto del tipo, la de su sala', async ({ page }) => {
    await fotos(page);
    await montar(page, (f) => { (f.salas as Fixture[])[0].fotoUrl = 'https://cdn.example.com/sala-propia.png'; });
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase').locator('img')).toHaveAttribute('src', /sala-propia\.png/);
  });

  test('una foto de por defecto o la del estudio NO salen: el color de la clase', async ({ page }) => {
    await montar(page, (f) => {
      (f.tiposClase as Fixture[])[0].fotoUrl = '/por-defecto/clase-reformer.webp';
      (f.salas as Fixture[])[0].fotoUrl = '/por-defecto/estudio-hero.webp';
      (f.studio as Fixture).imagenBienvenidaUrl = 'https://cdn.example.com/portada-estudio.png';
    });
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase')).toHaveCount(0);
    await expect(fila(page).getByTestId('color-clase')).toBeVisible();
  });

  test('un nombre largo ocupa hasta dos líneas', async ({ page }) => {
    await montar(page, (f) => { (f.tiposClase as Fixture[])[0].nombre = 'Reformer avanzado con trabajo de suelo pélvico y respiración'; });
    await abrirHorario(page);
    const caja = await fila(page).locator('.fila-horario__nombre').boundingBox();
    const linea = await fila(page).locator('.fila-horario__nombre').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 20);
    expect(caja!.height, 'el nombre no ocupa dos líneas').toBeGreaterThan(linea * 1.5);
    expect(caja!.height, 'el nombre pasa de dos líneas').toBeLessThan(linea * 2.6);
  });

  test('Inicio («Huecos de hoy») y Calendario también dicen «Cuota» a quien tiene cuota', async ({ page }) => {
    await montar(page, (f) => conBono(f, { cuota: true }));
    for (const ruta of ['', '/calendario']) {
      await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Cuota', { exact: true }).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText('1 sesión', { exact: true })).toHaveCount(0);
    }
  });
});

