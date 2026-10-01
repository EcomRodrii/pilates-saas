import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// «Dar de baja» y «Borrar sus datos», separados (Fase 0 de Clientas).
//
// Antes: «Desactivar» era un clic sin confirmación que dejaba la cuota
// renovándose y cobrándose, y la papelera de cada fila decía «¿Dar de baja?» y
// BORRABA los datos para siempre. Aquí se fija:
//   · la ventana de baja cuenta lo que va a pasar con SUS datos (cuota que ya no
//     se renueva, su recibo pendiente, sus reservas) antes de pulsar;
//   · solo da por hecho lo que la ruta confirma: con un 500 no cambia nada y lo
//     dice, y hubo petición (contador > 0: un camino de fallo sin contador es
//     hueco, `.claude/tentare-os.md`);
//   · borrar datos exige escribir su nombre, y solo lo ve la propietaria;
//   · en la lista no queda ni la papelera ni el «Desactivar» de un clic.
//
// Andamiaje compartido: `panel-sembrado.ts` (Laura Martín = soc-2, cuota mensual
// vigente, un recibo pendiente y reservas futuras). Los `page.route` propios van
// SIEMPRE después de `montar()`: si no, el comodín los tapa.

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// Lo que lee la ventana para decir qué pasa con sus recibos pendientes
// (`dbRecibosPendientesDeCuota`): uno de 89 € sin cobro automático.
async function reciboPendienteSinReintento(page: Page) {
  await page.route(
    (u) => u.pathname.endsWith('/rest/v1/recibos') && (u.searchParams.get('select') ?? '').includes('proximo_reintento'),
    (r) => json(r, [{ importe: 89, proximo_reintento: null, stripe_payment_intent_id: null, checkout_session_id: null, cobro_mostrador_pi: null }]),
  );
}

async function abrirFichaDeLaura(page: Page) {
  await ir(page, 'clientas/soc-2');
  await expect(page.getByRole('heading', { name: /Laura Martín/ }).first()).toBeVisible({ timeout: 30_000 });
}

// Dar de baja, volver a dar de alta y borrar viven en «Más acciones» de la cabecera.
async function abrirMenu(page: Page) {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  return page.getByRole('menu', { name: 'Más acciones' });
}

test.describe('Clientas · dar de baja', () => {
  test('la ventana cuenta qué pasa con su cuota y sus reservas, y solo pinta lo que el servidor confirma', async ({ page }) => {
    await montar(page);
    await reciboPendienteSinReintento(page);
    const cuerpos: unknown[] = [];
    await page.route((u) => u.pathname === '/api/socios/soc-2/baja', async (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      cuerpos.push(r.request().postDataJSON());
      return json(r, {
        ok: true,
        cuotasAlVencer: [{ id: 'sus-2', plan: 'Mensual ilimitado', fechaFin: '2026-10-21' }],
        cuotasCanceladas: [], plazasDadasDeBaja: [], reservasDePlazaRetiradas: [],
        reservasCanceladas: [], reservasSinCancelar: 0,
      });
    });

    await abrirFichaDeLaura(page);
    await (await abrirMenu(page)).getByRole('menuitem', { name: 'Dar de baja' }).click();

    const ventana = page.getByRole('dialog');
    await expect(ventana.getByText(/Dar de baja a Laura Martín/)).toBeVisible();
    await expect(ventana).toContainText(/«Mensual ilimitado» sigue hasta el \d+ de \S+ y ya no se renueva/);
    // La política de sus recibos pendientes, con su importe: no «no se le cobra» a secas.
    await expect(ventana).toContainText('No se generarán cobros nuevos de esta cuota. Le queda 1 recibo pendiente (89 €)');
    // Sus reservas futuras: casilla marcada por defecto, y se puede desmarcar.
    const casilla = ventana.getByRole('checkbox');
    await expect(casilla).toBeChecked();

    // Sin decir por qué se va no se puede: el botón espera al motivo y no sale nada.
    const darDeBaja = ventana.getByRole('button', { name: 'Dar de baja', exact: true });
    await expect(darDeBaja).toBeDisabled();
    expect(cuerpos).toEqual([]);
    await ventana.getByRole('button', { name: 'Se muda' }).click();
    await expect(ventana.getByRole('button', { name: 'Se muda' })).toHaveAttribute('aria-pressed', 'true');

    await darDeBaja.click();
    await expect.poll(() => cuerpos.length).toBe(1);
    expect(cuerpos[0]).toEqual({ cancelarReservas: true, motivo: 'SE_MUDA' });
    await expect(page.getByText(/Laura está de baja\. Su cuota sigue hasta el \d+ de \S+ y no se renueva\./)).toBeVisible();
    await expect((await abrirMenu(page)).getByRole('menuitem', { name: 'Volver a darla de alta' })).toBeVisible();
  });

  test('si el servidor dice que no, la ventana lo cuenta y la clienta sigue de alta', async ({ page }) => {
    await montar(page);
    await reciboPendienteSinReintento(page);
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/socios/soc-2/baja', (r) => {
      intentos++;
      return json(r, { error: 'No se ha podido parar la renovación de su cuota. No se ha dado de baja.' }, 500);
    });

    await abrirFichaDeLaura(page);
    await (await abrirMenu(page)).getByRole('menuitem', { name: 'Dar de baja' }).click();
    const ventana = page.getByRole('dialog');
    await ventana.getByRole('checkbox').uncheck();
    await ventana.getByRole('button', { name: 'Precio' }).click();
    await ventana.getByRole('button', { name: 'Dar de baja', exact: true }).click();

    await expect(ventana.getByRole('alert')).toContainText('No se ha podido parar la renovación de su cuota. No se ha dado de baja.');
    expect(intentos).toBeGreaterThan(0);
    await ventana.getByRole('button', { name: 'Cancelar' }).click();
    // Nada que deshacer: sigue ofreciéndose «Dar de baja», no «Volver a darla de alta».
    const menu = await abrirMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Dar de baja' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Volver a darla de alta' })).toHaveCount(0);
  });

  test('en la lista no queda ni la papelera ni el «Desactivar» de un clic', async ({ page }) => {
    await montar(page);
    await ir(page, 'clientas');
    await expect(page.getByText('Laura').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[title="Eliminar"]')).toHaveCount(0);
    await expect(page.locator('button[title="Desactivar"]')).toHaveCount(0);
  });
});

