import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Archivar un tipo de clase (Fase 2 · D1, migr 20260930203000).
//
// Un tipo con historial no se puede borrar (la FK de `sesiones` lo impide), así
// que el sitio de una clase que ya no se da es «Archivados». Lo que se fija:
//  · el diálogo cuenta con cifras lo que pasa ANTES de pulsar — clases que
//    quedan, alumnas apuntadas, la serie que deja de renovarse, el plan que se
//    queda sin clases —, y solo lo que el panel sabe de verdad;
//  · archivar es UN PATCH de `archivado_en`, y el tipo pasa a «Archivados»;
//  · «Recuperar» lo devuelve (PATCH a null);
//  · si la base de datos no toca ninguna fila (sin permiso), el diálogo lo dice
//    y el tipo sigue activo — con contador: «no mintió» no vale si no se intentó.
// Fechas con desfase explícito: la pantalla cuenta en hora del estudio.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Jueves 1 de octubre de 2026, mediodía en Madrid.
const AHORA = new Date('2026-10-01T12:00:00+02:00');

const TIPO_BASE = { studio_id: STUDIO_ID, descripcion: null, nivel: 'TODOS', foto_url: null, logo_url: null, duracion_minutos: 50 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const sesion = (id: string, inicio: string, serie: string | null) => ({
  id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-mat', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio, fin: inicio, aforo_maximo: 8, cancelada: false, notas: null, precio_puntual: null, serie_id: serie,
});

interface Opciones {
  /** `archivado_en` con el que arranca «Mat». */
  matArchivado?: string | null;
  /** Filas que la base de datos dice haber tocado en el PATCH (vacío = sin permiso). */
  patchTocaFilas?: boolean;
}

async function montar(page: Page, o: Opciones = {}) {
  await page.clock.setFixedTime(AHORA);
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  const tipos: Record<string, unknown>[] = [
    { ...TIPO_BASE, id: 'tc-reformer', nombre: 'Reformer', color: '#1f2937', archivado_en: null },
    { ...TIPO_BASE, id: 'tc-mat', nombre: 'Mat', color: '#c4b5fd', archivado_en: o.matArchivado ?? null },
  ];
  const patches: { id: string | null; body: Record<string, unknown> }[] = [];

  // OJO: Playwright resuelve las rutas en orden INVERSO al de registro, así que
  // los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, {
    id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID,
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Dos clases de Mat por delante (una serie) y una ya pasada, que no cuenta.
  await page.route('**/rest/v1/sesiones**', route => json(route, [
    sesion('ses-1', '2026-10-05T18:00:00+02:00', 'serie-mat'),
    sesion('ses-2', '2026-10-12T18:00:00+02:00', 'serie-mat'),
    sesion('ses-pasada', '2026-09-28T18:00:00+02:00', 'serie-mat'),
  ]));
  // Dos alumnas: una con plaza en las dos (cuenta una vez) y otra esperando.
  await page.route('**/rest/v1/reservas**', route => json(route, [
    { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'soc-1', estado: 'CONFIRMADA', creado_en: '2026-09-20T10:00:00+02:00' },
    { id: 'r2', studio_id: STUDIO_ID, sesion_id: 'ses-2', socio_id: 'soc-1', estado: 'CONFIRMADA', creado_en: '2026-09-20T10:00:00+02:00' },
    { id: 'r3', studio_id: STUDIO_ID, sesion_id: 'ses-2', socio_id: 'soc-2', estado: 'LISTA_ESPERA', creado_en: '2026-09-21T10:00:00+02:00' },
    { id: 'r4', studio_id: STUDIO_ID, sesion_id: 'ses-pasada', socio_id: 'soc-3', estado: 'ASISTIDA', creado_en: '2026-09-21T10:00:00+02:00' },
  ]));
  // Un bono que solo sirve para Mat.
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [
    { id: 'plan-mat', studio_id: STUDIO_ID, nombre: 'Bono Mat', descripcion: null, precio: 60, tipo: 'BONO', sesiones: 10, activo: true },
  ]));
  await page.route('**/rest/v1/plan_tipos_clase**', route => json(route, [
    { plan_id: 'plan-mat', tipo_clase_id: 'tc-mat', limite_semanal: null },
  ]));

  await page.route('**/rest/v1/tipos_clase**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const id = new URL(req.url()).searchParams.get('id')?.replace(/^eq\./, '') ?? null;
      const body = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
      patches.push({ id, body });
      if (o.patchTocaFilas === false) return json(route, []);
      const fila = tipos.find(t => t.id === id);
      if (fila) Object.assign(fila, body);
      return json(route, fila ? [{ id }] : []);
    }
    // Con `?id=eq.X` (al comprobar si la fila sigue existiendo), solo esa.
    const id = new URL(req.url()).searchParams.get('id')?.replace(/^eq\./, '');
    return json(route, id ? tipos.filter(t => t.id === id) : tipos);
  });

  await page.goto('/configuracion?tab=clases&abrir=tipos-de-clase');
  await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
  return { patches };
}

