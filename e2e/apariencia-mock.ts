import { type Page } from '@playwright/test';

// Ayudantes compartidos por los e2e del editor de Apariencia.
//
// El rail dejó de ser una única lista: ahora tiene dos pestañas, "Secciones"
// (el árbol de pantallas y sus bloques) y "Ajustes del tema" (las categorías:
// Color de marca, Tipografía, Botón principal…). Abre en Secciones, que es lo
// que se toca a diario.
//
// Eso significa que un `getByRole('button', { name: 'Botón principal' })` a
// secas ya no encuentra nada: la categoría no está oculta por CSS, no está
// montada. Los tests lo cazaron en CI con un timeout de 30 s que no decía por
// qué —solo "locator.click: Test timeout"—, así que este ayudante existe para
// que el próximo no tenga que averiguarlo otra vez.

/**
 * Abre una categoría de "Ajustes del tema" desde donde sea que esté el rail.
 *
 * Pulsa la pestaña primero y siempre: es idempotente (si ya estaba delante, el
 * click no cambia nada) y así el test no depende de en qué mitad lo dejó la
 * línea anterior.
 */
export async function abrirCategoriaTema(page: Page, categoria: string) {
  await page.getByRole('tab', { name: 'Ajustes del tema' }).click();
  await page.getByRole('button', { name: categoria, exact: true }).click();
}
