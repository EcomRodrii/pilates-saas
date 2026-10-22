import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESCRITURA_EN_VISTA_PREVIA, esVistaPreviaDelPanel } from './vista-previa-sin-escrituras.ts';
import { conVistaPrevia } from '../widgets/integracion.ts';

// Contrato: la vista previa del constructor de widgets no reserva, ni paga, ni
// manda correos de verdad. Se corta en la frontera de escritura, así que lo que
// se vigila aquí es esa frontera: si alguien añade una escritura nueva a
// /reservar sin pasar por ella, este test lo dice (y el e2e
// `reservar-vista-previa-no-escribe.spec.ts` cuenta las peticiones).

const raiz = join(import.meta.dirname, '..', '..');
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8');

/** El cuerpo de la función que empieza en `firma` (hasta la siguiente función al mismo nivel o 4.000 caracteres). */
function cuerpoDe(fuente: string, firma: string): string {
  const i = fuente.indexOf(firma);
  assert.ok(i >= 0, `no encuentro «${firma}»: si se ha renombrado, actualiza este contrato`);
  return fuente.slice(i, i + 4000);
}

test('el marcador es `vista-previa=1`, el mismo que pone el panel', () => {
  const url = conVistaPrevia('https://tentare.app/reservar/alma?embed=1&w=Ab3dE5gH9k');
  assert.equal(esVistaPreviaDelPanel(new URL(url).search), true);
  assert.equal(esVistaPreviaDelPanel('?embed=1'), false);
  assert.equal(esVistaPreviaDelPanel('?embed=1&vista-previa=0'), false);
  assert.equal(esVistaPreviaDelPanel(new URLSearchParams('vista-previa=1')), true);
});

test('el mensaje dice lo que pasa, sin culpar a nadie', () => {
  assert.match(ESCRITURA_EN_VISTA_PREVIA, /vista previa no se reserva de verdad/);
  assert.match(ESCRITURA_EN_VISTA_PREVIA, /En tu web, sí/);
});

test('cada POST directo de /reservar pasa por la guardia antes de salir', () => {
  const pagina = leer('app/reservar/[slug]/page.tsx');
  const posts = [...pagina.matchAll(/fetch\(\s*['`](\/api\/[^'`]+)['`]\s*,\s*\{\s*method:\s*'POST'/g)];
  assert.ok(posts.length >= 3, `esperaba al menos los tres cobros, hay ${posts.length}`);
  for (const m of posts) {
    const antes = pagina.slice(0, m.index);
    const funcion = antes.lastIndexOf('async function ');
    assert.ok(funcion >= 0);
    assert.match(antes.slice(funcion), /enVistaPreviaDelPanel\(\)/, `${m[1]} sale sin mirar si es la vista previa`);
  }
  // El enlace de acceso, además, se corta antes del captcha (no se espera para nada).
  assert.match(cuerpoDe(pagina, 'async function handleEnviarEnlace('), /enVistaPreviaDelPanel\(\)[\s\S]*pedirToken/);
});

test('las escrituras públicas del contexto y el enlace de acceso pasan por la guardia', () => {
  const contexto = leer('lib/studio-context.tsx');
  for (const firma of ['async function postPublico(', 'async function reservarCitaPublica(']) {
    const cuerpo = cuerpoDe(contexto, firma);
    const guardia = cuerpo.indexOf('enVistaPreviaDelPanel()');
    const salida = cuerpo.indexOf('fetch(');
    assert.ok(guardia >= 0 && guardia < salida, `${firma} escribe sin mirar si es la vista previa`);
  }
  const sesion = cuerpoDe(leer('lib/use-socia-session.ts'), 'const enviarEnlace = useCallback(');
  assert.ok(sesion.indexOf('enVistaPreviaDelPanel()') >= 0 && sesion.indexOf('enVistaPreviaDelPanel()') < sesion.indexOf('signInWithOtp'));
  const regalo = cuerpoDe(leer('components/regalo/comprar-regalo.tsx'), "setEnviando(true); // carga ANTES");
  const antesRegalo = leer('components/regalo/comprar-regalo.tsx').split("setEnviando(true); // carga ANTES")[0];
  assert.match(antesRegalo.slice(-400), /enVistaPreviaDelPanel\(\)/, 'la tarjeta regalo se compra sin mirar si es la vista previa');
  assert.match(regalo, /regalo\/comprar/);
});
