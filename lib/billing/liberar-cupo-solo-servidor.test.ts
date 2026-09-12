import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// `liberar_cupo_matricula` ya no la puede ejecutar `authenticated`.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Esa función devuelve una plaza al contador de matrículas gratis, o sea que
// REGALA matrículas, y nació con `grant execute ... to authenticated` por
// copiar el grant de su hermana `reservar_matricula` —que sí lo necesita, porque
// el mostrador la llama desde el navegador—. La 20260912002351 lo revocó: sus
// cuatro llamadores son rutas de servidor con service_role.
//
// El precio de esa decisión es que un camino NUEVO desde el navegador fallaría
// con `permission denied for function`. Eso no sale en `tsc` ni en un unitario
// de lógica: sale en producción, en un camino de compensación que solo corre
// cuando ya ha fallado algo. De ahí este guardián.
//
// No prueba los grants —eso se verificó en vivo contra producción, que es lo
// único que prueba un grant— sino que el código sigue respetando el supuesto en
// el que se apoyan.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

/** Todos los .ts/.tsx del repo menos los tests, por carpeta. */
function fuentes(subcarpetas: string[]): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    let entradas: string[];
    try { entradas = readdirSync(dir); } catch { return; }
    for (const e of entradas) {
      if (e === 'node_modules' || e === '.next') continue;
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) salida.push(ruta);
    }
  };
  for (const sub of subcarpetas) recorrer(join(RAIZ, sub));
  return salida;
}

test('⚠️ `liberar_cupo_matricula` solo se llama desde servidor', () => {
  // El único sitio que puede nombrar la RPC es el envoltorio, que recibe el
  // cliente admin por parámetro. Cualquier otro nombramiento es un camino nuevo.
  const culpables = fuentes(['app', 'lib', 'components'])
    .filter(ruta => /liberar_cupo_matricula/.test(readFileSync(ruta, 'utf8')))
    .map(ruta => ruta.replace(RAIZ + '/', ''))
    .filter(ruta => ruta !== 'lib/billing/matricula-online.ts');

  assert.deepEqual(culpables, [],
    'estos ficheros nombran la RPC directamente; `authenticated` no tiene EXECUTE '
    + 'sobre ella desde 20260912002351, así que desde el navegador daría '
    + '«permission denied for function». Pasa por `liberarCupoMatricula` con el cliente admin.');
});

test('⚠️ quien la usa lo hace desde una ruta de servidor, no desde una pantalla', () => {
  // `components/` y los Contexts corren en el navegador con la sesión de la
  // propietaria: ahí el EXECUTE ya no está.
  const culpables = fuentes(['components', 'lib'])
    .filter(ruta => /liberarCupoMatricula/.test(readFileSync(ruta, 'utf8')))
    .map(ruta => ruta.replace(RAIZ + '/', ''))
    .filter(ruta => ruta !== 'lib/billing/matricula-online.ts');

  assert.deepEqual(culpables, [],
    'devolver un cupo es una compensación de servidor. Si una pantalla necesita '
    + 'hacerlo, hace falta una ruta que lo haga con service_role — o volver a dar '
    + 'el grant Y dejar el guarda de rol del cuerpo, no una de las dos cosas.');
});

test('el envoltorio sigue recibiendo el cliente, no creándolo', () => {
  // Si algún día importa `getSupabaseAdmin` aquí dentro, este módulo pasa a ser
  // server-only de hecho pero sin declararlo, y cualquier import desde una
  // pantalla arrastraría la service-role key al bundle del navegador. Ese es un
  // fallo ya documentado en este repo, no una hipótesis.
  const fuente = readFileSync(join(RAIZ, 'lib/billing/matricula-online.ts'), 'utf8');
  assert.ok(!/getSupabaseAdmin|SUPABASE_SERVICE_ROLE/.test(fuente),
    'matricula-online.ts ha empezado a crear el cliente admin en vez de recibirlo');
});
