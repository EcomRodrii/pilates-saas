import { test, expect, type Page, type Route } from '@playwright/test';

// /interno → Visita guiada: el fundador decide a quién se le da. Servidor simulado CON memoria:
// cada acción cambia la lista que devuelve, y se cuenta cada petición (un test de camino de
// fallo sin contador de intentos es hueco: test-4xx-necesita-contador-de-intentos).
const STORAGE_KEY = 'sb-example-auth-token';

type Estado = 'desactivada' | 'sin-empezar' | 'en-curso' | 'completada';
interface Fila {
  id: string; nombre: string; slug: string; plan: string; creadoEn: string;
  esDemo: boolean; deCadena: boolean; suspendido: boolean; obligatorio: boolean;
  resumen: { estado: Estado; texto: string; porcentaje: number };
}
const fila = (id: string, nombre: string, extra: Partial<Fila> = {}): Fila => ({
  id, nombre, slug: id, plan: 'BASE', creadoEn: '2026-10-01T10:00:00Z', esDemo: false, deCadena: false, suspendido: false, obligatorio: false,
  resumen: { estado: 'desactivada', texto: 'Desactivada', porcentaje: 0 }, ...extra,
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opciones: { permisos?: string[]; fallar?: boolean } = {}) {
  const peticiones: Record<string, unknown>[] = [];
  const s = {
    nuevos: false,
    estudios: [
      fila('boutique', 'Pilates Boutique', { obligatorio: true, resumen: { estado: 'en-curso', texto: 'Capítulo 3 de 10 · Tu horario', porcentaje: 22 } }),
      fila('alya', 'Alya Pilates'),
      fila('hecha', 'Estudio que ya la hizo', { resumen: { estado: 'completada', texto: 'Completada el 7 oct', porcentaje: 100 } }),
      fila('demo', 'Estudio demo', { esDemo: true }),
    ],
  };
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, STORAGE_KEY);
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: opciones.permisos ?? ['studios.read', 'studios.update'] }));
  await page.route('**/api/interno/visita-guiada**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, s);
    const cuerpo = req.postDataJSON() as Record<string, unknown>;
    peticiones.push(cuerpo);
    if (opciones.fallar) return json(route, { error: 'No se ha podido cambiar el estudio.' }, 500);
    if (cuerpo.accion === 'nuevos') s.nuevos = cuerpo.activar === true;
    if (cuerpo.accion === 'estudio') {
      const e = s.estudios.find(x => x.id === cuerpo.id)!;
      e.obligatorio = cuerpo.operacion !== 'desactivar';
      e.resumen = e.obligatorio ? { estado: 'sin-empezar', texto: 'Activa · todavía no ha empezado', porcentaje: 0 } : { estado: 'desactivada', texto: 'Desactivada', porcentaje: 0 };
    }
    let cambiados = 0;
    if (cuerpo.accion === 'todos') {
      for (const e of s.estudios) {
        if (e.esDemo) continue;
        if (cuerpo.activar === true && !e.obligatorio && e.resumen.estado !== 'completada') { e.obligatorio = true; e.resumen = { estado: 'sin-empezar', texto: 'Activa · todavía no ha empezado', porcentaje: 0 }; cambiados++; }
        if (cuerpo.activar === false && e.obligatorio) { e.obligatorio = false; e.resumen = { estado: 'desactivada', texto: 'Desactivada', porcentaje: 0 }; cambiados++; }
      }
    }
    return json(route, { ok: true, cambiados });
  });
  await page.goto('/interno/visita-guiada');
  return peticiones;
}

const lista = (page: Page, nombre: string) => page.getByRole('listitem').filter({ hasText: nombre });

