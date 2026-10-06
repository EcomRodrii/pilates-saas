import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  CLASIFICACION_SUPRESION, COLUMNAS_QUE_APUNTAN_A_SOCIA, tablasPorAccion,
} from './supresion-clasificacion.ts';

// Cobertura de la supresión: la lista de qué se borra al dar de baja a una
// socia ya se dejó incompleta dos veces (I-14, H-2). Este test es lo que obliga
// a mirarla cada vez que aparece una tabla nueva con `socio_id`.

const dbTypes = readFileSync(new URL('../db-types.ts', import.meta.url), 'utf8');
// La definición VIGENTE es la de la última migración que recrea la función
// (la primera fue 20260913205144; cada tabla nueva la vuelve a crear entera).
const DIR_MIGRACIONES = new URL('../../supabase/migrations/', import.meta.url);
const ultimaAnonimizar = readdirSync(DIR_MIGRACIONES).filter(n => n.endsWith('.sql')).sort()
  .filter(n => /create or replace function public\.anonimizar_socio\b/.test(readFileSync(new URL(n, DIR_MIGRACIONES), 'utf8')))
  .at(-1);
if (!ultimaAnonimizar) throw new Error('no hay ninguna migración que defina anonimizar_socio');
const migracion = readFileSync(new URL(ultimaAnonimizar, DIR_MIGRACIONES), 'utf8');
const cuerpoFuncion = migracion.slice(migracion.indexOf('create or replace function public.anonimizar_socio'));

