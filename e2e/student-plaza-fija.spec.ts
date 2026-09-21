import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Plaza fija + recuperaciones (F2, el caso canónico) en la Student PWA.
// El backend las tenía enteras y el payload las traía; la app las ignoraba.
// Lo que rompe a una alumna: no ver su plaza, no saber que tiene una clase
// por recuperar ni hasta cuándo, y que al cancelar su ocurrencia de plaza fija
// la app diga «no se devuelve» cuando el servidor SÍ le dio una recuperación.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { plaza?: boolean; recuperaciones?: number; cancelacion?: Record<string, unknown> } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  const socia = f.socia as unknown as Record<string, unknown>;
  // El reloj de sembrarSociaLista es el 2026-08-12 (miércoles, dow 3).
  socia.plazasFijas = opts.plaza === false ? [] : [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  socia.recuperaciones = Array.from({ length: opts.recuperaciones ?? 0 }, (_, i) => ({ id: `rec-${i}`, studioId: STUDIO_ID, socioId: SOCIO_ID, origenReservaId: null, motivo: null, caducaEl: `2026-09-${10 + i}`, estado: 'DISPONIBLE', usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' }));
  if (opts.cancelacion) {
    (f.socia.reservas as unknown[]).push({ id: 'res-pf', sesionId: SESION_ID, socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null });
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  if (opts.cancelacion) {
    await page.route('**/api/public/reserva', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.cancelacion) }));
  }
}

test.describe('Student PWA · plaza fija y recuperaciones', () => {
  test('Bonos enseña la plaza fija con su próxima ocurrencia y las recuperaciones con su caducidad', async ({ page }) => {
    await montar(page, { recuperaciones: 2 });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText(/Reformer · Sala 1 · próxima mañana/)).toBeVisible();
    await expect(tarjeta.getByText('2 clases por recuperar')).toBeVisible();
    await expect(tarjeta.getByText(/La primera caduca el/)).toBeVisible();
  });

  test('sin plaza ni recuperaciones no se pinta nada (ni en Bonos ni en Inicio)', async ({ page }) => {
    await montar(page, { plaza: false, recuperaciones: 0 });
    await page.goto(`${base}/bonos`);
    await expect(page.getByRole('heading', { name: /bonos/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
  });

  test('Inicio: tarjeta compacta con la plaza', async ({ page }) => {
    await montar(page);
    await page.goto(base);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  // Plaza fija desde su app (migr 20260915231920): PIDE, no cambia. El ajuste del
  // estudio lo resuelve el servidor (`lib/studio-seo.ts`), encendido en e2e con
  // `E2E_PLAZA_FIJA_APP` (playwright.config.ts).
  test('Bonos: pide una pausa de su plaza fija y queda a la espera del estudio', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-1' }) });
    });

    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    // El reloj de `sembrarSociaLista` es el 2026-08-12.
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    // Un camino que no llega a pedir nada «no miente», y no probaría nada.
    await expect(tarjeta.getByText(/Pausa pedida del .* esperando a tu estudio/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'solicitar_pausa', plazaId: 'pf-1', hasta: '2026-08-26' });
    // Hasta que el estudio conteste, su plaza sigue igual.
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  test('si el servidor dice que no, la app no dice que sí', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ya has pedido una pausa para esta plaza fija: tu estudio te contestará.' }) });
    });

    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    await expect(page.getByText(/Ya has pedido una pausa para esta plaza fija/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByText(/Pausa pedida del/)).toHaveCount(0);
  });

  test('al cancelar una ocurrencia de plaza fija, el toast dice que hay una clase para recuperar y hasta cuándo', async ({ page }) => {
    await montar(page, { cancelacion: { ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-11' } });
    await page.goto(`${base}/mis-reservas`);
    // Botón «Cancelar» de la tarjeta → diálogo → «Sí, cancelar…» (el copy exacto
    // depende del aviso de ventana; la confirmación empieza siempre igual).
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Sí, cancelar/ }).click();
    // `fechaCorta('2026-09-11')` → «vie 11 sep»: se comprueba el día y el número.
    await expect(page.getByText(/tienes una clase para recuperar hasta el \w+ 11 \w+/i)).toBeVisible({ timeout: 30_000 });
  });
});


// ── Cómo se marca una alumna en una clase fija ───────────────────────────────
//
// Los estudios decían que no les quedaba claro cómo se marcan ellas para no
// reservar cada semana. Lo que la app le dice a la alumna, según SU plan:
//   · con cuota → se le ofrece pedirla, con su día y su hora, y qué pasa después;
//   · con bono  → NO se le ofrece un botón que el servidor rechazaría: se le dice
//                 por qué (con bono no hay plaza fija);
//   · al terminar de reservar una clase que se repite, se le ofrece en ese mismo
//     momento, no solo dentro de la ficha.
// El ajuste del estudio (`plaza_fija_solicitar_desde_app`) va encendido en e2e.

async function montarClaseQueSeRepite(page: Page, plan: 'cuota' | 'bono' | 'ninguno') {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  // La clase del fixture es el miércoles 12 de agosto a las 10:00: se repite el 19.
  (f.sesiones as unknown[]).push({
    id: 'ses-11', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: '2026-08-19T10:00:00', fin: '2026-08-19T10:50:00', aforoMaximo: 10, cancelada: false,
  });
  if (plan === 'cuota') {
    f.planesTarifa = [{ id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual', tipo: 'MENSUAL', sesiones: null, precio: 60, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-c', socioId: SOCIO_ID, planId: 'plan-cuota', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null },
    ];
  }
  if (plan === 'bono') {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-b', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
}

/** La petición de plaza fija que llega al servidor, contada, para no dar por bueno un camino que no pide nada. */
async function contarPeticiones(page: Page) {
  const visto = { intentos: 0, cuerpo: null as Record<string, unknown> | null };
  await page.route('**/api/public/plaza-fija', (r) => {
    visto.intentos++;
    visto.cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-9' }) });
  });
  return visto;
}

test.describe('Student PWA · cómo pedir una plaza fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('con cuota: se le ofrece con su día y su hora, se le dice qué pasa y al pedirla queda a la espera', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('¿Vienes los miércoles a las 10:00?', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sin que tengas que volver a hacerlo/)).toBeVisible();
    await expect(page.getByText(/Tu estudio tiene que confirmarla/)).toBeVisible();
    await page.getByRole('button', { name: 'Pedir plaza fija' }).click();

    await expect(page.getByText(/Ya la has pedido: tu estudio te contestará aquí/)).toBeVisible({ timeout: 30_000 });
    expect(visto.intentos).toBeGreaterThan(0);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza', sesionId: SESION_ID });
  });

  test('con bono no se le ofrece un botón que no va a funcionar: se le dice por qué', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/La plaza fija es para quien tiene una cuota activa que incluya esta clase/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Con bono o clases sueltas, se reserva clase a clase/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir plaza fija' })).toHaveCount(0);
    expect(visto.intentos, 'nada sale hacia el servidor').toBe(0);
  });

  test('al terminar de reservar una clase que se repite, se le ofrece hacerla fija', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });

    const oferta = page.getByTestId('oferta-plaza-fija');
    await expect(oferta).toBeVisible();
    await expect(oferta.getByText('¿Vienes cada semana?')).toBeVisible();
    await expect(oferta.getByText(/los miércoles a las 10:00/)).toBeVisible();
    await oferta.getByRole('button', { name: 'Pedir plaza fija' }).click();

    await expect(oferta.getByText('Petición enviada: tu estudio te contestará en la app.')).toBeVisible({ timeout: 30_000 });
    expect(visto.intentos).toBeGreaterThan(0);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza' });
  });

  test('al terminar de reservar con bono no se le ofrece nada de plaza fija', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('oferta-plaza-fija')).toHaveCount(0);
  });
});
