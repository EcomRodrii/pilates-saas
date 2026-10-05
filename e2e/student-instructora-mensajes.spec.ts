import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes de la instructora con sus alumnas en la app del estudio (Fase 2):
//   1. Desde la ficha de una alumna le escribe: abre el hilo con su nombre corto
//      y el mensaje se envía.
//   2. La bandeja enseña sus conversaciones con el nombre corto de la alumna.
//   3. Si no se puede abrir (sin clase confirmada con ella), lo explica y no
//      navega a ningún hilo.
//   4. Si el envío falla, lo dice, conserva el borrador y no pinta el mensaje.
//
// ⚠️ Cada camino de fallo lleva contador de intentos: «no pintó nada» sería
// verdad también si la pantalla no hubiera llegado a pedir nada.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };

const FICHA = {
  socioId: 'soc-aina', nombre: 'Aina P.', fotoUrl: null, primeraClase: false, tieneCuenta: true,
  proximas: [], pasadas: [],
};

const PREGUNTA = '¿Mañana hacemos suelo pélvico?';

const HILO = {
  id: 'conv-1', studio_id: 'st', tipo: 'ALUMNA_INSTRUCTORA', titulo: null,
  ancla_sesion_id: null, ancla_reserva_id: null,
  creado_en: '2026-09-10T10:00:00Z', ultimo_mensaje_en: '2026-09-12T08:00:00Z', mostrador_leido_hasta: null,
  leido_hasta: '2026-09-11T08:00:00Z', leido_hasta_otros: null,
  ultimo_cuerpo: PREGUNTA, ultimo_remitente_auth_user_id: 'auth-aina', sin_leer: true,
  alumna: { socioId: 'soc-aina', nombre: 'Aina P.', fotoUrl: null },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, o: { abrirSinClase?: boolean; enviarFalla?: boolean; hiloNoAdmite?: boolean; denunciarFalla?: boolean } = {}) {
  const contador = { abrir: 0, hilos: 0, enviados: [] as string[], moderacion: [] as Record<string, unknown>[] };
  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/perfil', (route) => json(route, { estudios: [], tarifa: null }));
  await page.route('**/api/portal/instructora/alumnas', (route) => json(route, FICHA));
  await page.route('**/api/portal/instructora/mensajes', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string; cuerpo?: string; bloquear?: boolean };
    switch (cuerpo.accion) {
      case 'hilos':
        contador.hilos++;
        return json(route, { hilos: [HILO] });
      case 'abrir':
        contador.abrir++;
        if (o.abrirSinClase) {
          return json(route, { error: 'Podrás escribirle cuando tenga una clase confirmada contigo.', motivo: 'SIN_CLASE_CONFIRMADA' }, 409);
        }
        return json(route, { id: 'conv-1' });
      case 'mensajes':
        return json(route, {
          mensajes: [{ id: 'm1', conversacion_id: 'conv-1', studio_id: 'st', remitente_auth_user_id: 'auth-aina', cuerpo: PREGUNTA, creado_en: '2026-09-12T08:00:00Z' }],
        });
      case 'enviar':
        contador.enviados.push(cuerpo.cuerpo ?? '');
        if (o.enviarFalla) return json(route, { error: 'No se ha podido enviar el mensaje. Vuelve a intentarlo.' }, 500);
        // El estudio cerró el hilo, o hay un bloqueo (moderación): el servidor dice que no.
        if (o.hiloNoAdmite) return json(route, { error: 'Esta conversación ya no admite mensajes.', estado: 'NO_ADMITE' }, 409);
        return json(route, {
          // La cuenta de la sesión del mock (`montarPortal`): así el mensaje que
          // envía sale como suyo, a la derecha, igual que en la app de verdad.
          mensaje: { id: 'm2', conversacion_id: 'conv-1', studio_id: 'st', remitente_auth_user_id: 'auth-marta', cuerpo: cuerpo.cuerpo, creado_en: new Date().toISOString() },
        });
      case 'leido':
        return route.fulfill({ status: 204 });
      case 'denunciar':
        contador.moderacion.push(cuerpo);
        if (o.denunciarFalla) return json(route, { error: 'No se ha podido enviar la denuncia. Inténtalo otra vez.' }, 500);
        return json(route, { ok: true, mensaje: 'Gracias. Lo revisaremos.' });
      case 'bloquear':
        contador.moderacion.push(cuerpo);
        return json(route, { ok: true, estado: cuerpo.bloquear ? 'BLOQUEADA_POR_MI' : 'ABIERTA' });
      default:
        return json(route, { error: 'Acción no válida' }, 400);
    }
  });
  return contador;
}

