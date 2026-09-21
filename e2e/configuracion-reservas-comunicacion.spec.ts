import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Cómo reservan mis alumnas» y «Cómo me comunico» en filas con su valor (15-sep, v2).
//
// Reservas eran cinco tarjetas abiertas con una sola barra de guardar, y
// WhatsApp podía decir una cosa en la pastilla y otra debajo. Lo que se fija aquí:
//   · cada fila enseña lo guardado, a 375 y a 1024, sin salirse de lado, y la
//     regla que algún tipo de clase cambia lo dice en su fila;
//   · tocar una fila abre su cajón con el foco en el título, con la consecuencia
//     y el camino a los tipos de clase;
//   · si el servidor dice que no, el cajón se queda abierto con lo escrito y lo
//     dice — contando que SÍ se intentó escribir, y solo sus columnas;
//   · el cargo pregunta antes de guardar;
//   · el aviso a las alumnas se guarda al tocarlo y vuelve atrás si falla;
//   · WhatsApp y Gmail, con UN estado cada uno.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', nif: 'B12345674', iva_por_defecto: 21,
  reserva_exigir_plan: true, reserva_ventana_minima_minutos: 0, reserva_antelacion_maxima_dias: 30,
  reserva_max_simultaneas: null, bloquear_reserva_impago: false, requiere_aprobacion: false,
  cancelacion_ventana_horas: 12, cancelacion_devolver_bono_tardia: false, cancelacion_clase_devuelve_bono: true,
  minimo_asistentes_por_clase: 0, recuperacion_caducidad_tipo: 'FIN_MES_SIGUIENTE', recuperacion_caducidad_dias: null,
  recuperacion_auto_semanal: false, permite_lista_espera: true, lista_espera_plazo_aceptacion_minutos: 30,
  requiere_checkin_qr: true, penalizacion_importe_eur: 5, penalizacion_aplica_cancelacion_tardia: true,
  penalizacion_aplica_no_show: true, penalizacion_cobro_automatico: false, avisar_alumnas: true,
  terminos_servicio: null, politica_privacidad: null, gmail_email: null,
};

const tipo = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, duracion_min: 50, color: '#F7A6C4', activo: true, ...extra,
});

// Dos tipos cambian el plazo de cancelación; el tercero pone el MISMO que el
// estudio (no le lleva la contraria a nadie) y el cuarto hereda (NULL).
const TIPOS = [
  tipo('tc-reformer', 'Reformer', { ventana_cancelacion_horas: 24 }),
  tipo('tc-mat', 'Mat', { ventana_cancelacion_horas: 6 }),
  tipo('tc-suelo', 'Suelo', { ventana_cancelacion_horas: 12 }),
  tipo('tc-barre', 'Barre', { ventana_cancelacion_horas: null }),
];

