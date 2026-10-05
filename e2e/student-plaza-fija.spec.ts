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

test.describe('Student PWA · clase fija y recuperaciones', () => {
  test('Bonos se queda con las recuperaciones; la clase fija vive en Mis clases → Fija', async ({ page }) => {
    await montar(page, { recuperaciones: 2 });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('2 clases por recuperar')).toBeVisible();
    await expect(tarjeta.getByText(/La primera caduca el/)).toBeVisible();
    await expect(tarjeta.getByText('Jueves · 18:00')).toHaveCount(0);

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await expect(page.getByRole('tab', { name: 'Fija' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    const mia = page.getByTestId('clase-fija-mia');
    await expect(mia).toContainText('Jueves 18:00', { timeout: 30_000 });
    await expect(mia).toContainText('Reformer · Sala 1');
    await expect(mia).toContainText('Sin fecha de fin');
    // Y en Fija también: sus clases por recuperar, con «Elegir clase» al horario.
    const recuperar = page.getByTestId('fila-recuperaciones');
    await expect(recuperar).toContainText('2 clases por recuperar');
    await expect(recuperar.getByRole('link', { name: 'Elegir clase' })).toHaveAttribute('href', `${base}/reservar`);
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
    await expect(tarjeta.getByText(/Reformer · Sala 1 · próxima mañana/)).toBeVisible();
    await expect(tarjeta.getByText('Activa')).toBeVisible();
    await expect(tarjeta.getByTestId('ver-mis-clases-fijas')).toHaveAttribute('href', `${base}/mis-reservas?tab=fijas`);
  });

  // Plaza fija desde su app (migr 20260915231920): PIDE, no cambia. El ajuste del
  // estudio lo resuelve el servidor (`lib/studio-seo.ts`), encendido en e2e con
  // `E2E_PLAZA_FIJA_APP` (playwright.config.ts).
  test('Mis clases → Fijas: pide una pausa de su clase fija y queda a la espera del estudio', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-1' }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('pausar-clase-fija').getByRole('button').click();
    // El reloj de `sembrarSociaLista` es el 2026-08-12.
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    // Un camino que no llega a pedir nada «no miente», y no probaría nada.
    await expect(tarjeta.getByText(/Pausa pedida del .* esperando a tu estudio/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'solicitar_pausa', plazaId: 'pf-1', hasta: '2026-08-26' });
    // Hasta que el estudio conteste, su plaza sigue igual: lo pedido se dice, y que se reserva sola también.
    await expect(tarjeta.getByTestId('clase-fija-estado')).toHaveText('Pausa pedida');
    await expect(tarjeta.getByTestId('plaza-fija-reservada-sola')).toHaveText('Se reserva sola cada semana. Tú solo avisa si un día no vas.');
  });

  test('si el servidor dice que no, la app no dice que sí', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ya has pedido una pausa para esta clase fija: tu estudio te contestará.' }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('pausar-clase-fija').getByRole('button').click();
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    await expect(page.getByText(/Ya has pedido una pausa para esta clase fija/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByText(/Pausa pedida del/)).toHaveCount(0);
  });

  // Dejar su clase fija (antes «se habla con el estudio»): ella, con confirmación.
  test('Mis clases → Fijas: deja su clase fija con confirmación y el aviso dice lo que contestó el servidor', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plazas: 1, canceladas: 3, mantenidas: 1, fallidas: 0, sinDejar: 0 }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('dejar-clase-fija').click();

    // Antes de confirmar: qué pasa, con la ventana REAL del estudio (12 h en el fixture). Y no se ha enviado nada.
    const aviso = page.getByTestId('dejar-aviso');
    await expect(aviso).toContainText('Se cancelan las clases que tienes reservadas');
    await expect(aviso).toContainText('menos de 12 h');
    await expect(aviso).not.toContainText('varios días');
    expect(intentos, 'abrir la confirmación no envía nada').toBe(0);

    await page.getByRole('button', { name: 'Sí, dejarla' }).click();
    await expect(page.getByText('Has dejado tu clase fija · se han cancelado 3 clases reservadas · mantienes 1 clase, que ya está dentro del plazo de cancelación.')).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'dejar_plaza', plazaId: 'pf-1' });
    expect(Object.keys(cuerpo as object)).not.toContain('socioId');
  });

  test('«Mantenerla» cierra la confirmación sin enviar nada', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => { intentos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('dejar-clase-fija').click();
    await expect(page.getByTestId('dejar-aviso')).toBeVisible();
    await page.getByRole('button', { name: 'Mantenerla' }).click();
    await expect(page.getByTestId('dejar-aviso')).toHaveCount(0);
    await expect(tarjeta.getByText('Activa')).toBeVisible();
    expect(intentos).toBe(0);
  });

  test('si el servidor dice que no, la app no dice que sí: la clase fija sigue y el motivo se ve en la confirmación', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Tu estudio gestiona las clases fijas en recepción: pídeselo a ellos.' }) });
    });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByTestId('dejar-clase-fija').click();
    await page.getByRole('button', { name: 'Sí, dejarla' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Tu estudio gestiona las clases fijas en recepción' })).toBeVisible({ timeout: 30_000 });
    expect(intentos, 'la petición salió de verdad').toBeGreaterThan(0);
    await expect(page.getByText(/Has dejado tu clase fija/)).toHaveCount(0);
    // La confirmación sigue abierta para reintentar o mantenerla, y la plaza sigue en la lista.
    await expect(page.getByTestId('dejar-aviso')).toBeVisible();
    await page.getByRole('button', { name: 'Mantenerla' }).click();
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  test('al cancelar una ocurrencia de clase fija, el toast dice que hay una clase para recuperar y hasta cuándo', async ({ page }) => {
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


// ── Cómo se pide una clase fija ──────────────────────────────────────────────
//
// UN solo camino (4-oct-2026): el interruptor «Clase fija» en la ficha de la clase
// del horario. La acción principal de la ficha sigue siendo «Reservar»; el
// interruptor es una tarjeta, no un segundo botón (el 23-sep, con dos botones, las
// alumnas no sabían cuál tocar). Ya no hay página «Clases fijas», ni ficha aparte,
// ni clases fijas con nombre. Con bono no hay clase fija: en su sitio, «reservar las
// próximas clases» (N reservas normales). El ajuste del estudio
// (`plaza_fija_solicitar_desde_app`) va encendido en e2e.

/**
 * La hora de estudio (Madrid) de una clase del fixture. El fixture la da SIN zona, así que el navegador la lee en su zona
 * (en el CI es UTC) y la app la pinta en la del estudio: 10:00 en una máquina de Madrid, 12:00 en el CI. El catálogo manda
 * la hora ya en la zona del estudio, y el interruptor casa la clase con su franja por esa hora.
 */
const horaEstudioDe = (inicioSinZona: string) =>
  new Date(inicioSinZona).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });

async function montarClaseQueSeRepite(page: Page, plan: 'cuota' | 'bono' | 'ninguno', opts: {
  laTiene?: boolean; deClaseFijaConNombre?: boolean; pedida?: boolean; sinFranjas?: boolean;
} = {}) {
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
  const hora = horaEstudioDe('2026-08-12T10:00:00');
  if (opts.laTiene) {
    // La misma hora que el catálogo (la de estudio de la clase del fixture): la plaza y la franja tienen que casar.
    (f.socia as Record<string, unknown>).plazasFijas = [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 3, horaInicio: `${hora}:00`, salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', claseFijaId: opts.deClaseFijaConNombre ? 'cf-1' : null }];
  }
  if (opts.pedida) {
    (f.socia as Record<string, unknown>).peticionesPlazaFija = [{ id: 'spf-1', tipo: 'CREAR', plazaId: null, diaSemana: 3, horaInicio: `${hora}:00`, salaId: 'sala-1', desde: null, hasta: null }];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  // Las clases que se repiten: esta, como la manda el servidor (sin clases fijas con nombre desde el 4-oct-2026).
  await page.route('**/api/public/clases-fijas', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ofertas: [], pedidas: [],
      sueltas: opts.sinFranjas ? [] : [{
        serieId: 'serie-1', diaSemana: 3, hora, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
        tipo: 'Reformer', sala: 'Sala 1', instructora: null, logoUrl: null, color: null, proximaSesionId: SESION_ID, ultimaFecha: '2026-12-30',
      }],
    }),
  }));
}

