import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La barra de guardar de «Cómo reservan mis alumnas» (y de Alta de alumnas y Mi
// equipo, que se llevaron dos de sus ajustes).
//
// Partir veintidós campos en cinco tarjetas con UNA barra no podía cambiar lo que
// se guarda. Lo que se fija aquí:
//   · la barra solo sale con cambios, y dice en qué tarjetas;
//   · «Guardar» manda las mismas columnas y los mismos valores que antes —se
//     comprueba el cuerpo del PATCH, no el mensaje—, y cada sección solo las
//     suyas;
//   · si el servidor dice que no (400, 500, sin red, cero filas), la barra se
//     queda, lo dice con `role="alert"` y lo escrito sigue ahí;
//   · doble toque = una petición; «Descartar» vuelve a lo guardado;
//   · salir con cambios pregunta;
//   · en el móvil y el iPad, la barra no queda debajo de la navegación, y la
//     burbuja de WhatsApp solo se aparta mientras la barra se ve.
// ⚠️ Todo camino de fallo cuenta peticiones: «no dijo Guardado» también es verdad
// si nunca se intentó escribir.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

// TODAS las columnas de la sección, varias lejos de los valores de fábrica: así
// «manda lo que había» se comprueba valor a valor.
const FILA: Record<string, unknown> = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', plan: 'ESTUDIO', subscription_status: 'active',
  reserva_exigir_plan: true,
  reserva_ventana_minima_minutos: 60,
  reserva_antelacion_maxima_dias: 14,
  reserva_max_simultaneas: 4,
  bloquear_reserva_impago: false,
  requiere_aprobacion: false,
  cancelacion_ventana_horas: 24,
  cancelacion_devolver_bono_tardia: false,
  cancelacion_clase_devuelve_bono: true,
  minimo_asistentes_por_clase: 2,
  recuperacion_caducidad_tipo: 'DIAS',
  recuperacion_caducidad_dias: 45,
  recuperacion_auto_semanal: false,
  permite_lista_espera: true,
  lista_espera_plazo_aceptacion_minutos: 15,
  requiere_checkin_qr: true,
  penalizacion_importe_eur: 5,
  penalizacion_aplica_cancelacion_tardia: true,
  penalizacion_aplica_no_show: false,
  penalizacion_cobro_automatico: false,
  compra_publica_modo: 'EXIGIR_REGISTRO',
  instructoras_crean_clases: true,
  avisar_alumnas: true,
};

// Lo que mandaba «Guardar política de reservas» hasta el 15-sep, menos
// `compra_publica_modo` e `instructoras_crean_clases`, que se guardan en su sección.
const COLUMNAS_RESERVAS = [
  'reserva_exigir_plan', 'reserva_ventana_minima_minutos', 'reserva_antelacion_maxima_dias', 'reserva_max_simultaneas',
  'bloquear_reserva_impago', 'requiere_aprobacion', 'cancelacion_ventana_horas', 'cancelacion_devolver_bono_tardia',
  'cancelacion_clase_devuelve_bono', 'minimo_asistentes_por_clase', 'recuperacion_caducidad_tipo',
  'recuperacion_caducidad_dias', 'recuperacion_auto_semanal', 'permite_lista_espera',
  'lista_espera_plazo_aceptacion_minutos', 'requiere_checkin_qr', 'penalizacion_importe_eur',
  'penalizacion_aplica_cancelacion_tardia', 'penalizacion_aplica_no_show', 'penalizacion_cobro_automatico',
];
const LO_GUARDADO = Object.fromEntries(COLUMNAS_RESERVAS.map(c => [c, FILA[c]]));

