import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El inicio de Configuración dice cómo está el estudio, de un vistazo.
//
// Hasta el 15-sep, a partir de 768 px `/configuracion` abría la primera sección
// y la propietaria caía en el formulario de datos sin ver cómo estaba nada; en
// el móvil la lista decía lo que había DENTRO de cada sección, nunca su valor.
// El fundador lo puntuaba en 55 %: «sigue siendo un poco lioso».
//
// Lo que se fija aquí, contra el panel sembrado:
//   · el inicio se ve a 375, 768 y 1024, sin abrir ninguna sección solo;
//   · cada fila enseña el valor GUARDADO y cambia con él;
//   · «Revisa esto» solo sale con un problema de verdad, y lleva a su tarjeta;
//   · el buscador encuentra «IVA» y «lista de espera» y anuncia cuántos hay;
//   · volver de una sección deja el foco en la fila que la abrió;
//   · los enlaces viejos (`?tab=…`) siguen abriendo su sección.
//
// ⚠️ Los resúmenes vienen de lib/configuracion/resumenes.ts, con sus tests
// unitarios. Esto comprueba lo que esos tests no ven: que la pantalla les pasa
// lo que el panel tiene cargado y los pinta donde toca.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  // Un NIF con formato y dígito de control buenos, que no es de relleno.
  nif: 'B12345674', iva_por_defecto: 21, direccion: 'Calle Mayor 4', ciudad: 'Almería',
  plan: 'ESTUDIO', subscription_status: 'active',
  // Con Stripe: el sembrado tiene tarifas activas y pide bono para reservar, y
  // sin Stripe eso ya es algo que revisar (una alumna nueva no podría pagar).
  stripe_account_id: 'acct_e2e',
  cancelacion_ventana_horas: 12, permite_lista_espera: true, lista_espera_plazo_aceptacion_minutos: 0,
};

// L-V 8:00-21:00, sábado 9:00-14:00, domingo cerrado. `dia_semana`: 0 = domingo.
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  studio_id: 'studio-test', dia_semana: d, abierto: d !== 0,
  hora_apertura: d === 0 ? null : d === 6 ? '09:00:00' : '08:00:00',
  hora_cierre: d === 0 ? null : d === 6 ? '14:00:00' : '21:00:00',
}));

