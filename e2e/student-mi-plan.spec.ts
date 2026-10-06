import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, SOCIO_ID, STUDIO_ID, type OpcionesSocia } from './socia-completa';
import { STRIPE_STUB } from './stripe-stub';

// «Clase fija y bonos, ordenados» (maqueta aprobada por el fundador el 6-oct-2026): tres preguntas, tres sitios.
//   · ¿Qué tengo y cuánto me queda? → Mi plan (la pestaña que antes se llamaba «Bonos»), en los tres perfiles.
//   · ¿Cuándo vengo? → Mis clases → «Clase fija», que solo sale a quien tiene cuota o ya tiene clase fija.
//   · Inicio: «Lo tuyo», una línea por cosa y cada una a su sitio.
//   · Comprar y pagar: los recibos pendientes se pagan desde Recibos, con la hoja de siempre. Es DINERO: cada camino de
//     fallo con su contador de peticiones (un «no mintió» sin intento es un test hueco), y lo que cobra el banco NO se
//     ofrece a pagar con tarjeta.
// Reloj: 12-ago-2026, 08:00 de Madrid (miércoles). Corre también en `webkit-publico`: la app de la alumna se usa desde el
// móvil de la socia.

test.describe.configure({ timeout: 150_000 });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const socia = (f: Record<string, unknown>) => f.socia as Record<string, unknown>;
/** La clase del fixture a las 10:00 DE MADRID (con su zona): la clase fija de los miércoles 10:00 cae en ella. */
function conZona(f: Record<string, unknown>) {
  const [s] = f.sesiones as Record<string, unknown>[];
  s.inicio = '2026-08-12T10:00:00+02:00';
  s.fin = '2026-08-12T10:50:00+02:00';
}
const PLAZA = { id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 3, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-08-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-08-01T00:00:00Z' };
const SEMANA = (limite: number, cuentan: number) => ({
  movimientos: null,
  semanas: [{ suscripcionId: 'sus-mes', limite, cuentan, conRecuperacion: 0, porTipo: [], desde: '2026-08-09T22:00:00.000Z', hasta: '2026-08-16T22:00:00.000Z' }],
});

async function montar(page: Page, o: OpcionesSocia & { payload?: (f: Record<string, unknown>) => void; misBonos?: unknown } = {}) {
  const a = await sembrarSociaCompleta(page, { relojMadrid: true, ...o, ajustar: (f) => { conZona(f); o.payload?.(f); } });
  if (o.misBonos) await page.route('**/api/public/mis-bonos', (r) => r.fulfill(json(o.misBonos)));
  return a;
}

async function abrir(page: Page, ruta: string) {
  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible({ timeout: 60_000 });
}

test.describe('Mi plan · los tres perfiles', () => {
  test('con bono: «Tu bono» con su anillo, la tienda y los recibos; lo anterior, plegado', async ({ page }) => {
    const a = await montar(page, {
      bono: 6,
      payload: (f) => {
        (socia(f).suscripciones as unknown[]).push({ id: 'sus-viejo', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 0, fechaInicio: '2026-03-01', fechaFin: '2026-06-30' });
      },
    });
    await abrir(page, '/bonos');
    await expect(page.getByRole('heading', { name: 'Mi plan' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mi plan' })).toHaveAttribute('aria-current', 'page');
    const bono = page.getByTestId('bono-hero');
    await expect(bono).toContainText('Tu bono');
    await expect(bono.getByTestId('bono-restantes')).toHaveText('6');
    await expect(bono.getByTestId('bono-caduca')).toHaveText('6 de 8 sesiones · hasta el 31 dic');
    await expect(page.getByTestId('cuota-hero')).toHaveCount(0);
    await expect(page.getByTestId('mi-plan-tienda')).toContainText('Tienda');
    await expect(page.getByTestId('mi-plan-tienda').getByRole('link')).toHaveAttribute('href', `${base}/comprar`);
    await expect(page.getByTestId('mi-plan-recibos').getByRole('link')).toHaveAttribute('href', `${base}/pagos`);
    // «Anteriores (1)», plegado: el bono gastado no se ve hasta pedirlo.
    const anteriores = page.getByTestId('mi-plan-anteriores');
    await expect(anteriores).toHaveText(/Anteriores \(1\)/);
    await expect(anteriores).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Expirado')).toHaveCount(0);
    await anteriores.click();
    await expect(anteriores).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Expirado')).toBeVisible();
    expect(a.sinMockear()).toEqual([]);
  });

  test('con cuota y clase fija: esta semana, la próxima renovación y la clase fija en una línea', async ({ page }) => {
    const a = await montar(page, {
      bono: null, cuota: { limiteSemanal: 2 }, misBonos: SEMANA(2, 1),
      payload: (f) => { socia(f).plazasFijas = [PLAZA]; },
    });
    await abrir(page, '/bonos');
    const cuota = page.getByTestId('cuota-hero');
    await expect(cuota).toContainText('Tu cuota');
    await expect(cuota.getByTestId('semana-cifra')).toHaveText('1 de 2', { timeout: 30_000 });
    await expect(cuota.getByTestId('semana-queda')).toHaveText('Te queda 1 clase hasta el domingo.');
    await expect(cuota.getByTestId('cuota-vigencia')).toHaveText('Próxima renovación: 1 ene · 89 €');
    const fija = cuota.getByTestId('cuota-fija');
    await expect(fija).toContainText('Tu clase fija: miércoles 10:00');
    await expect(fija).toContainText('Próxima: hoy');
    await expect(fija).toHaveAttribute('href', `${base}/mis-reservas?tab=fija`);
    await expect(page.getByTestId('bono-hero')).toHaveCount(0);
    // Ni «mensualidad», ni «suscripción», ni «sin límite»: cuota.
    await expect(page.getByText(/mensualidad|suscripci|sin límite/i)).toHaveCount(0);
    expect(a.sinMockear()).toEqual([]);
  });

  test('con cuota y además un bono: el bono va en «También tienes» y dice cuándo se usa', async ({ page }) => {
    const a = await montar(page, { bono: 4, cuota: true });
    await abrir(page, '/bonos');
    await expect(page.getByTestId('cuota-hero')).toBeVisible({ timeout: 30_000 });
    const bono = page.getByTestId('bono-hero');
    await expect(bono).toContainText('También tienes');
    await expect(bono.getByTestId('bono-se-usa')).toHaveText('Se usa cuando tu cuota no cubre la clase.');
    // La cuota va primero.
    const yCuota = (await page.getByTestId('cuota-hero').boundingBox())!.y;
    const yBono = (await bono.boundingBox())!.y;
    expect(yCuota).toBeLessThan(yBono);
    expect(a.sinMockear()).toEqual([]);
  });

  test('recién llegada sin nada: no se le promete lo que su estudio no vende', async ({ page }) => {
    const a = await montar(page, { bono: null, conTienda: false });
    await abrir(page, '/bonos');
    await expect(page.getByText('Aún no tienes cuota ni bono')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/clases sueltas desde el horario/i)).toHaveCount(0);
    await expect(page.getByTestId('mi-plan-tienda')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver la tienda' })).toHaveCount(0);
    expect(a.sinMockear()).toEqual([]);
  });
});

test.describe('Mis clases → «Clase fija»', () => {
  test('con cuota y sin clase fija: la pestaña sale y explica cómo pedirla', async ({ page }) => {
    await montar(page, { bono: null, cuota: true });
    await abrir(page, '/mis-reservas');
    const tab = page.getByRole('tab', { name: 'Clase fija' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.getByTestId('clase-fija-vacia')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu clase, cada semana' })).toBeVisible();
  });

  test('solo con bono: no hay pestaña «Clase fija» (y `?tab=fija` cae en Próximas)', async ({ page }) => {
    await montar(page, { bono: 5 });
    await abrir(page, '/mis-reservas?tab=fija');
    await expect(page.getByRole('tab', { name: 'Próximas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'Clase fija' })).toHaveCount(0);
    await expect(page.getByTestId('clase-fija-vacia')).toHaveCount(0);
  });

  test('con su clase fija: héroe con «va con tu cuota», sus semanas y las cuatro acciones; sin recuperaciones', async ({ page }) => {
    await montar(page, { bono: null, cuota: true, reservaFija: true, payload: (f) => {
      socia(f).plazasFijas = [PLAZA];
      socia(f).recuperaciones = [{ id: 'r1', studioId: STUDIO_ID, socioId: SOCIO_ID, estado: 'DISPONIBLE', caducaEl: '2026-09-30', motivo: null, origenReservaId: null, usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' }];
    } });
    await abrir(page, '/mis-reservas?tab=fijas');
    await expect(page.getByRole('tab', { name: 'Clase fija' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('clase-fija-hasta')).toHaveText('Sin fecha de fin · va con tu cuota');
    await expect(page.getByTestId('proximas-clases-fijas')).toContainText('Próximas semanas');
    await expect(page.getByTestId('ver-mes-clase-fija')).toContainText('Ver el mes entero');
    await expect(page.getByTestId('cambiar-clase-fija')).toContainText('Escribe al estudio');
    await expect(page.getByTestId('dejar-clase-fija')).toContainText('Dejar mi clase fija');
    // Las recuperaciones viven en Mi plan.
    await expect(page.getByText(/clase por recuperar/)).toHaveCount(0);
  });
});

test.describe('Inicio · «Lo tuyo»', () => {
  test('una tarjeta, una línea por cosa, y cada línea a su sitio', async ({ page }) => {
    const a = await montar(page, {
      bono: 3, cuota: { limiteSemanal: 2 }, misBonos: SEMANA(2, 1),
      payload: (f) => {
        socia(f).plazasFijas = [PLAZA];
        socia(f).recuperaciones = [
          { id: 'r1', studioId: STUDIO_ID, socioId: SOCIO_ID, estado: 'DISPONIBLE', caducaEl: '2026-08-20', motivo: null, origenReservaId: null, usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' },
          { id: 'r2', studioId: STUDIO_ID, socioId: SOCIO_ID, estado: 'DISPONIBLE', caducaEl: '2026-09-20', motivo: null, origenReservaId: null, usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' },
        ];
      },
    });
    await abrir(page, '');
    const loTuyo = page.getByRole('region', { name: 'Lo tuyo' });
    await expect(loTuyo).toBeVisible({ timeout: 45_000 });
    await expect(loTuyo.getByTestId('lo-tuyo-cuota')).toContainText('Tu cuota · te queda 1 esta semana', { timeout: 30_000 });
    await expect(loTuyo.getByTestId('lo-tuyo-cuota')).toContainText('Próxima renovación: 1 ene');
    await expect(loTuyo.getByTestId('lo-tuyo-cuota')).toHaveAttribute('href', `${base}/bonos`);
    await expect(loTuyo.getByTestId('lo-tuyo-bono')).toContainText('Tu bono · 3 de 8');
    await expect(loTuyo.getByTestId('lo-tuyo-fija')).toContainText('Tu clase fija · miércoles 10:00');
    await expect(loTuyo.getByTestId('lo-tuyo-fija')).toHaveAttribute('href', `${base}/mis-reservas?tab=fija`);
    await expect(loTuyo.getByTestId('lo-tuyo-recuperaciones')).toContainText('2 clases por recuperar');
    await expect(loTuyo.getByTestId('lo-tuyo-recuperaciones')).toContainText('La primera caduca el 20 ago');
    await expect(loTuyo.getByTestId('lo-tuyo-recuperaciones')).toHaveAttribute('href', `${base}/bonos`);
    // Ya no hay dos tarjetas: ni «Tu ritmo» ni la tarjeta suelta de la clase fija.
    await expect(page.getByRole('region', { name: 'Tu ritmo' })).toHaveCount(0);
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
    expect(a.sinMockear()).toEqual([]);
  });
});

test.describe('Recibos · pagar lo pendiente', () => {
  const RECIBO = { id: 'rec-oct', socioId: SOCIO_ID, concepto: 'Cuota de agosto', importe: 89, estado: 'PENDIENTE', fechaCobro: null, fechaVencimiento: '2026-08-20', metodoCobro: null, suscripcionId: 'sus-mes' };

  async function conDeuda(page: Page, cobro: unknown, checkout: (n: number) => { status: number; body: unknown }) {
    const a = await montar(page, {
      bono: null, cuota: true,
      payload: (f) => {
        (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test_123';
        socia(f).recibos = [RECIBO];
        socia(f).cobroRecibos = { [RECIBO.id]: cobro };
      },
    });
    await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    const cuerpos: Record<string, unknown>[] = [];
    await page.route('**/api/stripe/checkout', (r) => {
      cuerpos.push(r.request().postDataJSON() as Record<string, unknown>);
      const res = checkout(cuerpos.length);
      return r.fulfill(json(res.body, res.status));
    });
    return { a, intentos: () => cuerpos.length, cuerpos };
  }

  test('se paga desde Recibos: la hoja de siempre, a ESE recibo y dentro de la app', async ({ page }) => {
    const m = await conDeuda(page, { como: 'APP' }, () => ({ status: 200, body: { clientSecret: 'cs_test_abc_secret_x', checkoutSessionId: 'cs_test_abc' } }));
    await abrir(page, '/pagos');
    await expect(page.getByRole('heading', { name: 'Recibos' })).toBeVisible();
    const total = page.getByTestId('total-pendiente');
    await expect(total).toContainText('Te queda por pagar');
    await expect(total).toContainText('Cuota de agosto · vence el 20 ago');
    await total.getByRole('button', { name: 'Pagar 89 €' }).click();
    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    expect(m.intentos()).toBeGreaterThan(0);
    expect(m.cuerpos[0]).toMatchObject({ studioId: STUDIO_ID, reciboId: RECIBO.id, origen: 'portal', modo: 'incrustado' });
    // Nada optimista: abrir el pago no dice «Pagado».
    await expect(page.getByRole('heading', { name: 'Pagado' })).toHaveCount(0);
  });

  test('si el servidor dice que no (400), lo dice, no monta Stripe y deja reintentar', async ({ page }) => {
    const m = await conDeuda(page, { como: 'APP' }, () => ({ status: 400, body: { error: 'Este recibo ya no está pendiente de cobro' } }));
    await abrir(page, '/pagos');
    await page.getByTestId('total-pendiente').getByRole('button', { name: 'Pagar 89 €' }).click();
    await expect(page.getByText('Este recibo ya no está pendiente de cobro')).toBeVisible({ timeout: 30_000 });
    expect(m.intentos()).toBeGreaterThan(0);
    await expect(page.getByTestId('checkout-incrustado')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pagado' })).toHaveCount(0);
  });

  test('servidor caído (500): «no se te ha cobrado nada», sin montar Stripe', async ({ page }) => {
    const m = await conDeuda(page, { como: 'APP' }, () => ({ status: 500, body: { error: 'x' } }));
    await abrir(page, '/pagos');
    await page.getByTestId('total-pendiente').getByRole('button', { name: 'Pagar 89 €' }).click();
    await expect(page.getByText(/no se te ha cobrado nada/i).first()).toBeVisible({ timeout: 30_000 });
    expect(m.intentos()).toBeGreaterThan(0);
    await expect(page.getByTestId('checkout-incrustado')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pagado' })).toHaveCount(0);
  });

  test('lo que va a cobrar su banco NO se ofrece a pagar con tarjeta: se dice, y la fecha solo si se sabe', async ({ page }) => {
    const m = await conDeuda(page, { como: 'BANCO', via: 'sepa', desde: '2026-08-20' }, () => ({ status: 200, body: {} }));
    await abrir(page, '/pagos');
    const total = page.getByTestId('total-pendiente');
    await expect(total).toContainText('Lo cobrará tu banco el 20 ago. No tienes que hacer nada.');
    await expect(total.getByRole('button', { name: /^Pagar/ })).toHaveCount(0);
    // Tampoco desde Mi plan.
    await abrir(page, '/bonos');
    await expect(page.getByTestId('cuota-hero')).toBeVisible();
    await expect(page.getByTestId('pago-pendiente')).toHaveCount(0);
    expect(m.intentos(), 'nadie pidió un pago').toBe(0);
  });

  test('una domiciliada en un estudio con remesas: «tu estudio lo pasará a tu banco», sin fecha inventada ni «Pagar»', async ({ page }) => {
    const m = await conDeuda(page, { como: 'BANCO', via: 'remesa', desde: null }, () => ({ status: 200, body: {} }));
    await abrir(page, '/pagos');
    const total = page.getByTestId('total-pendiente');
    await expect(total).toContainText('Tu estudio lo pasará a tu banco. No tienes que hacer nada.');
    await expect(total.getByRole('button', { name: /^Pagar/ })).toHaveCount(0);
    expect(m.intentos(), 'nadie pidió un pago').toBe(0);
  });

  test('en Mi plan, lo que se puede pagar va arriba con el importe en el botón', async ({ page }) => {
    const m = await conDeuda(page, { como: 'APP' }, () => ({ status: 200, body: { clientSecret: 'cs_test_abc_secret_x', checkoutSessionId: 'cs_test_abc' } }));
    await abrir(page, '/bonos');
    const pendiente = page.getByTestId('pago-pendiente');
    await expect(pendiente).toContainText('Pago pendiente');
    await expect(pendiente).toContainText('Cuota de agosto · 89 €');
    const yPago = (await pendiente.boundingBox())!.y;
    const yCuota = (await page.getByTestId('cuota-hero').boundingBox())!.y;
    expect(yPago).toBeLessThan(yCuota);
    await pendiente.getByRole('button', { name: 'Pagar 89 €' }).click();
    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    expect(m.intentos()).toBeGreaterThan(0);
  });
});

// Segunda auditoría (6-oct-2026): la deuda que puede pagar ELLA se veía en Mi plan y Recibos, y en Inicio solo si era el
// recibo de su cuota. Una alumna con bono y un recibo pendiente no lo veía ni en Inicio ni en Perfil. La regla es la
// misma del servidor (`cobroRecibos`): lo que cobra su banco no se le anuncia como algo que tenga que hacer.
test.describe('Inicio y Perfil · lo que tiene por pagar', () => {
  const RECIBO = { id: 'rec-taller', socioId: SOCIO_ID, concepto: 'Taller de suelo pélvico', importe: 35, estado: 'PENDIENTE', fechaCobro: null, fechaVencimiento: '2026-08-20', metodoCobro: null, suscripcionId: null };

  async function conRecibo(page: Page, cobro: unknown, o: OpcionesSocia = { bono: 4 }) {
    return montar(page, {
      ...o,
      payload: (f) => {
        (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test_123';
        socia(f).recibos = [RECIBO];
        socia(f).cobroRecibos = { [RECIBO.id]: cobro };
      },
    });
  }

  test('con bono y un recibo que puede pagar: «Lo tuyo» lo dice primero y lleva a Recibos; Perfil, en la fila de Recibos', async ({ page }) => {
    const a = await conRecibo(page, { como: 'APP' });
    await abrir(page, '');
    const pago = page.getByRole('region', { name: 'Lo tuyo' }).getByTestId('lo-tuyo-pago');
    await expect(pago).toContainText('Pago pendiente · 35 €', { timeout: 45_000 });
    await expect(pago).toContainText('Taller de suelo pélvico · vence el 20 ago');
    await expect(pago).toHaveAttribute('href', `${base}/pagos`);
    const yPago = (await pago.boundingBox())!.y;
    const yBono = (await page.getByTestId('lo-tuyo-bono').boundingBox())!.y;
    expect(yPago).toBeLessThan(yBono);

    await abrir(page, '/perfil');
    await expect(page.getByRole('link', { name: /Recibos/ })).toContainText('35 € por pagar', { timeout: 30_000 });
    expect(a.sinMockear()).toEqual([]);
  });

  test('lo que cobrará su banco no se le pide: ni en Inicio ni en Perfil', async ({ page }) => {
    await conRecibo(page, { como: 'BANCO', via: 'sepa', desde: '2026-08-20' });
    await abrir(page, '');
    await expect(page.getByTestId('lo-tuyo-bono')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('lo-tuyo-pago')).toHaveCount(0);
    await abrir(page, '/perfil');
    await expect(page.getByRole('link', { name: /Recibos/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/por pagar/)).toHaveCount(0);
  });

  test('el recibo de su cuota lo dice la línea de la cuota, sin repetirlo en otra', async ({ page }) => {
    await montar(page, {
      bono: null, cuota: true,
      payload: (f) => {
        (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test_123';
        socia(f).recibos = [{ ...RECIBO, id: 'rec-cuota', concepto: 'Cuota de agosto', importe: 89, suscripcionId: 'sus-mes' }];
        socia(f).cobroRecibos = { 'rec-cuota': { como: 'APP' } };
      },
    });
    await abrir(page, '');
    await expect(page.getByTestId('lo-tuyo-cuota')).toContainText('Pago pendiente · 89 €', { timeout: 45_000 });
    await expect(page.getByTestId('lo-tuyo-pago')).toHaveCount(0);
  });

  test('si el recibo de su cuota lo cobra su banco, la línea de la cuota lo dice así (Inicio y Mi plan), sin «pendiente»', async ({ page }) => {
    await montar(page, {
      bono: null, cuota: true,
      payload: (f) => {
        socia(f).recibos = [{ ...RECIBO, id: 'rec-cuota', concepto: 'Cuota de agosto', importe: 89, suscripcionId: 'sus-mes' }];
        socia(f).cobroRecibos = { 'rec-cuota': { como: 'BANCO', via: 'sepa', desde: '2026-08-20' } };
      },
    });
    await abrir(page, '');
    const cuota = page.getByTestId('lo-tuyo-cuota');
    await expect(cuota).toContainText('Lo cobrará tu banco el 20 ago. No tienes que hacer nada.', { timeout: 45_000 });
    await expect(cuota).not.toContainText('Pago pendiente');
    await expect(page.getByTestId('lo-tuyo-pago')).toHaveCount(0);
    await abrir(page, '/bonos');
    await expect(page.getByTestId('cuota-vigencia')).toHaveText('Cuota de agosto · 89 €. Lo cobrará tu banco el 20 ago. No tienes que hacer nada.', { timeout: 30_000 });
  });
});