/** La petición de plaza fija que llega al servidor, contada, para no dar por bueno un camino que no pide nada. */
async function contarPeticiones(page: Page, respuesta: { status: number; body: unknown } = { status: 200, body: { ok: true, solicitudId: 'spf-9' } }) {
  const visto = { intentos: 0, cuerpo: null as Record<string, unknown> | null };
  await page.route('**/api/public/plaza-fija', (r) => {
    visto.intentos++;
    visto.cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
  });
  return visto;
}

const interruptorDe = (page: Page) => page.getByRole('switch', { name: 'Clase fija' });

test.describe('Student PWA · cómo pedir una clase fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('la ficha reserva con su botón de siempre: la clase fija es una tarjeta con interruptor, no otro botón', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Reservar$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('auto-reservable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
    // La hoja cerrada sigue en el DOM (inert, fuera de pantalla, como todas las hojas): lo que importa es que no se ve.
    await expect(page.getByText(/¿Vienes los/)).not.toBeInViewport();

    await page.getByRole('button', { name: /^Reservar$/ }).first().click();
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
  });

  test('sale apagado; tocarlo abre «cuánto tiempo» con «Sin fin» de serie y no manda nada hasta activarla', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const tarjeta = page.getByTestId('auto-reservable');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText('Clase fija');
    await expect(tarjeta).toContainText(/Los miércoles a las \d{2}:\d{2}, reservada cada semana/);
    const interruptor = interruptorDe(page);
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(interruptor).toHaveAttribute('data-estado', 'apagado');

    await interruptor.click();
    const hoja = page.getByTestId('auto-reservable-hoja');
    await expect(hoja).toBeVisible();
    await expect(hoja).toContainText(/¿Vienes los miércoles a las \d{2}:\d{2}\?/);
    await expect(hoja).toContainText('Tu estudio tiene que confirmarla');
    await expect(hoja.getByRole('button', { name: 'Sin fin' })).toHaveAttribute('aria-pressed', 'true');
    await expect(hoja.getByTestId('clase-fija-hasta')).toHaveText('Sin fecha de fin');
    await hoja.getByRole('button', { name: '3 meses' }).click();
    // El reloj del test es el 12-ago: la fecha exacta a la vista antes de pedirla.
    await expect(hoja.getByTestId('clase-fija-hasta')).toHaveText('Hasta el 12/11/2026');
    expect(visto.intentos, 'mirar la hoja no pide nada').toBe(0);
    await expect(interruptor).toHaveAttribute('data-estado', 'apagado');
  });

  test('activarla con una duración manda UNA petición con esa duración y queda pendiente (no encendida) hasta que el estudio conteste', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await interruptor.click({ timeout: 30_000 });
    const hoja = page.getByTestId('auto-reservable-hoja');
    await hoja.getByRole('button', { name: '6 meses' }).click();
    await hoja.getByRole('button', { name: 'Hacerla mi clase fija' }).click();

    await expect(interruptor).toHaveAttribute('data-estado', 'pendiente', { timeout: 30_000 });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    // Para un lector de pantalla «desactivado» no basta: el interruptor lleva su descripción («ya la has pedido…»).
    await expect(interruptor).toHaveAccessibleDescription(/Ya la has pedido/);
    expect(visto.intentos, 'la petición salió de verdad').toBe(1);
    // Viaja la DURACIÓN, no una fecha: la fecha de fin la calcula el servidor.
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza', sesionId: SESION_ID, duracionMeses: 6 });
    expect(Object.keys(visto.cuerpo as object)).not.toContain('hasta');
    await expect(hoja).not.toBeInViewport();
  });

  test('«Sin fin» (lo de serie) no manda ninguna duración', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await interruptorDe(page).click({ timeout: 30_000 });
    await page.getByTestId('auto-reservable-hoja').getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await expect(interruptorDe(page)).toHaveAttribute('data-estado', 'pendiente', { timeout: 30_000 });
    expect(visto.intentos).toBe(1);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza', sesionId: SESION_ID });
    expect(Object.keys(visto.cuerpo as object)).not.toContain('duracionMeses');
  });

  test('aprobación automática: si el servidor la da al instante, se enciende con SU texto', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const dicho = 'Tu clase fija de los miércoles a las 10:00 está confirmada. Ya tienes reservada la próxima clase.';
    const visto = await contarPeticiones(page, { status: 200, body: { ok: true, solicitudId: 'spf-9', resuelta: true, mensaje: dicho } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await interruptor.click({ timeout: 30_000 });
    await page.getByTestId('auto-reservable-hoja').getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido', { timeout: 30_000 });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(dicho)).toBeVisible();
    expect(visto.intentos, 'la petición salió de verdad').toBe(1);
  });

  test('⚠️ «resuelta» sin el texto que enseñar no se cree: queda pendiente', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page, { status: 200, body: { ok: true, solicitudId: 'spf-9', resuelta: true } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await interruptorDe(page).click({ timeout: 30_000 });
    await page.getByTestId('auto-reservable-hoja').getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await expect(interruptorDe(page)).toHaveAttribute('data-estado', 'pendiente', { timeout: 30_000 });
    expect(visto.intentos).toBe(1);
  });

  test('si el servidor dice que no, la hoja sigue abierta con el motivo y NO se enciende', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page, { status: 409, body: { error: 'Ya tienes otra clase a esa hora.' } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await interruptor.click({ timeout: 30_000 });
    const hoja = page.getByTestId('auto-reservable-hoja');
    await hoja.getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await expect(hoja.getByRole('alert')).toContainText('Ya tienes otra clase a esa hora.', { timeout: 30_000 });
    expect(visto.intentos, 'el camino de fallo sí intentó pedirla').toBeGreaterThan(0);
    await expect(interruptor).toHaveAttribute('data-estado', 'apagado');
  });

  test('lo que se le promete depende del estudio: manual dice que lo confirma el estudio; automático, las dos posibilidades', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await interruptorDe(page).click({ timeout: 30_000 });
    await expect(page.getByTestId('auto-reservable-hoja')).toContainText('Tu estudio tiene que confirmarla');
    await expect(page.getByText(/Si cumples las reglas de tu estudio/)).toHaveCount(0);

    // El estudio con la aprobación automática (en e2e, el slug propio: una variable global lo encendería en todas las specs).
    await page.goto('/portal/tentare-aprobacion-auto/reservar/' + SESION_ID, { waitUntil: 'domcontentloaded' });
    await interruptorDe(page).click({ timeout: 30_000 });
    await expect(page.getByTestId('auto-reservable-hoja')).toContainText(/Si cumples las reglas de tu estudio, se te da al momento/);
  });

  test('pedida: sale pendiente y anularla manda SU petición; solo se apaga cuando el servidor lo confirma', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { pedida: true });
    const visto = await contarPeticiones(page, { status: 200, body: { ok: true } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await expect(interruptor).toHaveAttribute('data-estado', 'pendiente', { timeout: 30_000 });
    await interruptor.click();
    expect(visto.intentos, 'abrir la confirmación no envía nada').toBe(0);
    await page.getByRole('button', { name: 'Anular la petición' }).click();
    await expect(interruptor).toHaveAttribute('data-estado', 'apagado', { timeout: 30_000 });
    expect(visto.intentos).toBe(1);
    expect(visto.cuerpo).toMatchObject({ accion: 'cancelar_peticion', solicitudId: 'spf-1' });
  });

  test('ya es suya: encendida; apagarla pide confirmación con lo que pasa con sus clases y solo se apaga cuando el servidor la deja', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { laTiene: true });
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plazas: 1, canceladas: 3, mantenidas: 1, fallidas: 0, sinDejar: 0 }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido', { timeout: 30_000 });
    await expect(page.getByTestId('auto-reservable')).toContainText('Ya es tu clase fija ✓');

    await interruptor.click();
    const aviso = page.getByTestId('dejar-aviso');
    await expect(aviso).toContainText('Se cancelan las clases que tienes reservadas');
    await expect(aviso).not.toContainText('los dejas todos');
    expect(intentos, 'abrir la confirmación no envía nada').toBe(0);
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido');

    await page.getByRole('button', { name: 'Sí, dejarla' }).click();
    await expect(interruptor).toHaveAttribute('data-estado', 'apagado', { timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'dejar_plaza', plazaId: 'pf-1' });
    expect(Object.keys(cuerpo as object)).not.toContain('socioId');
  });

  test('si el servidor dice que no se pudo dejar, sigue encendida y se enseña el motivo', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { laTiene: true });
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'No se ha podido dejar tu clase fija. Inténtalo de nuevo o habla con tu estudio.' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido', { timeout: 30_000 });
    await interruptor.click();
    await page.getByRole('button', { name: 'Sí, dejarla' }).click();
    await expect(page.getByTestId('dejar-aviso').getByRole('alert')).toContainText('No se ha podido dejar tu clase fija', { timeout: 30_000 });
    expect(intentos, 'el camino de fallo sí lo intentó').toBeGreaterThan(0);
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido');
  });

  test('una plaza que salió de una clase fija con nombre (de antes de retirarlas): encendida, y al dejarla avisa de que deja todos sus días', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { laTiene: true, deClaseFijaConNombre: true });
    await contarPeticiones(page, { status: 200, body: { ok: true, plazas: 2, canceladas: 4, mantenidas: 0, fallidas: 0, sinDejar: 0 } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido', { timeout: 30_000 });
    await interruptor.click();
    await expect(page.getByTestId('dejar-aviso')).toContainText('Es una clase fija de varios días: los dejas todos.');
  });

  test('⚠️ tras activarla, la ficha de detrás vuelve a leer sus datos (puede que esta clase ya esté reservada)', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    let lecturas = 0;
    // Registrado DESPUÉS del andamiaje: cuenta y deja pasar a su respuesta.
    await page.route('**/api/public/studio-data', async (r) => { lecturas++; await r.fallback(); });
    await contarPeticiones(page, { status: 200, body: { ok: true, solicitudId: 'spf-9', resuelta: true, mensaje: 'Confirmada.' } });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const interruptor = interruptorDe(page);
    await interruptor.click({ timeout: 30_000 });
    await expect.poll(() => lecturas, { timeout: 15_000 }).toBeGreaterThan(0);
    const antes = lecturas;
    await page.getByTestId('auto-reservable-hoja').getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await expect(interruptor).toHaveAttribute('data-estado', 'encendido', { timeout: 30_000 });
    await expect.poll(() => lecturas, { timeout: 15_000 }).toBeGreaterThan(antes);
  });

  test('sin franja que se repita, o con el catálogo roto, la ficha queda como estaba y no se frena la reserva', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { sinFranjas: true });
    let pedidos = 0;
    await page.route('**/api/public/clases-fijas', (r) => { pedidos++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ofertas: [], pedidas: [], sueltas: [] }) }); });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Reservar$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => pedidos, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('auto-reservable')).toHaveCount(0);

    // Una respuesta con otra forma: la ficha no puede dar por hecha la forma.
    let rotos = 0;
    await page.route('**/api/public/clases-fijas', (r) => { rotos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Reservar$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => rotos, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('auto-reservable')).toHaveCount(0);
  });

  test('sin cuota ni bono: no hay interruptor que no va a funcionar, solo qué haría falta', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'ninguno');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('clase-fija-solo-cuota')).toContainText('Con una cuota que incluya esta clase', { timeout: 30_000 });
    await expect(interruptorDe(page)).toHaveCount(0);
    await expect(page.getByTestId('reservar-proximas')).toHaveCount(0);
    expect(visto.intentos, 'nada sale hacia el servidor').toBe(0);
  });

  // ── Con bono: «reservar las próximas clases», N reservas NORMALES (no una clase fija), cada una descontando su sesión ──
  const OCURRENCIAS = [
    { sesionId: 'ses-10', fecha: '2026-08-12', hora: '12:00', resultado: 'SE_RESERVARA', pagador: 'bono' },
    { sesionId: 'ses-11', fecha: '2026-08-19', hora: '12:00', resultado: 'SE_RESERVARA', pagador: 'bono' },
    { sesionId: 'ses-12', fecha: '2026-08-26', hora: '12:00', resultado: 'SE_RESERVARA', pagador: 'bono' },
    { sesionId: 'ses-13', fecha: '2026-09-02', hora: '12:00', resultado: 'SE_RESERVARA', pagador: 'bono' },
  ];
  const datosProximas = (accion: 'previsualizar' | 'reservar', oc: Record<string, unknown>[], saldoDespues: number, paro: unknown = null) => ({
    ok: true, accion, n: oc.length,
    ocurrencias: oc,
    bono: { suscripcionId: 'sus-b', plan: 'Bono 8 sesiones', saldoAntes: 5, saldoDespues, fechaFin: '2026-12-31' },
    resumen: {
      reservadas: oc.filter((o) => o.resultado === 'SE_RESERVARA' || o.resultado === 'RESERVADA').length,
      descontadas: oc.filter((o) => (o.resultado === 'SE_RESERVARA' || o.resultado === 'RESERVADA') && o.pagador === 'bono').length,
      pedidas: oc.length, paro,
    },
  });
  /** Monta el mock del lote y cuenta lo que sale hacia el servidor, separando mirar de reservar. */
  async function montarLote(page: Page, opts: { reservar?: (cuerpo: Record<string, unknown>, intento: number) => { status: number; body: unknown } | 'caida'; previo?: { status: number; body: unknown } } = {}) {
    const visto = { previsualizaciones: [] as Record<string, unknown>[], reservas: [] as Record<string, unknown>[] };
    await page.route('**/api/public/reserva-proximas', async (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      if (cuerpo.accion === 'previsualizar') {
        visto.previsualizaciones.push(cuerpo);
        const n = Number(cuerpo.n);
        const respuesta = opts.previo ?? { status: 200, body: datosProximas('previsualizar', OCURRENCIAS.slice(0, n), 5 - Math.min(n, OCURRENCIAS.length)) };
        return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
      }
      visto.reservas.push(cuerpo);
      const hecho = opts.reservar?.(cuerpo, visto.reservas.length) ?? { status: 200, body: datosProximas('reservar', OCURRENCIAS.map((o) => ({ ...o, resultado: 'RESERVADA' })), 1) };
      if (hecho === 'caida') return r.abort('failed');
      return r.fulfill({ status: hecho.status, contentType: 'application/json', body: JSON.stringify(hecho.body) });
    });
    return visto;
  }

  test('solo con bono: no hay interruptor de clase fija; enseña qué se reservaría y cuántas sesiones se descontarán, sin reservar al mirar', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await montarLote(page);
    const peticionesFija = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    const bloque = page.getByTestId('reservar-proximas');
    await expect(bloque).toBeVisible({ timeout: 30_000 });
    await expect(interruptorDe(page)).toHaveCount(0);
    // Con 5 sesiones: 2, 4 y «todas las que me quedan».
    await expect(bloque.getByRole('button', { name: '2 clases', exact: true })).toBeVisible();
    await expect(bloque.getByRole('button', { name: '4 clases', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(bloque.getByRole('button', { name: 'Todas las que me quedan (5)' })).toBeVisible();
    await expect(bloque.getByRole('button', { name: '8 clases', exact: true })).toHaveCount(0);

    await expect(bloque.getByTestId('proxima-ocurrencia')).toHaveCount(4, { timeout: 30_000 });
    await expect(bloque.getByTestId('proximas-resumen')).toHaveText('Se reservarán 4 clases y se descontarán 4 sesiones de tu «Bono 8 sesiones»: te quedarán 1.');
    await expect(bloque).toContainText('No se renueva sola');
    // Mirar no reserva nada: solo previsualizaciones, sin intento.
    expect(visto.previsualizaciones.length).toBeGreaterThan(0);
    expect(visto.reservas, 'mirar no reserva').toHaveLength(0);
    expect(Object.keys(visto.previsualizaciones[0])).not.toContain('intentoId');
    expect(peticionesFija.intentos, 'no se pide ninguna clase fija').toBe(0);
  });

  test('reservar: UNA petición con su intento, y lo que se pinta es lo que contestó el servidor («3 de 4», con la parada)', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const parcial = datosProximas('reservar', [
      { ...OCURRENCIAS[0], resultado: 'RESERVADA' }, { ...OCURRENCIAS[1], resultado: 'RESERVADA' }, { ...OCURRENCIAS[2], resultado: 'RESERVADA' },
      { ...OCURRENCIAS[3], resultado: 'SIN_DERECHO', codigo: 'bono-no-cubre', pagador: undefined },
    ], 0, { motivo: 'SIN_DERECHO', desdeSesionId: 'ses-13' });
    const visto = await montarLote(page, { reservar: () => ({ status: 200, body: parcial }) });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const bloque = page.getByTestId('reservar-proximas');
    await expect(bloque.getByTestId('proxima-ocurrencia')).toHaveCount(4, { timeout: 30_000 });

    await bloque.getByRole('button', { name: 'Reservar 4 clases' }).click();
    await expect(bloque.getByTestId('proximas-hecho')).toHaveText(
      'Reservadas 3 de 4 · se han descontado 3 sesiones de tu bono; te quedan 0 · tu bono se ha quedado sin sesiones: no se reservaron las últimas.',
      { timeout: 30_000 },
    );
    expect(visto.reservas.length, 'la petición salió de verdad').toBe(1);
    expect(visto.reservas[0]).toMatchObject({ accion: 'reservar', n: 4 });
    // El intento: 16-64 caracteres seguros, y NUNCA el prefijo de las plazas fijas.
    expect(String(visto.reservas[0].intentoId)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(String(visto.reservas[0].intentoId)).not.toMatch(/^pf[-_]/i);
    expect(Object.keys(visto.reservas[0])).not.toContain('socioId');
    await expect(bloque.getByRole('button', { name: /^Reservar \d+ clases$/ })).toHaveCount(0);
  });

  test('doble toque: exactamente UNA petición de reservar', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    let liberar: () => void = () => {};
    const espera = new Promise<void>((res) => { liberar = res; });
    const reservas: Record<string, unknown>[] = [];
    await page.route('**/api/public/reserva-proximas', async (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      if (cuerpo.accion === 'previsualizar') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datosProximas('previsualizar', OCURRENCIAS, 1)) });
      }
      reservas.push(cuerpo);
      await espera;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(datosProximas('reservar', OCURRENCIAS.map((o) => ({ ...o, resultado: 'RESERVADA' })), 1)) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const bloque = page.getByTestId('reservar-proximas');
    const boton = bloque.getByRole('button', { name: 'Reservar 4 clases' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();
    await expect(bloque.getByRole('button', { name: /Un momento/ })).toBeDisabled();
    await bloque.getByRole('button', { name: /Un momento/ }).click({ force: true, timeout: 2_000 }).catch(() => {});
    liberar();
    await expect(bloque.getByTestId('proximas-hecho')).toBeVisible({ timeout: 30_000 });
    expect(reservas, 'UNA sola petición de reservar').toHaveLength(1);
  });

  test('si la red cae al reservar, no se dice que sí y el reintento lleva el MISMO intento (no duplica)', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await montarLote(page, { reservar: (_c, vez) => (vez === 1 ? 'caida' : { status: 200, body: datosProximas('reservar', OCURRENCIAS.map((o) => ({ ...o, resultado: 'RESERVADA', repetida: true })), 1) }) });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const bloque = page.getByTestId('reservar-proximas');
    await expect(bloque.getByRole('button', { name: 'Reservar 4 clases' })).toBeVisible({ timeout: 30_000 });
    await bloque.getByRole('button', { name: 'Reservar 4 clases' }).click();

    await expect(bloque.getByTestId('proximas-error')).toContainText('no sabemos si se ha reservado alguna', { timeout: 30_000 });
    await expect(bloque.getByTestId('proximas-hecho')).toHaveCount(0);
    expect(visto.reservas.length, 'el intento salió de verdad').toBe(1);

    await bloque.getByRole('button', { name: 'Reservar 4 clases' }).click();
    await expect(bloque.getByTestId('proximas-hecho')).toBeVisible({ timeout: 30_000 });
    expect(visto.reservas).toHaveLength(2);
    expect(visto.reservas[1].intentoId, 'el reintento es el MISMO intento').toBe(visto.reservas[0].intentoId);
  });

  test('cambiar cuántas clases vuelve a mirar y abre un intento NUEVO; si el servidor dice que no, se enseña el motivo', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await montarLote(page, { reservar: () => ({ status: 409, body: { error: 'Para reservar varias clases de una vez necesitas un bono con sesiones que cubra esta clase.', codigo: 'sin-bono' } }) });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const bloque = page.getByTestId('reservar-proximas');
    await expect(bloque.getByTestId('proxima-ocurrencia')).toHaveCount(4, { timeout: 30_000 });
    await bloque.getByRole('button', { name: '2 clases', exact: true }).click();
    await expect(bloque.getByTestId('proxima-ocurrencia')).toHaveCount(2, { timeout: 30_000 });
    expect(visto.previsualizaciones.map((p) => p.n)).toEqual(expect.arrayContaining([4, 2]));

    await bloque.getByRole('button', { name: 'Reservar 2 clases' }).click();
    await expect(bloque.getByTestId('proximas-error')).toContainText('necesitas un bono con sesiones', { timeout: 30_000 });
    expect(visto.reservas.length, 'el camino de fallo sí intentó reservar').toBe(1);
    await expect(bloque.getByTestId('proximas-hecho')).toHaveCount(0);
  });

  test('con cuota no sale: ahí se activa la clase fija, no se reserva por bono', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await montarLote(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(interruptorDe(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('reservar-proximas')).toHaveCount(0);
    expect(visto.previsualizaciones, 'ni mira').toHaveLength(0);
  });
});