type Fallo = 400 | 500 | 'red' | 'cero-filas';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: { fallo?: Fallo; retrasoMs?: number; falloConfirmacion?: boolean } = {}) {
  const patches: Record<string, unknown>[] = [];
  const puts: unknown[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', async r => {
    if (r.request().method() !== 'PATCH') return json(r, FILA);
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.retrasoMs) await new Promise(res => setTimeout(res, opts.retrasoMs));
    if (opts.fallo === 'red') return r.abort('failed');
    if (opts.fallo === 400) return json(r, { code: '22023', message: 'valor no válido' }, 400);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    // Lo que devuelve PostgREST con `select=id`; `[]` es «la RLS no casó».
    return json(r, opts.fallo === 'cero-filas' ? [] : [{ id: STUDIO_ID }]);
  });
  await page.route(u => u.pathname === '/api/decisiones/confirmacion-riesgo', r => {
    if (r.request().method() !== 'PUT') return json(r, { activo: false });
    puts.push(r.request().postDataJSON());
    return opts.falloConfirmacion
      ? json(r, { error: 'No se ha podido cambiar el ajuste' }, 500)
      : json(r, r.request().postDataJSON());
  });
  await ir(page, ruta);
  return { patches, puts };
}

const barra = (page: Page) => page.getByRole('region', { name: 'Cambios sin guardar' });
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const descartar = (page: Page) => page.getByRole('button', { name: 'Descartar', exact: true });
const ventana = (page: Page) => page.getByLabel('Plazo para cancelar sin perder la sesión (horas antes)');
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

/** Abre Reservas y espera a que la fila haya llegado (24 h no es el valor de fábrica). */
async function reservas(page: Page, opts?: Parameters<typeof abrir>[2]) {
  const r = await abrir(page, 'configuracion?tab=reservas', opts);
  await expect(ventana(page)).toHaveValue('24', { timeout: 30_000 });
  return r;
}

/** ¿Pediría el navegador confirmación al recargar o cerrar la pestaña? */
const pideConfirmarAlSalir = (page: Page) => page.evaluate(() => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});

