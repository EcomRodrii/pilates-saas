import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Cobros y facturas» y «Alta de alumnas» en filas con su valor (15-sep, v2).
//
// Cobros tenía cuatro formas de guardar en una pantalla y Stripe decía «No
// conectado» y «Todavía no disponible» a la vez. Lo que se fija aquí:
//   · cada fila enseña lo guardado, a 375 y a 1024, sin salirse de lado;
//   · Stripe tiene UN estado, y su acción cuadra con él;
//   · tocar una fila abre su cajón con el foco en el título;
//   · si el servidor dice que no, el cajón se queda abierto con lo escrito y lo
//     dice — contando que SÍ se intentó escribir;
//   · la valoración inicial se guarda al tocarla y vuelve atrás si falla.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
// Un CIF con formato y dígito de control correctos, que no es de relleno.
const NIF = 'B12345674';

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active',
  razon_social: 'Pilates Centro SL', nif: NIF, iva_por_defecto: 21, stripe_account_id: null,
  sepa_acreedor_id: 'ES12ZZZ12345678', sepa_iban: 'ES00 0000 0000 0000 0000 0000', sepa_titular: 'Pilates Centro SL',
  reembolsos_activos: true, reembolso_plazo_dias: 14, reembolso_solo_sin_usar: true,
  compra_publica_modo: 'EXIGIR_REGISTRO', valoracion_inicial_activa: false, preguntas_alta_activas: false,
  politica_privacidad: null, terminos_servicio: null, penalizacion_importe_eur: null,
};

const CAMPOS = [
  { id: 'cp-1', studio_id: STUDIO_ID, etiqueta: 'Cómo nos conoció', tipo: 'texto', opciones: [], requerido: true, orden: 0, activo: true },
  { id: 'cp-2', studio_id: STUDIO_ID, etiqueta: 'Horario preferido', tipo: 'seleccion', opciones: ['Mañana', 'Tarde'], requerido: false, orden: 1, activo: true },
  { id: 'cp-3', studio_id: STUDIO_ID, etiqueta: 'Objetivo', tipo: 'texto', opciones: [], requerido: false, orden: 2, activo: true },
  { id: 'cp-4', studio_id: STUDIO_ID, etiqueta: 'Talla', tipo: 'texto', opciones: [], requerido: true, orden: 3, activo: false },
];

const PREGUNTAS = [
  { id: 'pq-1', studio_id: STUDIO_ID, pregunta: '¿Tiene alguna lesión?', tipo_respuesta: 'texto', opciones: [], orden: 0, activo: true },
  { id: 'pq-2', studio_id: STUDIO_ID, pregunta: '¿Está embarazada?', tipo_respuesta: 'booleano', opciones: [], orden: 1, activo: true },
];

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: { fila?: Record<string, unknown>; fallo?: 500 } = {}) {
  const patches: Record<string, unknown>[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, { ...FILA, ...opts.fila });
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/rest/v1/campos_personalizados**', r => json(r, CAMPOS));
  await page.route('**/rest/v1/plantillas_cuestionario_salud**', r => json(r, PREGUNTAS));
  await ir(page, ruta);
  return { patches };
}

const valor = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const estado = (page: Page, id: string) => page.locator(`#${id} [data-estado-ajuste]`);
const cajon = (page: Page) => page.getByRole('dialog').first();
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Lo que dentro del cajón se sale de él (un `fixed` no ensancha la página: hay que mirarlo aquí). */
const seSaleDelCajon = (page: Page) => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')!;
  const caja = d.getBoundingClientRect();
  return [...d.querySelectorAll<HTMLElement>('input, button, label, p, h2')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && (r.left < caja.left - 0.5 || r.right > caja.right + 0.5);
    })
    .map(el => `${el.tagName} ${el.getAttribute('aria-label') ?? (el.textContent ?? '').slice(0, 30)}`);
});