// ── Las pantallas retiradas el 4-oct-2026 llevan a su sitio, para los enlaces viejos ──
test.describe('Student PWA · clases fijas · enlaces viejos', () => {
  test.describe.configure({ timeout: 120_000 });

  test('«Clases fijas» lleva a Mis clases → Fijas, y la ficha aparte a la ficha de la clase; el horario ya no tiene la puerta', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${base}/mis-reservas\\?tab=fijas$`), { timeout: 30_000 });
    await page.goto(`${base}/clases-fijas/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`${base}/reservar/${SESION_ID}$`), { timeout: 30_000 });
    await expect(interruptorDe(page)).toBeVisible({ timeout: 30_000 });

    await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('entrada-clases-fijas')).toHaveCount(0);
  });

  test('Mis clases → Fija sin ninguna dice qué es, cómo se pide y lleva al horario', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    await page.goto(`${base}/mis-reservas?tab=fijas`, { waitUntil: 'domcontentloaded' });
    const vacia = page.getByTestId('clase-fija-vacia');
    await expect(vacia.getByRole('heading', { name: 'Tu hueco, cada semana' })).toBeVisible({ timeout: 30_000 });
    // En e2e el estudio deja pedirla desde la app (E2E_PLAZA_FIJA_APP): los pasos hablan del interruptor.
    // Sin ese ajuste dicen «Pídesela a tu estudio» (lo fija `clase-fija-vista.test.ts`: es del servidor, no se cambia por test).
    await expect(vacia.getByRole('listitem')).toHaveText([/Abre la clase a la que vas siempre$/, /Activa «Clase fija» y elige hasta cuándo$/, /Tu estudio la confirma y ya está$/]);
    // El interruptor de muestra no es un control de verdad: nada que tocar aquí.
    await expect(vacia.getByRole('switch')).toHaveCount(0);
    await expect(vacia.getByRole('link', { name: 'Ver el horario' })).toHaveAttribute('href', `${base}/reservar`);
  });
});


