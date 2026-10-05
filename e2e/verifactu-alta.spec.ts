import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El alta del envío a la AEAT (Veri*Factu) que hace la propietaria en
// /configuracion/verifactu, abierta a todos los estudios el 5-oct-2026.
//
// El recorrido entero, corto a propósito (es un trámite legal): confirmar sus
// datos ya rellenos, pegar el CSV del poder que dio en la AEAT, aceptar el mandato
// y quedarse en «Comprobando». A una autónoma no se le pregunta nada más. Lo que
// decide cada paso es el SERVIDOR (`/api/verifactu/estudio`): la pantalla pinta
// lo que contesta. Por eso los fallos cuentan peticiones: «no avanzó» también
// sería verdad con un botón que no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// DNI de ejemplo con la letra de control bien puesta (no el de relleno del demo).
const NIF = '48392017V';

const FILA = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  iva_por_defecto: 21, modo_facturacion: 'facturas', nif: NIF, razon_social: null,
};

const BASE = {
  motivo: null,
  nifEstudio: NIF,
  nifValido: true,
  nombreFiscal: null as string | null,
  tipoEmisor: null as string | null,
  esDemo: false,
  apoderado: { nombre: 'Apoderado de Ejemplo', nif: '00000000T' },
  tramite: { codigo: 'IZ860', nombre: 'Remisión y consulta de registros de facturación por servicio web' },
  urls: { registro: 'https://sede.agenciatributaria.gob.es/registro.invalid', ayuda: 'https://sede.agenciatributaria.gob.es/ayuda.invalid' },
  mandato: { version: '2026-09-30.2', texto: 'Texto del mandato de ejemplo.' },
  representacion: null as Record<string, unknown> | null,
  habilitadoParaEnviar: false,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Contestar = (cuerpo: Record<string, unknown>) => { status: number; body: unknown };

async function montar(page: Page, inicial: Record<string, unknown>, contestar: Contestar) {
  const posts: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route => json(route, FILA));
  await page.route('**/api/verifactu/estudio', route => {
    if (route.request().method() !== 'POST') return json(route, inicial);
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(cuerpo);
    const r = contestar(cuerpo);
    return json(route, r.body, r.status);
  });
  await page.goto('/configuracion/verifactu');
  return { posts };
}

test('autónoma: confirma sus datos con un clic y solo pega el código de la AEAT', async ({ page }) => {
  const pendiente = { ...BASE, estado: 'PENDIENTE_AUTORIZACION', nombreFiscal: 'Carmen Ejemplo', tipoEmisor: 'persona_fisica' };
  // El nombre llega de la razón social: no hay que escribirlo.
  const { posts } = await montar(page, { ...BASE, estado: 'SIN_CONFIGURAR', nombreFiscal: 'Carmen Ejemplo' }, cuerpo =>
    cuerpo.accion === 'configurar'
      ? { status: 200, body: pendiente }
      : { status: 200, body: { ...pendiente, estado: 'AUTORIZACION_EN_REVISION', representacion: { estado: 'EN_REVISION', estado_motivo: null, vigente_hasta: '2031-10-04', tramite: 'IZ860' } } });

  await expect(page.getByRole('heading', { name: 'Sin dar de alta' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Es obligatorio por ley.')).toBeVisible();

  // 1 · Sus datos, ya rellenos: el tipo sale del NIF (un DNI = persona física).
  await expect(page.getByText('Persona física (autónoma)')).toBeVisible();
  await page.getByRole('button', { name: 'Sí, son mis datos' }).click();
  await expect(page.getByRole('heading', { name: 'Falta tu autorización' })).toBeVisible();
  expect(posts[0]).toMatchObject({ accion: 'configurar', nombreFiscal: 'Carmen Ejemplo', tipoEmisor: 'persona_fisica' });

  // 2 · El permiso: a quién dárselo y el código. Nada más que escribir.
  await expect(page.getByRole('heading', { name: '2 · Da el permiso en la AEAT' })).toBeVisible();
  await expect(page.getByText('00000000T')).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir la AEAT/ })).toHaveAttribute('href', BASE.urls.registro);
  await expect(page.getByLabel('Quién lo firmó en la AEAT (nombre)')).toHaveCount(0);
  const enviar = page.getByRole('button', { name: 'Enviar', exact: true });
  await page.getByLabel('Código (CSV) que te da la AEAT').fill('ABCD1234EFGH5678');
  await expect(enviar).toBeDisabled(); // sin aceptar el mandato, no
  await page.getByRole('checkbox').check();
  await enviar.click();

  await expect(page.getByRole('heading', { name: 'Comprobando tu autorización' })).toBeVisible();
  await expect(page.getByText('no tienes que hacer nada más')).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toMatchObject({
    accion: 'autorizar', csv: 'ABCD1234EFGH5678', tramite: 'IZ860', aceptaMandato: true, mandatoVersion: '2026-09-30.2',
    otorgante: { nombre: 'Carmen Ejemplo', nif: NIF, cargo: 'titular' },
  });
});

