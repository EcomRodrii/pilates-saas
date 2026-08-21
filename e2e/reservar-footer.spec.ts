import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 del Theme Builder: /reservar/[slug] gana un pie de página de verdad.
// Antes los enlaces legales solo vivían dentro de la pestaña "El estudio" —
// quien reservaba desde "Clases" nunca los veía. Ahora es un <footer> visible
// en las cuatro pestañas, con redes sociales opcionales configuradas desde
// "Marca y colores" (lib/theme-schema.ts → redesSociales).
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const S = 'studio-test';

function fixture(extra: Record<string, unknown> = {}) {
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [], salas: [], instructores: [], spots: [], planesTarifa: [], sesiones: [],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
    ...extra,
  };
}

async function montar(page: Page, extra: Record<string, unknown> = {}) {
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(extra)) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  await page.goto(`/reservar/${SLUG}`);
}

test('los enlaces legales se ven en "Clases", sin tener que ir a "El estudio"', async ({ page }) => {
  await montar(page);
  // Timeout explícito en la primera aserción tras `montar` (que acaba en un
  // goto): con `next dev` esta ruta se compila bajo demanda y se pasa de los 5s
  // por defecto de expect.
  await expect(page.getByRole('button', { name: 'Política de privacidad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Términos de servicio' })).toBeVisible();
});

test('sin redes sociales configuradas, no se pinta ningún icono de red social', async ({ page }) => {
  await montar(page);
  // Anclar en algo que SÍ tiene que estar antes de afirmar ausencias: los
  // toHaveCount(0) de abajo pasan al instante contra una página en blanco, así
  // que sin esta espera el test daba verde con la ruta aún sin compilar.
  await expect(page.getByRole('button', { name: 'Política de privacidad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Facebook' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
});

test('con Instagram configurado, el enlace se ve y apunta a la URL de verdad', async ({ page }) => {
  await montar(page, { redesSociales: { instagram: 'https://instagram.com/estudio-alma', facebook: '', whatsapp: '' } });
  const enlace = page.getByRole('link', { name: 'Instagram' });
  await expect(enlace).toBeVisible({ timeout: 30_000 });
  await expect(enlace).toHaveAttribute('href', 'https://instagram.com/estudio-alma');
  await expect(enlace).toHaveAttribute('target', '_blank');
  // Facebook/WhatsApp siguen sin configurar: no aparecen.
  await expect(page.getByRole('link', { name: 'Facebook' })).toHaveCount(0);
});

test('un enlace de red social peligroso (javascript:) no se pinta', async ({ page }) => {
  await montar(page, { redesSociales: { instagram: 'javascript:alert(1)', facebook: '', whatsapp: '' } });
  // Mismo motivo que arriba: sin anclar, el toHaveCount(0) pasa contra una
  // página que todavía no ha pintado nada y el test no prueba el saneado.
  await expect(page.getByRole('button', { name: 'Política de privacidad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveCount(0);
});

// ── Canales completos: web + TikTok ─────────────────────────────────────────
// La web NO viaja por `redesSociales` (vive en `studios.sitio_web`, ver
// lib/canales-estudio.ts), así que este test es el que prueba que las dos
// mitades del modelo llegan al MISMO pie. Si alguien la olvidara en la lista
// blanca de `studioPublico()`, aquí se cae — que es justo el fallo que nunca
// avisa por sí solo.
test('la web del estudio y TikTok se pintan en el mismo pie que el resto', async ({ page }) => {
  await montar(page, {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      colorPrimario: '#2C352C', sitioWeb: 'estudioalma.es',
    },
    redesSociales: { instagram: '', facebook: '', tiktok: '@estudioalma', whatsapp: '' },
  });
  const web = page.getByRole('link', { name: 'Web' });
  await expect(web).toBeVisible({ timeout: 30_000 });
  // Sin protocolo en la BD: el enlace lo completa el render, no el guardado.
  await expect(web).toHaveAttribute('href', 'https://estudioalma.es');
  const tiktok = page.getByRole('link', { name: 'TikTok' });
  await expect(tiktok).toBeVisible();
  await expect(tiktok).toHaveAttribute('href', 'https://www.tiktok.com/@estudioalma');
});

// Un @usuario se guardaba y desaparecía del pie sin decir nada: era lo más
// natural de teclear en una casilla que pone «Instagram».
test('un @usuario de Instagram se convierte en enlace en vez de desaparecer', async ({ page }) => {
  await montar(page, { redesSociales: { instagram: '@estudio.alma', facebook: '', tiktok: '', whatsapp: '' } });
  const enlace = page.getByRole('link', { name: 'Instagram' });
  await expect(enlace).toBeVisible({ timeout: 30_000 });
  await expect(enlace).toHaveAttribute('href', 'https://instagram.com/estudio.alma');
});