// ── Su clase fija: qué ve cuando ya la tiene ─────────────────────────────────
//
// Los estudios decían que no tenían claro que la alumna NO reserva. Su tarjeta
// tiene que decir que la plaza está reservada sola, enseñar las próximas clases
// que ya tiene y dejar que falte UNA semana sin tocar la clase fija. Con lo que
// SÍ hace el servidor: se cancela solo la reserva de esa semana (`res-pf-`).

// ⚠️ Con su desfase (+02:00, verano en Madrid), NO como las del resto del fixture
// (`2026-08-12T10:00:00`, sin zona). Sin él el navegador las lee en su zona local y
// la hora del estudio sale 10:00 en una máquina en Madrid y 12:00 en el CI (UTC):
// la plaza fija de las 10:00 dejaba de coincidir con sus clases y «Próximas
// clases» salía vacía solo en el CI. Aquí la hora tiene que ser SIEMPRE la misma.
const CLASES_FIJAS = [
  { id: 'res-pf-s20', sesion: 'ses-20', inicio: '2026-08-13T10:00:00+02:00', fin: '2026-08-13T10:50:00+02:00' },
  { id: 'res-pf-s21', sesion: 'ses-21', inicio: '2026-08-20T10:00:00+02:00', fin: '2026-08-20T10:50:00+02:00' },
  { id: 'res-pf-s22', sesion: 'ses-22', inicio: '2026-08-27T10:00:00+02:00', fin: '2026-08-27T10:50:00+02:00' },
];

