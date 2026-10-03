import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Peticiones desde su app» (plaza fija): lo que ve la alumna, al lado del
// interruptor.
//
// Los estudios decían que no les quedaba claro cómo se marcan las alumnas en una
// clase fija sin reservarla cada semana. Investigado a fondo (22-sep): el ajuste
// venía APAGADO de serie en los 7 estudios de producción, sin ningún motivo de
// negocio para tenerlo así — con eso apagado, ninguna alumna veía NUNCA la opción
// de quedarse fija. Ahora viene ENCENDIDO de serie (migr
// `20260922151000_plaza_fija_desde_app_por_defecto`); el estudio lo sigue pudiendo
// apagar si prefiere seguir dándolas a mano en recepción. Debajo del interruptor
// se enseña el cartel que ve la alumna con las MISMAS palabras que su app
// (`TEXTOS_PLAZA_FIJA`), atenuado mientras esté apagado.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const fila = (extra: Record<string, unknown> = {}) => ({
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
  email: 'cloe@example.com', moneda: 'EUR', plan: 'ESTUDIO', subscription_status: 'active',
  cancelacion_ventana_horas: 24, ...extra,
});
const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrirAjuste(page: Page, columnas: Record<string, unknown> = {}) {
  const patches: Record<string, unknown>[] = [];
  await montar(page);
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, fila(columnas));
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await ir(page, 'configuracion?tab=reservas');
  await page.locator('#plaza-fija-desde-la-app').click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Peticiones desde su app', exact: true })).toBeFocused({ timeout: 30_000 });
  return { patches };
}

test.describe('Configuración · peticiones de plaza fija desde la app', () => {
  test.describe.configure({ timeout: 180_000 });

  test('de serie ya viene encendido: explica cómo se marcan las alumnas y enseña lo que ven, sin el aviso de que no lo ven', async ({ page }) => {
    await abrirAjuste(page);

    // La explicación dice lo que hace de serie, cómo se pide y el límite de la cuota.
    await expect(page.getByText(/pueden pedir quedarse fijas en una clase que se repite/)).toBeVisible();
    await expect(page.getByText(/con bono se reserva clase a clase/)).toBeVisible();

    const vista = page.getByTestId('vista-previa-plaza-fija');
    await expect(vista).toContainText('Así lo ve tu alumna');
    await expect(vista).toContainText('¿Vienes los martes a las 10:00?');
    await expect(vista).toContainText('tu plaza queda reservada cada semana');
    await expect(vista).toContainText('Tu estudio tiene que confirmarla');
    await expect(vista).toContainText('Pedir clase fija');
    await expect(vista).not.toContainText('Ahora tus alumnas no lo ven');
  });

  test('apagado a mano, se ve atenuado con el aviso de que no lo ven', async ({ page }) => {
    await abrirAjuste(page, { plaza_fija_solicitar_desde_app: false });
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('¿Vienes los martes a las 10:00?');
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Ahora tus alumnas no lo ven');
  });

  test('apagarlo (de serie viene encendido) manda solo sus columnas al guardar', async ({ page }) => {
    const { patches } = await abrirAjuste(page);
    await page.getByRole('switch', { name: /Pueden pedir plaza fija/ }).click();

    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Ahora tus alumnas no lo ven');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    // La tarjeta manda TODAS sus columnas: también quién aprueba y el tope (sin tocar: manual y 50 %, lo de siempre).
    expect(patches[0]).toEqual({
      plaza_fija_solicitar_desde_app: false, plaza_fija_pausa_desde_app: false,
      plaza_fija_aprobacion: 'MANUAL', plaza_fija_auto_tope_pct: 50,
    });
  });

  // ── Quién aprueba las plazas fijas que piden ──

  test('de serie las apruebas tú (como siempre), y el porcentaje no se enseña hasta elegir que se den solas', async ({ page }) => {
    await abrirAjuste(page);
    const grupo = page.getByTestId('aprobacion-plaza-fija');
    await expect(grupo.getByRole('radio', { name: /La apruebo yo/ })).toBeChecked();
    await expect(grupo.getByRole('radio', { name: /Se da sola si cumple mis reglas/ })).not.toBeChecked();
    await expect(page.getByTestId('tope-plaza-fija')).toHaveCount(0);
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Tu estudio tiene que confirmarla');
  });

  test('con las pedidas apagadas no hay nada que aprobar: el selector no sale', async ({ page }) => {
    await abrirAjuste(page, { plaza_fija_solicitar_desde_app: false });
    await expect(page.getByTestId('aprobacion-plaza-fija')).toHaveCount(0);
  });

  test('⚠️ pasar a «se da sola» PREGUNTA qué se comprueba antes de guardar, y solo entonces manda la columna', async ({ page }) => {
    const { patches } = await abrirAjuste(page);
    await page.getByRole('radio', { name: /Se da sola si cumple mis reglas/ }).check();
    // El tope aparece con su valor de serie, y la vista previa cambia a lo que dirá la app de la alumna.
    await expect(page.getByTestId('tope-plaza-fija').getByRole('radio', { name: '50 %' })).toBeChecked();
    await expect(page.getByTestId('vista-previa-plaza-fija')).toContainText('Si cumples las reglas de tu estudio, se te da al momento');
    await expect(page.getByTestId('vista-previa-plaza-fija')).not.toContainText('Tu estudio tiene que confirmarla:');

    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('¿Dar las plazas fijas sin que las apruebes?')).toBeVisible();
    // Dice lo que se comprueba y lo que NO se aprueba solo.
    await expect(page.getByText(/límite semanal de su cuota/)).toBeVisible();
    await expect(page.getByText(/no pasan del 50 % de su aforo/)).toBeVisible();
    // Mientras no confirme, no se ha escrito nada.
    expect(patches).toHaveLength(0);

    await page.getByRole('button', { name: 'Sí, que se den solas' }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    expect(patches[0]).toMatchObject({ plaza_fija_aprobacion: 'AUTOMATICA', plaza_fija_auto_tope_pct: 50 });
  });

  test('«Volver» en esa pregunta no guarda nada', async ({ page }) => {
    const { patches } = await abrirAjuste(page);
    await page.getByRole('radio', { name: /Se da sola si cumple mis reglas/ }).check();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('¿Dar las plazas fijas sin que las apruebes?')).toBeVisible();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(page.getByText('¿Dar las plazas fijas sin que las apruebes?')).toHaveCount(0);
    expect(patches, 'no se guardó nada').toHaveLength(0);
  });

  test('ya en automática, cambiar solo el porcentaje se guarda sin preguntar', async ({ page }) => {
    const { patches } = await abrirAjuste(page, { plaza_fija_aprobacion: 'AUTOMATICA', plaza_fija_auto_tope_pct: 50 });
    await page.getByTestId('tope-plaza-fija').getByRole('radio', { name: '75 %' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);
    expect(patches[0]).toMatchObject({ plaza_fija_aprobacion: 'AUTOMATICA', plaza_fija_auto_tope_pct: 75 });
    await expect(page.getByText('¿Dar las plazas fijas sin que las apruebes?')).toHaveCount(0);
  });
});
