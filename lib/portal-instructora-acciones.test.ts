import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato cliente ↔ servidor de la app de la instructora.
//
// Las siete rutas de `app/api/portal/instructora/*` despachan por una cadena
// `accion` que manda `lib/student/datos-instructora.ts`. Ese contrato NO lo
// comprueba TypeScript: el cliente manda un literal dentro de un
// `Record<string, unknown>` y la ruta lo compara contra su propia lista. Quitar
// un valor de la lista del servidor compila, pasa el lint y rompe una pantalla
// entera en producción con un 400 «Acción no válida».
//
// Pasó de verdad: #2183 («la instructora empieza sus clases») reescribió
// `clases/route.ts` para las cuatro acciones de fichaje y se llevó por delante
// 'opciones' y 'crear', dejando «Nueva clase» caída. Los e2e siguieron en verde
// porque mockean la ruta con `page.route` y responden 200 a cualquier acción —
// el punto ciego que `.claude/tentare-os.md` avisa que los mocks no cubren.
//
// Este test cruza las dos listas leyendo el código. Si falla: o el cliente pide
// algo que nadie atiende, o alguien borró una acción viva.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const sinComentarios = (ts: string) => ts.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const CLIENTE = sinComentarios(readFileSync(join(RAIZ, 'lib/student/datos-instructora.ts'), 'utf8'));

/** Las parejas (ruta, accion) que el cliente pide de verdad. */
function pedidasPorElCliente(): Map<string, Set<string>> {
  const porRuta = new Map<string, Set<string>>();
  // postInstructora('clases', { slug, accion: 'crear', ... })  y también
  // postInstructora('ofertas', { slug, accion, sustitucionId }) → variable, se ignora
  // aquí y se cubre con las constantes de su propia llamada más arriba.
  const re = /postInstructora\(\s*'([a-z]+)'\s*,\s*\{([^}]*)\}/g;
  for (const m of CLIENTE.matchAll(re)) {
    const [, ruta, cuerpo] = m;
    const accion = cuerpo.match(/accion:\s*'([a-zA-Z_]+)'/)?.[1];
    if (!accion) continue; // `accion` como variable: no es un literal comprobable
    if (!porRuta.has(ruta)) porRuta.set(ruta, new Set());
    porRuta.get(ruta)!.add(accion);
  }
  return porRuta;
}

test('toda acción que el cliente pide la atiende su ruta', () => {
  const porRuta = pedidasPorElCliente();
  assert.ok(porRuta.size >= 5, `esperaba ≥5 rutas con acciones literales, encontré ${porRuta.size}`);

  const fallos: string[] = [];
  for (const [ruta, acciones] of porRuta) {
    const fichero = join(RAIZ, `app/api/portal/instructora/${ruta}/route.ts`);
    if (!existsSync(fichero)) {
      fallos.push(`${ruta}: el cliente la llama y no existe app/api/portal/instructora/${ruta}/route.ts`);
      continue;
    }
    const servidor = sinComentarios(readFileSync(fichero, 'utf8'));
    for (const accion of acciones) {
      // La acción tiene que aparecer como literal en el servidor: o en la lista
      // de acciones válidas, o en un `accion === '...'`. Si no aparece, nadie la
      // atiende y el cliente se come un 400.
      if (!new RegExp(`'${accion}'`).test(servidor)) {
        fallos.push(`${ruta}: el cliente manda accion '${accion}' y la ruta no la menciona`);
      }
    }
  }
  assert.deepEqual(fallos, [], `\n${fallos.join('\n')}`);
});

test('«Nueva clase» de la instructora sigue enchufada de punta a punta', () => {
  // Caso concreto de la regresión de #2183, escrito aparte para que el motivo del
  // fallo se lea en el nombre del test y no haya que deducirlo de una lista.
  const ruta = sinComentarios(readFileSync(join(RAIZ, 'app/api/portal/instructora/clases/route.ts'), 'utf8'));

  for (const accion of ['opciones', 'crear']) {
    assert.match(ruta, new RegExp(`'${accion}'`), `clases/route.ts ya no acepta '${accion}'`);
  }
  assert.match(
    ruta, /opcionesNuevaClase/,
    'clases/route.ts no llama a opcionesNuevaClase: la pantalla se queda en error permanente',
  );
  assert.match(
    ruta, /crearClasePropia/,
    'clases/route.ts no llama a crearClasePropia: crear la clase no escribe nada',
  );
  // Y las reglas siguen donde deben: la ruta va con service-role, así que el
  // permiso del estudio lo comprueba el módulo, no la RLS.
  const reglas = readFileSync(join(RAIZ, 'lib/portal-instructora/crear-clase-servidor.ts'), 'utf8');
  assert.match(reglas, /instructoras_crean_clases/, 'crear-clase-servidor dejó de mirar el permiso del estudio');
});