// Los jueves siguientes, también en horario de verano (+02:00): el motor reserva la
// clase fija con meses de antelación, y «Mis clases» no puede volverse una lista de
// medio año.
const JUEVES_EXTRA = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];

async function montarConClaseFija(page: Page, opts: {
  reservaAMano?: boolean; masFijas?: number;
  /** Estado distinto de CONFIRMADA para alguna reserva de la clase fija (por id). */
  estados?: Record<string, string>;
  /** Reservas de la clase fija que NO existen: la clase está, la reserva no. */
  sinReserva?: string[];
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const sesiones = f.sesiones as unknown[];
  const clasesFijas = [
    ...CLASES_FIJAS,
    ...JUEVES_EXTRA.slice(0, opts.masFijas ?? 0).map((dia, i) => ({
      id: `res-pf-x${i}`, sesion: `ses-x${i}`, inicio: `${dia}T10:00:00+02:00`, fin: `${dia}T10:50:00+02:00`,
    })),
  ];
  for (const c of clasesFijas) {
    sesiones.push({ id: c.sesion, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: c.inicio, fin: c.fin, aforoMaximo: 10, cancelada: false });
  }
  const socia = f.socia as Record<string, unknown>;
  // El reloj de `sembrarSociaLista` es el 2026-08-12: los jueves 13, 20 y 27 a las 10:00 (hora del fixture).
  socia.plazasFijas = [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  socia.reservas = [
    ...clasesFijas.filter((c) => !opts.sinReserva?.includes(c.id)).map((c) => ({
      id: c.id, sesionId: c.sesion, socioId: SOCIO_ID, estado: opts.estados?.[c.id] ?? 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null,
    })),
    // Una reserva de una vez, en OTRO día: no es de su clase fija y no puede salir en «Próximas clases».
    ...(opts.reservaAMano ? [{ id: 'res-mano-1', sesionId: 'ses-10', socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-02T00:00:00Z', posicionEspera: null }] : []),
  ];
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
}

test.describe('Student PWA · tu clase fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('dice que la plaza está reservada sola y enseña las próximas clases que ya tiene', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByTestId('clase-fija-mia')).toContainText('Jueves 10:00');
    await expect(tarjeta.getByTestId('clase-fija-mia')).toContainText('Reformer · Sala 1 · con Ana');
    await expect(tarjeta.getByTestId('plaza-fija-reservada-sola')).toHaveText('Se reserva sola cada semana. Tú solo avisa si un día no vas.');

    // Las tres que el motor le tiene reservadas, y NO la que reservó a mano.
    const proximas = tarjeta.getByTestId('proximas-clases-fijas');
    await expect(proximas.getByText('Próximas semanas')).toBeVisible();
    await expect(proximas.locator('[data-testid="semana-clase-fija"][data-estado="va"]')).toHaveCount(3);
    await expect(proximas.getByRole('button', { name: /No puedo asistir$/ })).toHaveCount(3);
    // Y cómo dejarla o cambiarla: no se hace desde la app, se escribe al estudio.
    await expect(tarjeta.getByRole('link', { name: 'Escribir al estudio' })).toHaveAttribute('href', `${base}/mensajes`);
  });

  test('su próxima clase abre su ficha, como en el horario; y cada día del mes, la suya', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    // El día y la hora de su tarjeta llevan a la ficha de la PRÓXIMA (donde se ve y se cancela ese día).
    await expect(tarjeta.getByTestId('enlace-clase-fija')).toHaveCount(1);
    // Las semanas con su reserva son «no voy» (un botón), no un enlace: no abren la ficha.
    await expect(tarjeta.getByTestId('proximas-clases-fijas').getByRole('button', { name: /No puedo asistir$/ })).toHaveCount(3);
    // Cada día, a su ficha: en «Ver el mes entero».
    await tarjeta.getByTestId('ver-mes-clase-fija').getByRole('button').click();
    await expect(page.getByTestId('calendario-clase-fija').locator('[data-fecha="2026-08-20"]')).toHaveAttribute('href', `${base}/reservar/ses-21`);
    await page.keyboard.press('Escape');
    await tarjeta.getByTestId('enlace-clase-fija').click();
    await expect(page).toHaveURL(new RegExp(`${base}/reservar/ses-20$`), { timeout: 30_000 });
  });

  test('«No puedo asistir» cancela SOLO esa semana y dice que su clase fija sigue', async ({ page }) => {
    await montarConClaseFija(page);
    const cancelaciones: Record<string, unknown>[] = [];
    await page.route('**/api/public/reserva', (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      if (r.request().method() !== 'POST' || cuerpo.accion !== 'cancelar') return r.continue();
      cancelaciones.push(cuerpo);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: false }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: /No puedo asistir$/ }).first().click();

    // Antes de confirmar se le dice qué toca: solo esta clase, y nada de «tu bono».
    const aviso = page.getByTestId('no-puedo-aviso');
    await expect(aviso).toContainText('Solo cancelas esta clase. Tu clase fija de los jueves sigue activa');
    await expect(aviso).not.toContainText('bono');
    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();

    await expect(tarjeta.getByTestId('no-voy-resultado')).toContainText('Mañana: no vas. Tu clase fija sigue activa.', { timeout: 30_000 });
    // Un camino que no llega a cancelar nada «no miente», y no probaría nada.
    expect(cancelaciones.length).toBeGreaterThan(0);
    expect(cancelaciones[0]).toMatchObject({ reservaId: 'res-pf-s20' });
    expect(cancelaciones, 'solo esa semana, no la recurrencia').toHaveLength(1);
  });

  test('«Mis clases»: la de su clase fija lo dice y no habla de bono; la de una vez es una reserva normal', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    // La reservada a mano NO es de su clase fija, aunque coincidiera el horario.
    await expect(page.getByText('Reservada ✓')).toHaveCount(1);

    await page.getByRole('button', { name: /^Cancelar$/ }).nth(1).click();
    const aviso = page.getByTestId('cancelar-clase-fija-aviso');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('Tu clase fija de los jueves sigue activa');
    await expect(page.getByText(/sesión de tu bono/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sí, no puedo asistir' })).toBeVisible();
  });

  test('«Mis clases»: con muchas clases fijas ya reservadas se enseñan las primeras y se dice cuántas más hay', async ({ page }) => {
    // 9 clases fijas + 1 reserva a mano. Las de la clase fija se acotan a las 6 primeras; la
    // reservada a mano no se acota nunca.
    await montarConClaseFija(page, { reservaAMano: true, masFijas: 6 });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu clase fija ✓')).toHaveCount(6);
    await expect(page.getByText('Reservada ✓')).toHaveCount(1);
    await expect(page.getByTestId('fijas-ocultas')).toHaveText('Y 3 clases más de tu clase fija, ya reservadas: irán apareciendo aquí según se acerquen.');
  });

  test('«Mis clases»: con pocas clases fijas no hay nada que acotar ni aviso de «más»', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu clase fija ✓')).toHaveCount(3);
    await expect(page.getByTestId('fijas-ocultas')).toHaveCount(0);
  });
});