const COLUMNAS_CANCELAR = [
  'cancelacion_devolver_bono_tardia', 'cancelacion_ventana_horas', 'recuperacion_auto_semanal',
  'recuperacion_caducidad_dias', 'recuperacion_caducidad_tipo',
];

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: {
  fila?: Record<string, unknown>;
  fallo?: 500;
  falloAvisar?: 500;
  integraciones?: Record<string, unknown>[];
} = {}) {
  const patches: Record<string, unknown>[] = [];
  const avisos: unknown[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, { ...FILA, ...opts.fila });
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/rest/v1/tipos_clase**', r => json(r, TIPOS));
  await page.route('**/rest/v1/integraciones**', r => json(r, opts.integraciones ?? []));
  await page.route(u => u.pathname === '/api/decisiones/confirmacion-riesgo', r => json(r, { activo: false }));
  await page.route(u => u.pathname === '/api/integrations/config', r => json(r, { config: {} }));
  await page.route(u => u.pathname === '/api/sustituciones', r => {
    if (r.request().method() === 'GET') return json(r, { sustituciones: [], avisarAlumnas: true });
    avisos.push(r.request().postDataJSON());
    if (opts.falloAvisar === 500) return json(r, { error: 'No se ha podido guardar el ajuste de avisos.' }, 500);
    return json(r, { ok: true });
  });
  await ir(page, ruta);
  return { patches, avisos };
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
  return [...d.querySelectorAll<HTMLElement>('input, button, label, p, h2, a')]
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
  test.describe(`Reservas y comunicación en ${vista.nombre}`, () => {
    test.use(vista.use);

    test('cada fila dice lo guardado y qué tipos la cambian, y tocar una abre su cajón con el foco en el título', async ({ page }) => {
      await abrir(page, 'configuracion?tab=reservas');
      await expect(valor(page, 'reservar')).toHaveText('Hasta 30 días antes · con plan o bono', { timeout: 30_000 });
      // Reformer (24 h) y Mat (6 h); Suelo pone lo mismo y Barre está apagado.
      await expect(valor(page, 'cancelar-y-recuperar')).toHaveText('Hasta 12 h antes · 2 tipos lo cambian');
      await expect(valor(page, 'si-se-cancela-una-clase')).toHaveText('Devuelve la sesión · sin mínimo');
      await expect(valor(page, 'lista-de-espera')).toHaveText('Oferta de 30 min');
      await expect(valor(page, 'asistencia')).toHaveText('Se pasa lista');
      await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toHaveText('5 € · lo apruebas tú');
      await expect(page.getByRole('switch', { name: 'Avisos a las alumnas' })).toHaveAttribute('aria-checked', 'true');
      // Lo que es de serie se cuenta, sin chevron ni interruptor.
      await expect(page.locator('[data-fila-informativa]')).toHaveCount(3);
      await expect(page.getByText('Cuando algo cambia, Tentare…')).toHaveCount(0);
      expect(await desborde(page), 'Reservas se sale de lado').toBeLessThanOrEqual(0);

      await page.locator('#cancelar-y-recuperar').click();
      await expect(titulo(page, 'Cancelar y recuperar')).toBeFocused();
      // Entra deslizándose desde la derecha: se mide cuando ha llegado.
      await expect.poll(async () => {
        const b = await cajon(page).boundingBox();
        return b ? Math.round(b.x + b.width) : null;
      }).toBe(vista.ancho);
      const caja = (await cajon(page).boundingBox())!;
      if (vista.ancho === 375) expect(Math.round(caja.x)).toBe(0);
      else expect(caja.width).toBeLessThan(500);

      await expect(page.getByRole('spinbutton', { name: 'Plazo para cancelar sin perder la sesión (horas antes)' })).toHaveValue('12');
      await expect(cajon(page).locator('[data-consecuencia]')).toHaveText('Si cancela con menos de 12 h, no recupera la sesión.');
      await expect(cajon(page).locator('[data-excepciones]')).toContainText('Reformer y Mat tienen su propia regla');
      await expect(cajon(page).getByRole('link', { name: 'Ver tipos de clase' })).toHaveAttribute('href', '/configuracion?tab=clases&abrir=tipos-de-clase');
      // Sin cambios, ni barra ni «Guardar» gris en reposo.
      await expect(guardar(page)).toHaveCount(0);
      expect(await seSaleDelCajon(page)).toEqual([]);
    });

    test('Cómo me comunico: filas con su valor, y WhatsApp y Gmail con un solo estado', async ({ page }) => {
      await abrir(page, 'configuracion?tab=comunicacion');
      // Sin nombre ni email propios: los del estudio, que es con lo que salen.
      await expect(valor(page, 'integracion-resend')).toHaveText('Pilates Centro · responde a cloe@example.com', { timeout: 30_000 });
      await expect(page.locator('#fila-herramienta-correos-automaticos')).toBeVisible();

      await expect(estado(page, 'integracion-whatsapp')).toHaveCount(1);
      await expect(estado(page, 'integracion-whatsapp')).toHaveText('Sin conectar');
      await expect(page.locator('#integracion-whatsapp').getByRole('button', { name: 'Conectar' })).toBeVisible();

      await expect(estado(page, 'integracion-gmail')).toHaveCount(1);
      const gmail = await estado(page, 'integracion-gmail').textContent();
      expect(gmail).toMatch(/^(Sin conectar|No disponible todavía)$/);
      await expect(page.locator('#integracion-gmail').getByRole('button', { name: 'Conectar' })).toHaveCount(gmail === 'Sin conectar' ? 1 : 0);
      await expect(page.getByText('No conectado', { exact: true })).toHaveCount(0);

      // El recordatorio ya no es un texto fijo: es la fila de «Avisos en el móvil», con la antelación del estudio.
      await expect(page.locator('[data-fila-informativa]')).toHaveCount(0);
      await expect(page.locator('#fila-herramienta-avisos-del-movil')).toContainText('Recordatorio 24 h y 1 h');
      await expect(page.locator('#fila-automatizaciones')).toHaveAttribute('href', '/automatizaciones');
      expect(await desborde(page), 'Comunicación se sale de lado').toBeLessThanOrEqual(0);
    });
  });
}

