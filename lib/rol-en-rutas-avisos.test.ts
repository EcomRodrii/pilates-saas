import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Rutas con service-role que solo pedían sesión de staff. La RLS no está debajo,
// así que la regla de `lib/permisos-reglas.ts` (probada aparte) solo protege si
// la ruta la llama. Se atan aquí para que el gemelo no se quede atrás: el fallo
// repetido de este repo es arreglar un endpoint y no su hermano.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

const AVISOS_DE_CLASE = [
  'app/api/clases/avisar-cancelada/route.ts',
  'app/api/clases/avisar-modificada/route.ts',
  'app/api/clases/avisar-cambio-clase/route.ts',
  'app/api/clases/avisar-cambio-serie/route.ts',
];

for (const rel of AVISOS_DE_CLASE) {
  test(`${rel}: comprueba contra la BD quién puede avisar de la clase`, () => {
    const fuente = leer(rel);
    assert.ok(fuente.includes('clasesParaAviso('), 'sin clasesParaAviso cualquier rol avisa de cualquier clase');
    assert.ok(fuente.includes('status: 403'), 'tiene que cortar con 403');
  });

  test(`${rel}: lo que dice el aviso no sale del body`, () => {
    const fuente = leer(rel);
    assert.doesNotMatch(fuente, /\b[bc]\.(clase|cuando|sala|fecha|hora|instructorActual)\b/,
      'clase, fecha, hora, sala y quién la da se leen de la BD (ClaseAviso), no de la petición');
  });
}

test('avisar-cancelada solo avisa de una clase cancelada en la BD', () => {
  const fuente = leer('app/api/clases/avisar-cancelada/route.ts');
  assert.ok(fuente.includes('!clase.cancelada'));
  assert.ok(fuente.includes('status: 409'));
});

test('emails/send: rol por tipo, y recibo y clase armados desde la BD', () => {
  const fuente = leer('app/api/emails/send/route.ts');
  assert.ok(fuente.includes('puedeEnviarEmail('), 'sin rol por tipo, una instructora manda recibos');
  assert.ok(fuente.includes(".from('recibos')"), 'el justificante se arma desde el recibo cobrado');
  assert.ok(fuente.includes('clasesParaAviso('), 'los correos de clase se arman desde la sesión');
  assert.doesNotMatch(fuente, /body\.data as/, 'nada de castear el body a los datos del correo');
});

const GUARDIAS: Array<[ruta: string, guardia: string]> = [
  ['app/api/automatizaciones/run/route.ts', 'puedeGestionarAutomatizaciones(sesion.rol)'],
  ['app/api/integrations/kisi/abrir/route.ts', 'puedeOperarClase('],
  ['app/api/valoraciones/route.ts', 'puedeVerValoracionesDe('],
];

for (const [rel, guardia] of GUARDIAS) {
  test(`${rel}: comprueba el rol con ${guardia}`, () => {
    const fuente = leer(rel);
    assert.ok(fuente.includes(guardia), `falta ${guardia}`);
    const pos = fuente.indexOf(guardia);
    const cierre = fuente.indexOf('status: 403', pos);
    assert.ok(cierre > pos && cierre - pos < 300, `llama a ${guardia} pero no corta con un 403`);
  });
}

test('calendario: el equipo pasa por instructoresVisiblesPorRol antes de salir', () => {
  const fuente = leer('app/api/calendario/route.ts');
  assert.ok(fuente.includes('instructoresVisiblesPorRol('));
  assert.doesNotMatch(fuente, /instructores:\s*\(\(instructoresRows[^\n]*\.map\(mapInstructor\),/,
    'mapInstructor a secas entrega email y teléfono de todo el equipo a la instructora');
});
