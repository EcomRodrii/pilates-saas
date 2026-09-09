import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La hoja de confirmar: la ÚLTIMA pantalla antes de comprometerse.
//
// ⚠️ Dos cosas fallaban aquí a la vez, y las dos en el peor sitio posible.
//
//  1. Los CUATRO avisos de «cómo se paga» se pintaban con el MISMO adorno:
//     círculo verde y un ✓ sobre fondo de acento. Dos de los cuatro no son una
//     buena noticia sino un MURO («esta clase solo se reserva con bono») y un
//     tercero avisa de que va a pagar. Un ✓ verde encima de «no puedes reservar
//     esto» es literalmente la señal contraria.
//  2. La promesa «Cancelación gratuita hasta N h antes» citaba la ventana del
//     ESTUDIO, no la resuelta — tercera pantalla con el bug de #1802, y la única
//     que lo dice en el momento de confirmar. La misma pantalla YA calculaba la
//     resuelta doce líneas más arriba para decidir; solo no la usaba al
//     escribirla.
//
// Se prueba en la PANTALLA porque el unitario (`lib/student/como-se-paga.ts`)
// solo cubre la decisión: lo que fallaba era el sitio donde se pinta.

const base = `/portal/${SLUG}`;

async function montar(page: Page, o: {
  precioPuntual?: number | null;
  ventanaTipo?: number | null;
  ventanaEstudio?: number;
  conBono?: boolean;
  llena?: boolean;
} = {}) {
  const { precioPuntual = null, ventanaTipo = null, ventanaEstudio = 12, conBono = false, llena = false } = o;
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.studio as Record<string, unknown>).cancelacionVentanaHoras = ventanaEstudio;
  (f.tiposClase as Record<string, unknown>[])[0].ventanaCancelacionHoras = ventanaTipo;
  // Sin precio puntual NI plan PUNTUAL, `precioDeSesion` devuelve null y la
  // clase es «solo con bono» — que es el caso por defecto de este fixture.
  (f.sesiones as Record<string, unknown>[])[0].precioPuntual = precioPuntual;
  if (precioPuntual !== null) {
    f.planesTarifa = [{ id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: precioPuntual, activo: true }];
  }
  if (conBono) {
    f.planesTarifa = [
      ...(f.planesTarifa as unknown[] ?? []),
      { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
    ];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (llena) {
    // El aforo llega por dos vías y las dos tienen que decir lo mismo: el
    // payload (`aforoReservas`) y `/api/public/aforo`, que la ficha pide aparte.
    // ⚠️ `sesion_id`, en snake_case: `proyectarClases` cuenta el aforo con el
    // nombre crudo de la fila, no con el camelCase del resto de proyecciones.
    const ocupado = Array.from({ length: 10 }, () => ({ sesion_id: SESION_ID, estado: 'CONFIRMADA' }));
    f.aforoReservas = ocupado;
    await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: ocupado })));
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
}

/** Abre la hoja de confirmar de la clase del fixture y devuelve su aviso. */
async function abrirHoja(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  const reservar = page.getByRole('button', { name: /^Reservar$/ }).first();
  await expect(reservar).toBeVisible({ timeout: 30_000 });
  await reservar.click();
  await expect(page.getByText('Confirma tu plaza')).toBeVisible({ timeout: 15_000 });
  return page.locator('[data-tono]').first();
}

test.describe('Student PWA · hoja de confirmar la reserva', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('«solo se reserva con bono» es un MURO, no un ✓ verde', async ({ page }) => {
    await montar(page);
    const aviso = await abrirHoja(page);
    await expect(aviso).toHaveAttribute('data-tono', 'bloqueo');
    await expect(aviso).toContainText('solo se reserva con bono');
    expect(await aviso.innerText(), 'un ✓ encima de «no puedes reservar esto»').not.toContain('✓');
  });

  test('«vas a pagar 18 €» avisa, no felicita', async ({ page }) => {
    await montar(page, { precioPuntual: 18 });
    const aviso = await abrirHoja(page);
    await expect(aviso).toHaveAttribute('data-tono', 'coste');
    await expect(aviso).toContainText('18 €');
    expect(await aviso.innerText()).not.toContain('✓');
  });

  test('y con bono que cubre sí es buena noticia, con su ✓', async ({ page }) => {
    await montar(page, { conBono: true });
    const aviso = await abrirHoja(page);
    await expect(aviso).toHaveAttribute('data-tono', 'ok');
    await expect(aviso).toContainText('No pagas nada hoy');
    expect(await aviso.innerText()).toContain('✓');
  });

  test('la promesa de cancelación cita la ventana DEL TIPO de clase', async ({ page }) => {
    // Estudio 12 h, tipo 2 h: prometer 12 aquí es prometer diez horas que no
    // existen, en el momento exacto de comprometerse.
    await montar(page, { ventanaTipo: 2, ventanaEstudio: 12 });
    await abrirHoja(page);
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja).toContainText('Cancelación gratuita hasta 2 h antes');
    expect(await hoja.innerText(), 'sigue prometiendo la ventana del estudio').not.toContain('hasta 12 h antes');
  });

  test('en lista de espera NO se habla de cómo se paga', async ({ page }) => {
    // ⚠️ Con la clase llena, la hoja pasa `bono={null}` a propósito: apuntarse a
    // la lista no consume nada todavía. Pero eso hacía que el aviso de pago
    // leyera «no tiene bono» y soltara «Esta clase solo se reserva con bono» a
    // quien SÍ lo tiene — daba igual antes, porque los cuatro mensajes salían
    // con el mismo ✓ verde y nadie lo leía como una negativa. Al darle a cada
    // tono su cara, ese mismo texto se convierte en un × rojo delante de una
    // alumna con bono de sobra. La respuesta no es fingir un tono: es que en
    // una lista de espera esa pregunta todavía no toca.
    await montar(page, { conBono: true, llena: true });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const espera = page.getByRole('button', { name: /lista de espera/i }).first();
    await expect(espera).toBeVisible({ timeout: 30_000 });
    await espera.click();
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja).toContainText('Sin coste');
    await expect(hoja.locator('[data-tono]'), 'la lista de espera no cobra nada, no hay «cómo se paga» que contar').toHaveCount(0);
    expect(await hoja.innerText(), 'le niega la clase a quien tiene bono').not.toContain('solo se reserva con bono');
  });
});
