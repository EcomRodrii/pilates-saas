// ─────────────────────────────────────────────────────────────────────────────
// O-1 / I-3: cadencia de los crons y vigilancia de cobros fuera de ventana.
//
// El suelo de tics de Inngest es FIJO: no baja con menos estudios ni sube con
// más, así que es lo único que se puede recortar para hacer sitio al fan-out
// diario cuando crezcan los clientes. Pero espaciar un cron es un intercambio
// con la experiencia de alguien real, no una optimización gratuita — y hay dos
// que NO se pueden espaciar por motivos concretos. Este test fija esas dos
// decisiones para que una pasada futura no "termine el trabajo" a ojo.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

// Extrae el cron de una función Inngest por su id.
function cronDe(fuente: string, id: string): string | null {
  const re = new RegExp(`id:\\s*'${id}'[^}]*?cron:\\s*'([^']+)'`);
  const m = fuente.match(re);
  return m ? m[1] : null;
}

// Extrae el schedule de un cron.schedule('job', 'schedule', ...) de una
// migración SQL, por nombre de job.
function cronScheduleDeMigracion(fuente: string, jobName: string): string | null {
  const re = new RegExp(`cron\\.schedule\\(\\s*\\n?\\s*'${jobName}',\\s*\\n?\\s*'([^']+)'`);
  const m = fuente.match(re);
  return m ? m[1] : null;
}

test('penalizaciones-procesar: reducida de cada 30min a cada hora (auditoría #3)', () => {
  assert.equal(cronDe(leer('lib/inngest/penalizaciones.ts'), 'penalizaciones-procesar'), '0 * * * *',
    'auditoría #3: las penalizaciones no necesitan ejecutarse cada 30min; cada hora es suficiente');
});

// Piloto de arquitectura, resto del bucket A (2026-08-11): estos siete
// barridos salieron de Inngest a pg_cron + pg_net en la misma tanda que
// lista-espera-ofertas-expirar. Las cadencias reales (incluida la razonada
// de O-1 para reservas-pendientes/checkin-automatico) NO cambiaron, solo el
// motor que las dispara.
test('bucket A (resto): cadencias preservadas en la migración pg_cron', () => {
  const migracion = leer('supabase/migrations/20260811140000_pg_cron_bucket_a_resto.sql');
  assert.equal(cronScheduleDeMigracion(migracion, 'checkin-automatico'), '*/30 * * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'minimo-asistentes-cancelar'), '*/15 * * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'reservas-pendientes-expirar'), '*/10 * * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'notif-recordatorios'), '*/15 * * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'backups-diarios'), '0 3 * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'notif-bonos'), '0 9 * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'notif-inactivas'), '0 10 * * 1');
  assert.equal(cronScheduleDeMigracion(migracion, 'revisiones-salud'), '0 7 * * *');
  assert.equal(cronScheduleDeMigracion(migracion, 'resumen-semanal'), '15 9 * * 1');
});

test('bucket A (resto): ninguno debe quedar registrado en Inngest', () => {
  const route = leer('app/api/inngest/route.ts');
  for (const nombre of [
    'checkinAutomaticoDispatcher', 'minimoAsistentesDispatcher', 'expirarReservasPendientesDispatcher',
    'notifRecordatoriosDispatcher', 'notifBonosDispatcher', 'notifInactivasDispatcher', 'procesarAutomacionEstudio',
    'backupsDispatcher', 'procesarBackupsEstudio', 'revisionesSaludDispatcher', 'procesarRevisionesSaludEstudio',
    'resumenSemanalDispatcher', 'procesarResumenSemanalEstudio',
  ]) {
    assert.ok(!route.includes(nombre), `${nombre} no debe seguir registrado: correría por duplicado junto al piloto pg_cron`);
  }
});

