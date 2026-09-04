// ─────────────────────────────────────────────────────────────────────────────
// Regresión: los crons de query GLOBAL no pueden leer sin paginar.
//
// Contexto. Colapsar el fan-out por estudio en una única query global fue el
// arreglo correcto para la cuota de Inngest (se pasó del 84 % del plan free),
// pero cambió la naturaleza de cada lectura: donde antes se leían "las filas de
// UN estudio", pasaron a leerse "las de TODOS". Y PostgREST corta en 1.000 filas
// EN SILENCIO — sin error, sin excepción, sin nada que distinga "no había más"
// de "no te doy más". Este repo ya sangró exactamente por aquí (#684, backups
// truncados).
//
// El fallo resultante no se parece a una caída: las socias de la parte truncada
// simplemente dejan de recibir su recordatorio, o su check-in no se marca y
// después les consta una falta. Degrada por porcentaje, no de golpe, y no deja
// rastro. Por eso se blinda con un test y no solo con un comentario.
//
// Se comprueba sobre el FUENTE (no importando los módulos) porque estos ficheros
// arrastran el cliente de Supabase y el motor de notificaciones; mismo idioma que
// ya usa `tope-socias-idempotencia.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

// Los cinco barridos cuya lectura es global de verdad (sin `.eq('studio_id', …)`).
// `recordatorios.ts` y `confirmacion-riesgo.ts` NO están aquí a propósito: hacen
// fan-out por estudio y sus lecturas van acotadas a un `studioId`, así que su
// techo es el de un solo estudio, no el de la plataforma.
// Los cinco salieron de Inngest a pg_cron (piloto de arquitectura, 2026-08-11)
// — el riesgo de truncado silencioso es el mismo, solo cambió quién dispara
// cada barrido.
const CRONS_GLOBALES = [
  'lib/notificaciones/recordatorios-clase-cron.ts',
  'lib/lista-espera/expirar-ofertas.ts',
  'lib/reservas-pendientes/expirar.ts',
  'lib/minimo-asistentes/cancelar-por-minimo.ts',
  'lib/checkin/marcar-asistidas-automatico.ts',
  'lib/sustituciones/cerrar-vencidas.ts',
];

// Tablas que crecen con el uso: una lectura suya sin paginar es la que rompe.
// (`studios`/`tipos_clase` crecen con clientes, no con uso; su truncado es un
// problema distinto y mucho más lejano — ver C-3 del informe de auditoría.)
const TABLAS_QUE_CRECEN = ['reservas', 'sesiones', 'socio_excepciones'];

// Trocea por `await` para aislar cada lectura: basta para no confundir la
// cadena de una consulta con la de la siguiente.
function sentencias(fuente: string): string[] {
  return fuente.split(/\bawait\b/g);
}

for (const rel of CRONS_GLOBALES) {
  test(`${rel}: ninguna lectura global de una tabla que crece va sin paginar`, () => {
    const fuente = leer(rel);
    for (const s of sentencias(fuente)) {
      for (const tabla of TABLAS_QUE_CRECEN) {
        if (!s.includes(`.from('${tabla}')`)) continue;
        if (!s.includes('.select(')) continue;          // update/delete: no truncan
        if (s.includes(`.eq('studio_id'`)) continue;    // acotada a un estudio
        if (s.includes('{ count:')) continue;           // head+count: no devuelve filas
        assert.ok(
          s.includes('.range('),
          `Lectura global de '${tabla}' sin .range() en ${rel}.\n` +
          `PostgREST la truncará a 1.000 filas EN SILENCIO. Envuélvela en fetchAllRows.\n` +
          `Fragmento: ${s.trim().slice(0, 220)}`,
        );
      }
    }
  });
}

// Barridos acotados a UN estudio cuyas lecturas, aun así, pasan del corte. El
// `.eq('studio_id', …)` baja el techo pero no lo quita: `bonos-inactivas-cron`
// mira 180 días de `sesiones` y las `reservas` de todas ellas, y un estudio
// activo pasa de 1.000 filas él solo. Truncado ahí, el mapa de última asistencia
// sale falso y la lista de inactivas se lee igual de bien que "no hay ninguna".
const CRONS_POR_ESTUDIO = [
  'lib/notificaciones/bonos-inactivas-cron.ts',
];

