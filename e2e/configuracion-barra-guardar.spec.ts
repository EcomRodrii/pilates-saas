import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La barra de guardar de Configuración: en el cajón de cada regla de «Cómo
// reservan mis alumnas» y en las secciones que aún guardan con barra (Mi equipo).
//
// Desde el 15-sep (v2) cada regla de reserva se cambia en su cajón, y su
// «Guardar» manda SOLO sus columnas (#2027). Lo que se fija aquí:
//   · la barra solo sale con cambios, y dice en qué;
//   · «Guardar» manda las columnas de esa regla con lo elegido —se comprueba el
//     cuerpo del PATCH, no el mensaje—, y ninguna más;
//   · si el servidor dice que no (400, 500, sin red, cero filas), la barra se
//     queda, lo dice con `role="alert"` y lo escrito sigue ahí;
//   · doble toque = una petición; «Descartar» vuelve a lo guardado;
//   · salir con cambios pregunta (cerrar el cajón, cambiar de sección);
//   · en el móvil y el iPad, la barra de una sección no queda debajo de la
//     navegación, y la burbuja de WhatsApp solo se aparta mientras la barra se ve.
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

// Las columnas de cada cajón (lib/configuracion/reglas-reserva.ts).
const CANCELAR = ['cancelacion_ventana_horas', 'cancelacion_devolver_bono_tardia', 'recuperacion_caducidad_tipo', 'recuperacion_caducidad_dias', 'recuperacion_auto_semanal'];
const deFila = (columnas: string[]) => Object.fromEntries(columnas.map(c => [c, FILA[c]]));

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
const valorFila = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const interruptorEquipo = (page: Page) => page.getByRole('switch', { name: /Las instructoras pueden crear sus clases/ });

/** Abre Reservas, espera a que la fila haya llegado (24 h no es el valor de fábrica) y abre el cajón de esa regla. */
async function cajonDe(page: Page, id: string, nombre: string, opts?: Parameters<typeof abrir>[2]) {
  const r = await abrir(page, 'configuracion?tab=reservas', opts);
  await expect(valorFila(page, 'cancelar-y-recuperar')).toHaveText(/^Hasta 24 h antes/, { timeout: 30_000 });
  await page.locator(`#${id}`).click();
  await expect(titulo(page, nombre)).toBeFocused();
  return r;
}

/** Mi equipo guarda aún con la barra de la sección. */
async function equipo(page: Page, opts?: Parameters<typeof abrir>[2]) {
  const r = await abrir(page, 'configuracion?tab=equipo', opts);
  await expect(interruptorEquipo(page)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  return r;
}

/** ¿Pediría el navegador confirmación al recargar o cerrar la pestaña? */
const pideConfirmarAlSalir = (page: Page) => page.evaluate(() => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});