// ⚠️ Las dos que NO se bajaron, y por qué. No es purismo: bajarlas degrada algo
// concreto que alguien nota. Actualizado 2026-08-25: conciliar-cobros bajó de
// cada 5min a cada hora porque el webhook es el camino principal de entrega de
// cobros (auditoría #3). La ventana de recuperación de 12h sigue siendo válida,
// y la red de seguridad ahora recorre una vez por hora en punto.
test('conciliar-cobros cada hora en punto (red de seguridad, no camino principal)', () => {
  const fuente = leer('lib/inngest/conciliar-cobros.ts');
  assert.equal(
    cronDe(fuente, 'conciliar-cobros'), '0 * * * *',
    'cada hora en punto es suficiente para reconciliar; el webhook es el camino principal. Inngest: 28.8k→2.4k executions/mes (90% reducción)',
  );
});

// Piloto de arquitectura (2026-08-11): lista-espera-ofertas-expirar salió de
// Inngest a pg_cron + pg_net (ver la migración y app/api/cron/lista-espera-
// ofertas-expirar/route.ts) — es un barrido periódico sin estado por ítem,
// bucket A de la auditoría de crons. La cadencia real (la tolerancia "5 sobre
// una ventana de 15") NO cambió, solo el motor que la dispara.
test('lista-espera-ofertas-expirar: cadencia de 5 min preservada en el piloto pg_cron', () => {
  const migracion = leer('supabase/migrations/20260811133000_pg_cron_lista_espera_piloto.sql');
  assert.match(
    migracion, /\*\/5 \* \* \* \*/,
    'la tolerancia razonada sigue siendo "5 sobre una ventana de 15"; el barrido cambió de motor, no de cadencia',
  );
});

test('lista-espera-ofertas-expirar: no debe quedar registrada dos veces (Inngest + pg_cron)', () => {
  assert.ok(
    !leer('app/api/inngest/route.ts').includes('lista-espera-ofertas') &&
    !leer('app/api/inngest/route.ts').includes('listaEspera'),
    'si vuelve a Inngest sin quitar el piloto de pg_cron, el barrido corre por duplicado',
  );
});

// Bug (2026-08-18): una clase que se quedaba sin sustituta y ya había pasado
// seguía apareciendo "activa" (contactando/esperando respuesta) en el panel
// para siempre — nada cerraba la fila. Bucket A puro (SELECT+UPDATE, sin
// step.sleep): mismo patrón pg_cron que el resto, nunca Inngest.
test('sustituciones-cerrar-vencidas: cadencia de 30 min en la migración pg_cron', () => {
  const migracion = leer('supabase/migrations/20260817224815_pg_cron_sustituciones_cerrar_vencidas.sql');
  assert.equal(cronScheduleDeMigracion(migracion, 'sustituciones-cerrar-vencidas'), '*/30 * * * *');
});

test('sustituciones-cerrar-vencidas: no debe registrarse en Inngest', () => {
  assert.ok(
    !leer('app/api/inngest/route.ts').includes('cerrarSustitucionesVencidas') &&
    !leer('lib/inngest/sustituciones.ts').includes('cerrarSustitucionesVencidas'),
    'es un barrido sin step.sleep (bucket A) — registrarlo también en Inngest lo haría correr por duplicado',
  );
});

// ── I-3 ──────────────────────────────────────────────────────────────────────

test('la vigilancia de cobros detecta pero NO entrega', () => {
  const fuente = leer('lib/inngest/conciliar-cobros.ts');
  const ini = fuente.indexOf('async function vigilarEstudio');
  assert.ok(ini > 0, 'no encuentro vigilarEstudio: ¿se renombró?');
  const cuerpo = fuente.slice(ini, fuente.indexOf('\nexport const conciliarCobrosVigilancia', ini));

  assert.ok(
    !cuerpo.includes('entregar('),
    'la vigilancia no debe entregar: si un cobro lleva >12 h sin entregarse la causa es estructural, y entregarlo en silencio taparía la señal que hace falta para arreglarla',
  );
  assert.ok(cuerpo.includes('captureMessage'), 'debe avisar de lo que encuentra');
  assert.ok(
    cuerpo.includes('creado < limite'),
    'solo debe avisar de lo que ya está FUERA del alcance del barrido de 12 h; lo más reciente es ruido diario garantizado',
  );
});

