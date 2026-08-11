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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

// Extrae el cron de una función Inngest por su id.
function cronDe(fuente: string, id: string): string | null {
  const re = new RegExp(`id:\\s*'${id}'[^}]*?cron:\\s*'([^']+)'`);
  const m = fuente.match(re);
  return m ? m[1] : null;
}

test('las cadencias bajadas en O-1 se mantienen', () => {
  assert.equal(cronDe(leer('lib/inngest/reservas-pendientes.ts'), 'reservas-pendientes-expirar'), '*/10 * * * *');
  assert.equal(cronDe(leer('lib/inngest/penalizaciones.ts'), 'penalizaciones-procesar'), '*/30 * * * *');
  assert.equal(cronDe(leer('lib/inngest/checkin-automatico.ts'), 'checkin-automatico'), '*/30 * * * *');
});

// ⚠️ Las dos que NO se bajaron, y por qué. No es purismo: bajarlas degrada algo
// concreto que alguien nota.
test('conciliar-cobros sigue cada 5 min mientras sea el camino principal del dinero', () => {
  const fuente = leer('lib/inngest/conciliar-cobros.ts');
  assert.equal(
    cronDe(fuente, 'conciliar-cobros'), '*/5 * * * *',
    'espaciarlo dobla lo que una socia espera a su bono, y hoy este barrido NO es la red sino el camino por el que llegan cobros reales (Sentry JAVASCRIPT-NEXTJS-13)',
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
    cuerpo.includes('s.created < limite'),
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
