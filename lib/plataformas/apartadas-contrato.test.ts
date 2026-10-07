import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Plazas apartadas para ClassPass (migr 20261007164222, decisión del fundador
// del 7-oct-2026): UNA regla (`plazas_apartadas`) que suman a las ocupadas las
// cinco funciones que deciden plaza, justo antes de comparar con el aforo, y
// que restan las pantallas que enseñan plazas libres. Guardianes sobre el
// fuente; el comportamiento contra una base real vive en
// supabase/tests/rls-plazas-apartadas.test.ts.

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');
const MIGRACIONES = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort();
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/--[^\n]*/g, '');

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

test('⚠️ las cinco que deciden plaza suman las apartadas a las ocupadas ANTES de comparar con el aforo', () => {
  for (const [fn, comparacion] of [
    ['evaluar_reserva', 'if v_aforo is null or v_ocupadas < v_aforo then'],
    ['promocionar_siguiente_espera', 'if v_aforo is not null and v_ocupadas >= v_aforo then'],
    ['resolver_reserva_pendiente', 'if v_aforo is null or v_ocupadas < v_aforo then'],
    ['aceptar_oferta_lista_espera', 'if v_aforo is not null and v_ocupadas >= v_aforo then'],
  ] as const) {
    const c = sinComentarios(cuerpoVigente(fn));
    const suma = c.indexOf('v_ocupadas := v_ocupadas + public.plazas_apartadas(');
    const compara = c.indexOf(comparacion);
    assert.ok(suma > 0 && compara > suma, `${fn}: las apartadas tienen que sumarse antes de comparar con el aforo`);
  }
  // Las externas: ClassPass usa sus apartadas (no se las cuenta a sí misma); USC y Wellhub, no.
  assert.match(sinComentarios(cuerpoVigente('reservar_plaza_externa')),
    /v_ocupadas \+ public\.plazas_apartadas\(p_sesion_id, p_origen\) >= v_aforo then\s+raise exception 'AFORO_LLENO_APARTADAS'/);
});

test('reservar_plaza no decide por su cuenta (lo hace evaluar_reserva), y las clases fijas no se tocan', () => {
  assert.doesNotMatch(cuerpoVigente('reservar_plaza'), /plazas_apartadas/);
  // Derecho preaprobado, reservado al crear la sesión: gana por construcción.
  assert.doesNotMatch(cuerpoVigente('materializar_plazas_fijas_interno'), /plazas_apartadas/);
});

test('la cola, cuando se liberan: el predicado del job y la ruta piden lo mismo', () => {
  const migracion = MIGRACIONES.filter(n => n.includes('classpass_aparta_plazas')).pop();
  assert.ok(migracion, 'falta la migración de las plazas apartadas');
  assert.match(readFileSync(join(DIR, migracion!), 'utf8'), /sesiones_con_plazas_liberadas\(interval '15 minutes'\)/);
  assert.match(leer('lib/lista-espera/plazas-liberadas.ts'), /VENTANA_PLAZAS_LIBERADAS = '15 minutes'/);
  assert.match(leer('app/api/cron/lista-espera-ofertas-expirar/route.ts'), /await barrerColasConPlazaLiberada\(\)/);
});

test('⚠️ dinero: a la invitada sin ficha no se le cobra si no se pueden leer las apartadas', () => {
  const s = leer('lib/db/supabase-data-admin.ts');
  const fn = s.slice(s.indexOf('export async function comprobarPlazaAntesDeCobrar'), s.indexOf('export async function crearReservaPublica'));
  assert.match(fn, /admin\.rpc\('plazas_apartadas', \{ p_sesion_id: p\.sesionId \}\)/);
  assert.match(fn, /if \(apartadasRes\.error\) throw new Error/);
  assert.match(fn, /apartadas: typeof apartadasRes\.data === 'number'/);
});

test('lo que se enseña al público resta las apartadas en los cuatro sitios que cuentan plazas', () => {
  assert.match(leer('lib/student/mapeo.ts'), /plazasLibresParaReservar\(s\.aforoMaximo, ocupadas\.get\(s\.id\) \?\? 0, apartadas\.get\(s\.id\) \?\? 0\)/);
  assert.match(leer('lib/reservar/construir-slots.ts'), /\(apartadas\?\.get\(s\.id\) \?\? 0\)/);
  assert.equal((leer('app/reservar/[slug]/page.tsx').match(/apartadasPorSesion\(aforoApartadas\)/g) ?? []).length, 2);
  assert.match(leer('lib/widget/usar-datos-widget.ts'), /apartadas: apartadasPorSesion\(datos\.aforoApartadas\)/);
  assert.equal((leer('lib/db/supabase-data-admin.ts').match(/aforoApartadasDe\(admin as never, studioId/g) ?? []).length, 2,
    'las dos respuestas públicas (catálogo y refresco de aforo) llevan las apartadas');
});

test('el mostrador no usa una apartada: la libera antes, por el servidor y con rastro', () => {
  const ruta = leer('app/api/plataformas/liberar-apartada/route.ts');
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /puedeGestionarCalendario\(sesion\.rol\)/);
  assert.match(ruta, /p_studio_id: sesion\.studioId/, 'el estudio sale de la sesión, nunca del body');
  assert.match(ruta, /tipo: 'PLAZA_PLATAFORMA_LIBERADA'/);
  const fn = sinComentarios(cuerpoVigente('liberar_plaza_apartada'));
  assert.match(fn, /for update/);
  // Solo lo apartado AHORA (la misma regla que `plazas_apartadas`), nunca por debajo de lo vendido.
  assert.match(fn, /from public\.apartados_de_sesion\(p_sesion_id\) as a\s+where a\.plataforma = p_plataforma and a\.cupo is not null and a\.cupo > a\.vendidas and now\(\) < a\.liberan_en;\s+if v_cupo is null then\s+raise exception 'NADA_APARTADO'/);
});