test.describe('La barra de guardar de los cajones de «Cómo reservan mis alumnas»', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('solo sale con cambios, dice en qué, y se va al deshacerlos a mano', async ({ page }) => {
    const { patches } = await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar');
    await expect(barra(page)).toHaveCount(0);

    await ventana(page).fill('6');
    await page.getByRole('switch', { name: /Dar recuperaciones solas al cerrar la semana/ }).click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar');

    // Volver a lo guardado a mano también cuenta.
    await ventana(page).fill('24');
    await page.getByRole('switch', { name: /Dar recuperaciones solas al cerrar la semana/ }).click();
    await expect(barra(page)).toHaveCount(0);
    expect(patches).toHaveLength(0);
  });

  test('«Guardar» manda las columnas de su regla con lo elegido, y ninguna más', async ({ page }) => {
    const { patches, puts } = await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar');

    await ventana(page).fill('6');
    await guardar(page).click();

    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ ...deFila(CANCELAR), cancelacion_ventana_horas: 6 });
    // Ni la confirmación de asistencia (su endpoint) ni otras reglas.
    expect(puts).toHaveLength(0);
    // Guardado de verdad: el cajón se cierra y la fila dice lo nuevo.
    await expect(titulo(page, 'Cancelar y recuperar')).toHaveCount(0);
    await expect(valorFila(page, 'cancelar-y-recuperar')).toHaveText(/^Hasta 6 h antes/);
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
    test(`lista de espera, «${caso.nombre}»: sus dos columnas de siempre, y solo esas`, async ({ page }) => {
      const { patches } = await cajonDe(page, 'lista-de-espera', 'Lista de espera');
      await caso.elegir(page);
      await expect(barra(page)).toContainText('Cambios sin guardar en: Lista de espera');
      await guardar(page).click();
      await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
      expect(patches[0]).toEqual(caso.columnas);
    });
  }

  test('lo que no se puede guardar deja «Guardar» apagado y dice por qué', async ({ page }) => {
    const { patches } = await cajonDe(page, 'reservar', 'Reservar');

    await page.getByLabel('Días antes de la clase en que se abre la reserva').fill('0');
    await expect(page.getByRole('dialog').locator('[data-consecuencia]')).toContainText('se cerraría antes de abrirse');
    await expect(barra(page).getByRole('alert')).toHaveText('La reserva se cerraría antes de abrirse: cambia los días o los minutos.');
    await expect(guardar(page)).toBeDisabled();
    await guardar(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(0);

    await descartar(page).click();
    await page.keyboard.press('Escape');
    await expect(titulo(page, 'Reservar')).toHaveCount(0);
    await page.locator('#lista-de-espera').click();
    await page.getByLabel('Minutos para aceptar la plaza').fill('');
    await expect(barra(page).getByRole('alert')).toContainText('Pon cuántos minutos tiene para aceptar la plaza');
    await expect(guardar(page)).toBeDisabled();
    await guardar(page).click({ force: true });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(0);
  });

  for (const fallo of [400, 500, 'red', 'cero-filas'] as const) {
    test(`si el servidor dice que no (${fallo}): el cajón se queda, lo dice y no se pierde nada`, async ({ page }) => {
      const { patches } = await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar', { fallo });

      await ventana(page).fill('6');
      await guardar(page).click();

      await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(barra(page).getByRole('alert')).toContainText(/No se ha guardado: .+\. Tus cambios siguen aquí\./, { timeout: 15_000 });
      await expect(guardar(page)).toBeEnabled();
      await expect(ventana(page)).toHaveValue('6');
      await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar');
      await expect(page.getByText('Reglas de reserva guardadas')).toHaveCount(0);
      // Lo que dice la fila sigue siendo lo guardado.
      await expect(valorFila(page, 'cancelar-y-recuperar')).toHaveText(/^Hasta 24 h antes/);
    });
  }

  test('pasar lista se guarda pero la confirmación dice que no: el cajón se queda con «Asistencia» pendiente', async ({ page }) => {
    const { patches, puts } = await cajonDe(page, 'asistencia', 'Asistencia', { falloConfirmacion: true });

    await page.getByRole('switch', { name: /^Pasar lista/ }).click();
    const pedir = page.getByRole('switch', { name: /Pedir confirmación a quien suele no venir/ });
    await expect(pedir).toBeEnabled({ timeout: 15_000 });
    await pedir.click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Asistencia');
    await guardar(page).click();

    await expect.poll(() => puts.length, { timeout: 15_000 }).toBe(1);
    expect(puts[0]).toEqual({ activo: true });
    await expect(barra(page).getByRole('alert')).toContainText('No se ha guardado', { timeout: 15_000 });
    await expect(barra(page)).toContainText('Cambios sin guardar en: Asistencia');
    await expect(pedir).toHaveAttribute('aria-checked', 'true');
    expect(patches).toEqual([{ requiere_checkin_qr: false }]);
    expect(Object.keys(patches[0])).not.toContain('pedir_confirmacion_riesgo');
    await expect(page.getByText('Reglas de reserva guardadas')).toHaveCount(0);
  });

  test('doble toque en «Guardar»: una sola petición', async ({ page }) => {
    const { patches } = await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar', { retrasoMs: 1_000 });
    await ventana(page).fill('6');
    await guardar(page).dblclick();

    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
  });

  test('«Descartar» vuelve a lo guardado sin escribir nada', async ({ page }) => {
    const { patches, puts } = await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar');

    await ventana(page).fill('6');
    await page.getByRole('switch', { name: /Devolver la sesión del bono en cancelaciones tardías/ }).click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Cancelar y recuperar');

    await descartar(page).click();
    await expect(barra(page)).toHaveCount(0);
    await expect(ventana(page)).toHaveValue('24');
    await expect(page.getByRole('switch', { name: /Devolver la sesión del bono en cancelaciones tardías/ })).toHaveAttribute('aria-checked', 'false');
    expect(patches).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });

  test('cerrar el cajón con cambios pregunta; «Seguir editando» no pierde nada', async ({ page }) => {
    await cajonDe(page, 'cancelar-y-recuperar', 'Cancelar y recuperar');
    expect(await pideConfirmarAlSalir(page), 'sin cambios, recargar no pregunta').toBe(false);

    await ventana(page).fill('6');
    expect(await pideConfirmarAlSalir(page), 'con cambios, recargar o cerrar pregunta').toBe(true);

    await page.keyboard.press('Escape');
    const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Los cambios de «Cancelar y recuperar» se perderán.');
    await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(ventana(page)).toHaveValue('6');

    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(titulo(page, 'Cancelar y recuperar')).toHaveCount(0);
    await expect(page).toHaveURL(/\?tab=reservas$/);
    expect(await pideConfirmarAlSalir(page), 'lo descartado ya no pregunta').toBe(false);
  });
});

