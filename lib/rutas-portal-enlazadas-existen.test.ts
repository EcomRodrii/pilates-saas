import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: si el código enlaza a `/portal/<slug>/algo`, ese `algo` tiene que
// ser una ruta que exista.
//
// ── Qué pasa de verdad si no existe ──────────────────────────────────────────
// NO es un 404 —esto se afirmó al crear el guardián y era falso—. Hay una capa
// de compatibilidad en dos niveles, y conviene entenderla antes de tocar nada:
//
//   · `app/portal/[slug]/[...resto]/route.ts` recoge lo que no casa con ninguna
//     ruta real y redirige con `destinoPortalViejo` (lib/student/deep-links.ts).
//   · `traducirEnlace` reescribe al LEERLAS las filas de `notification.deep_link`
//     ya persistidas, que llevan las 18 formas del portal borrado.
//
// El fallo real es más callado que un 404: un nombre que el mapa NO conoce
// acaba en `redirect(base)` — el inicio del estudio— y un aviso que prometía
// «tu clase de mañana» deja a la persona en la portada sin decir por qué. En
// `traducirEnlace`, directamente se queda SIN enlace.
//
// ── Por qué sigue mereciendo la pena ─────────────────────────────────────────
// Porque la red de seguridad existe para lo que ya está escrito y no se puede
// cambiar —filas emitidas, QR impresos, la bio de Instagram del estudio—, no
// para que el código nuevo nazca apoyándose en ella. Un enlace escrito HOY
// contra una ruta que no existe es deuda que alguien tendrá que traducir
// mañana, y si el nombre no está en el mapa no se traduce: se pierde.
//
// Nada de esto lo ve un compilador: la URL es un template literal, así que para
// TypeScript es un `string` cualquiera.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// Apunta el enlace a la ruta real. No lo añadas al mapa de compatibilidad: ese
// mapa es para URLs que ya salieron de aquí, no para las que escribes ahora.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const CARPETAS = ['app', 'lib', 'components'];
const SALTAR = new Set(['node_modules', '.next', 'fixtures']);

function ficheros(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SALTAR.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheros(p, out);
    // Los `.test.ts`/`.spec.ts` quedan fuera: un test puede nombrar una ruta
    // inventada a propósito (este fichero mismo lo hace en su comentario).
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `/portal/${slug}/acceso/verificar` → ['acceso','verificar'] */
const ENLACE = /\/portal\/\$\{[^}]*\}((?:\/[a-z0-9-]+)+)/gi;

const hallazgos: { fichero: string; ruta: string }[] = [];
for (const carpeta of CARPETAS) {
  for (const f of ficheros(join(RAIZ, carpeta))) {
    const fuente = readFileSync(f, 'utf8');
    for (const m of fuente.matchAll(ENLACE)) {
      hallazgos.push({ fichero: f.slice(RAIZ.length + 1), ruta: m[1] });
    }
  }
}

test('se han encontrado enlaces al portal de verdad', () => {
  // Sin esto, un cambio en cómo se construyen las URLs dejaría el test en verde
  // recorriendo una lista vacía. Verde por vacío, no.
  assert.ok(hallazgos.length >= 3, `solo ${hallazgos.length} enlaces a /portal/\${...}/: ¿cambió la forma de construirlos?`);
  assert.ok(
    hallazgos.some((h) => h.ruta.startsWith('/acceso')),
    'ninguno apunta a /acceso: el lector no está cogiendo lo que cree',
  );
});

/**
 * Deuda ya existente, enumerada y CERRADA — por FICHERO y ruta, no solo por
 * ruta.
 *
 * Que la pareja sea exacta importa: con una lista de rutas a secas, tener
 * `/clases` perdonado en un sitio perdonaba un `/clases` nuevo en cualquier
 * otro. Así solo se perdona exactamente lo que ya estaba.
 *
 * Lo que queda son los dos enlaces de `lib/portal-busqueda.ts`, la búsqueda
 * del portal viejo. NO se arreglan porque ese módulo **no lo usa ninguna
 * pantalla** —solo sus propios tests—, y parchear las URLs de código que no se
 * ejecuta es mantenimiento de mentira: lo deja pareciendo vivo. Si algún día se
 * revive la búsqueda, sus destinos se deciden entonces (hoy `/reservar` filtra
 * por `?q=`, no por `?tipo=`, y las instructoras ya no tienen ruta propia: se
 * abren en una hoja dentro de la ficha de clase).
 */
const ROTOS_CONOCIDOS = [
  'lib/portal-busqueda.ts → /clases',
  'lib/portal-busqueda.ts → /instructores',
];

/** La forma con la que se comparan: `<fichero> → <ruta>`. */
function clave(h: { fichero: string; ruta: string }): string {
  return `${h.fichero} → ${h.ruta}`;
}

function estaRota({ ruta }: { ruta: string }): boolean {
  const base = join(RAIZ, 'app/portal/[slug]', ruta);
  return !existsSync(join(base, 'page.tsx')) && !existsSync(join(base, 'route.ts'));
}

test('todo enlace a una ruta del portal apunta a una ruta que existe', () => {
  const nuevos = hallazgos.filter((h) => estaRota(h) && !ROTOS_CONOCIDOS.includes(clave(h)));
  assert.deepEqual(
    [...new Set(nuevos.map(clave))], [],
    'enlaces NUEVOS del portal a rutas que no existen (la persona aterriza en un '
    + '404, o gotrue lo ignora y la devuelve al Site URL con el token ya gastado)',
  );
});

test('la lista de deuda conocida no tiene entradas de más', () => {
  // Si alguien arregla una ruta y no la quita de arriba, la lista deja de
  // describir la realidad y empieza a tapar la siguiente que se rompa igual.
  const rotasDeVerdad = new Set(hallazgos.filter(estaRota).map(clave));
  const sobran = ROTOS_CONOCIDOS.filter((r) => !rotasDeVerdad.has(r));
  assert.deepEqual(sobran, [], 'ya no están rotas: quítalas de ROTOS_CONOCIDOS');
});