const VISTAS = [
  { nombre: 'móvil 375×812', ancho: 375, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  { nombre: 'escritorio 1024×768', ancho: 1024, use: { viewport: { width: 1024, height: 768 } } },
] as const;

for (const vista of VISTAS) {
  test.describe(`Cobros y altas en ${vista.nombre}`, () => {
    test.use(vista.use);

    test('cada fila dice lo guardado, Stripe con un solo estado, y tocar una abre su cajón con el foco en el título', async ({ page }) => {
      await abrir(page, 'configuracion?tab=cobros');
      await expect(valor(page, 'datos-fiscales')).toHaveText(`Pilates Centro SL · ${NIF} · IVA 21 %`, { timeout: 30_000 });
      await expect(valor(page, 'domiciliaciones')).toHaveText('Listas para remesas');
      await expect(valor(page, 'devoluciones')).toHaveText('Hasta 14 días · bonos, solo sin empezar');
      await expect(valor(page, 'fila-paquetes')).toHaveText('3 planes a la venta');

      // UN estado, sin la pareja «No conectado» + «Todavía no disponible». Cuál
      // sale depende de si este servidor tiene la clave de Stripe Connect.
      await expect(estado(page, 'integracion-stripe')).toHaveCount(1);
      const stripe = await estado(page, 'integracion-stripe').textContent();
      expect(stripe).toMatch(/^(Sin conectar|No disponible todavía)$/);
      await expect(page.locator('#integracion-stripe').getByRole('button', { name: 'Conectar' })).toHaveCount(stripe === 'Sin conectar' ? 1 : 0);
      await expect(page.getByText('No conectado', { exact: true })).toHaveCount(0);
      expect(await desborde(page), 'Cobros se sale de lado').toBeLessThanOrEqual(0);

      await ir(page, 'configuracion?tab=altas');
      await expect(valor(page, 'contrato-y-privacidad')).toHaveText('Los textos de Tentare', { timeout: 30_000 });
      await expect(valor(page, 'compra-desde-tu-enlace')).toHaveText('Se registra antes de pagar');
      // El apagado no se pide en el alta: no cuenta.
      await expect(valor(page, 'datos-extra-de-la-ficha')).toHaveText('3 datos extra · 1 obligatorio');
      await expect(valor(page, 'cuestionario-de-salud')).toHaveText('2 preguntas');
      await expect(page.getByRole('switch', { name: 'Valoración inicial' })).toHaveAttribute('aria-checked', 'false');
      expect(await desborde(page), 'Alta de alumnas se sale de lado').toBeLessThanOrEqual(0);

      await page.locator('#compra-desde-tu-enlace').click();
      await expect(titulo(page, 'Compra desde tu enlace')).toBeFocused();
      // Entra deslizándose desde la derecha: se mide cuando ha llegado.
      await expect.poll(async () => {
        const b = await cajon(page).boundingBox();
        return b ? Math.round(b.x + b.width) : null;
      }).toBe(vista.ancho);
      const caja = (await cajon(page).boundingBox())!;
      if (vista.ancho === 375) expect(Math.round(caja.x)).toBe(0);
      else expect(caja.width).toBeLessThan(500);
      await expect(page.getByRole('radio', { name: /Que se registre antes de pagar/ })).toBeChecked();
      // Sin cambios, ni barra ni «Guardar» gris en reposo.
      await expect(guardar(page)).toHaveCount(0);
      expect(await seSaleDelCajon(page)).toEqual([]);
    });
  });
}

test.describe('Cobros y altas: guardar', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('si el servidor dice que no, el cajón se queda abierto con lo escrito y lo dice', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=cobros', { fallo: 500 });
    await expect(valor(page, 'datos-fiscales')).toHaveText(`Pilates Centro SL · ${NIF} · IVA 21 %`, { timeout: 30_000 });
    await page.locator('#datos-fiscales').click();
    await expect(titulo(page, 'Datos fiscales e IVA')).toBeFocused();

    const razon = page.getByRole('textbox', { name: 'Razón social' });
    await expect(razon).toHaveValue('Pilates Centro SL');
    await razon.fill('Pilates Centro Almería SL');
    await guardar(page).click();

    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/);
    // «No dijo Guardado» también sería verdad si nunca se hubiera intentado.
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(Object.keys(patches[0]).sort()).toEqual(['iva_por_defecto', 'nif', 'razon_social']);
    await expect(titulo(page, 'Datos fiscales e IVA')).toBeVisible();
    await expect(razon).toHaveValue('Pilates Centro Almería SL');
    await expect(page.getByText('Datos fiscales guardados')).toHaveCount(0);
  });

  test('la valoración inicial se guarda al tocarla y, si el servidor dice que no, vuelve atrás', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=altas', { fallo: 500 });
    const interruptor = page.getByRole('switch', { name: 'Valoración inicial' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
    await expect(interruptor).toBeEnabled();

    await interruptor.click();
    await expect(page.locator('#valoracion-inicial').getByRole('alert')).toHaveText(/^No se ha guardado: .+\.$/);
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(patches[0]).toEqual({ valoracion_inicial_activa: true });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('La valoración inicial ya está activa')).toHaveCount(0);
  });

  // «Preguntar los datos extra en su app» (petición de varios estudios, 25-sep):
  // apagado de serie; si el servidor dice que no, vuelve atrás y no dice «activado».
  test('preguntar los datos extra en su app: si el servidor dice que no, vuelve atrás', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=altas', { fallo: 500 });
    const interruptor = page.getByRole('switch', { name: 'Preguntar los datos extra en su app' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
    await expect(interruptor).toBeEnabled();

    await interruptor.click();
    await expect(page.locator('#preguntas-en-su-app').getByRole('alert')).toHaveText(/^No se ha guardado: .+\.$/);
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(patches[0]).toEqual({ preguntas_alta_activas: true });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  });

  test('preguntar los datos extra en su app: guardado de verdad se queda encendido', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=altas');
    const interruptor = page.getByRole('switch', { name: 'Preguntar los datos extra en su app' });
    await expect(interruptor).toBeEnabled({ timeout: 30_000 });

    await interruptor.click();
    // Sin preguntas activas en el estudio, el aviso dice que falta crearlas.
    await expect(page.getByText(/Activado\. Añade alguna pregunta|Tus alumnas contestarán tus preguntas en su app/)).toBeVisible();
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    expect(patches).toEqual([{ preguntas_alta_activas: true }]);
  });

  test('la valoración inicial guardada de verdad se queda encendida', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=altas');
    const interruptor = page.getByRole('switch', { name: 'Valoración inicial' });
    await expect(interruptor).toBeEnabled({ timeout: 30_000 });

    await interruptor.click();
    await expect(page.getByText('La valoración inicial ya está activa')).toBeVisible();
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    expect(patches).toEqual([{ valoracion_inicial_activa: true }]);
    await expect(page.locator('#valoracion-inicial').getByRole('alert')).toHaveCount(0);
  });
});

