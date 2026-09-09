import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALORACION_VACIA, loQueFalta, sePuedeCompletar, normalizar, pasosVisibles,
  repartirHistorial, queHaCambiado, type Valoracion, type FilaValoracion,
} from './valoracion-inicial.ts';

const con = (over: Partial<Valoracion>): Valoracion => ({ ...VALORACION_VACIA, ...over });

/** Lo mínimo que el encargo declara obligatorio. */
const COMPLETA = con({
  objetivos: ['movilidad', 'postura'],
  objetivoPrincipal: 'movilidad',
  experiencia: 'algunas_veces',
  nivel: 'principiante',
  tieneMolestias: false,
});

// ── Obligatorio vs. opcional ───────────────────────────────────────────────

test('una valoración vacía enumera TODO lo que falta, no solo lo primero', () => {
  // Devolver solo el primer hueco obliga a la alumna a descubrirlos de uno en
  // uno, guardando y fallando cada vez.
  const falta = loQueFalta(VALORACION_VACIA, true);
  assert.deepEqual(falta, ['objetivos', 'experiencia', 'nivel', 'molestias']);
});

test('con lo obligatorio puesto, se puede completar', () => {
  assert.equal(sePuedeCompletar(COMPLETA, true), true);
});

test('lo opcional NO bloquea: expectativas, hábitos y cuerpo se pueden dejar en blanco', () => {
  assert.equal(COMPLETA.expectativas, '');
  assert.equal(COMPLETA.estadoCuerpo, null);
  assert.equal(sePuedeCompletar(COMPLETA, true), true);
});

// ── La regla condicional ───────────────────────────────────────────────────

test('si dice que SÍ tiene molestias, la zona pasa a ser obligatoria', () => {
  const v = con({ ...COMPLETA, tieneMolestias: true });
  assert.deepEqual(loQueFalta(v, true), ['zonas']);
  assert.equal(sePuedeCompletar(v, true), false);
});

test('con la zona marcada, ya se puede completar', () => {
  const v = con({ ...COMPLETA, tieneMolestias: true, zonas: ['lumbar'] });
  assert.equal(sePuedeCompletar(v, true), true);
});

test('el detalle libre sigue siendo opcional aunque haya molestia', () => {
  // «No obligues a la alumna a escribir párrafos» — el encargo, §16.
  const v = con({ ...COMPLETA, tieneMolestias: true, zonas: ['rodillas'], detalle: '' });
  assert.equal(sePuedeCompletar(v, true), true);
});

// ── Consentimiento de salud ────────────────────────────────────────────────

test('SIN consentimiento no se pregunta por molestias, y la valoración se completa igual', () => {
  // Si el consentimiento fuera un peaje, sería un consentimiento forzado — que
  // es justo lo que el RGPD no considera consentimiento.
  const v = con({ ...VALORACION_VACIA, objetivos: ['fuerza'], objetivoPrincipal: 'fuerza', experiencia: 'nunca', nivel: 'basico' });
  assert.deepEqual(loQueFalta(v, false), []);
  assert.equal(sePuedeCompletar(v, false), true);
});

test('sin consentimiento, los pasos de salud no se enseñan', () => {
  const ids = pasosVisibles(COMPLETA, false).map((p) => p.id);
  assert.ok(!ids.includes('molestias'));
  assert.ok(!ids.includes('zonas'));
  assert.ok(!ids.includes('detalle'));
  assert.ok(!ids.includes('cuerpo'));
  assert.ok(ids.includes('objetivos'));
  assert.ok(ids.includes('resumen'));
});

test('⚠️ pero la PUERTA del consentimiento sí se enseña — si no, no hay dónde darlo', () => {
  // El fallo que esto evita: la puerta se pintaba «cuando el paso actual es de
  // salud y no hay consentimiento», pero sin consentimiento no hay ningún paso
  // de salud en la lista. Era invisible justo para quien tenía que verla.
  assert.ok(pasosVisibles(COMPLETA, false).map((p) => p.id).includes('consentimiento'));
});

test('dado el consentimiento, la puerta desaparece y aparecen sus preguntas', () => {
  const ids = pasosVisibles(con({ ...COMPLETA, tieneMolestias: true, zonas: ['lumbar'] }), true).map((p) => p.id);
  assert.ok(!ids.includes('consentimiento'));
  assert.ok(ids.includes('molestias'));
  assert.ok(ids.includes('cuerpo'));
  assert.ok(ids.includes('zonas'));
});

