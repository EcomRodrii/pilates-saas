import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: una función SECURITY DEFINER corre con los permisos de su DUEÑO,
// así que la RLS de las tablas que toca NO se le aplica. Si además tiene GRANT
// EXECUTE a `authenticated`, la política de la tabla es decorativa: cualquier
// cuenta de personal la invoca por PostgREST (rest/v1/rpc/<nombre>) con su
// propio JWT desde la consola del navegador, y el gate de la UI no pinta nada.
//
// Esta familia lleva reapareciendo desde agosto: #1803 (confirmar_sustitucion),
// el H-1 de la 48ª pasada (crear_recuperacion) y, en la 49ª, CINCO de golpe.
// La más cara —otorgar_credito_disparador— concedía créditos ILIMITADOS: el
// dedupe es UNIQUE(studio_id, trigger, ref_id) y el ref_id lo elegía quien
// llamaba, así que bastaba con variarlo. Verificado en producción con una
// INSTRUCTOR real: saldo 95 → 215 con tres ref_id inventados.
//
// Lo que hace este fichero es impedir que vuelva a colarse por descuido, y en
// particular que alguien añada un disparador nuevo a la RPC sin comprobar nada.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// No relajes el test: el disparador nuevo necesita, o bien comprobar en SQL que
// la condición ocurrió de verdad (CONDICION_NO_CUMPLIDA), o bien exigir que el
// ref_id se DERIVE de datos que quien llama no inventa (REF_ID_NO_DERIVADO).
// Si no puedes hacer ninguna de las dos, el disparador no debe concederse desde
// el navegador: sácalo a una ruta de servidor con service_role.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DIR_MIGRACIONES = join(RAIZ, 'supabase/migrations');

/** Ficheros de migración en orden de aplicación (= orden de nombre). */
function migraciones(): { nombre: string; sql: string }[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter(n => n.endsWith('.sql'))
    .sort()
    .map(nombre => ({ nombre, sql: readFileSync(join(DIR_MIGRACIONES, nombre), 'utf8') }));
}

/**
 * Último cuerpo declarado de una función en las migraciones. Manda la última
 * definición, no la primera: una migración posterior puede redefinirla (que es
 * justo lo que hace el arreglo de la 49ª pasada).
 */