// ── El calendario del mes ────────────────────────────────────────────────────
//
// Sus días marcados, como en cualquier app de reservas que la alumna conozca. Lo
// que se defiende: que un check sea una reserva que EXISTE (no «le toca los
// jueves»), que el día que no va se vea distinto, y que un día sin reserva lo
// diga en vez de pintar un check que nadie ha hecho.
test.describe('Student PWA · tu clase fija · calendario del mes', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  const dia = (page: Page, fecha: string) => page.getByTestId('calendario-clase-fija').locator(`[data-testid="dia-clase-fija"][data-fecha="${fecha}"]`);
  // El calendario es el mismo de siempre, ahora en una hoja: «Ver el mes entero».
  const abrirMes = async (page: Page) => {
    await page.getByTestId('ver-mes-clase-fija').getByRole('button').click({ timeout: 30_000 });
  };

  test('marca los jueves que ya tiene reservados y cada día abre su clase', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await abrirMes(page);
    const cal = page.getByTestId('calendario-clase-fija');
    await expect(cal).toBeVisible({ timeout: 30_000 });
    await expect(cal.getByText('Agosto de 2026', { exact: true })).toBeVisible();
    for (const [fecha, sesion] of [['2026-08-13', 'ses-20'], ['2026-08-20', 'ses-21'], ['2026-08-27', 'ses-22']]) {
      await expect(dia(page, fecha).locator('[data-marca="RESERVADA"]')).toHaveCount(1);
      await expect(dia(page, fecha)).toHaveAttribute('href', `${base}/reservar/${sesion}`);
    }
    // Un miércoles no le toca: ni marca ni enlace.
    await expect(cal.locator('[data-fecha="2026-08-19"]')).toHaveCount(0);
    await expect(cal.getByRole('list', { name: 'Leyenda' })).toContainText('Reservada');
    await expect(page.getByTestId('clase-fija-cambios')).toContainText('¿Un día no puedes venir?');
  });

  test('el día que no va sale distinto, y un día con clase sin reserva lo dice', async ({ page }) => {
    await montarConClaseFija(page, { estados: { 'res-pf-s21': 'CANCELADA' }, sinReserva: ['res-pf-s22'] });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    // Las píldoras de las próximas semanas dicen lo mismo que el calendario.
    const semanas = page.getByTestId('semana-clase-fija');
    await expect(semanas).toHaveCount(3, { timeout: 30_000 });
    await expect(semanas.nth(0)).toHaveAttribute('data-estado', 'va');
    await expect(semanas.nth(1)).toHaveAttribute('data-estado', 'no-va');
    await expect(semanas.nth(2)).toHaveAttribute('data-estado', 'sin-reservar');
    await abrirMes(page);
    await expect(page.getByTestId('calendario-clase-fija')).toBeVisible({ timeout: 30_000 });
    await expect(dia(page, '2026-08-13').locator('[data-marca="RESERVADA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-20').locator('[data-marca="NO_VA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-27').locator('[data-marca="SIN_RESERVA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-27')).toHaveAttribute('aria-label', /jueves 27 de agosto: 10:00, sin reservar/);
    await expect(page.getByText('Si un día sale sin reservar, pregúntale a tu estudio')).toBeVisible();
  });

  test('se pasa de mes hasta donde hay clases, y no antes de hoy', async ({ page }) => {
    // Con los jueves de septiembre y los dos primeros de octubre también reservados.
    await montarConClaseFija(page, { masFijas: 6 });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await abrirMes(page);
    const cal = page.getByTestId('calendario-clase-fija');
    await expect(cal).toBeVisible({ timeout: 30_000 });
    await expect(cal.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();

    await cal.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(cal.getByText('Septiembre de 2026', { exact: true })).toBeVisible();
    for (const fecha of ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']) {
      await expect(dia(page, fecha).locator('[data-marca="RESERVADA"]')).toHaveCount(1);
    }

    await cal.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(cal.getByText('Octubre de 2026', { exact: true })).toBeVisible();
    await expect(cal.getByTestId('dia-clase-fija')).toHaveCount(2);
    await expect(cal.getByRole('button', { name: 'Mes siguiente' }).first()).toBeDisabled();

    await cal.getByRole('button', { name: 'Mes anterior' }).click();
    await cal.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(cal.getByText('Agosto de 2026', { exact: true })).toBeVisible();
  });

  test('en Inicio (tarjeta compacta) no sale el calendario', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(base);
    await expect(page.getByTestId('plaza-fija')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('calendario-clase-fija')).toHaveCount(0);
  });
});

