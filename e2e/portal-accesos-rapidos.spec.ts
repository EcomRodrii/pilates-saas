import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// El bloque "Accesos rápidos" (filas/rejilla/círculos, lib/theme-variantes.ts)
// quedó RETIRADO del Inicio por decisión explícita (31-ago, verificado contra
// CHEATSHEET-CSS.md/docs/diseno-referencia-portal/): no existe en el diseño
// real de referencia ("Tentare Studio App") — los cuatro atajos "Mis
// reservas"/"Mi progreso"/"Notificaciones"/"El equipo" no aparecen en ninguna
// de las 20 capturas. Se retiró del catálogo de bloques (ya no se puede
// añadir/reordenar desde el editor) y del render de portal-home-view.tsx —
// `variantes.accesosRapidos` sigue vivo en el esquema por compatibilidad con
// temas ya guardados, pero no tiene ningún efecto observable.
//
// Los tests por variante de antes (filas/rejilla/círculos, geometría de cada
// una) probaban una rama muerta y se retiran en vez de mantenerse. Lo que
// queda es la red de seguridad: que el bloque no reaparezca por accidente.
test.describe('Inicio — sin "Accesos rápidos" (retirado)', () => {
  test('ninguno de los cuatro atajos de antes aparece, con o sin variantes guardadas', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { accesosRapidos: 'rejilla' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('heading', { name: 'Mis accesos rápidos' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Accesos rápidos' })).toHaveCount(0);
    // "Mis reservas"/"El equipo" son únicos del bloque retirado — a
    // diferencia de "Notificaciones", que sigue existiendo como nombre
    // accesible de la campana del hero (sin relación con este bloque).
    await expect(page.getByRole('link', { name: /^Mis reservas/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^El equipo/ })).toHaveCount(0);
    await expect(page.locator('[data-bloque-sistema="accesosRapidos"]')).toHaveCount(0);
  });
});