test.describe('La barra de guardar de «Cómo reservan mis alumnas»', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('solo sale con cambios, dice en qué tarjetas, y se va al deshacerlos a mano', async ({ page }) => {
    const { patches } = await reservas(page);
    await expect(barra(page)).toHaveCount(0);

    await ventana(page).fill('6');
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar');
    await page.getByRole('switch', { name: /Exigir plan o bono activo/ }).click();
    await page.getByRole('radio', { name: /Sin lista de espera/ }).check();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Reservar, Cancelar y recuperar, Lista de espera');

    // Volver a lo guardado a mano también cuenta.
    await ventana(page).fill('24');
    await page.getByRole('switch', { name: /Exigir plan o bono activo/ }).click();
    await page.getByRole('radio', { name: /Se le ofrece durante 15 minutos/ }).check();
    await expect(barra(page)).toHaveCount(0);
    expect(patches).toHaveLength(0);
  });

  test('«Guardar» manda las columnas de la sección con lo elegido, y lo demás como estaba', async ({ page }) => {
    const { patches, puts } = await reservas(page);

    await ventana(page).fill('6');
    await page.getByRole('radio', { name: /Se da a la primera al momento/ }).check();
    await page.getByLabel('Cargo por cancelar tarde o no venir sin avisar (€)').fill('7.5');
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar, Lista de espera, Si cancela tarde o no viene');
    await guardar(page).click();

    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    expect(patches).toHaveLength(1);
    expect(Object.keys(patches[0]).sort()).toEqual([...COLUMNAS_RESERVAS].sort());
    expect(patches[0]).toEqual({
      ...LO_GUARDADO,
      cancelacion_ventana_horas: 6,
      permite_lista_espera: true,
      lista_espera_plazo_aceptacion_minutos: 0,
      penalizacion_importe_eur: 7.5,
    });
    // Ni la confirmación de asistencia (su endpoint) ni lo que se fue a otra sección.
    expect(puts).toHaveLength(0);
    // Guardado de verdad: la barra se va y se anuncia.
    await expect(barra(page)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /^Guardado$/ })).toHaveCount(1);
  });

  const LISTA: { nombre: string; elegir: (page: Page) => Promise<void>; columnas: Record<string, unknown> }[] = [
    {
      nombre: 'sin lista (conserva el plazo guardado)',
      elegir: page => page.getByRole('radio', { name: /Sin lista de espera/ }).check(),
      columnas: { permite_lista_espera: false, lista_espera_plazo_aceptacion_minutos: 15 },
    },
    {
      nombre: 'se da a la primera al momento',
      elegir: page => page.getByRole('radio', { name: /Se da a la primera al momento/ }).check(),
      columnas: { permite_lista_espera: true, lista_espera_plazo_aceptacion_minutos: 0 },
    },
    {
      nombre: 'se le ofrece durante 30 minutos',
      elegir: page => page.getByLabel('Minutos para aceptar la plaza').fill('30'),
      columnas: { permite_lista_espera: true, lista_espera_plazo_aceptacion_minutos: 30 },
    },
  ];
  for (const caso of LISTA) {
    test(`lista de espera, «${caso.nombre}»: las dos columnas de siempre`, async ({ page }) => {
      const { patches } = await reservas(page);
      await caso.elegir(page);
      await expect(barra(page)).toContainText('Cambios sin guardar en: Lista de espera');
      await guardar(page).click();
      await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
      expect(patches[0]).toEqual({ ...LO_GUARDADO, ...caso.columnas });
    });
  }

  test('lo que no se puede guardar deja «Guardar» apagado y dice dónde mirar', async ({ page }) => {
    const { patches } = await reservas(page);

    await page.getByLabel('Días antes de la clase en que se abre la reserva').fill('0');
    await expect(page.locator('#reservar').getByRole('alert')).toContainText('se cerraría antes de abrirse');
    await expect(barra(page).getByRole('alert')).toHaveText('Revisa «Reservar»: la reserva se cerraría antes de abrirse.');
    await expect(guardar(page)).toBeDisabled();

    await page.getByLabel('Días antes de la clase en que se abre la reserva').fill('14');
    await page.getByLabel('Minutos para aceptar la plaza').fill('');
    await expect(barra(page).getByRole('alert')).toContainText('Revisa «Lista de espera»');
    await expect(guardar(page)).toBeDisabled();
    await guardar(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(0);
  });

  for (const fallo of [400, 500, 'red', 'cero-filas'] as const) {
    test(`si el servidor dice que no (${fallo}): la barra se queda, lo dice y no se pierde nada`, async ({ page }) => {
      const { patches } = await reservas(page, { fallo });

      await ventana(page).fill('6');
      await guardar(page).click();

      await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(barra(page).getByRole('alert')).toContainText(/No se ha guardado: .+\. Tus cambios siguen aquí\./, { timeout: 15_000 });
      await expect(guardar(page)).toBeEnabled();
      await expect(ventana(page)).toHaveValue('6');
      await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar');
      await expect(page.getByText('Reglas de reserva guardadas')).toHaveCount(0);
      // Lo que se cuenta arriba sigue siendo lo guardado.
      await expect(page.getByRole('list', { name: 'Cuando algo cambia, Tentare…' })).toContainText('más de 24 h');
    });
  }

  test('las reglas se guardan pero la confirmación dice que no: solo «Asistencia» queda pendiente', async ({ page }) => {
    const { patches, puts } = await reservas(page, { falloConfirmacion: true });

    await ventana(page).fill('6');
    const pedir = page.locator('#asistencia').getByRole('switch', { name: /Pedir confirmación a quien suele no venir/ });
    await expect(pedir).toBeEnabled({ timeout: 15_000 });
    await pedir.click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar, Asistencia');
    await guardar(page).click();

    await expect.poll(() => puts.length, { timeout: 15_000 }).toBe(1);
    expect(puts[0]).toEqual({ activo: true });
    await expect(barra(page).getByRole('alert')).toContainText('No se ha guardado', { timeout: 15_000 });
    await expect(barra(page)).toContainText('Cambios sin guardar en: Asistencia');
    await expect(pedir).toHaveAttribute('aria-checked', 'true');
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ cancelacion_ventana_horas: 6 });
    expect(Object.keys(patches[0])).not.toContain('pedir_confirmacion_riesgo');
    await expect(page.getByText('Reglas de reserva guardadas')).toHaveCount(0);
  });

  test('doble toque en «Guardar»: una sola petición', async ({ page }) => {
    const { patches } = await reservas(page, { retrasoMs: 1_000 });
    await ventana(page).fill('6');
    await guardar(page).dblclick();

    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
  });

  test('«Descartar» vuelve a lo guardado sin escribir nada', async ({ page }) => {
    const { patches, puts } = await reservas(page);

    await ventana(page).fill('6');
    await page.getByRole('radio', { name: /Sin lista de espera/ }).check();
    await page.getByRole('switch', { name: /^Pasar lista/ }).click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar, Lista de espera, Asistencia');

    await descartar(page).click();
    await expect(barra(page)).toHaveCount(0);
    await expect(ventana(page)).toHaveValue('24');
    await expect(page.getByRole('radio', { name: /Se le ofrece durante 15 minutos/ })).toBeChecked();
    await expect(page.getByRole('switch', { name: /^Pasar lista/ })).toHaveAttribute('aria-checked', 'true');
    expect(patches).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });

  test('salir con cambios pregunta; «Seguir editando» no pierde nada', async ({ page }) => {
    await reservas(page);
    expect(await pideConfirmarAlSalir(page), 'sin cambios, recargar no pregunta').toBe(false);

    await ventana(page).fill('6');
    expect(await pideConfirmarAlSalir(page), 'con cambios, recargar o cerrar pregunta').toBe(true);

    const rail = page.getByRole('navigation', { name: 'Secciones de Configuración' });
    await rail.getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Los cambios de «Cómo reservan mis alumnas» se perderán.');
    await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(titulo(page, 'Cómo reservan mis alumnas')).toBeVisible();
    await expect(page).toHaveURL(/\?tab=reservas$/);
    await expect(ventana(page)).toHaveValue('6');

    // Otra sección, confirmando.
    await rail.getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible();
    await expect(page).toHaveURL(/\?tab=cobros$/);
    expect(await pideConfirmarAlSalir(page), 'lo descartado ya no pregunta').toBe(false);
  });

  test('ir a otra pantalla del panel con cambios también pregunta', async ({ page }) => {
    await reservas(page);
    await ventana(page).fill('6');

    // «Mi cuenta» está en la lista de secciones, pero es otra pantalla.
    await page.getByRole('navigation', { name: 'Secciones de Configuración' }).getByRole('link', { name: 'Mi cuenta' }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(dialogo).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion\?tab=reservas$/);
    await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(/\/mi-perfil$/, { timeout: 30_000 });
  });

  test('sin cambios, cambiar de sección no pregunta nada', async ({ page }) => {
    await reservas(page);
    await page.getByRole('navigation', { name: 'Secciones de Configuración' })
      .getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Lo que se fue de las reglas de reserva se guarda en su sección, solo', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Alta de alumnas: «Compra desde tu enlace» manda su columna y ninguna más', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=altas');
    await expect(page.getByRole('radio', { name: /Que se registre antes de pagar/ })).toBeChecked({ timeout: 30_000 });
    await expect(barra(page)).toHaveCount(0);

    await page.getByRole('radio', { name: /Que pague directamente/ }).check();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Compra desde tu enlace');
    await guardar(page).click();

    await expect(page.getByText('Compra desde tu enlace guardada')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ compra_publica_modo: 'CREAR_FICHA' }]);
    await expect(barra(page)).toHaveCount(0);
  });

  test('Mi equipo: «Las instructoras crean sus clases» manda su columna y ninguna más', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=equipo');
    const interruptor = page.getByRole('switch', { name: /Las instructoras pueden crear sus clases/ });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

    await interruptor.click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Las instructoras crean sus clases');
    await guardar(page).click();

    await expect(page.getByText('Ajuste de tu equipo guardado')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ instructoras_crean_clases: false }]);
  });

  test('Mi equipo: si el servidor dice que no, la barra se queda y el interruptor también', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=equipo', { fallo: 'cero-filas' });
    const interruptor = page.getByRole('switch', { name: /Las instructoras pueden crear sus clases/ });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await interruptor.click();
    await guardar(page).click();

    await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(barra(page).getByRole('alert')).toContainText('No se ha guardado');
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Ajuste de tu equipo guardado')).toHaveCount(0);
  });
});