test('⚠️ con un solo objetivo, la pantalla del principal NO se enseña', () => {
  // `loQueFalta` ya no lo pedía, pero `pasosVisibles` seguía incluyendo el
  // paso: se veía «¿Y si tuvieras que quedarte con una?» con una sola opción
  // ya marcada. Las dos mitades de la regla tienen que decir lo mismo.
  const uno = con({ ...COMPLETA, objetivos: ['postura'], objetivoPrincipal: 'postura' });
  assert.ok(!pasosVisibles(uno, false).map((p) => p.id).includes('principal'));

  const dos = con({ ...COMPLETA, objetivos: ['postura', 'fuerza'], objetivoPrincipal: 'postura' });
  assert.ok(pasosVisibles(dos, false).map((p) => p.id).includes('principal'));

  const ninguno = con({ ...COMPLETA, objetivos: [], objetivoPrincipal: null });
  assert.ok(!pasosVisibles(ninguno, false).map((p) => p.id).includes('principal'));
});

test('quien dice que no tiene molestias no ve la pantalla de zonas', () => {
  const ids = pasosVisibles(con({ ...COMPLETA, tieneMolestias: false }), true).map((p) => p.id);
  assert.ok(ids.includes('molestias'));
  assert.ok(!ids.includes('zonas'));
});

// ── normalizar: las contradicciones que crea ir y volver ───────────────────

test('⚠️ cambiar a «no tengo molestias» BORRA las zonas que hubiera marcado', () => {
  // El peor de los cuatro: la ficha diría «lumbar» de alguien que acaba de
  // decir expresamente que no le duele nada.
  const v = normalizar(con({ ...COMPLETA, tieneMolestias: false, zonas: ['lumbar', 'cuello'], detalle: 'me molesta al girar' }));
  assert.deepEqual(v.zonas, []);
  assert.equal(v.detalle, '');
});

test('un objetivo principal que ya no está entre los elegidos se cae', () => {
  const v = normalizar(con({ objetivos: ['fuerza'], objetivoPrincipal: 'estres' }));
  assert.equal(v.objetivoPrincipal, 'fuerza', 'y al quedar uno solo, ese pasa a ser el principal');
});

test('con un solo objetivo no hay nada que preguntar: es el principal', () => {
  const v = normalizar(con({ objetivos: ['postura'] }));
  assert.equal(v.objetivoPrincipal, 'postura');
  assert.deepEqual(loQueFalta(v, false), ['experiencia', 'nivel']);
});

test('el texto en blanco no cuenta como texto escrito', () => {
  const v = normalizar(con({ expectativas: '   ', actividadHabitual: '\n\t ' }));
  assert.equal(v.expectativas, '');
  assert.equal(v.actividadHabitual, '');
});

test('⚠️ el texto libre tiene tope: la tabla no se puede llenar desde el cuerpo', () => {
  // El endpoint acepta cualquier JSON y las columnas son `text` sin límite.
  const v = normalizar(con({
    expectativas: 'a'.repeat(5000),
    actividadHabitual: 'b'.repeat(5000),
    tieneMolestias: true,
    detalle: 'c'.repeat(5000),
  }));
  assert.equal(v.expectativas.length, 600);
  assert.equal(v.actividadHabitual.length, 600);
  assert.equal(v.detalle.length, 600);
});

test('«cómo siento mi cuerpo» va detrás del consentimiento, no delante', () => {
  // «Estoy recuperándome de algo» es una condición de salud declarada: si la
  // pregunta viviera en la mitad no clínica se la haríamos a quien dijo que no
  // a los datos de salud, y la vería RECEPCIÓN.
  const sinConsentimiento = pasosVisibles(COMPLETA, false).map((p) => p.id);
  assert.ok(!sinConsentimiento.includes('cuerpo'));
  const conConsentimiento = pasosVisibles(COMPLETA, true).map((p) => p.id);
  assert.ok(conConsentimiento.includes('cuerpo'));
});

test('normalizar descarta valores que no están en el catálogo', () => {
  // El cuerpo de una petición lo escribe quien quiera; el servidor usa esta
  // misma función antes de guardar.
  const v = normalizar(con({ objetivos: ['movilidad', 'inventado' as never], zonas: ['lumbar', 'codo' as never], tieneMolestias: true }));
  assert.deepEqual(v.objetivos, ['movilidad']);
  assert.deepEqual(v.zonas, ['lumbar']);
});

test('normalizar conserva el ORDEN del catálogo, no el de llegada', () => {
  // Así dos alumnas con los mismos objetivos se leen igual en el panel.
  const v = normalizar(con({ objetivos: ['estres', 'movilidad', 'fuerza'] }));
  assert.deepEqual(v.objetivos, ['movilidad', 'fuerza', 'estres']);
});

// ── Inicial vs. actual: la petición central del encargo ────────────────────

const fila = (id: string, estado: 'EN_PROGRESO' | 'COMPLETADA', creadoEn: string, v: Partial<Valoracion> = {}): FilaValoracion =>
  ({ id, estado, creadoEn, valoracion: con({ ...COMPLETA, ...v }) });

test('sin ninguna fila, no hay ni inicial ni actual', () => {
  const h = repartirHistorial([]);
  assert.equal(h.inicial, null);
  assert.equal(h.actual, null);
  assert.equal(h.vueltas, 0);
});