test.describe('Archivar un tipo de clase', () => {
  test('el diálogo cuenta lo que pasa con cifras y archivar es un PATCH de archivado_en', async ({ page }) => {
    const { patches } = await montar(page);

    await page.getByRole('button', { name: 'Archivar Mat' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Archivar «Mat»' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('No podrás programar más clases de este tipo hasta que lo recuperes.');
    await expect(dialogo).toContainText('Tiene 2 clases programadas, la última el 12 de octubre, con 2 alumnas apuntadas. Se quedan como están y se pueden seguir reservando.');
    await expect(dialogo).toContainText('Su clase que se repite deja de renovarse: termina con la última fecha que ya tiene.');
    await expect(dialogo).toContainText('«Bono Mat» solo sirve para este tipo');
    await expect(dialogo).toContainText('Su historial (asistencias, informes, cobros) no se toca.');
    expect(patches, 'abrir el diálogo no escribe nada').toHaveLength(0);

    await dialogo.getByRole('button', { name: 'Archivar', exact: true }).click();

    await expect(dialogo).toBeHidden();
    await expect(page.getByText('«Mat» archivado')).toBeVisible();
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe('tc-mat');
    expect(Object.keys(patches[0].body)).toEqual(['archivado_en']);
    expect(typeof patches[0].body.archivado_en).toBe('string');

    // Sale de la lista de los que se programan y pasa a «Archivados».
    await expect(page.getByRole('button', { name: 'Archivar Mat' })).toHaveCount(0);
    await expect(page.getByText('1 tipo de clase configurado')).toBeVisible();
    const plegable = page.getByRole('button', { name: /Archivados \(1\)/ });
    await expect(plegable).toContainText('no se programan clases nuevas suyas; su historial se conserva');
    await plegable.click();
    await expect(page.getByRole('button', { name: 'Recuperar Mat' })).toBeVisible();
  });

  test('«Recuperar» lo devuelve a la lista con un PATCH a null', async ({ page }) => {
    const { patches } = await montar(page, { matArchivado: '2026-09-30T18:00:00+02:00' });

    await expect(page.getByRole('button', { name: 'Archivar Mat' })).toHaveCount(0);
    await page.getByRole('button', { name: /Archivados \(1\)/ }).click();
    const lista = page.locator('#tipos-archivados');
    await expect(lista).toContainText('Archivado el 30 de septiembre · le quedan 2 clases, la última el 12 de octubre');

    await lista.getByRole('button', { name: 'Recuperar Mat' }).click();

    await expect(page.getByText('«Mat» vuelve a estar entre tus tipos de clase')).toBeVisible();
    expect(patches).toEqual([{ id: 'tc-mat', body: { archivado_en: null } }]);
    await expect(page.getByRole('button', { name: 'Archivar Mat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archivados/ })).toHaveCount(0);
  });

  test('si la base de datos no toca ninguna fila, el diálogo lo dice y el tipo sigue activo', async ({ page }) => {
    const { patches } = await montar(page, { patchTocaFilas: false });

    await page.getByRole('button', { name: 'Archivar Mat' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Archivar «Mat»' });
    await dialogo.getByRole('button', { name: 'Archivar', exact: true }).click();

    await expect(dialogo.getByRole('alert')).toHaveText(
      'No tienes permiso para cambiar los tipos de clase. Pídeselo a la propietaria o a la responsable de sede.',
    );
    expect(patches.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
    // No se ha anunciado nada y, al cerrar, sigue donde estaba.
    await expect(page.getByText('«Mat» archivado')).toHaveCount(0);
    await dialogo.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByRole('button', { name: 'Archivar Mat' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archivados/ })).toHaveCount(0);
  });

  test('un tipo con clases no se puede borrar: el aviso ofrece archivarlo', async ({ page }) => {
    const { patches } = await montar(page);

    // La tarjeta de Mat: su «Eliminar» (de la propietaria).
    const tarjeta = page.locator('div').filter({ has: page.getByRole('button', { name: 'Archivar Mat' }) }).last();
    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    const aviso = page.getByRole('dialog', { name: '«Mat» tiene clases' });
    await expect(aviso).toContainText('Si ya no la das, archívalo');
    await aviso.getByRole('button', { name: 'Archivar' }).click();

    await expect(page.getByRole('dialog', { name: 'Archivar «Mat»' })).toBeVisible();
    expect(patches).toHaveLength(0);
  });
});
