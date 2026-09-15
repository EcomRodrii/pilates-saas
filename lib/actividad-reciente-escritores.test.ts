import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de quién escribe en `actividad_reciente`.
//
//  · `anonimizar_socio` borra el feed por `socio_id`. Una línea que nombra a una
//    socia y no lleva su `socio_id` sobrevive a la supresión con el nombre dentro.
//    Por eso toda inserción declara `socio_id` de forma explícita (null solo
//    cuando no hay socia de por medio).
//  · `origen` 'TENTARE' solo lo escribe el servidor, y solo cuando Tentare actuó
//    solo (piloto automático). La RLS no deja escribirlo desde una sesión.
//
// Los mensajes de fallo nombran fichero y línea, nunca el fuente entero: los logs
// de CI son públicos.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

function fuentes(dir: string): string[] {
  return readdirSync(join(RAIZ, dir), { recursive: true, encoding: 'utf8' })
    .filter(n => /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && !n.includes('node_modules'))
    .map(n => join(dir, n));
}

const lineaDe = (src: string, i: number) => src.slice(0, i).split('\n').length;

/** Devuelve el texto entre la llave de apertura en `desde` y su cierre. */
function objetoLiteral(src: string, desde: number): string | null {
  let nivel = 0;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') { nivel--; if (nivel === 0) return src.slice(desde, i + 1); }
  }
  return null;
}

type Insercion = { donde: string; argumento: string };

function inserciones(): Insercion[] {
  const out: Insercion[] = [];
  const patron = /\.from\(\s*['"]actividad_reciente['"]\s*\)\s*\.insert\(\s*/g;
  for (const ruta of [...fuentes('app'), ...fuentes('lib')]) {
    const src = leer(ruta);
    for (const m of src.matchAll(patron)) {
      const inicio = m.index! + m[0].length;
      const donde = `${relative(RAIZ, join(RAIZ, ruta))}:${lineaDe(src, m.index!)}`;
      const argumento = src[inicio] === '{'
        ? (objetoLiteral(src, inicio) ?? '')
        : (src.slice(inicio).match(/^[\w.]+\([^)]*\)/)?.[0] ?? '');
      out.push({ donde, argumento });
    }
  }
  return out;
}

test('el escáner ve las inserciones que hay (no está ciego)', () => {
  const todas = inserciones();
  // navegador (1) + Decision OS (1) + gestoría, Stripe desconectar, SEPA, dominios
  // del widget y callback de Connect (5).
  assert.ok(todas.length >= 7, `solo ${todas.length} inserciones encontradas`);
});

test('toda inserción en actividad_reciente declara socio_id', () => {
  for (const { donde, argumento } of inserciones()) {
    if (argumento.startsWith('{')) {
      assert.match(argumento, /\bsocio_id\s*:/, `${donde}: inserción sin socio_id`);
    } else {
      // El navegador inserta lo que construye `actividadRecienteToDb`.
      assert.match(argumento, /^actividadRecienteToDb\(/, `${donde}: inserción no reconocida por el test`);
    }
  }
  const datos = leer('lib/supabase-data.ts');
  const i = datos.indexOf('function actividadRecienteToDb(');
  assert.ok(i >= 0, 'falta actividadRecienteToDb');
  const cuerpo = objetoLiteral(datos, datos.indexOf('{', datos.indexOf('return', i))) ?? '';
  assert.match(cuerpo, /\bsocio_id\s*:/, 'actividadRecienteToDb sin socio_id');
  // El navegador nunca manda `origen`: toma el DEFAULT 'EQUIPO', que es lo único
  // que la política de inserción acepta.
  assert.doesNotMatch(cuerpo, /\borigen\s*:/, 'actividadRecienteToDb no debe mandar origen');
});

test('solo el servidor escribe origen, y TENTARE solo para el piloto automático', () => {
  for (const { donde, argumento } of inserciones()) {
    const tentare = /['"]TENTARE['"]/.test(argumento);
    if (tentare) assert.ok(donde.startsWith('lib/decision/'), `${donde}: TENTARE fuera del Decision OS`);
  }

  // Cada llamada al registro del Decision OS decide su origen y su socia.
  const llamadas: string[] = [];
  for (const ruta of [...fuentes('app'), ...fuentes('lib')]) {
    const src = leer(ruta);
    for (const m of src.matchAll(/dbLogActividadReciente\(\s*\{/g)) {
      const arg = objetoLiteral(src, m.index! + m[0].length - 1) ?? '';
      const donde = `${ruta}:${lineaDe(src, m.index!)}`;
      llamadas.push(donde);
      assert.match(arg, /\borigen\s*:/, `${donde}: sin origen`);
      assert.match(arg, /\bsocioId\s*:/, `${donde}: sin socioId`);
    }
  }
  assert.ok(llamadas.length >= 4, `solo ${llamadas.length} llamadas a dbLogActividadReciente`);

  const ejecutor = leer('lib/inngest/decision.ts');
  assert.match(ejecutor, /resueltoPor\s*===\s*'AUTONOMIA'\s*\?\s*'TENTARE'\s*:\s*'EQUIPO'/,
    'el ejecutor debe firmar TENTARE solo lo que aprobó el piloto automático');
  for (const ruta of ['app/api/decisiones/[id]/rechazar/route.ts', 'app/api/decisiones/[id]/posponer/route.ts']) {
    assert.match(leer(ruta), /origen:\s*'EQUIPO'/, `${ruta}: lo decide la propietaria`);
  }
});

test('la migración parte la RLS por rol y retira UPDATE/DELETE', () => {
  const sql = leer('supabase/migrations/20260914234708_actividad_reciente_escritura_por_rol.sql')
    .replace(/--.*$/gm, '');
  assert.match(sql, /drop policy if exists owner_actividad_reciente on public\.actividad_reciente/i);
  assert.match(sql, /for select to authenticated\s+using[\s\S]*?current_rol\(\)\)\s*=\s*'PROPIETARIO'/i);
  assert.match(sql, /for insert to authenticated\s+with check[\s\S]*?'PROPIETARIO',\s*'MANAGER',\s*'RECEPCION'[\s\S]*?origen\s*=\s*'EQUIPO'/i);
  assert.doesNotMatch(sql, /create policy[^;]*\bfor\s+(all|update|delete)\b/i);
  assert.match(sql, /revoke all on table public\.actividad_reciente from anon/i);
  assert.match(sql, /revoke all on table public\.actividad_reciente from authenticated/i);
  assert.match(sql, /grant select, insert on table public\.actividad_reciente to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*\b(update|delete)\b[^;]*actividad_reciente[^;]*\bto\b[^;]*\bauthenticated\b/i);
});