test('sociedad: escribe su nombre y pregunta quién firmó el permiso', async ({ page }) => {
  const CIF = 'B12345674';
  const pendiente = { ...BASE, estado: 'PENDIENTE_AUTORIZACION', nifEstudio: CIF, nombreFiscal: 'Studio Carmen SL', tipoEmisor: 'sociedad' };
  const { posts } = await montar(page, { ...BASE, estado: 'SIN_CONFIGURAR', nifEstudio: CIF }, cuerpo =>
    cuerpo.accion === 'configurar'
      ? { status: 200, body: pendiente }
      : { status: 200, body: { ...pendiente, estado: 'AUTORIZACION_EN_REVISION' } });

  // Sin razón social no hay nada que confirmar: se pregunta. El tipo, deducido del CIF.
  await expect(page.getByRole('heading', { name: 'Sin dar de alta' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Facturas como')).toHaveValue('sociedad');
  await page.getByLabel('Nombre o razón social, tal como figura en la AEAT').fill('Studio Carmen SL');
  await page.getByRole('button', { name: 'Guardar mis datos' }).click();
  await expect(page.getByRole('heading', { name: '2 · Da el permiso en la AEAT' })).toBeVisible();
  expect(posts[0]).toMatchObject({ accion: 'configurar', nombreFiscal: 'Studio Carmen SL', tipoEmisor: 'sociedad' });

  const enviar = page.getByRole('button', { name: 'Enviar', exact: true });
  await page.getByLabel('Código (CSV) que te da la AEAT').fill('ABCD1234EFGH5678');
  await page.getByRole('checkbox').check();
  await expect(enviar).toBeDisabled(); // falta quién lo firmó
  await page.getByLabel('Quién lo firmó en la AEAT (nombre)').fill('Persona Ejemplo');
  await page.getByLabel('Su NIF').fill('00000001R');
  await enviar.click();

  await expect(page.getByRole('heading', { name: 'Comprobando tu autorización' })).toBeVisible();
  expect(posts[1]).toMatchObject({ accion: 'autorizar', otorgante: { nombre: 'Persona Ejemplo', nif: '00000001R', cargo: 'representante_legal' } });
});

test('si el servidor rechaza el poder, lo dice y no avanza', async ({ page }) => {
  const pendiente = { ...BASE, estado: 'PENDIENTE_AUTORIZACION', nombreFiscal: 'Carmen Ejemplo', tipoEmisor: 'persona_fisica' };
  const { posts } = await montar(page, pendiente, () =>
    ({ status: 400, body: { errores: ['El CSV del apoderamiento no tiene el formato esperado (letras y números).'] } }));

  await expect(page.getByRole('heading', { name: 'Falta tu autorización' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Código (CSV) que te da la AEAT').fill('mal');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'no tiene el formato esperado' })).toBeVisible();
  expect(posts.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Falta tu autorización' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comprobando tu autorización' })).toHaveCount(0);
});

test('el estudio de demostración no puede darse de alta, y lo dice', async ({ page }) => {
  await montar(page, { ...BASE, estado: 'SIN_CONFIGURAR', esDemo: true, nombreFiscal: 'Demo' }, () => ({ status: 500, body: {} }));
  await expect(page.getByText('Este es el estudio de demostración')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Sí, son mis datos' })).toHaveCount(0);
  await expect(page.getByText('Es obligatorio por ley.')).toHaveCount(0);
});