const VISTAS = [
  { nombre: 'móvil 375×812', viewport: { width: 375, height: 812 } },
  { nombre: 'iPad vertical 768×1024', viewport: { width: 768, height: 1024 } },
] as const;

for (const vista of VISTAS) {
  test.describe(`La barra de guardar en ${vista.nombre}`, () => {
    test.use({ viewport: vista.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('queda por encima de la navegación de abajo, arriba y al final de la sección', async ({ page }) => {
      await reservas(page);
      await ventana(page).fill('6');
      await expect(barra(page)).toBeVisible();

      for (const donde of ['arriba', 'abajo'] as const) {
        await page.evaluate(d => window.scrollTo(0, d === 'arriba' ? 0 : document.documentElement.scrollHeight), donde);
        await page.waitForTimeout(400);
        const navArriba = await page.evaluate(() => {
          const nav = [...document.querySelectorAll('nav')].find(n => {
            const cs = getComputedStyle(n);
            return cs.position === 'fixed' && cs.display !== 'none' && n.getBoundingClientRect().bottom >= window.innerHeight - 1;
          });
          return nav ? nav.getBoundingClientRect().top : null;
        });
        expect(navArriba, 'la navegación de abajo').not.toBeNull();
        const caja = (await barra(page).boundingBox())!;
        expect(caja.y + caja.height, `${donde}: la barra, encima de la navegación`).toBeLessThanOrEqual(navArriba! + 0.5);
        expect(caja.y, `${donde}: la barra, dentro de la pantalla`).toBeGreaterThanOrEqual(0);
        // Y lo que hay en el centro de «Guardar» es «Guardar», no la navegación ni otra cosa.
        const alcanzable = await page.evaluate(() => {
          const boton = [...document.querySelectorAll<HTMLButtonElement>('[data-barra-guardar] button')].at(-1)!;
          const r = boton.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!el && boton.contains(el);
        });
        expect(alcanzable, `${donde}: «Guardar» se puede pulsar`).toBe(true);
      }
    });

    test('la burbuja de WhatsApp solo se aparta mientras se ve la barra', async ({ page }) => {
      await reservas(page);
      const burbuja = page.getByRole('button', { name: 'Ayuda por WhatsApp' });
      // Sin cambios, la sección entera no la esconde.
      await expect(burbuja).toBeVisible();

      await ventana(page).fill('6');
      await expect(barra(page)).toBeVisible();
      await expect(burbuja).toBeHidden();

      await descartar(page).click();
      await expect(barra(page)).toHaveCount(0);
      await expect(burbuja).toBeVisible();
    });

    if (vista.viewport.width < 768) {
      test('«Volver a Configuración» con cambios pregunta antes', async ({ page }) => {
        await reservas(page);
        await ventana(page).fill('6');
        await page.getByRole('button', { name: 'Volver a Configuración' }).click();

        const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
        await expect(dialogo).toBeVisible();
        await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
        await expect(titulo(page, 'Cómo reservan mis alumnas')).toBeVisible();
        await expect(ventana(page)).toHaveValue('6');

        await page.getByRole('button', { name: 'Volver a Configuración' }).click();
        await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
        // En el móvil, volver lleva al inicio de Configuración (sus grupos de secciones).
        await expect(page.locator('[aria-labelledby^="inicio-grupo-"]').first()).toBeVisible();
        await expect(titulo(page, 'Cómo reservan mis alumnas')).toBeHidden();
      });
    }
  });
}

// A 1024 px la columna es estrecha: la barra llega hasta el borde derecho y la
// burbuja de WhatsApp tapaba «Guardar» (captura del 15-sep).
test.describe('La barra de guardar en un portátil de 1024×768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('la burbuja se aparta y «Guardar» se puede pulsar', async ({ page }) => {
    const { patches } = await reservas(page);
    const burbuja = page.getByRole('button', { name: 'Ayuda por WhatsApp' });
    await expect(burbuja).toBeVisible();

    await ventana(page).fill('6');
    await expect(barra(page)).toBeVisible();
    await expect(burbuja).toBeHidden();
    const alcanzable = await page.evaluate(() => {
      const boton = [...document.querySelectorAll<HTMLButtonElement>('[data-barra-guardar] button')].at(-1)!;
      const r = boton.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el && boton.contains(el);
    });
    expect(alcanzable, '«Guardar» no queda tapado').toBe(true);

    await guardar(page).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    await expect(barra(page)).toHaveCount(0);
    await expect(burbuja).toBeVisible();
  });
});
