import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La gerencia entra en SU parte de Configuración.
//
// Decisión del fundador (15-sep): quien lleva una sede gestiona su operación
// —horario, cierres, salas y averías, tipos de clase y horario de citas— y el
// dinero, el contrato y la cuenta siguen siendo de la propietaria. El servidor
// ya lo hace cumplir (`puede_gestionar_sede()` y el trigger
// `tipos_clase_dinero_solo_propietaria`, migr 20260915224739); esta suite fija
// lo que la PANTALLA enseña, que es lo que antes no existía: hasta ahora
// /configuracion estaba cerrada entera a este rol.
//
// Lo que se fija:
//   · el inicio le enseña sus dos secciones y solo sus tarjetas;
//   · un `?tab=` a una sección que no abre cae al inicio, como cualquier enlace
//     viejo, y lo dice;
//   · en «Mi estudio» están el horario, los cierres y las salas, y NO el nombre
//     ni el contacto ni las sedes;
//   · en un tipo de clase no ve «Eliminar» ni puede tocar la penalización: la lee;
//   · y guardar el horario llega de verdad a la base de datos — con contador de
//     peticiones, que un «no mintió» sin petición no vale.
//
// La visibilidad por rol tiene sus tests unitarios (lib/configuracion/
// secciones.test.ts, destino.test.ts); aquí se comprueba que la pantalla los usa.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const UID = 'auth-e2e-duena';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// La gerencia NO es la dueña del estudio: `useRol` mira primero su ficha de
// equipo, y `studios.owner_auth_user_id` tiene que ser de otra persona o saldría
// PROPIETARIO por la puerta de atrás.
const STUDIO = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-otra-duena', email: 'estudio@example.com', moneda: 'EUR',
  nif: 'B12345674', iva_por_defecto: 21, direccion: 'Calle Mayor 4', ciudad: 'Almería',
  plan: 'ESTUDIO', subscription_status: 'active', stripe_account_id: 'acct_e2e',
  cancelacion_ventana_horas: 12, penalizacion_importe_eur: 10, reserva_exigir_plan: true,
};

const GERENCIA = {
  id: 'ins-gerencia', studio_id: STUDIO_ID, nombre: 'Laura Gil', activo: true, rol: 'MANAGER',
  color: '#2C352C', auth_user_id: UID, email: 'laura@example.com', telefono: null,
};

// L-V 8:00-21:00, sábado 9:00-14:00, domingo cerrado. `dia_semana`: 0 = domingo.
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  studio_id: STUDIO_ID, dia_semana: d, abierto: d !== 0,
  hora_apertura: d === 0 ? null : d === 6 ? '09:00:00' : '08:00:00',
  hora_cierre: d === 0 ? null : d === 6 ? '14:00:00' : '21:00:00',
}));

const TIPOS = [
  { id: 'tc-reformer', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_minutos: 50, color: '#F7A6C4', nivel: 'TODOS', objetivos: [], es_online: false, requiere_autorizacion: false },
];