test.describe('/interno → Visita guiada', () => {
  test('lista los estudios con su estado, está en el menú y marca demos', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Visita guiada', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Visita guiada' })).toBeVisible();
    await expect(lista(page, 'Pilates Boutique')).toContainText('Capítulo 3 de 10 · Tu horario');
    await expect(lista(page, 'Alya Pilates')).toContainText('Desactivada');
    await expect(lista(page, 'Estudio que ya la hizo')).toContainText('Completada el 7 oct');
    await expect(lista(page, 'Estudio demo')).toContainText('demo');
    await expect(page.getByText('Ahora la tienen activada 1 de 4')).toBeVisible();
  });

  test('activar un estudio lo pide al servidor y cambia su estado', async ({ page }) => {
    const peticiones = await montar(page);
    const alya = lista(page, 'Alya Pilates');
    await alya.getByRole('button', { name: 'Activar', exact: true }).click({ timeout: 30_000 });
    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    expect(peticiones[0]).toEqual({ accion: 'estudio', id: 'alya', operacion: 'activar' });
    await expect(alya).toContainText('Activa · todavía no ha empezado');
    await expect(alya.getByRole('button', { name: 'Desactivar' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Visita activada en Alya Pilates');
  });

  test('«Activar desde cero» y «Desactivar» mandan su operación', async ({ page }) => {
    const peticiones = await montar(page);
    await lista(page, 'Alya Pilates').getByRole('button', { name: 'Activar desde cero' }).click({ timeout: 30_000 });
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0]).toEqual({ accion: 'estudio', id: 'alya', operacion: 'activar-desde-cero' });
    await lista(page, 'Pilates Boutique').getByRole('button', { name: 'Desactivar' }).click();
    await expect.poll(() => peticiones.length).toBe(2);
    expect(peticiones[1]).toEqual({ accion: 'estudio', id: 'boutique', operacion: 'desactivar' });
    await expect(lista(page, 'Pilates Boutique')).toContainText('Desactivada');
  });

  test('una demo no se puede activar', async ({ page }) => {
    await montar(page);
    const demo = lista(page, 'Estudio demo');
    await expect(demo.getByRole('button', { name: 'Activar', exact: true })).toBeDisabled({ timeout: 30_000 });
    await expect(demo.getByRole('button', { name: 'Activar desde cero' })).toBeDisabled();
  });

  test('«Activar en todos» pide un segundo clic y no toca demos ni completadas', async ({ page }) => {
    const peticiones = await montar(page);
    // Activables: Alya (la demo y la ya completada no cuentan; Boutique ya la tiene).
    const boton = page.getByRole('button', { name: 'Activar en todos (1)', exact: true });
    await boton.click({ timeout: 30_000 });
    expect(peticiones).toHaveLength(0);
    await page.getByRole('button', { name: /¿Activar en 1\? Pulsa otra vez/ }).click();
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0]).toEqual({ accion: 'todos', activar: true });
    await expect(page.getByRole('status')).toContainText('Visita activada en 1 estudio.');
    await expect(lista(page, 'Alya Pilates')).toContainText('Activa ·');
    await expect(lista(page, 'Estudio demo')).not.toContainText('Activa ·');
    await expect(lista(page, 'Estudio que ya la hizo')).toContainText('Completada');
  });

  test('«Desactivar en todos» también pide confirmación y se puede cancelar', async ({ page }) => {
    const peticiones = await montar(page);
    await page.getByRole('button', { name: 'Desactivar en todos (1)', exact: true }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect(peticiones).toHaveLength(0);
    await page.getByRole('button', { name: 'Desactivar en todos (1)', exact: true }).click();
    await page.getByRole('button', { name: /¿Desactivar en 1\? Pulsa otra vez/ }).click();
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0]).toEqual({ accion: 'todos', activar: false });
    await expect(lista(page, 'Pilates Boutique')).toContainText('Desactivada');
  });

  test('el interruptor de estudios nuevos se guarda y se lee', async ({ page }) => {
    const peticiones = await montar(page);
    const interruptor = page.getByRole('switch', { name: 'Visita guiada en estudios nuevos' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
    await expect(page.getByText('Los estudios que se creen ahora NO reciben la visita')).toBeVisible();
    await interruptor.click();
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0]).toEqual({ accion: 'nuevos', activar: true });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Todo estudio que se cree desde ahora recibe la visita')).toBeVisible();
  });

  test('si el servidor dice que no, no finge que se hizo', async ({ page }) => {
    const peticiones = await montar(page, { fallar: true });
    const alya = lista(page, 'Alya Pilates');
    await alya.getByRole('button', { name: 'Activar', exact: true }).click({ timeout: 30_000 });
    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido cambiar el estudio' })).toBeVisible();
    await expect(alya).toContainText('Desactivada');
    await expect(alya.getByRole('button', { name: 'Activar', exact: true })).toBeVisible();
  });

  test('quien solo puede leer ve la lista pero ningún botón que cambie algo', async ({ page }) => {
    await montar(page, { permisos: ['studios.read'] });
    await expect(lista(page, 'Alya Pilates')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Activar|Desactivar/ })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Visita guiada en estudios nuevos' })).toBeDisabled();
  });

  test('buscar filtra la lista', async ({ page }) => {
    await montar(page);
    await page.getByLabel('Buscar estudio').fill('alya');
    await expect(lista(page, 'Alya Pilates')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('listitem').filter({ hasText: 'Pilates Boutique' })).toHaveCount(0);
  });
});