test.describe('Clientas · borrar sus datos (RGPD)', () => {
  test('hay que escribir su nombre, y si el servidor lo rechaza se dice por qué', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/socios/eliminar', (r) => {
      intentos++;
      return json(r, { error: 'Solo la propietaria del estudio puede borrar los datos de una clienta.' }, 403);
    });

    await abrirFichaDeLaura(page);
    await (await abrirMenu(page)).getByRole('menuitem', { name: 'Borrar sus datos' }).click();
    const ventana = page.getByRole('dialog');
    await expect(ventana).toContainText('no se puede deshacer');
    const borrar = ventana.getByRole('button', { name: 'Borrar para siempre' });
    await expect(borrar).toBeDisabled();
    await ventana.getByRole('textbox').fill('Laura');
    await expect(borrar).toBeDisabled();
    await ventana.getByRole('textbox').fill('laura martín');
    await expect(borrar).toBeEnabled();
    await borrar.click();

    // Dentro de la ventana, y una sola vez (no también en el aviso global).
    await expect(ventana.getByRole('alert')).toHaveText('Solo la propietaria del estudio puede borrar los datos de una clienta.');
    await expect(page.getByText('Solo la propietaria del estudio puede borrar los datos de una clienta.')).toHaveCount(1);
    expect(intentos).toBeGreaterThan(0);
  });

  test('recepción no ve «Borrar sus datos» (y sí puede dar de baja)', async ({ page }) => {
    await montar(page);
    // La sesión pasa a ser de recepción: el estudio es de otra cuenta y la ficha
    // del equipo con este usuario tiene rol RECEPCION.
    await page.route('**/rest/v1/studios**', (r) => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'otra-cuenta',
      email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
    }));
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-rec', studio_id: 'studio-test', nombre: 'Ana Peña', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: 'auth-e2e-duena' },
    ]));

    await abrirFichaDeLaura(page);
    const menu = await abrirMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Dar de baja' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Borrar sus datos' })).toHaveCount(0);
  });
});

test.describe('Clientas · acciones en bloque', () => {
  test('«Enviar acceso a la app» dice a quién le llega y cuenta lo que ha salido de verdad', async ({ page }) => {
    await montar(page);
    const envios: unknown[] = [];
    await page.route((u) => u.pathname === '/api/emails/send', (r) => {
      envios.push(r.request().postDataJSON());
      return json(r, {}, 500);
    });

    await ir(page, 'clientas');
    await page.getByRole('row', { name: /María García Fernández/ }).getByRole('checkbox').check();
    await page.getByRole('toolbar', { name: 'Acciones con las seleccionadas' }).getByRole('button', { name: 'Acceso a la app' }).click();
    const ventana = page.getByRole('dialog');
    await expect(ventana).toContainText('el enlace para entrar en su app');
    await ventana.getByRole('button', { name: 'Enviar a 1' }).click();

    // El servidor lo rechazó: no se cuenta como enviado.
    // Y dice a QUIÉN no le ha salido, para saber con quién reintentar.
    await expect(ventana.getByRole('status')).toHaveText('Enviado a 0. No ha salido el de María García Fernández: vuelve a intentarlo.');
    expect(envios.length).toBeGreaterThan(0);
    expect(envios[0]).toMatchObject({ tipo: 'bienvenida', socioId: 'soc-1' });
  });

  test('una acción en bloque no cae sobre clientas que el filtro ha dejado fuera', async ({ page }) => {
    await montar(page);
    await ir(page, 'clientas');
    await page.getByRole('row', { name: /María García Fernández/ }).getByRole('checkbox').check();
    await expect(page.getByText('1 seleccionada')).toBeVisible();

    await page.getByPlaceholder(/Buscar por nombre/).fill('Laura');
    await expect(page.getByText('1 seleccionada')).toHaveCount(0);
  });
});
