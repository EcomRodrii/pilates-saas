import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// PR-13 (P06 · Fase A): quien pagó una clase y se quedó sin plaza va la PRIMERA en la lista de
// espera. La cola la ordenan dos sitios —quién va en qué puesto (`renumerar_lista_espera`) y a quién
// le toca el hueco (`promocionar_siguiente_espera`)— y tienen que usar EL MISMO orden: si no, la app
// diría «eres la 1.ª» y el hueco se lo llevaría otra. `cancelar_reserva_plaza` y
// `expirar_oferta_lista_espera` tenían cada una su copia del UPDATE de renumerar con el orden viejo:
// ahora llaman a la función.
//
// Estructural sobre el ÚLTIMO cuerpo de cada función en las migraciones. Lo que hace contra Postgres
// (la compensada pasa delante, la carrera, la promoción) está en
// `supabase/tests/rls-cola-prioridad-pago.test.ts` y se ensayó en vivo con ROLLBACK (descripción del PR).

const DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const MIGRACIONES = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort();

function cuerpoVigente(fn: string): string {
  let ultimo: string | null = null;
  for (const nombre of MIGRACIONES) {
    const sql = readFileSync(join(DIR, nombre), 'utf8');
    const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${fn}\s*\(`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index);
      const abre = /\$(function|body)?\$/.exec(resto);
      if (!abre) continue;
      const cierra = resto.indexOf(abre[0], abre.index + abre[0].length);
      if (cierra === -1) continue;
      ultimo = resto.slice(abre.index + abre[0].length, cierra);
    }
  }
  assert.notEqual(ultimo, null, `No se encontró ninguna definición de ${fn}`);
  return ultimo!;
}

/** El orden de la cola, sin espacios y con el alias de la reserva normalizado a `X`. */
function ordenDe(cuerpo: string, alias: string): string {
  const i = cuerpo.indexOf('order by (select min(pc.prioridad_espera_desde)');
  assert.ok(i > -1, 'sin la prioridad de quien pagó en el orden');
  const fin = cuerpo.indexOf(`${alias}.id asc`, i);
  assert.ok(fin > i);
  return cuerpo.slice(i, fin + `${alias}.id asc`.length).replace(/\s+/g, ' ')
    .replaceAll(`${alias}.`, 'X.').replaceAll(`= ${alias}.id`, '= X.id');
}

test('renumerar y promocionar ordenan IGUAL: primero la prioridad de un pago COMPENSADA, luego creado_en e id', () => {
  const numerar = ordenDe(cuerpoVigente('renumerar_lista_espera'), 'rr');
  const elegir = ordenDe(cuerpoVigente('promocionar_siguiente_espera'), 'r');
  assert.equal(numerar, elegir);
  assert.match(numerar, /pc\.reserva_id = X\.id and pc\.estado = 'COMPENSADA'/);
  assert.match(numerar, /asc nulls last, X\.creado_en asc, X\.id asc$/, 'sin prioridad, al final y como siempre');
  // `min(...)`: una subconsulta escalar con dos filas tumbaría la cancelación entera.
  assert.match(numerar, /^order by \(select min\(pc\.prioridad_espera_desde\) from public\.pagos_clase as pc/);
});

test('nadie más numera la cola con el orden viejo: cancelar y expirar llaman a renumerar_lista_espera', () => {
  for (const fn of ['cancelar_reserva_plaza', 'expirar_oferta_lista_espera']) {
    const c = cuerpoVigente(fn);
    assert.match(c, /perform public\.renumerar_lista_espera\(v_sesion_id\);/, fn);
    assert.doesNotMatch(c, /row_number\(\)/, `${fn}: una copia del UPDATE de renumerar se quedaría con el orden viejo`);
  }
  assert.doesNotMatch(cuerpoVigente('promocionar_siguiente_espera'), /order by r\.creado_en asc, r\.id asc/);
});

test('la migración no cambia firmas ni el tipo de seguridad, y las cuatro siguen solo para el servidor', () => {
  const nombre = MIGRACIONES.find(n => n.endsWith('_cola_quien_pago_va_primera.sql'));
  assert.ok(nombre, 'no existe la migración de la cola');
  const sql = readFileSync(join(DIR, nombre), 'utf8');
  assert.doesNotMatch(sql, /drop\s+function/i);
  for (const firma of [
    'renumerar_lista_espera(text)', 'promocionar_siguiente_espera(text, text, integer)',
    'cancelar_reserva_plaza(text, text, text, boolean)', 'expirar_oferta_lista_espera(text, text)',
  ]) {
    const f = firma.replace(/[()]/g, m => `\\${m}`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${f} from public, anon, authenticated;`), firma);
    assert.match(sql, new RegExp(`grant execute on function public\\.${f} to service_role, postgres;`), firma);
  }
  // DEFINER las dos que ya lo eran; INVOKER las otras dos (lo comprueba también el DO final).
  assert.match(sql, /cancelar_reserva_plaza[\s\S]*?LANGUAGE plpgsql\n SECURITY DEFINER/);
  assert.match(sql, /expirar_oferta_lista_espera\(p_studio_id text, p_reserva_id text\)[\s\S]*?LANGUAGE plpgsql\n SECURITY DEFINER/);
  const verificacion = sql.slice(sql.lastIndexOf('do $$'));
  for (const frag of ["has_function_privilege('authenticated'", "has_function_privilege('service_role'", 'prosecdef', 'proconfig']) {
    assert.ok(verificacion.includes(frag), frag);
  }
});
