import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del editor de temas: reordenar/ocultar módulos de Hoy. Verifica el
// lado de CONSUMO (components/portal/portal-home-view.tsx) — el lado del
// editor (dashboard) se verifica en e2e/apariencia-inicio-portal.spec.ts.
//
// El rediseño "Tentare Studio App" (Fase 1 de la sustitución de
// Oliva/Bloom/Noir) fija la estructura de Hoy al diseño único: el bloque de
// sistema "estaSemana" (el carrusel de próximas sesiones) ya no existe —
// ocultarlo/reordenarlo desde `portalHome` ya no tiene ningún efecto porque
// no hay nada que mostrar u ocultar. Solo quedan reordenables dos bloques que
// SÍ son contenido real del estudio, no del tema visual: "Invita a una
// amiga" y el contenido editable (mensaje destacado/banners) — este fichero
// cubre el primero, que es el único con datos de muestra ya disponibles en
// `portal-mock.ts`.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Hoy — módulos reordenables/ocultables', () => {
  test('sin portalHome configurado, se ve todo en el orden de siempre', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Trae a quien quieras')).toBeVisible();
  });

  test('un módulo oculto (Invita a una amiga) no aparece', async ({ page }) => {
    await montarPortal(page, { conSesion: true, portalHome: { orden: [], ocultos: ['invitarAmiga'] } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    // `hidden` deja el nodo en el DOM (display:none), así que toHaveCount(0)
    // no sirve aquí como sí sirve con getByRole (que respeta accesibilidad) —
    // se comprueba visibilidad, no ausencia del DOM.
    await expect(page.getByText('Trae a quien quieras')).not.toBeVisible();
  });
});