test('recuperación y vigilancia comparten la MISMA detección', () => {
  const fuente = leer('lib/inngest/conciliar-cobros.ts');
  // Si cada uno tuviera su propia consulta, tocar una dejaría a la otra ciega
  // justo en lo que la primera se deja — que es el fallo que esto viene a cerrar.
  const usos = fuente.split('detectarPendientes(').length - 1;
  assert.ok(usos >= 3, `detectarPendientes debe definirse y usarse por ambos caminos (encontrados: ${usos})`);
  assert.ok(fuente.includes('VENTANA_VIGILANCIA_HORAS'), 'la ventana de vigilancia debe ser explícita');
});

test('la vigilancia está registrada en el serve de Inngest', () => {
  // Un cron que no se registra no corre nunca, y no hay nada que lo delate:
  // ni error, ni test, ni log. Solo silencio.
  const route = leer('app/api/inngest/route.ts');
  assert.ok(route.includes('conciliarCobrosVigilancia'), 'sin registrar, el cron simplemente no existe');
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ La regla que faltaba: FRECUENCIA ALTA × FAN-OUT es la combinación cara.
//
// Un cron `*/30` parece inofensivo mirado solo: 48 tics al día. Pero si además
// abre un evento por estudio, son 48 × (nº de estudios) ejecuciones, y cada una
// gasta sus pasos fijos aunque no encuentre nada que hacer. `confirmacion-riesgo-corte`
// eran ~31.000 pasos/mes —más del 60 % del plan free de Inngest— para un barrido
// que casi siempre no encuentra ni una reserva.
//
// Ha pasado DOS veces con el mismo patrón: recordatorios `*/15` (agosto 2026, se
// comió el 84 % de la cuota) y este. En ambos casos el dato estaba a la vista y
// nadie multiplicó las dos cifras. Por eso deja de ser criterio humano.
//
// La regla: por debajo de una hora, nada de fan-out. Si un barrido frecuente
// necesita mirar todos los estudios, va con UNA consulta global — como ya hacen
// recordatorios, reservas-pendientes, lista-espera y ahora el corte.
// ─────────────────────────────────────────────────────────────────────────────
test('ningún cron de frecuencia sub-horaria puede hacer fan-out por estudio', () => {
  const dir = join(RAIZ, 'lib/inngest');
  const infractores: string[] = [];

  // Quita comentarios: si no, la propia nota de arriba que MENCIONA el patrón
  // haría saltar la comprobación. (Ya pasó con `console.error` en el test de los
  // barridos de Vercel.)
  const soloCodigo = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  for (const f of readdirSync(dir).filter(n => n.endsWith('.ts') && !n.includes('.test.'))) {
    const fuente = soloCodigo(readFileSync(join(dir, f), 'utf8'));

    // ⚠️ Por FUNCIÓN, no por fichero: `notif-automations.ts` tiene un cron `*/15`
    // (global, correcto) y además dos dispatchers diarios que sí hacen fan-out.
    // Mirando el fichero entero daría un falso positivo y el test acabaría
    // desactivado, que es peor que no tenerlo.
    for (const bloque of fuente.split('inngest.createFunction').slice(1)) {
      const cuerpo = bloque.split('\n);')[0];
      if (!cuerpo.includes('enviarFanOutEnLotes')) continue;
      const m = cuerpo.match(/cron:\s*'([^']+)'/);
      if (!m) continue;
      const minutos = m[1].split(' ')[0];
      if (minutos.startsWith('*/') || minutos === '*') {
        const id = cuerpo.match(/id:\s*'([^']+)'/)?.[1] ?? '(sin id)';
        infractores.push(`${f} → '${id}' con cron '${m[1]}' + enviarFanOutEnLotes`);
      }
    }
  }

  assert.deepEqual(
    infractores, [],
    'Cron sub-horario + fan-out por estudio: el coste se multiplica por el número de '
    + 'clientes y revienta la cuota de Inngest. Usa una consulta global dentro del propio '
    + `cron (patrón de recordatoriosGlobal).\n  ${infractores.join('\n  ')}`,
  );
});