test.describe('Reservas: guardar', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('si el servidor dice que no, el cajón se queda abierto con lo escrito, y solo mandó sus columnas', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=reservas', { fallo: 500 });
    await expect(valor(page, 'cancelar-y-recuperar')).toHaveText(/^Hasta 12 h antes/, { timeout: 30_000 });
    await page.locator('#cancelar-y-recuperar').click();
    await expect(titulo(page, 'Cancelar y recuperar')).toBeFocused();

    const plazo = page.getByRole('spinbutton', { name: 'Plazo para cancelar sin perder la sesión (horas antes)' });
    await plazo.fill('6');
    // La consecuencia dice lo que va a pasar con lo que hay en pantalla.
    await expect(cajon(page).locator('[data-consecuencia]')).toHaveText('Si cancela con menos de 6 h, no recupera la sesión.');
    await guardar(page).click();

    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/);
    // «No dijo Guardado» también sería verdad si nunca se hubiera intentado.
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(Object.keys(patches[0]).sort()).toEqual(COLUMNAS_CANCELAR);
    await expect(titulo(page, 'Cancelar y recuperar')).toBeVisible();
    await expect(plazo).toHaveValue('6');
    await expect(page.getByText('Reglas de reserva guardadas')).toHaveCount(0);
    // Y la fila sigue en lo guardado.
    await expect(valor(page, 'cancelar-y-recuperar')).toHaveText(/^Hasta 12 h antes/);
  });

  test('el cargo es dinero: «Guardar» pregunta antes con la consecuencia, y solo entonces escribe', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=reservas');
    await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toHaveText('5 € · lo apruebas tú', { timeout: 30_000 });
    await page.locator('#si-cancela-tarde-o-no-viene').click();
    await expect(titulo(page, 'Si cancela tarde o no viene')).toBeFocused();

    await page.getByRole('spinbutton', { name: 'Cargo por cancelar tarde o no venir sin avisar (€)' }).fill('8');
    await guardar(page).click();
    const pregunta = page.getByRole('dialog', { name: '¿Cambiar el cargo?' });
    await expect(pregunta).toBeVisible();
    await expect(pregunta.getByText(/^Si cancela con menos de 12 h o no viene sin avisar, se le cobran 8 € cuando lo apruebes\./)).toBeVisible();
    expect(patches, 'preguntar no escribe').toHaveLength(0);

    await page.getByRole('button', { name: 'Sí, guardarlo' }).click();
    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    await expect(pregunta).toHaveCount(0);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      penalizacion_importe_eur: 8, penalizacion_aplica_cancelacion_tardia: true,
      penalizacion_aplica_no_show: true, penalizacion_cobro_automatico: false,
    });
  });

  test('el aviso a las alumnas se guarda al tocarlo y, si el servidor dice que no, vuelve atrás', async ({ page }) => {
    const { avisos, patches } = await abrir(page, 'configuracion?tab=reservas', { falloAvisar: 500 });
    const interruptor = page.getByRole('switch', { name: 'Avisos a las alumnas' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await expect(interruptor).toBeEnabled();

    await interruptor.click();
    await expect(page.locator('#ajuste-avisar-alumnas').getByRole('alert')).toHaveText(/^No se ha guardado: .+\.$/);
    expect(avisos.length, 'intentos de escribir').toBeGreaterThan(0);
    // Por su único escritor, nunca por el PATCH de `studios`.
    expect(avisos[0]).toEqual({ action: 'config_avisar', avisar: false });
    expect(patches).toHaveLength(0);
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Reservas y comunicación: estados', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('con términos propios y un cargo puesto, la fila del cargo lo dice', async ({ page }) => {
    await abrir(page, 'configuracion?tab=reservas', { fila: { terminos_servicio: 'Mis condiciones.' } });
    await expect(estado(page, 'si-cancela-tarde-o-no-viene')).toHaveText('Con problemas', { timeout: 30_000 });
    await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toHaveText('Con términos propios no se cobran penalizaciones');
  });

  test('WhatsApp funcionando: un solo estado, «Conectado», y la fila abre su cajón', async ({ page }) => {
    await abrir(page, 'configuracion?tab=comunicacion', {
      integraciones: [{
        id: 'intg-whatsapp', studio_id: STUDIO_ID, tipo: 'WHATSAPP', activo: true, actualizado_en: '2026-08-01T10:00:00Z',
        ultimo_ok_en: '2026-08-18T10:00:00Z', ultimo_error: null, ultimo_error_en: null,
      }],
    });
    await expect(estado(page, 'integracion-whatsapp')).toHaveText('Conectado', { timeout: 30_000 });
    await expect(estado(page, 'integracion-whatsapp')).toHaveCount(1);
    await expect(valor(page, 'integracion-whatsapp')).toHaveText(/^Funciona · última vez el /);

    await page.locator('#integracion-whatsapp').click();
    await expect(titulo(page, 'WhatsApp')).toBeFocused();
    await expect(cajon(page).getByRole('button', { name: 'Probar conexión' })).toBeVisible();
    await expect(cajon(page).getByRole('button', { name: 'Desconectar WhatsApp' })).toBeVisible();
  });
});