/** El panel sembrado, pero con sesión de gerencia. Devuelve el contador del horario. */
async function panelGerencia(page: Page) {
  await montar(page);
  // ⚠️ Después de `montar`: Playwright prueba las rutas en orden INVERSO al
  // registro, así que estas pisan las suyas.
  const guardadosHorario: unknown[] = [];
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route('**/rest/v1/instructores**', r => json(r, [GERENCIA]));
  await page.route('**/rest/v1/tipos_clase**', r => json(r, TIPOS));
  await page.route('**/rest/v1/rpc/mis_estudios', r =>
    json(r, [{ id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', ciudad: null, rol: 'MANAGER' }]));
  await page.route('**/rest/v1/studio_horario**', r => {
    if (r.request().method() !== 'GET') {
      guardadosHorario.push(r.request().postDataJSON());
      // Lo que devuelve el upsert con `.select('dia_semana')`: las 7 filas.
      return json(r, HORARIO.map(h => ({ dia_semana: h.dia_semana })));
    }
    return json(r, HORARIO);
  });
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
  return { guardadosHorario };
}

const filaInicio = (page: Page, id: string) => page.locator(`#inicio-seccion-${id}`);

test.describe('En el portátil', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('el inicio le enseña sus dos secciones, y ninguna del dinero ni de la cuenta', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion');

    await expect(filaInicio(page, 'estudio')).toBeVisible({ timeout: 30_000 });
    await expect(filaInicio(page, 'clases')).toBeVisible();
    for (const id of ['reservas', 'cobros', 'altas', 'comunicacion', 'motivacion', 'marca', 'web', 'equipo', 'conexiones', 'datos', 'avisos', 'panel']) {
      await expect(filaInicio(page, id), id).toHaveCount(0);
    }
    // «Plan de Tentare» es lo que el estudio le paga a Tentare: de la
    // propietaria. «Mi cuenta» es su propio perfil, y sí.
    await expect(page.locator('#inicio-plan')).toHaveCount(0);
    await expect(page.locator('#inicio-mi-cuenta')).toBeVisible();
    // La guía («Pon tu estudio a punto») es de la propietaria: sus pasos son el
    // NIF, Stripe y la marca, ninguno suyo.
    await expect(page.getByRole('heading', { name: 'Pon tu estudio a punto' })).toHaveCount(0);

    // Y la columna de la izquierda cuenta lo mismo que el inicio.
    const rail = page.getByRole('navigation', { name: 'Secciones de Configuración' });
    await expect(rail.getByRole('link', { name: 'Mi estudio' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Cobros y facturas' })).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'Plan de Tentare' })).toHaveCount(0);
  });

  test('un enlace a una sección que no abre cae al inicio y lo dice', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion?tab=cobros');

    await expect(page.getByRole('status').filter({ hasText: 'Esta parte la gestiona la propietaria' }))
      .toBeVisible({ timeout: 30_000 });
    await expect(filaInicio(page, 'estudio')).toBeVisible();
    // Y una herramienta suya se abre igual de bien por su enlace.
    await ir(page, 'configuracion?tab=estudio&abrir=salas');
    await expect(page.getByRole('heading', { level: 2, name: 'Salas', exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test('«Mi estudio»: horario, cierres y salas; ni el nombre, ni el contacto, ni las sedes', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion?tab=estudio');

    await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#cerrar-el-centro')).toBeVisible();
    await expect(page.locator('#fila-herramienta-salas')).toBeVisible();
    for (const id of ['nombre-y-direccion', 'contacto', 'sedes']) {
      await expect(page.locator(`#${id}`), id).toHaveCount(0);
    }
    // El grupo entero desaparece: un título sin filas debajo no es un ajuste.
    await expect(page.getByRole('heading', { name: 'Datos y contacto' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Horario y cierres' })).toBeVisible();
  });

  test('«Mis clases y citas»: sus tipos de clase y su horario de citas, sin los servicios (que llevan precio)', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion?tab=clases');

    await expect(page.locator('#fila-herramienta-tipos-de-clase')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#horario-de-citas')).toBeVisible();
    await expect(page.locator('#servicios-de-cita')).toHaveCount(0);
  });

  test('un tipo de clase: lo edita, pero no lo borra ni le cambia lo que acaba en dinero', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion?tab=clases&abrir=tipos-de-clase');

    await expect(page.getByText('Reformer').first()).toBeVisible({ timeout: 30_000 });
    // Borrar un tipo es de la propietaria: el botón no está.
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Editar tipo de clase' });
    await expect(panel).toBeVisible();

    // Las tres reglas de dinero se LEEN: ni campo ni «Personalizar».
    await panel.getByRole('button', { name: /^Si cancelan o no vienen/ }).click();
    await expect(panel.getByText('Lo decide la propietaria').first()).toBeVisible();
    await expect(panel.getByLabel('Cargo por cancelar tarde o no venir sin avisar, en euros')).toHaveCount(0);
    await expect(panel.getByLabel('Plazo para cancelar sin perder la sesión, en horas')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Personalizar: ¿Se le cobra algo/ })).toHaveCount(0);
    // Y se dice el valor que rige hoy, que es lo que ella necesita saber.
    await expect(panel.getByText('Como tu estudio: 10,00 €')).toBeVisible();

    // Lo que sí es suyo sigue estando: el nombre y las plazas.
    await expect(panel.getByLabel('Nombre de la clase')).toBeVisible();
    await expect(panel.getByLabel('Plazas por defecto')).toBeVisible();
  });

  test('guardar el horario llega a la base de datos', async ({ page }) => {
    const { guardadosHorario } = await panelGerencia(page);
    await ir(page, 'configuracion?tab=estudio#horario');

    const cajon = page.getByRole('dialog', { name: 'Horario' });
    await expect(cajon).toBeVisible({ timeout: 30_000 });
    // Cerrar el sábado y guardar.
    await cajon.getByRole('switch').nth(5).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => guardadosHorario.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText('Horario guardado')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('En el móvil', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('el inicio cabe y enseña solo lo suyo', async ({ page }) => {
    await panelGerencia(page);
    await ir(page, 'configuracion');

    await expect(filaInicio(page, 'estudio')).toBeVisible({ timeout: 30_000 });
    await expect(filaInicio(page, 'clases')).toBeVisible();
    await expect(filaInicio(page, 'cobros')).toHaveCount(0);
    const desborde = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde, 'el inicio de la gerencia se sale de lado').toBeLessThanOrEqual(0);
  });
});