function cuerpoVigente(fn: string): string | null {
  let ultimo: string | null = null;
  for (const { sql } of migraciones()) {
    const re = new RegExp(
      String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${fn}\s*\(`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      // El cuerpo va entre el primer $function$/$$ tras la firma y su pareja.
      const resto = sql.slice(m.index);
      const abre = resto.search(/\$function\$|\$\$/);
      if (abre === -1) continue;
      const tag = resto.slice(abre).startsWith('$function$') ? '$function$' : '$$';
      const cierra = resto.indexOf(tag, abre + tag.length);
      if (cierra === -1) continue;
      ultimo = resto.slice(abre + tag.length, cierra);
    }
  }
  return ultimo;
}

// ─── 1. otorgar_credito_disparador: ningún disparador sin guarda ─────────────

test('otorgar_credito_disparador: cada disparador comprueba condición o deriva el ref_id', () => {
  const cuerpo = cuerpoVigente('otorgar_credito_disparador');
  assert.notEqual(cuerpo, null, 'No se encontró ninguna definición de otorgar_credito_disparador');

  // Las ramas se extraen del propio SQL, no de una lista a mano: un disparador
  // nuevo queda cubierto sin tocar este fichero.
  const ramas = [...cuerpo!.matchAll(/p_trigger\s*(?:=|in)\s*\(?\s*'([^']+)'((?:\s*,\s*'[^']+')*)/gi)]
    .map(m => ({ indice: m.index!, triggers: [m[1], ...[...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])] }));

  assert.ok(ramas.length >= 5, `Se esperaban al menos 5 ramas de disparador, se hallaron ${ramas.length}`);

  const sinGuarda: string[] = [];
  for (let i = 0; i < ramas.length; i++) {
    const desde = ramas[i].indice;
    const hasta = i + 1 < ramas.length ? ramas[i + 1].indice : cuerpo!.length;
    const trozo = cuerpo!.slice(desde, hasta);
    const tieneGuarda = /CONDICION_NO_CUMPLIDA|REF_ID_NO_DERIVADO/.test(trozo);
    if (!tieneGuarda) sinGuarda.push(ramas[i].triggers.join('/'));
  }

  assert.deepEqual(
    sinGuarda, [],
    `Estos disparadores conceden créditos sin comprobar nada: ${sinGuarda.join(', ')}. ` +
    'Con el ref_id a elección de quien llama, el UNIQUE(studio,trigger,ref_id) no acota ' +
    'nada y los créditos son infinitos (se canjean por clases y productos).',
  );
});

test('otorgar_credito_disparador: el importe lo pone la regla del estudio, nunca quien llama', () => {
  const cuerpo = cuerpoVigente('otorgar_credito_disparador')!;
  // No debe existir ningún parámetro de créditos en la firma; el valor sale
  // siempre de reward_rules / achievement_definitions / challenge_definitions.
  assert.ok(
    /v_creditos\s*(?:int|:=)/.test(cuerpo),
    'El importe debe resolverse en una variable interna a partir de la configuración del estudio',
  );
  assert.ok(
    /if\s+v_creditos\s+is\s+null\s+or\s+v_creditos\s*<=\s*0\s+then\s*[\s\S]{0,80}SIN_REGLA_ACTIVA/i.test(cuerpo),
    'Sin regla activa no se concede nada: falta el corte SIN_REGLA_ACTIVA',
  );
});

// ─── 1bis. La clave de semana que MANDA el cliente, ¿la acepta el SQL? ───────
//
// Este test existe porque su ausencia costó una rotura en producción. El primer
// arreglo de esta pasada exigía `extract(isodow from clave) = 1` apoyándose en
// un comentario que afirmaba que claveSemana() «es el lunes en ISO». No lo es:
// lunesDe() calcula la medianoche LOCAL del lunes y claveSemana() la serializa
// con toISOString(), que pasa a UTC — en España eso cae el DOMINGO. Resultado:
// SEMANA_COMPLETA rechazó el 100 % de las concesiones reales durante dos horas.
//
// No se replica aquí el cálculo (replicarlo es volver a tener dos fuentes de
// verdad, que es el fallo original): se EJECUTA el motor real en las dos zonas
// horarias que importan —la del servidor en Vercel (UTC) y la de los estudios
// (Europe/Madrid)— y se comprueba que la rama SQL acepta las dos claves.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function claveSemanaEn(tz: string): string {
  const guion = `
    import { calcularRacha } from ${JSON.stringify(join(RAIZ, 'lib/engines/streak-engine.ts'))};
    const r = calcularRacha([], [], new Date('2026-09-10T09:00:00Z'));
    process.stdout.write(r.claveSemanaActual);
  `;
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', guion],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

test('SEMANA_COMPLETA: el SQL acepta la clave que produce el cliente (UTC y Europe/Madrid)', () => {
  const cuerpo = cuerpoVigente('otorgar_credito_disparador')!;

  // Días de la semana que la rama SEMANA_COMPLETA da por buenos, leídos del SQL.
  const m = cuerpo.match(/extract\s*\(\s*isodow\s+from\s+\w+\s*\)\s*(not\s+in|in|<>|=)\s*\(?\s*([\d,\s]+)\)?/i);
  assert.notEqual(m, null, 'No se encontró la comprobación de día de la semana en la rama SEMANA_COMPLETA');
  const numeros = m![2].split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
  // OJO con el sentido: lo que se lee es la condición que dispara el RAISE, no
  // la lista de días válidos. `if isodow not in (1,7) then raise` ⇒ los días
  // ACEPTADOS son 1 y 7. `if isodow <> 1 then raise` ⇒ aceptado solo el 1.
  const rechazaLosListados = !/not\s+in|<>/i.test(m![1]);
  const todos = [1, 2, 3, 4, 5, 6, 7];
  // isodow: 1 = lunes … 7 = domingo. Se normaliza a getUTCDay (0 = domingo).
  const aceptados = new Set(
    (rechazaLosListados ? todos.filter(n => !numeros.includes(n)) : numeros).map(n => n % 7),
  );

  for (const tz of ['UTC', 'Europe/Madrid']) {
    const clave = claveSemanaEn(tz);
    assert.match(clave, /^\d{4}-\d{2}-\d{2}$/, `clave inesperada en ${tz}: ${clave}`);
    const dia = new Date(`${clave}T00:00:00Z`).getUTCDay();
    assert.ok(
      aceptados.has(dia),
      `Con TZ=${tz} el cliente manda la clave ${clave} (${DIAS[dia]}) y la rama ` +
      `SEMANA_COMPLETA solo acepta [${[...aceptados].map(d => DIAS[d]).join(', ')}]. ` +
      'Toda concesión de racha de esos estudios se rechaza con REF_ID_NO_DERIVADO.',
    );
  }
});

// ─── 2. Dinero: congelar/descongelar exigen el mismo rol que la RLS ──────────

// Pausar una suscripción la saca del barrido de renovaciones
// (lib/inngest/renovaciones.ts filtra estado='ACTIVA'): deja de facturarse en
// silencio y ningún cron lo revierte. Descongelar suma días de caducidad. La
// RLS de `suscripciones` ya exige puede_mover_dinero(); estas dos RPCs se la
// saltaban por ser SECURITY DEFINER.
for (const fn of ['congelar_suscripcion', 'descongelar_suscripcion']) {
  test(`${fn}: comprueba puede_mover_dinero() (la RLS de suscripciones lo exige)`, () => {
    const cuerpo = cuerpoVigente(fn);
    assert.notEqual(cuerpo, null, `No se encontró ninguna definición de ${fn}`);
    assert.ok(
      /puede_mover_dinero\s*\(\s*\)/.test(cuerpo!),
      `${fn} es SECURITY DEFINER y la RLS no la protege: sin este chequeo, una ` +
      'INSTRUCTORA puede pausar el cobro de cualquier socia de su estudio ' +
      'desde la consola del navegador.',
    );
    assert.ok(
      /validar_studio_mismatch|current_studio_id/.test(cuerpo!),
      `${fn} debe seguir comprobando el estudio además del rol`,
    );
  });
}

// ─── 3. reservar_cita: server-only, no callable desde el navegador ───────────

/**
 * ¿Puede `authenticated` ejecutar la función, según las migraciones?
 *
 * Se modela cada grantee POR SEPARADO y se reproducen los estados en orden, en
 * vez de quedarse con el último REVOKE/GRANT que mencione la función. La
 * primera versión de este test hacía justo eso y daba un falso PASS: la
 * migración 20260729154500 dice `revoke ... from public, anon`, y con un
 * "gana el último" eso contaba como revocado para authenticated, cuando el
 * GRANT de 0046 seguía en pie (producción confirmaba `authenticated=X`).
 *
 * Detalle que importa: `CREATE FUNCTION` concede EXECUTE a PUBLIC por defecto,
 * y `authenticated` hereda de PUBLIC. Por eso "no hay ningún GRANT" NO
 * significa "no es callable" — es exactamente la trampa que documentó #1803.
 */
function authenticatedPuedeEjecutar(fn: string): boolean {
  let viaPublic = true;   // el default de Postgres al crear la función
  let directo = false;
  for (const { sql } of migraciones()) {
    const re = new RegExp(
      String.raw`(revoke|grant)\s+execute\s+on\s+function\s+public\.${fn}\s*\([^)]*\)\s*(?:from|to)\s+([a-z_,\s]+)`,
      'gi',
    );
    for (const m of sql.matchAll(re)) {
      const esGrant = m[1].toLowerCase() === 'grant';
      const destinos = m[2].toLowerCase().split(',').map(s => s.trim());
      if (destinos.includes('public')) viaPublic = esGrant;
      if (destinos.includes('authenticated')) directo = esGrant;
    }
  }
  return viaPublic || directo;
}

test('reservar_cita: sin EXECUTE para authenticated (su único llamante usa service_role)', () => {
  assert.equal(
    authenticatedPuedeEjecutar('reservar_cita'), false,
    'reservar_cita fija el PRECIO desde los argumentos y no comprueba rol: si ' +
    'authenticated puede ejecutarla, una INSTRUCTORA crea citas CONFIRMADAS a 0 € ' +
    '(la RLS citas_escritura_insert le prohíbe justo eso por la vía normal).',
  );
});

// ─── 4. tiene_consentimiento_salud: no cruza estudios ────────────────────────

test('tiene_consentimiento_salud: filtra por estudio (se usa dentro de 13 policies)', () => {
  const cuerpo = cuerpoVigente('tiene_consentimiento_salud');
  assert.notEqual(cuerpo, null, 'No se encontró ninguna definición de tiene_consentimiento_salud');
  assert.ok(
    /current_studio_id\s*\(\s*\)/.test(cuerpo!),
    'Sin filtro de estudio, cualquier authenticated puede preguntar por un socio_id ' +
    'de OTRO tenant. No se puede arreglar con un REVOKE: la función se evalúa ' +
    'dentro de las políticas RLS de las tablas de salud y revocarla las rompe (42501).',
  );
  assert.ok(
    /auth\.uid\s*\(\s*\)\s+is\s+null/.test(cuerpo!),
    'La rama `auth.uid() is null` preserva el camino de service_role',
  );
});