/** `RowVentasPos` → `ventas_pos` (inverso de `pascal()` en scripts/gen-db-types.py). */
function aSnake(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function tablasDeDbTypes(): Map<string, Set<string>> {
  const tablas = new Map<string, Set<string>>();
  for (const m of dbTypes.matchAll(/^export interface Row(\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const columnas = new Set([...m[2].matchAll(/^ {2}(\w+)\??:/gm)].map(c => c[1]));
    tablas.set(aSnake(m[1]), columnas);
  }
  return tablas;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('el parser de db-types ve las tablas con socia (no verde por vacío)', () => {
  const tablas = tablasDeDbTypes();
  assert.ok(tablas.size > 100, `solo ${tablas.size} tablas leídas de db-types`);
  for (const t of ['reservas', 'recibos', 'notas_internas', 'socio_companeras', 'notification']) {
    assert.ok(tablas.has(t), `el parser no encuentra ${t}`);
  }
});

test('toda tabla de db-types con una columna que apunta a una socia está clasificada', () => {
  const sinClasificar: string[] = [];
  for (const [tabla, columnas] of tablasDeDbTypes()) {
    const apunta = COLUMNAS_QUE_APUNTAN_A_SOCIA.some(c => columnas.has(c));
    if (apunta && !(tabla in CLASIFICACION_SUPRESION)) sinClasificar.push(tabla);
  }
  assert.deepEqual(sinClasificar, [],
    `Tablas con datos de una socia sin decidir qué pasa al suprimirla: ${sinClasificar.join(', ')}. `
    + 'Añádelas a lib/socios/supresion-clasificacion.ts y, si no son CONSERVAR, a anonimizar_socio.');
});

test('las tablas de PRs posteriores ya están clasificadas aunque aún no estén en db-types', () => {
  // La cobertura va en UNA dirección (db-types ⊆ clasificación): una entrada de
  // una tabla que todavía no existe es válida y es lo que evita que el test se
  // ponga rojo el día que esos PRs regeneren db-types.
  assert.equal(CLASIFICACION_SUPRESION.solicitudes_derechos?.accion, 'CONSERVAR');
  assert.equal(CLASIFICACION_SUPRESION.consentimientos_salud_eventos?.accion, 'ANONIMIZAR');
  assert.equal(CLASIFICACION_SUPRESION.aceptaciones_contrato_eventos?.accion, 'ANONIMIZAR');
  // Y la función no puede tocarlas en estático: tienen que ir detrás de un
  // `to_regclass` y por EXECUTE, o fallaría mientras la tabla no exista.
  assert.match(cuerpoFuncion, /to_regclass\('public\.consentimientos_salud_eventos'\) is not null/);
  assert.doesNotMatch(cuerpoFuncion, /^\s*update public\.consentimientos_salud_eventos/m);
  assert.match(cuerpoFuncion, /to_regclass\('public\.aceptaciones_contrato_eventos'\) is not null/);
  assert.doesNotMatch(cuerpoFuncion, /^\s*update public\.aceptaciones_contrato_eventos/m);
  // IP, navegador y quién la introdujo se vacían; la huella del texto y la fecha quedan como prueba.
  for (const col of ['ip_hmac = null', 'user_agent = null', 'introducida_por = null', 'actor_uid = null']) {
    assert.ok(cuerpoFuncion.includes(col), `anonimizar_socio no pone ${col} en aceptaciones_contrato_eventos`);
  }
  assert.doesNotMatch(cuerpoFuncion, /\b(texto_hash|texto_cliente_coincide) = null/);
  assert.doesNotMatch(cuerpoFuncion, /solicitudes_derechos/);
});

test('toda tabla BORRAR/ANONIMIZAR aparece en el cuerpo de anonimizar_socio', () => {
  const ausentes = [...tablasPorAccion('BORRAR'), ...tablasPorAccion('ANONIMIZAR')]
    .filter(t => !new RegExp(`public\\.${escapar(t)}\\b`).test(cuerpoFuncion));
  assert.deepEqual(ausentes, [], `Clasificadas pero la función no las toca: ${ausentes.join(', ')}`);
});

test('la función no borra ni modifica ninguna tabla fiscal ni el registro de accesos', () => {
  const intocables = ['recibos', 'facturas', 'ventas_pos', 'devoluciones', 'pagos_historicos',
    'codigos_descuento_consumos', 'lecturas_ficha_salud'];
  for (const t of intocables) {
    assert.equal(CLASIFICACION_SUPRESION[t]?.accion, 'CONSERVAR', `${t} debería ser CONSERVAR`);
    assert.doesNotMatch(cuerpoFuncion, new RegExp(`(delete\\s+from|update)\\s+public\\.${escapar(t)}\\b`, 'i'),
      `anonimizar_socio escribe en ${t}`);
  }
});

test('la cabecera de la migración documenta todas las tablas clasificadas', () => {
  const cabecera = migracion.slice(0, migracion.indexOf('create or replace function'));
  const sinDocumentar = Object.keys(CLASIFICACION_SUPRESION)
    .filter(t => !new RegExp(`\\b${escapar(t)}\\b`).test(cabecera));
  assert.deepEqual(sinDocumentar, []);
});

test('moderación de la app: avisos de sus conversaciones, comentarios por su ficha y sus denuncias', () => {
  // Los avisos «mensaje.recibido» llevan su nombre como remitente: se borran por la
  // conversación, ANTES de borrar las conversaciones (después ya no se encuentran).
  const avisos = cuerpoFuncion.search(/n\.event_type = 'mensaje\.recibido'\s+and n\.data ->> 'conversacionId' in \(select cp\.conversacion_id/);
  assert.ok(avisos > 0, 'anonimizar_socio no borra los avisos de mensajes de sus conversaciones');
  assert.ok(avisos < cuerpoFuncion.indexOf('delete from public.conversaciones c'), 'los avisos se buscan después de borrar sus conversaciones');
  assert.match(cuerpoFuncion, /cc\.autor_id = p_socio_id or cc\.socio_id = p_socio_id/);
  // Denuncias: se ANONIMIZAN (la fila queda como constancia), nunca se borran.
  assert.match(cuerpoFuncion, /update public\.denuncias dn set socio_id = null, denunciante_auth_user_id = null, detalle = null/);
  assert.match(cuerpoFuncion, /update public\.denuncias dn set autor_auth_user_id = null, detalle = null/);
  assert.doesNotMatch(cuerpoFuncion, /delete from public\.denuncias/);
});

test('la guarda md5 de la copia acepta su propio cuerpo, con y sin líneas de comentario (repetible)', async () => {
  // Producción puede guardar el cuerpo sin las líneas `--` (pasó con anonimizar_instructor,
  // 5-oct-2026): la guarda acepta las dos huellas de cada versión. Si se toca el cuerpo y no
  // la guarda, volver a aplicar el fichero fallaría.
  const { createHash } = await import('node:crypto');
  const md5 = (s: string) => createHash('md5').update(s).digest('hex');
  const funciones: [string, string][] = [['anonimizar_socio', migracion]];
  const dir = DIR_MIGRACIONES;
  const ultimaInstructor = readdirSync(dir).filter(n => n.endsWith('.sql')).sort()
    .filter(n => /create or replace function public\.anonimizar_instructor\(/.test(readFileSync(new URL(n, dir), 'utf8'))).at(-1);
  if (ultimaInstructor) funciones.push(['anonimizar_instructor', readFileSync(new URL(ultimaInstructor, dir), 'utf8')]);
  for (const [nombre, sql] of funciones) {
    const guarda = sql.match(/select md5\(prosrc\)[\s\S]*?not in \(([\s\S]*?)\)\s*then/);
    if (!guarda) continue; // sin guarda, nada que comprobar
    const aceptadas = [...guarda[1].matchAll(/'([0-9a-f]{32})'/g)].map(m => m[1]);
    const ini = sql.indexOf(`create or replace function public.${nombre}(`);
    const a = sql.indexOf('$function$', ini) + '$function$'.length;
    const cuerpo = sql.slice(a, sql.indexOf('$function$', a));
    const sinComentarios = cuerpo.split(/(?<=\n)/).filter(l => !l.trim().startsWith('--')).join('');
    assert.ok(aceptadas.includes(md5(cuerpo)), `${nombre}: la guarda no acepta su propio cuerpo (${md5(cuerpo)})`);
    assert.ok(aceptadas.includes(md5(sinComentarios)), `${nombre}: la guarda no acepta su cuerpo sin comentarios (${md5(sinComentarios)})`);
  }
});

test('la función es solo de service_role y lo comprueba al aplicarse', () => {
  const firma = 'public.anonimizar_socio(text, text, uuid, text)';
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(migracion, new RegExp(`revoke all on function ${escapar(firma)} from ${rol};`));
  }
  assert.match(migracion, new RegExp(`grant execute on function ${escapar(firma)} to service_role;`));
  for (const rol of ['anon', 'authenticated', 'service_role']) {
    assert.match(migracion, new RegExp(`has_function_privilege\\('${rol}', '${escapar(firma)}'`));
  }
});
