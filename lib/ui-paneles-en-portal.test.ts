import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: los paneles y hojas del panel se abren en portal por defecto.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `PanelPageTransition` envuelve cada página en `.panel-page-in`, cuya animación
// deja un `transform` identidad aplicado. Una identidad sigue creando containing
// block, así que un `fixed inset-0` abierto desde la página se ancla a la CAJA
// DE LA PÁGINA, no a la ventana. En el calendario esa caja es tan alta como la
// rejilla entera: el cajón «Nueva clase» se abría con el pie —y el botón de
// guardar— fuera de la vista (13-sep-2026, captura del fundador).
//
// `DashboardDrawer` y `DashboardSheet` ya tenían el remedio, la prop `portal`,
// pero OPT-IN. Y opt-in es «cada caller tiene que acordarse»: doce no se
// acordaron. Los tests de ese formulario pasaban igual porque `.click()` de
// Playwright desplaza hasta el botón antes de pulsar.
//
// Así que se invirtió el valor por defecto. Esto impide que vuelva a `false`, y
// que alguien lo apague a mano sin que se note.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const PRIMITIVAS = ['components/ui/dashboard-drawer.tsx', 'components/ui/dashboard-sheet.tsx'];

function ficherosTsx(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue;
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (e.endsWith('.tsx')) salida.push(ruta);
    }
  };
  for (const sub of ['app', 'components']) recorrer(join(RAIZ, sub));
  return salida;
}

test('⚠️ las dos primitivas abren en portal por defecto', () => {
  for (const ruta of PRIMITIVAS) {
    const fuente = readFileSync(join(RAIZ, ruta), 'utf8');
    // La firma se lee de verdad: si el fichero cambia de forma, esto tiene que
    // gritar, no pasar por no encontrar nada.
    assert.match(fuente, /portal\?: boolean/, `${ruta}: ya no declara la prop \`portal\``);
    assert.match(fuente, /^\s*portal = true,/m,
      `${ruta}: \`portal\` ya no es \`true\` por defecto — un panel abierto desde una página `
      + 'volverá a anclarse a la caja de la página y a salir cortado');
  }
});

test('⚠️ nadie apaga el portal a mano', () => {
  // No hay hoy ni un caso legítimo. Si aparece uno, que se discuta aquí con su
  // porqué en vez de colarse en silencio en una pantalla.
  //
  // ⚠️ Las dos primitivas quedan FUERA: la regla es para quien las usa, y su
  // propio comentario explica el cambio citando literalmente `portal={false}`.
  // La primera versión de este test se cazó a sí misma leyendo ese comentario —
  // la trampa de siempre de los guardianes que leen el fuente.
  const culpables = ficherosTsx()
    .map(ruta => ruta.replace(RAIZ + '/', ''))
    .filter(rel => !PRIMITIVAS.includes(rel))
    .filter(rel => /portal=\{false\}/.test(readFileSync(join(RAIZ, rel), 'utf8')));
  assert.deepEqual(culpables, [], `apagan el portal: ${culpables.join(', ')}`);
});