for (const rel of CRONS_POR_ESTUDIO) {
  test(`${rel}: ninguna lectura de una tabla que crece va sin paginar`, () => {
    const fuente = leer(rel);
    for (const s of sentencias(fuente)) {
      for (const tabla of TABLAS_QUE_CRECEN) {
        if (!s.includes(`.from('${tabla}')`)) continue;
        if (!s.includes('.select(')) continue;          // update/delete: no truncan
        if (s.includes('{ count:')) continue;           // head+count: no devuelve filas
        assert.ok(
          s.includes('.range('),
          `Lectura de '${tabla}' sin .range() en ${rel}.\n` +
          `Acotarla a un estudio NO la salva: PostgREST la truncará a 1.000 filas EN ` +
          `SILENCIO. Envuélvela en fetchAllRows.\n` +
          `Fragmento: ${s.trim().slice(0, 220)}`,
        );
      }
    }
  });
}

// C-3: la lista de estudios que alimenta CADA fan-out (o bucle, tras el
// piloto pg_cron). Si se trunca, un estudio entero deja de existir para el
// sistema —sin backups, sin recordatorios, sin renovaciones— y no hay error
// que lo señale. Umbral exacto: 1.000 estudios.
const DISPATCHERS = [
  'lib/backups/ejecutar-copia-diaria.ts',
  'lib/inngest/recordatorios.ts',
  'lib/inngest/renovaciones.ts',
  'lib/salud/generar-revisiones-todas.ts',
  'lib/inngest/valoraciones.ts',
  'lib/decision/resumen-semanal-cron.ts',
  'lib/notificaciones/bonos-inactivas-cron.ts',
  'lib/inngest/decision.ts',
  'lib/inngest/automatizaciones.ts',
  'lib/inngest/confirmacion-riesgo.ts',
  'lib/inngest/dunning.ts',
  'lib/inngest/conciliar-cobros.ts',
  'lib/inngest/cierre-gestoria-automatico.ts',
];

for (const rel of DISPATCHERS) {
  test(`${rel}: la lista de estudios del fan-out va paginada`, () => {
    const fuente = leer(rel);
    for (const s of sentencias(fuente)) {
      if (!s.includes(".from('studios')")) continue;
      if (!s.includes('.select(')) continue;
      // Acotadas a un estudio concreto: no son listas, no truncan.
      if (s.includes(".eq('id'") || s.includes('.single()') || s.includes('.maybeSingle()')) continue;
      assert.ok(
        s.includes('.range(') || s.includes('idsEstudios('),
        `Lista de estudios sin paginar en ${rel}.\n` +
        `Pasado el estudio 1.001, los de fuera del corte dejan de recibir este cron EN SILENCIO.\n` +
        `Usa idsEstudios() (lib/inngest/estudios.ts) o fetchAllRows.\n` +
        `Fragmento: ${s.trim().slice(0, 220)}`,
      );
    }
  });
}

test('conciliar-cobros pagina las sesiones de Stripe (no se queda en la primera página)', () => {
  const fuente = leer('lib/inngest/conciliar-cobros.ts');

  // `for await` sobre el listado = autopaginado de stripe-node. Sin esto se leía
  // solo `.data` (las 100 más RECIENTES); las que se caían eran las más
  // antiguas, justo las que llevaban más tiempo sin entregar, y al deslizarse la
  // ventana de 12 h no volvían nunca: cobro real perdido sin ningún error.
  assert.match(
    fuente,
    /for await \([^)]*stripe\.checkout\.sessions\.list\(/,
    'conciliar-cobros debe recorrer checkout.sessions.list con `for await` (autopagina), no leer .data de la primera página',
  );

  // Y si alguna vez se toca el techo defensivo, tiene que avisar: un tope
  // silencioso aquí es indistinguible de "no había nada que conciliar".
  assert.ok(
    fuente.includes('techo-paginado'),
    'al alcanzar el techo defensivo debe avisarse a Sentry, nunca cortar en silencio',
  );
});