test.describe('Mensajes de la instructora con sus alumnas', () => {
  test('desde la ficha de una alumna le escribe y el mensaje se envía', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/alumnas/soc-aina`);
    await page.getByRole('button', { name: 'Escribir', exact: true }).click({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/equipo\/mensajes\/conv-1$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Aina P.' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(PREGUNTA)).toBeVisible();
    await expect(page.getByTestId('aviso-hilo')).toHaveText('El estudio también puede leer esta conversación.');

    await page.getByPlaceholder('Escribe un mensaje…').fill('Sí, y trae calcetines antideslizantes');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Sí, y trae calcetines antideslizantes', { exact: true })).toBeVisible();
    expect(contador.abrir).toBe(1);
    expect(contador.enviados).toEqual(['Sí, y trae calcetines antideslizantes']);
  });

  test('la bandeja enseña sus conversaciones con el nombre corto de la alumna', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/mensajes`);

    const hilo = page.getByTestId('hilo');
    await expect(hilo).toContainText('Aina P.', { timeout: 30_000 });
    await expect(hilo).toContainText(PREGUNTA);
    expect(contador.hilos).toBeGreaterThan(0);
  });

  test('si no puede abrir la conversación, lo explica y se queda en la ficha', async ({ page }) => {
    const contador = await montar(page, { abrirSinClase: true });
    await page.goto(`/portal/${SLUG}/equipo/alumnas/soc-aina`);
    await page.getByRole('button', { name: 'Escribir', exact: true }).click({ timeout: 30_000 });

    await expect(page.getByText('Podrás escribirle cuando tenga una clase confirmada contigo.')).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/equipo\/mensajes/);
    expect(contador.abrir).toBeGreaterThan(0);
  });

  test('si el mensaje no se envía, lo dice y conserva el borrador sin pintarlo', async ({ page }) => {
    const contador = await montar(page, { enviarFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/mensajes/conv-1`);
    await expect(page.getByText(PREGUNTA)).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Escribe un mensaje…').fill('Esto no llega');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('No se ha podido enviar el mensaje')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('Esto no llega');
    // Por burbujas y no por texto: el borrador que se conserva en el cuadro también lo contiene.
    await expect(page.getByTestId('mensaje').filter({ hasText: 'Esto no llega' })).toHaveCount(0);
    await expect(page.getByTestId('mensaje')).toHaveCount(1);
    expect(contador.enviados.length).toBeGreaterThan(0);
  });

  test('si el hilo ya no admite mensajes (cerrado o bloqueado), lo dice y conserva el borrador', async ({ page }) => {
    const contador = await montar(page, { hiloNoAdmite: true });
    await page.goto(`/portal/${SLUG}/equipo/mensajes/conv-1`);
    await expect(page.getByText(PREGUNTA)).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Escribe un mensaje…').fill('¿Seguimos el jueves?');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Esta conversación ya no admite mensajes.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveValue('¿Seguimos el jueves?');
    await expect(page.getByTestId('mensaje').filter({ hasText: '¿Seguimos el jueves?' })).toHaveCount(0);
    // Sí se intentó, una vez: el «no» es del servidor, no de una pantalla que no llegó a pedir nada.
    expect(contador.enviados).toEqual(['¿Seguimos el jueves?']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Denunciar y bloquear (App Store 1.2): tocar un mensaje de la alumna abre sus
// opciones. Cada camino lleva su contador: «no dijo gracias» sería verdad
// también si la pantalla no hubiera mandado nada.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('La instructora denuncia y bloquea', () => {
  test('denunciar un mensaje de la alumna: se manda y da las gracias', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/mensajes/conv-1`);
    await page.getByRole('button', { name: 'Opciones del mensaje' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Denunciar este mensaje' }).click();
    await expect(page.getByText('Gracias. Lo revisaremos.')).toBeVisible({ timeout: 30_000 });
    expect(contador.moderacion).toEqual([expect.objectContaining({ accion: 'denunciar', conversacionId: 'conv-1', mensajeId: 'm1' })]);
  });

  test('si la denuncia no llega, lo dice y no da las gracias', async ({ page }) => {
    const contador = await montar(page, { denunciarFalla: true });
    await page.goto(`/portal/${SLUG}/equipo/mensajes/conv-1`);
    await page.getByRole('button', { name: 'Opciones del mensaje' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Denunciar este mensaje' }).click();
    await expect(page.getByText('No se ha podido enviar la denuncia')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Gracias. Lo revisaremos.')).toHaveCount(0);
    expect(contador.moderacion.length).toBeGreaterThan(0);
  });

  test('bloquear pide confirmación, quita el compositor y se puede deshacer', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/mensajes/conv-1`);
    await page.getByRole('button', { name: 'Opciones del mensaje' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Bloquear a Aina P.' }).click();
    await expect(page.getByRole('heading', { name: '¿Bloquear a Aina P.?' })).toBeVisible();
    // Sin confirmar, no se ha mandado nada.
    expect(contador.moderacion).toHaveLength(0);
    await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
    await expect(page.getByText('Has bloqueado esta conversación.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toHaveCount(0);
    expect(contador.moderacion).toEqual([expect.objectContaining({ accion: 'bloquear', bloquear: true })]);

    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByPlaceholder('Escribe un mensaje…')).toBeVisible({ timeout: 30_000 });
    expect(contador.moderacion[1]).toMatchObject({ accion: 'bloquear', bloquear: false });
  });
});