test.describe('Una sección con barra: salir con cambios pregunta', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('cambiar de sección con cambios pregunta; «Seguir editando» no pierde nada', async ({ page }) => {
    await equipo(page);
    await interruptorEquipo(page).click();
    expect(await pideConfirmarAlSalir(page), 'con cambios, recargar o cerrar pregunta').toBe(true);

    const rail = page.getByRole('navigation', { name: 'Secciones de Configuración' });
    await rail.getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Los cambios de «Mi equipo» se perderán.');
    await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(titulo(page, 'Mi equipo')).toBeVisible();
    await expect(page).toHaveURL(/\?tab=equipo$/);
    await expect(interruptorEquipo(page)).toHaveAttribute('aria-checked', 'false');

    // Otra sección, confirmando.
    await rail.getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible();
    await expect(page).toHaveURL(/\?tab=cobros$/);
    expect(await pideConfirmarAlSalir(page), 'lo descartado ya no pregunta').toBe(false);
  });

  test('ir a otra pantalla del panel con cambios también pregunta', async ({ page }) => {
    await equipo(page);
    await interruptorEquipo(page).click();

    // «Mi cuenta» está en la lista de secciones, pero es otra pantalla.
    await page.getByRole('navigation', { name: 'Secciones de Configuración' }).getByRole('link', { name: 'Mi cuenta' }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(dialogo).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion\?tab=equipo$/);
    await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(/\/mi-perfil$/, { timeout: 30_000 });
  });

  test('sin cambios, cambiar de sección no pregunta nada', async ({ page }) => {
    await equipo(page);
    await page.getByRole('navigation', { name: 'Secciones de Configuración' })
      .getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Lo que se fue de las reglas de reserva se guarda en su sección, solo', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Alta de alumnas: «Compra desde tu enlace» manda su columna y ninguna más', async ({ page }) => {
    // Una fila con su cajón desde el 15-sep (v2): el ancla lo abre.
    const { patches } = await abrir(page, 'configuracion?tab=altas#compra-desde-tu-enlace');
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
    const { patches } = await equipo(page);

    await interruptorEquipo(page).click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Las instructoras crean sus clases');
    await guardar(page).click();

    await expect(page.getByText('Ajuste de tu equipo guardado')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ instructoras_crean_clases: false }]);
  });

  test('Mi equipo: si el servidor dice que no, la barra se queda y el interruptor también', async ({ page }) => {
    const { patches } = await equipo(page, { fallo: 'cero-filas' });
    await interruptorEquipo(page).click();
    await guardar(page).click();

    await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(barra(page).getByRole('alert')).toContainText('No se ha guardado');
    await expect(interruptorEquipo(page)).toHaveAttribute('aria-checked', 'false');
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
      await equipo(page);
      await interruptorEquipo(page).click();
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
      await equipo(page);
      const burbuja = page.getByRole('button', { name: 'Ayuda por WhatsApp' });
      // Sin cambios, la sección entera no la esconde.
      await expect(burbuja).toBeVisible();

      await interruptorEquipo(page).click();
      await expect(barra(page)).toBeVisible();
      await expect(burbuja).toBeHidden();

      await descartar(page).click();
      await expect(barra(page)).toHaveCount(0);
      await expect(burbuja).toBeVisible();
    });

    if (vista.viewport.width < 768) {
      test('«Volver a Configuración» con cambios pregunta antes', async ({ page }) => {
        await equipo(page);
        await interruptorEquipo(page).click();
        await page.getByRole('button', { name: 'Volver a Configuración' }).click();

        const dialogo = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
        await expect(dialogo).toBeVisible();
        await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
        await expect(titulo(page, 'Mi equipo')).toBeVisible();
        await expect(interruptorEquipo(page)).toHaveAttribute('aria-checked', 'false');

        await page.getByRole('button', { name: 'Volver a Configuración' }).click();
        await dialogo.getByRole('button', { name: 'Salir sin guardar' }).click();
        // En el móvil, volver lleva al inicio de Configuración (sus grupos de secciones).
        await expect(page.locator('[aria-labelledby^="inicio-grupo-"]').first()).toBeVisible();
        await expect(titulo(page, 'Mi equipo')).toBeHidden();
      });
    }
  });
}

// A 1024 px la columna es estrecha: la barra llega hasta el borde derecho y la
// burbuja de WhatsApp tapaba «Guardar» (captura del 15-sep).
test.describe('La barra de guardar en un portátil de 1024×768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('la burbuja se aparta y «Guardar» se puede pulsar', async ({ page }) => {
    const { patches } = await equipo(page);
    const burbuja = page.getByRole('button', { name: 'Ayuda por WhatsApp' });
    await expect(burbuja).toBeVisible();

    await interruptorEquipo(page).click();
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