// ── «No voy» desde las próximas semanas (rediseño del 5-oct-2026) ─────────────
//
// Un toque en una semana = «no voy», por la MISMA vía que «No puedo asistir»
// (cancelar esa reserva, con su confirmación). La píldora cambia solo con lo que
// contesta el servidor; con un no, se queda como estaba. Siempre con contador:
// un camino que no llega a pedir nada «no miente», y no probaría nada.
test.describe('Student PWA · tu clase fija · no voy', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  type Respuesta = { status: number; body: unknown };
  async function rutaReserva(page: Page, respuestas: { cancelar: Respuesta; crear?: Respuesta }) {
    const cuenta = { cancelar: 0, crear: 0, cuerpos: [] as Record<string, unknown>[] };
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      cuenta.cuerpos.push(cuerpo);
      const res = cuerpo.accion === 'cancelar' ? respuestas.cancelar : cuerpo.accion === 'crear' ? respuestas.crear : undefined;
      if (!res) return r.continue();
      if (cuerpo.accion === 'cancelar') cuenta.cancelar++; else cuenta.crear++;
      return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
    });
    return cuenta;
  }
  const CANCELADA_A_TIEMPO = { status: 200, body: { ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: false } };

  test('un toque: confirmación, UNA petición, y la semana pasa a «No vas» solo con el sí del servidor', async ({ page }) => {
    await montarConClaseFija(page);
    const cuenta = await rutaReserva(page, { cancelar: CANCELADA_A_TIEMPO });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const primera = page.getByTestId('semana-clase-fija').first();
    await expect(primera).toHaveAttribute('data-estado', 'va', { timeout: 30_000 });

    await primera.click();
    await expect(page.getByTestId('no-puedo-aviso')).toBeVisible();
    expect(cuenta.cancelar, 'abrir la confirmación no cancela nada').toBe(0);
    await expect(primera).toHaveAttribute('data-estado', 'va');

    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();
    await expect(page.getByTestId('no-voy-resultado')).toContainText('Mañana: no vas. Tu clase fija sigue activa.', { timeout: 30_000 });
    expect(cuenta.cancelar).toBe(1);
    expect(cuenta.cuerpos[0]).toMatchObject({ accion: 'cancelar', reservaId: 'res-pf-s20' });
    await expect(page.getByTestId('semana-clase-fija').first()).toHaveAttribute('data-estado', 'no-va');
    // A tiempo y sin recuperación: volver a reservarla deja todo como estaba, así que se ofrece deshacer.
    await expect(page.getByTestId('no-voy-resultado').getByRole('button', { name: 'Deshacer' })).toBeVisible();
  });

  test('si el servidor dice que no (4xx), la semana NO cambia y la confirmación sigue abierta', async ({ page }) => {
    await montarConClaseFija(page);
    const cuenta = await rutaReserva(page, { cancelar: { status: 409, body: { error: 'La clase ya ha empezado: no se puede cancelar.' } } });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const primera = page.getByTestId('semana-clase-fija').first();
    await expect(primera).toHaveAttribute('data-estado', 'va', { timeout: 30_000 });
    await primera.click();
    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();

    await expect(page.getByText('La clase ya ha empezado: no se puede cancelar.')).toBeVisible({ timeout: 30_000 });
    expect(cuenta.cancelar, 'la petición salió de verdad').toBeGreaterThan(0);
    await expect(primera).toHaveAttribute('data-estado', 'va');
    await expect(page.getByTestId('no-voy-resultado')).toHaveCount(0);
    await expect(page.getByTestId('no-puedo-aviso')).toBeVisible();
  });

  test('con una clase para recuperar ya creada, se dice hasta cuándo y NO se ofrece deshacer (sería una clase de regalo)', async ({ page }) => {
    await montarConClaseFija(page);
    await rutaReserva(page, { cancelar: { status: 200, body: { ...CANCELADA_A_TIEMPO.body, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-11' } } });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await page.getByTestId('semana-clase-fija').first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();
    const linea = page.getByTestId('no-voy-resultado');
    await expect(linea).toContainText(/Tienes una clase para recuperar hasta el \w+ 11 \w+/, { timeout: 30_000 });
    await expect(linea.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  });

  test('«Deshacer» vuelve a reservar por la reserva de siempre (UNA petición) y dice lo que contestó, aunque ya no haya sitio', async ({ page }) => {
    await montarConClaseFija(page);
    const cuenta = await rutaReserva(page, {
      cancelar: CANCELADA_A_TIEMPO,
      crear: { status: 200, body: { ok: true, estado: 'LISTA_ESPERA', reservaId: 'res-nueva', posicionEspera: 2 } },
    });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await page.getByTestId('semana-clase-fija').first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();
    await page.getByTestId('no-voy-resultado').getByRole('button', { name: 'Deshacer' }).click({ timeout: 30_000 });

    await expect(page.getByTestId('deshacer-resultado')).toHaveText('Ya había cogido el sitio otra persona: estás en la lista de espera (puesto 2).', { timeout: 30_000 });
    expect(cuenta.crear).toBe(1);
    expect(cuenta.cuerpos.find((c) => c.accion === 'crear')).toMatchObject({ accion: 'crear', sesionId: 'ses-20' });
    // No ha vuelto a ir: la semana sigue en «No vas».
    await expect(page.getByTestId('semana-clase-fija').first()).toHaveAttribute('data-estado', 'no-va');
  });
});
