import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Bloque "Retos" del Inicio (tema Bloom) — carrusel de 2 retos fijos
// (lib/retos-portal.ts) con conteo REAL de apuntadas de este estudio y un
// toggle Apuntarme/Apuntada ✓ persistido por socia. Oculto por defecto: solo
// se ve si el bloque `sistema` "retos" está presente y visible en homeBloques
// (lo que hace instalar Bloom, ver e2e/apariencia-tema.spec.ts).
// ─────────────────────────────────────────────────────────────────────────────

const HOME_CON_RETOS = [
  { id: 'sistema-retos', kind: 'sistema' as const, sistemaId: 'retos' as const },
  { id: 'sistema-accesosRapidos', kind: 'sistema' as const, sistemaId: 'accesosRapidos' as const },
];

test.describe('Portal — Inicio: bloque Retos', () => {
  test('sin apuntadas, invita a ser la primera', async ({ page }) => {
    await montarPortal(page, { conSesion: true, homeBloques: HOME_CON_RETOS });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: 'Retos' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Core Pilates')).toBeVisible();
    await expect(page.getByText('Sé la primera en apuntarte').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apuntarme' }).first()).toBeVisible();
  });

  test('con apuntadas reales de otras socias, muestra el conteo del estudio', async ({ page }) => {
    await montarPortal(page, { conSesion: true, homeBloques: HOME_CON_RETOS, retoConteos: { core: 3 } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByText('3 apuntadas')).toBeVisible({ timeout: 30_000 });
  });

  test('pulsar Apuntarme cambia a Apuntada ✓ y sube el conteo, sin recargar', async ({ page }) => {
    await montarPortal(page, { conSesion: true, homeBloques: HOME_CON_RETOS });
    await page.goto(`/portal/${SLUG}/home`);

    // Solo se pulsa el primero (Core Pilates) — Face Yoga se queda en
    // "Apuntarme", así que tras el click "Apuntada ✓" es inequívoco.
    await expect(page.getByRole('button', { name: 'Apuntarme' }).first()).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/public/retos') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Apuntarme' }).first().click(),
    ]);

    await expect(page.getByRole('button', { name: 'Apuntada ✓' })).toBeVisible();
    await expect(page.getByText('1 apuntada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apuntarme' })).toHaveCount(1); // Face Yoga sigue sin apuntar
  });

  test('ya apuntada de antes, llega marcada como Apuntada ✓', async ({ page }) => {
    await montarPortal(page, { conSesion: true, homeBloques: HOME_CON_RETOS, retosApuntados: ['core'], retoConteos: { core: 1 } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Apuntada ✓' })).toBeVisible({ timeout: 30_000 });
  });
});