async function panel(page: Page, cambios: Record<string, unknown> = {}) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, { ...STUDIO, ...cambios }));
  await page.route('**/rest/v1/studio_horario**', r => json(r, HORARIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const fila = (page: Page, id: string) => page.locator(`#inicio-seccion-${id}`);
const resumen = (page: Page, id: string) => fila(page, id).locator('[data-resumen]');
const rail = (page: Page) => page.getByRole('navigation', { name: 'Secciones de Configuración' });
const tituloSeccion = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

/** El inicio con los datos ya cargados: verde por un esqueleto no vale. */
async function inicioCargado(page: Page) {
  await ir(page, 'configuracion');
  await expect(fila(page, 'estudio').locator('[data-resumen="valor"]')).toBeVisible({ timeout: 30_000 });
}

const VISTAS = [
  { nombre: 'móvil 375×812', uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, columna: false },
  { nombre: 'iPad 768×1024', uso: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true }, columna: true },
  { nombre: 'portátil 1024×768', uso: { viewport: { width: 1024, height: 768 } }, columna: true },
] as const;

for (const vista of VISTAS) {
  test.describe(`El inicio en ${vista.nombre}`, () => {
    test.use(vista.uso);

    test('se ve el inicio con sus grupos, y no se abre ninguna sección sola', async ({ page }) => {
      await panel(page);
      await inicioCargado(page);

      await expect(page.getByRole('heading', { level: 1, name: 'Configuración', exact: true })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Buscar un ajuste' })).toBeVisible();
      for (const grupo of ['Lo básico', 'Tus alumnas', 'Tu imagen', 'Equipo', 'Conexiones y datos', 'Tu cuenta']) {
        await expect(page.getByRole('heading', { level: 2, name: grupo, exact: true })).toBeVisible();
      }
      await expect(page.locator('#seccion-titulo')).toHaveCount(0);
      await expect(page).toHaveURL(/\/configuracion$/);
      if (vista.columna) {
        await expect(rail(page).getByRole('link', { name: 'Configuración', exact: true })).toHaveAttribute('aria-current', 'page');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'se sale de lado').toBeLessThanOrEqual(0);
    });
  });
}

test.describe('En el portátil', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('cada fila enseña el valor guardado, y cambia con él', async ({ page }) => {
    await panel(page);
    await inicioCargado(page);

    await expect(resumen(page, 'estudio')).toHaveText('Pilates Centro · L-V 8-21, S 9-14 · 2 salas');
    await expect(resumen(page, 'clases')).toHaveText('2 tipos de clase');
    await expect(resumen(page, 'reservas')).toHaveText('Cancelar 12 h · lista de espera al momento');
    await expect(resumen(page, 'cobros')).toHaveText('Stripe conectado · IVA 21 %');
    // El tema sembrado trae el oliva de fábrica.
    await expect(resumen(page, 'marca')).toHaveText('Sin logo · color de Tentare');
    await expect(resumen(page, 'web')).toHaveText('Fuera de Tentare Network');
    // Lo que no se sabe no se inventa: la motivación se carga al abrir su sección.
    await expect(resumen(page, 'motivacion')).toHaveAttribute('data-resumen', 'descripcion');

    // Otras reglas guardadas, otro resumen.
    await page.route('**/rest/v1/studios**', r => json(r, {
      ...STUDIO, cancelacion_ventana_horas: 24, permite_lista_espera: false, iva_por_defecto: 10,
    }));
    await inicioCargado(page);
    await expect(resumen(page, 'reservas')).toHaveText('Cancelar 24 h · sin lista de espera');
    await expect(resumen(page, 'cobros')).toHaveText('Stripe conectado · IVA 10 %');
  });

  test('sin nada que revisar, «Revisa esto» no sale ni hay pastillas de estado', async ({ page }) => {
    await panel(page);
    await inicioCargado(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Revisa esto' })).toHaveCount(0);
    await expect(page.locator('[data-estado-ajuste]')).toHaveCount(0);
  });

  test('sin NIF, «Revisa esto» lo dice, su fila también, y lleva a la tarjeta', async ({ page }) => {
    await panel(page, { nif: '' });
    await inicioCargado(page);

    const revisa = page.getByRole('region', { name: 'Revisa esto' });
    await expect(revisa).toBeVisible();
    await expect(revisa.getByRole('link')).toHaveCount(1);
    await expect(fila(page, 'cobros').locator('[data-estado-ajuste]')).toHaveText('Falta el NIF');

    await revisa.getByRole('link', { name: /Falta tu NIF/ }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=cobros#datos-fiscales$/);
    await expect(page.locator('#datos-fiscales-titulo')).toBeFocused({ timeout: 15_000 });
    await expect(page.locator('#datos-fiscales')).toBeInViewport();
  });

  test('el buscador encuentra «IVA» y «lista de espera», dice cuántos hay y lleva a la tarjeta', async ({ page }) => {
    await panel(page);
    await inicioCargado(page);

    const buscador = page.getByRole('searchbox', { name: 'Buscar un ajuste' });
    const cuantos = page.locator('[data-tour="configuracion-vista"] p[role="status"][aria-live="polite"]');
    const resultados = page.getByRole('list', { name: 'Resultados de la búsqueda' });

    await buscador.fill('IVA');
    await expect(cuantos).toHaveText('1 resultado');
    await expect(resultados.getByRole('link')).toHaveCount(1);
    await expect(resultados.getByRole('link', { name: /Datos fiscales e IVA/ })).toBeVisible();
    // Mientras se busca, los grupos se apartan.
    await expect(page.getByRole('heading', { level: 2, name: 'Lo básico', exact: true })).toHaveCount(0);

    await buscador.fill('nada que se parezca');
    await expect(cuantos).toHaveText('Nada con «nada que se parezca». Prueba con otra palabra.');

    await buscador.fill('lista de espera');
    await expect(cuantos).toHaveText(/^\d+ resultados?$/);
    await resultados.getByRole('link', { name: /Lista de espera/ }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=reservas#lista-de-espera$/);
    await expect(page.locator('#lista-de-espera-titulo')).toBeFocused({ timeout: 15_000 });
  });

  test('volver de una sección —con el atrás o con «Configuración»— deja el foco en su fila', async ({ page }) => {
    await panel(page);
    await inicioCargado(page);
    const historial = await page.evaluate(() => history.length);

    await fila(page, 'cobros').click();
    await expect(tituloSeccion(page, 'Cobros y facturas')).toBeFocused({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/configuracion\?tab=cobros$/);
    // `push`: el atrás del navegador vuelve al inicio.
    expect(await page.evaluate(() => history.length)).toBe(historial + 1);

    await page.goBack();
    await expect(fila(page, 'cobros')).toBeFocused({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/configuracion$/);

    await fila(page, 'reservas').click();
    await expect(tituloSeccion(page, 'Cómo reservan mis alumnas')).toBeVisible({ timeout: 30_000 });
    await rail(page).getByRole('link', { name: 'Configuración', exact: true }).click();
    await expect(fila(page, 'reservas')).toBeFocused({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/configuracion$/);
  });

  test('los enlaces de antes (`?tab=`) siguen abriendo su sección', async ({ page }) => {
    await panel(page);
    const casos: [string, string, string | null][] = [
      ['configuracion?tab=gamificacion&sub=canjes', 'Motivación', '#canjes'],
      ['configuracion?tab=plantillas', 'Cómo me comunico', '#correos-automaticos'],
      ['configuracion?tab=estudio', 'Mi estudio', null],
    ];
    for (const [ruta, seccion, tarjeta] of casos) {
      await ir(page, ruta);
      await expect(tituloSeccion(page, seccion)).toBeVisible({ timeout: 30_000 });
      await expect(rail(page).getByRole('link', { name: seccion, exact: true })).toHaveAttribute('aria-current', 'page');
      if (tarjeta) await expect(page.locator(tarjeta)).toBeInViewport({ timeout: 15_000 });
    }
  });
});
