import { test } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría visual del panel. No afirma nada: deja las imágenes en
// test-results/ para mirarlas.
//
// Con datos SEMBRADOS, no vacíos: un panel sin filas enseña estados iniciales
// —que también hay que revisar, pero son otra cosa— y no cómo se ve la pantalla
// cuando el estudio lleva meses funcionando, que es donde se rompen las
// rejillas, se desbordan los textos y aparecen los huecos.
//
// Hermana de `caja-captura.spec.ts`, que hace lo mismo con el TPV.
// ─────────────────────────────────────────────────────────────────────────────

const RUTAS = [
  'dashboard', 'centro-de-control', 'calendario', 'clientas',
  'cobros', 'equipo', 'informes', 'productos', 'configuracion', 'citas',
  // Segunda tanda: el resto del panel vivo. Fuera quedan las tres congeladas
  // (/chat, /ondemand y el kiosko), que no pintan página a propósito.
  'automatizaciones', 'cierre', 'comunidad', 'contenido',
  'explorar-funciones', 'facturas', 'libreta', 'marketing',
  'mensajeria', 'mi-perfil', 'migracion', 'notificaciones',
  'pagos', 'primeros-pasos', 'socios', 'sustituciones',
  'transacciones', 'network/buscar',
];

// ⚠️ Un test POR PANTALLA, no un bucle dentro de un test. Con el bucle, diez
// rutas por tres segundos de espera se comían el límite de 30 s por test de
// Playwright y la corrida moría a la segunda captura, dejando ocho pantallas
// sin mirar — que es como no auditar nada.
for (const ruta of RUTAS) {
  test(`escritorio — ${ruta}`, async ({ page }) => {
    await montar(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await ir(page, ruta);
    await page.screenshot({ path: `test-results/panel-${ruta.replace('/', '-')}.png`, fullPage: false });
  });
}

// El panel tiene modo oscuro desde siempre y nunca se había capturado. Es donde
// aparecen los colores calculados para fondo claro puestos sobre fondo oscuro:
// `.dark` y las custom properties de marca viven en el MISMO div, y un `style`
// en línea gana a una regla de clase.
for (const ruta of ['dashboard', 'productos', 'cobros', 'clientas', 'equipo']) {
  test(`escritorio oscuro — ${ruta}`, async ({ page }) => {
    await montar(page);
    await enOscuro(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await ir(page, ruta);
    await page.screenshot({ path: `test-results/oscuro-${ruta}.png`, fullPage: false });
  });
}

for (const ruta of ['dashboard', 'calendario', 'clientas', 'cobros']) {
  test(`iPad — ${ruta}`, async ({ page }) => {
    await montar(page);
    await page.setViewportSize({ width: 834, height: 1112 });
    await ir(page, ruta);
    await page.screenshot({ path: `test-results/tablet-${ruta}.png`, fullPage: false });
  });
}
