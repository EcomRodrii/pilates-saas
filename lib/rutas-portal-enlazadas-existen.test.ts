import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: si el código enlaza a `/portal/<slug>/algo`, ese `algo` tiene que
// ser una ruta que exista.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// #1591 («borrar el portal de la alumna», 3-sep-2026) borró
// `app/portal/[slug]/clave-nueva`. Dos sitios seguían enlazando ahí, y uno era
// el `redirectTo` del magic link del CORREO DE BIENVENIDA, que se manda de
// verdad: dos estudios lo tenían activo. Durante seis días, cada clienta nueva
// recibió un correo cuyo botón de acceso llevaba a una ruta inexistente.
//
// Nada podía verlo. La URL se construye con un template literal, así que para
// TypeScript es un `string` como cualquier otro; el enlace se resuelve en el
// navegador de la clienta, no en el build; y el fallo ocurre en el correo, que
// ningún test E2E abre. Un borrado de ruta y una cadena de texto en otro
// fichero es justo la deriva que ningún compilador cruza.
//
// ── Qué mira ─────────────────────────────────────────────────────────────────
// Cualquier `/portal/${...}/segmentos` en el código: los `${...}` son el slug,
// que en el árbol de rutas es `[slug]`. Se admite que el destino sea una página
// (`page.tsx`) o un manejador (`route.ts`).
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O el enlace apunta a una ruta que ya no existe (arréglalo: mira a dónde va
// ahora ese flujo), o acabas de crear la ruta y falta el `page.tsx`.
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
 * Deuda ya existente, enumerada y CERRADA.
 *
 * El mismo #1591 dejó rotas estas seis, y no se arreglan aquí porque cada una
 * necesita decidir a dónde va ahora ese flujo —`/clases/<sesionId>` puede
 * querer decir `/reservar/<claseId>` o `/mis-reservas/<reservaId>` según la
 * notificación, y eso es una decisión de producto, no un renombrado—.
 *
 * La lista es EXACTA, no un tope: arreglar una obliga a quitarla de aquí, y
 * añadir una rota nueva rompe el test. Es lo que impide que esto crezca
 * mientras se decide. Mismo mecanismo que `HUERFANAS_CONOCIDAS` en
 * `lazy-load-tiene-cargador.test.ts`.
 *
 *   /acceso        app/reservar/[slug]/page.tsx        → hoy es /acceso/login
 *   /login         reservar + components/layout/sidebar → hoy es /acceso/login
 *   /compras       enviar-recibo-webhook, notifications → hoy es /pagos
 *   /reservas      notifications/catalog                → hoy es /mis-reservas
 *   /clases        notifications/catalog, portal-busqueda → ¿reservar? ¿calendario?
 *   /instructores  portal-busqueda                      → no tiene equivalente
 */
const ROTOS_CONOCIDOS = ['/acceso', '/clases', '/compras', '/instructores', '/login', '/reservas'];

test('todo enlace a una ruta del portal apunta a una ruta que existe', () => {
  const rotos = hallazgos.filter(({ ruta }) => {
    const base = join(RAIZ, 'app/portal/[slug]', ruta);
    return !existsSync(join(base, 'page.tsx')) && !existsSync(join(base, 'route.ts'));
  });

  const nuevos = rotos.filter((r) => !ROTOS_CONOCIDOS.includes(r.ruta));
  assert.deepEqual(
    nuevos.map((r) => `${r.fichero} → /portal/<slug>${r.ruta}`), [],
    'enlaces NUEVOS del portal a rutas que no existen (la persona aterriza en un '
    + '404, o gotrue lo ignora y la devuelve al Site URL con el token ya gastado)',
  );
});

test('la lista de deuda conocida no tiene entradas de más', () => {
  // Si alguien arregla una ruta y no la quita de arriba, la lista deja de
  // describir la realidad y empieza a tapar la siguiente que se rompa igual.
  const rotasDeVerdad = new Set(
    hallazgos
      .filter(({ ruta }) => {
        const base = join(RAIZ, 'app/portal/[slug]', ruta);
        return !existsSync(join(base, 'page.tsx')) && !existsSync(join(base, 'route.ts'));
      })
      .map((r) => r.ruta),
  );
  const sobran = ROTOS_CONOCIDOS.filter((r) => !rotasDeVerdad.has(r));
  assert.deepEqual(sobran, [], 'ya no están rotas: quítalas de ROTOS_CONOCIDOS');
});