test('con una sola completada, inicial y actual son LA MISMA', () => {
  const h = repartirHistorial([fila('a', 'COMPLETADA', '2026-01-10T10:00:00Z')]);
  assert.equal(h.inicial?.id, 'a');
  assert.equal(h.actual?.id, 'a');
  assert.equal(h.vueltas, 1);
});

test('el caso del encargo: dijo lumbar, tres meses después dice que ya no', () => {
  const h = repartirHistorial([
    fila('ene', 'COMPLETADA', '2026-01-10T10:00:00Z', { tieneMolestias: true, zonas: ['lumbar'] }),
    fila('abr', 'COMPLETADA', '2026-04-12T10:00:00Z', { tieneMolestias: false }),
  ]);
  // La instructora tiene que poder ver LAS DOS.
  assert.equal(h.inicial?.valoracion.tieneMolestias, true);
  assert.deepEqual(h.inicial?.valoracion.zonas, ['lumbar']);
  assert.equal(h.actual?.valoracion.tieneMolestias, false);
  assert.equal(h.vueltas, 2);
});

test('⚠️ la inicial NO se pierde a la tercera actualización', () => {
  // Es lo que fallaría con un modelo de «inicial + actual» como dos entidades:
  // la segunda actualización pisa a la primera y el punto de partida se va.
  const h = repartirHistorial([
    fila('c', 'COMPLETADA', '2026-06-01T10:00:00Z'),
    fila('a', 'COMPLETADA', '2026-01-10T10:00:00Z'),
    fila('b', 'COMPLETADA', '2026-03-01T10:00:00Z'),
  ]);
  assert.equal(h.inicial?.id, 'a');
  assert.equal(h.actual?.id, 'c');
  assert.equal(h.vueltas, 3);
});

test('⚠️ el orden de llegada NO decide cuál es la inicial', () => {
  // Postgres no garantiza orden sin ORDER BY, y este repo ya se quemó con
  // «el primero del array» en la tarjeta del bono.
  const alReves = repartirHistorial([
    fila('nueva', 'COMPLETADA', '2026-09-01T10:00:00Z'),
    fila('vieja', 'COMPLETADA', '2026-01-01T10:00:00Z'),
  ]);
  assert.equal(alReves.inicial?.id, 'vieja');
  assert.equal(alReves.actual?.id, 'nueva');
});

test('⚠️ un borrador no es ni la inicial ni la actual', () => {
  // Lo que estaba escribiendo cuando le sonó el teléfono no es lo que declara.
  const h = repartirHistorial([
    fila('hecha', 'COMPLETADA', '2026-01-10T10:00:00Z'),
    fila('a-medias', 'EN_PROGRESO', '2026-05-01T10:00:00Z'),
  ]);
  assert.equal(h.inicial?.id, 'hecha');
  assert.equal(h.actual?.id, 'hecha');
  assert.equal(h.borrador?.id, 'a-medias');
  assert.equal(h.vueltas, 1);
});

test('un borrador sin ninguna completada deja inicial y actual vacías', () => {
  const h = repartirHistorial([fila('x', 'EN_PROGRESO', '2026-05-01T10:00:00Z')]);
  assert.equal(h.inicial, null);
  assert.equal(h.actual, null);
  assert.equal(h.borrador?.id, 'x');
});

// ── Qué ha cambiado ────────────────────────────────────────────────────────

test('con una sola valoración no hay nada que comparar', () => {
  const h = repartirHistorial([fila('a', 'COMPLETADA', '2026-01-10T10:00:00Z')]);
  assert.deepEqual(queHaCambiado(h), []);
});

test('el cambio que le importa a la instructora sale nombrado', () => {
  const h = repartirHistorial([
    fila('a', 'COMPLETADA', '2026-01-10T10:00:00Z', { tieneMolestias: true, zonas: ['lumbar'], nivel: 'principiante' }),
    fila('b', 'COMPLETADA', '2026-04-10T10:00:00Z', { tieneMolestias: false, zonas: [], nivel: 'intermedio' }),
  ]);
  const campos = queHaCambiado(h).map((c) => c.campo).sort();
  assert.deepEqual(campos, ['molestias', 'nivel', 'zonas']);
});

test('reescribir las expectativas NO cuenta como cambio', () => {
  // Otra redacción no es información nueva, y llenar la ficha de ruido hace
  // que se deje de leer.
  const h = repartirHistorial([
    fila('a', 'COMPLETADA', '2026-01-10T10:00:00Z', { expectativas: 'quiero estar mejor' }),
    fila('b', 'COMPLETADA', '2026-04-10T10:00:00Z', { expectativas: 'me gustaría encontrarme mejor' }),
  ]);
  assert.deepEqual(queHaCambiado(h), []);
});
