import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 del editor de temas: constructor de bloques del Inicio del portal.
// Verifica el lado de CONSUMO de los bloques NUEVOS (banner/texto/cta/faq) —
// el lado del editor se verifica en e2e/apariencia-inicio-portal.spec.ts, y el
// legacy (portalHome) en e2e/portal-home-modulos.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inicio del portal — bloques del catálogo (banner/texto/cta/faq)', () => {
  test('un bloque de texto se pinta con su título y contenido', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-texto', kind: 'texto', config: { titulo: 'Horario de verano', texto: 'Cerramos los sábados de julio y agosto.' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Horario de verano')).toBeVisible();
    await expect(page.getByText('Cerramos los sábados de julio y agosto.')).toBeVisible();
  });

  test('un bloque CTA con enlace externo inseguro (javascript:) no se pinta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-cta', kind: 'cta', config: { titulo: 'Síguenos', textoBoton: 'Ir', href: 'javascript:alert(1)' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    // El título del CTA es el marcador fiable de que el bloque se pintó — "Ir"
    // (el texto del botón) es demasiado genérico, ya aparece en otro sitio de
    // la pantalla sin relación con este bloque.
    await expect(page.getByText('Síguenos')).toHaveCount(0);
  });

  test('un bloque CTA con enlace interno válido se pinta y enlaza dentro del portal', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-cta', kind: 'cta', config: { titulo: 'Trae a una amiga', textoBoton: 'Invitar', href: '/invitar' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    const boton = page.getByRole('link', { name: 'Invitar' });
    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute('href', `/portal/${SLUG}/invitar`);
  });

  test('un bloque FAQ despliega la respuesta al pulsar la pregunta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-faq', kind: 'faq', config: { titulo: 'Preguntas', preguntas: [{ pregunta: '¿Hay parking?', respuesta: 'Sí, gratuito.' }] } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('¿Hay parking?')).toBeVisible();
    await expect(page.getByText('Sí, gratuito.')).not.toBeVisible();
    await page.getByText('¿Hay parking?').click();
    await expect(page.getByText('Sí, gratuito.')).toBeVisible();
  });

  test('un bloque oculto no se pinta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-texto', kind: 'texto', config: { titulo: 'No debería verse', texto: 'x' }, oculto: true },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No debería verse')).toHaveCount(0);
  });
});
