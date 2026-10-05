import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: abrir un hilo apaga sus avisos de la campana —en la app
// de la alumna, en la de la instructora y en el panel—, cada uno solo los SUYOS
// y solo hasta el último mensaje que su pantalla ha pintado. Si falla, se
// arregla la ruta, no la guardia.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const ALUMNA = leer('app/api/public/mensajeria/conversaciones/[id]/leido/route.ts');
const PANEL = leer('app/api/mensajeria/conversaciones/[id]/leido/route.ts');
const INSTRUCTORA = leer('lib/portal-instructora/mensajes-servidor.ts');
const HELPER = leer('lib/mensajeria/avisos-leidos.ts');

function cuerpoDe(fuente: string, firma: string): string {
  const inicio = fuente.indexOf(firma);
  assert.ok(inicio >= 0, `falta ${firma}`);
  const fin = fuente.indexOf('\n}\n', inicio);
  return fuente.slice(inicio, fin < 0 ? undefined : fin);
}

test('las tres vías de «leído» apagan los avisos del hilo después de marcarlo, y un fallo no se calla', () => {
  const vias = [
    ['alumna', ALUMNA, 'alumna'],
    ['panel', PANEL, 'equipo'],
    ['instructora', cuerpoDe(INSTRUCTORA, 'export async function marcarHiloLeido'), 'equipo'],
  ] as const;
  for (const [nombre, fuente, lado] of vias) {
    const llamada = fuente.indexOf('marcarAvisosDeConversacionLeidos(');
    assert.ok(llamada > 0, `${nombre}: no apaga los avisos del hilo`);
    assert.ok(llamada > fuente.lastIndexOf(".from('conversacion_participantes')"), `${nombre}: apaga avisos antes de marcar el hilo`);
    assert.match(fuente.slice(llamada), new RegExp(`lado: '${lado}'`), `${nombre}: lado equivocado`);
    assert.match(fuente.slice(llamada), /hasta: instante/, `${nombre}: no acota los avisos a lo pintado`);
  }
  assert.match(ALUMNA, /if \(errorAvisos\) return errorInterno\(/);
  assert.match(PANEL, /if \(errorAvisos\) return errorInterno\(/);
  assert.match(INSTRUCTORA, /if \(errorAvisos\) throw errorAvisos;/);
  // La identidad sale de la sesión verificada, nunca del body.
  assert.match(ALUMNA, /userId: user\.userId, studioId: body\.studioId, conversacionId: id/);
  assert.match(ALUMNA, /socioAutenticado\(user\.userId, body\.studioId\)/);
  assert.match(PANEL, /userId: sesion\.userId, studioId: sesion\.studioId, conversacionId: id/);
  // El instante sale del mensaje de ESE hilo; en el panel, leído con su sesión.
  assert.match(PANEL, /instanteDelMensaje\(sesionCliente, id, hasta\)/);
});

test('las marcas nunca van hacia atrás cuando se acotan a lo pintado', () => {
  assert.match(ALUMNA, /marca\.lt\('leido_hasta', instante\)/);
  assert.match(PANEL, /propia\.lt\('leido_hasta', instante\)/);
  assert.match(PANEL, /mostrador_leido_hasta\.is\.null,mostrador_leido_hasta\.lt\."\$\{instante\}"/);
  assert.match(INSTRUCTORA, /marca\.lt\('leido_hasta', instante\)/);
});

test('cada uno solo apaga sus avisos: su cuenta y su estudio; el rol solo acota el resumen', () => {
  assert.match(HELPER, /\.eq\('recipient_user_id', p\.userId\)/);
  assert.match(HELPER, /\.eq\('studio_id', p\.studioId\)/);
  assert.match(HELPER, /\.eq\('data->>conversacionId', p\.conversacionId\)/);
  // Los del hilo, sin filtrar por rol (una cuenta socia y equipo a la vez los
  // pudo recibir con cualquiera de los dos). El rol, solo en el resumen.
  const delHilo = HELPER.slice(HELPER.indexOf('// 1.'), HELPER.indexOf('// 2.'));
  assert.doesNotMatch(delHilo, /recipient_role/);
  assert.match(HELPER, /p\.lado === 'alumna' \? resumen\.eq\('recipient_role', 'SOCIA'\) : resumen\.neq\('recipient_role', 'SOCIA'\)/);
  // Acotado a lo pintado: por la hora del MENSAJE del aviso, en la base.
  assert.match(HELPER, /\.lte\('creado_en', p\.hasta\)/);
});
