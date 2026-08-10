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

// Los cinco crons cuya lectura es global de verdad (sin `.eq('studio_id', …)`).
// `recordatorios.ts` y `confirmacion-riesgo.ts` NO están aquí a propósito: hacen
// fan-out por estudio y sus lecturas van acotadas a un `studioId`, así que su
// techo es el de un solo estudio, no el de la plataforma.
const CRONS_GLOBALES = [
  'lib/inngest/notif-automations.ts',
  'lib/inngest/lista-espera-ofertas.ts',
  'lib/inngest/reservas-pendientes.ts',
  'lib/inngest/minimo-asistentes.ts',
  'lib/inngest/checkin-automatico.ts',
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
