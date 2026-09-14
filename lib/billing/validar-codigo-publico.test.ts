import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodigoDescuento } from '../types.ts';
import { validarCodigoPublico, type DepsValidarCodigo } from './validar-codigo-publico.ts';

// La comprobación de un código contesta cosas de UNA socia (si es nueva, qué ha
// canjeado). Estos tests fijan que esa socia es la de la sesión y nunca otra.

const ESTUDIO = 'e1';
const HOY = '2026-09-14T10:00:00.000Z';

function codigo(p: Partial<CodigoDescuento> & Pick<CodigoDescuento, 'id' | 'codigo'>): CodigoDescuento {
  return {
    studioId: ESTUDIO, descripcion: '', tipo: 'IMPORTE_FIJO', valor: 3,
    usos: 0, usosMax: null, expira: null, activo: true, creadoEn: HOY, ...p,
  };
}

const CATALOGO = [
  codigo({ id: 'c-bienvenida', codigo: 'BIENVENIDA' }),
  codigo({ id: 'c-nuevas', codigo: 'SOLONUEVAS', soloNuevas: true }),
];

// Historial de canjes: la socia de la sesión no ha usado nada; OTRA socia del
// mismo estudio ya canjeó BIENVENIDA.
const USADOS: Record<string, string[]> = { 'socia-otra': ['c-bienvenida'], 'socia-yo': [] };

/** Deps falsas que apuntan cada consulta, para saber qué se llegó a preguntar. */
function montar(opts: { token?: string | null; fichas?: Record<string, string> } = {}) {
  const llamadas = { usuario: 0, historialDe: [] as (string | null)[], esNuevaDe: [] as (string | null)[] };
  const fichas = opts.fichas ?? { 'user-yo': 'socia-yo' };
  const deps: DepsValidarCodigo = {
    usuario: async () => { llamadas.usuario++; return opts.token ? { userId: opts.token } : null; },
    socioDelEstudio: async (userId, studioId) => (studioId === ESTUDIO ? fichas[userId] ?? null : null),
    codigos: async () => CATALOGO,
    esNueva: async (_s, socioId) => { llamadas.esNuevaDe.push(socioId); return socioId === null; },
    codigosYaUsados: async (socioId) => { llamadas.historialDe.push(socioId); return new Set(socioId ? USADOS[socioId] ?? [] : []); },
    hoyISO: HOY,
  };
  return { deps, llamadas };
}

const pedir = (codigoTexto: string, pideSocia: boolean, deps: DepsValidarCodigo) =>
  validarCodigoPublico({ studioId: ESTUDIO, codigo: codigoTexto, subtotal: 18, pideSocia }, deps);

test('diciendo venir de una socia pero sin sesión: 401 y no se consulta el historial de nadie', async () => {
  const { deps, llamadas } = montar({ token: null });
  const r = await pedir('BIENVENIDA', true, deps);
  assert.equal(r.status, 401);
  assert.equal(r.cuerpo.ok, false);
  // Contador: sí se intentó resolver la sesión (no pasa «por no hacer nada»)…
  assert.ok(llamadas.usuario > 0);
  // …y no se llegó a leer ningún dato de socia.
  assert.deepEqual(llamadas.historialDe, []);
  assert.deepEqual(llamadas.esNuevaDe, []);
});

test('con sesión pero sin ficha en ESTE estudio: 403, sin tocar datos de socia', async () => {
  const { deps, llamadas } = montar({ token: 'user-de-otro-estudio' });
  const r = await pedir('BIENVENIDA', true, deps);
  assert.equal(r.status, 403);
  assert.equal(r.cuerpo.ok, false);
  assert.ok(llamadas.usuario > 0);
  assert.deepEqual(llamadas.historialDe, []);
  assert.deepEqual(llamadas.esNuevaDe, []);
});

test('con sesión: responde con el historial de la socia de la sesión, nunca con el de otra', async () => {
  // BIENVENIDA ya lo canjeó OTRA socia. A la de la sesión le vale igual: la
  // respuesta no puede reflejar el historial ajeno.
  const { deps, llamadas } = montar({ token: 'user-yo' });
  const r = await pedir('BIENVENIDA', true, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { ok: true, descuento: 3 });
  assert.deepEqual(llamadas.historialDe, ['socia-yo']);
  assert.deepEqual(llamadas.esNuevaDe, ['socia-yo']);
});

test('con sesión: su propio historial y «solo nuevas» siguen aplicándose', async () => {
  const { deps } = montar({ token: 'user-otra', fichas: { 'user-otra': 'socia-otra' } });
  assert.deepEqual((await pedir('BIENVENIDA', true, deps)).cuerpo, { ok: false, motivo: 'Ya has usado este código antes' });
  assert.deepEqual((await pedir('SOLONUEVAS', true, deps)).cuerpo, { ok: false, motivo: 'Ese código es solo para clientas nuevas' });
});

test('sin socia (pagar y reservar sin cuenta): comprobación permisiva de siempre, sin mirar sesión', async () => {
  const { deps, llamadas } = montar({ token: 'user-yo' });
  const r = await pedir('SOLONUEVAS', false, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { ok: true, descuento: 3 });
  assert.equal(llamadas.usuario, 0);
  assert.deepEqual(llamadas.historialDe, [null]);
});

test('la ruta no pasa ningún socioId del body a las consultas', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../../app/api/public/validar-codigo-descuento/route.ts'), 'utf8');
  const sinComentarios = fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(sinComentarios, /validarCodigoPublico\(/);
  assert.match(sinComentarios, /verificarUsuarioSupabase\(req\)/);
  // El body solo puede decir SI pide socia; su valor no viaja a ninguna parte.
  assert.equal((sinComentarios.match(/body\.socioId/g) ?? []).length, 1);
  assert.match(sinComentarios, /Boolean\(body\.socioId\)/);
});