test.describe('Cobros y altas: estados', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('Stripe conectado: un solo estado, y la fila abre su cajón', async ({ page }) => {
    await abrir(page, 'configuracion?tab=cobros', { fila: { stripe_account_id: 'acct_e2e' } });
    await expect(estado(page, 'integracion-stripe')).toHaveText('Conectado', { timeout: 30_000 });
    await expect(estado(page, 'integracion-stripe')).toHaveCount(1);
    await expect(page.getByText(/No disponible todavía|No conectado|Sin conectar/)).toHaveCount(0);

    await page.locator('#integracion-stripe').click();
    await expect(titulo(page, 'Cobro con tarjeta (Stripe)')).toBeFocused();
    await expect(cajon(page).getByRole('button', { name: 'Desconectar Stripe' })).toBeVisible();
  });

  test('con términos propios y una penalización puesta, el contrato lo dice en su fila', async ({ page }) => {
    await abrir(page, 'configuracion?tab=altas', { fila: { terminos_servicio: 'Mis condiciones.', penalizacion_importe_eur: 5 } });
    await expect(estado(page, 'contrato-y-privacidad')).toHaveText('Con problemas', { timeout: 30_000 });
    await expect(valor(page, 'contrato-y-privacidad')).toHaveText('Con términos propios no se cobran penalizaciones');
  });
});
