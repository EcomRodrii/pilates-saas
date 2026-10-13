import type { Grabador } from '../nucleo.ts';
import type { Page } from '@playwright/test';

/** La portada del capítulo y la pantalla de su sección ya abierta. */
export async function abrirSeccion(g: Grabador, pos: { numero: number; total: number }, id: string, titulo: string, frase: string, narracion: string) {
  await g.visita(`configuracion?tab=${id}`);
  g.seccion(titulo);
  await g.portada(`Capítulo ${pos.numero} de ${pos.total}`, titulo, frase, narracion);
}

/** La fila (o el interruptor) de una tarjeta en su sección. */
export const fila = (page: Page, id: string) => page.locator(`#${id}`);

/** El cajón abierto. */
export const cajon = (page: Page) => page.getByRole('dialog').first();

/** Abre el cajón de una fila con un clic y espera a que esté. */
export async function abrirCajon(g: Grabador, id: string) {
  const f = fila(g.page, id);
  // Unas filas son un botón entero; las de una conexión llevan dentro su botón («Conectar», «Configurar»).
  const esBoton = await f.evaluate(e => e.tagName === 'BUTTON');
  await g.clic(esBoton ? f : f.getByRole('button').first());
  await cajon(g.page).waitFor();
  await g.pausa(500);
}

/** Cierra el cajón con su aspa (sin guardar). */
export async function cerrarCajon(g: Grabador) {
  const aspa = cajon(g.page).getByRole('button', { name: 'Cerrar' }).first();
  await g.clic(aspa);
  await g.page.waitForTimeout(400);
}

/** Cuando el cajón se cierra solo tras guardar, esto lo espera. */
export async function esperarCajonCerrado(g: Grabador) {
  await g.page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  await g.pausa(500);
}

/** Guarda lo escrito en el cajón y espera a que se cierre. */
export async function guardarYCerrar(g: Grabador, nombre = 'Guardar') {
  await g.guarda(nombre);
  await esperarCajonCerrado(g);
}

/** Un interruptor por su nombre accesible (dentro del cajón o de la página). */
export const interruptor = (page: Page, nombre: string | RegExp) => page.getByRole('switch', { name: nombre });

/** Vuelve de una herramienta a su sección con el enlace «← Sección». */
export async function volverDeHerramienta(g: Grabador, seccion: string) {
  // Un cuadro que se acaba de guardar tarda un instante en irse y, mientras, deja la página inerte.
  await g.page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  const volver = g.page.getByRole('button', { name: new RegExp(`Volver a ${seccion}`) }).or(g.page.getByRole('link', { name: seccion })).first();
  // Tras guardar dentro de la herramienta, los primeros clics pueden no llevar a ninguna
  // parte (el cuadro que se cerró aún se lleva el foco): se comprueba y se repite.
  const salio = () => g.page.waitForFunction(() => !location.search.includes('abrir='), null, { timeout: 1500 }).then(() => true, () => false);
  for (let intento = 0; intento < 4; intento++) {
    await g.clic(volver);
    if (await salio()) break;
  }
  await g.pausa(500);
}
