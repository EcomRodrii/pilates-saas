import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_FORMA, CAMPOS_ESCALA_TEXTO, valoresFormaDesdeTema, escrituraDeCampoForma } from './campos-forma.ts';
import { VARIANTES_PORTAL, resolveVariantes } from '../theme-variantes.ts';

function campo(id: string) {
  return CAMPOS_FORMA.find((c) => c.id === id);
}

test('el porDefecto de cada eje es el PRIMER valor del catálogo — el aspecto de hoy', () => {
  for (const eje of ['cabeceraInicio', 'accesosRapidos', 'barra', 'retos', 'tarjetaPrincipal', 'bienvenida'] as const) {
    const c = campo(eje);
    assert.ok(c, `falta el campo ${eje}`);
    assert.equal(
      (c as { porDefecto: string }).porDefecto,
      VARIANTES_PORTAL[eje][0],
      `${eje}: el defecto del formulario se ha separado del catálogo`,
    );
  }
});

test('las opciones de cada eje son EXACTAMENTE las del catálogo, sin inventarse ni perder ninguna', () => {
  for (const eje of ['cabeceraInicio', 'accesosRapidos', 'barra', 'retos', 'tarjetaPrincipal', 'bienvenida'] as const) {
    const c = campo(eje) as { opciones: readonly { id: string; label: string }[] };
    assert.deepEqual(c.opciones.map((o) => o.id), [...VARIANTES_PORTAL[eje]]);
    // Una etiqueta que se quedara en el id crudo ("todasRelleno") sería una
    // fuga de nombre interno a la pantalla de la propietaria.
    for (const o of c.opciones) assert.notEqual(o.label, o.id, `${eje}/${o.id} sin etiqueta de negocio`);
  }
});

test('`tabBarStyle` NO se expone: portal-nav.tsx ya no lo lee y sería un control que no mueve nada', () => {
  assert.equal(campo('tabBarStyle'), undefined);
});

test('`radioTema` tampoco: su fallback no es un número único, y fijarlo mataría la herencia', () => {
  for (const id of ['radioTema', 'radioCard', 'radioBoton', 'radioChip', 'radioAcceso']) {
    assert.equal(campo(id), undefined, `${id} no debería exponerse todavía`);
  }
});

test('un tema vacío se lee con el aspecto de hoy en todos los ejes', () => {
  const v = valoresFormaDesdeTema({});
  assert.equal(v.cabeceraInicio, 'clasica');
  assert.equal(v.accesosRapidos, 'filas');
  assert.equal(v.barra, 'soloActiva');
  assert.equal(v.barraClasica, false);
  assert.equal(v.barraFlotante, false);
  assert.equal(v.barraOscura, false);
  assert.equal(v.destacado, null);
});

test('un tema con variantes reales se lee tal cual, sin pisarlas con el defecto', () => {
  const v = valoresFormaDesdeTema({
    variantes: { accesosRapidos: 'circulos', barra: 'todasRelleno' },
    barraClasica: true, destacado: '#D4AF37',
  });
  assert.equal(v.accesosRapidos, 'circulos');
  assert.equal(v.barra, 'todasRelleno');
  assert.equal(v.barraClasica, true);
  assert.equal(v.destacado, '#D4AF37');
  // Un eje que el tema no declara sigue en el aspecto de hoy, no en undefined.
  assert.equal(v.retos, 'neutro');
});

test('tocar UN eje reenvía el objeto `variantes` entero, conservando los demás', () => {
  const tema = { variantes: { accesosRapidos: 'circulos' } };
  const w = escrituraDeCampoForma(tema, 'retos', 'color');
  assert.ok(w);
  assert.equal(w.clave, 'variantes');
  const v = w.valor as Record<string, string>;
  assert.equal(v.retos, 'color');
  // Lo que ya había NO se pierde al tocar otro eje — el fallo clásico de
  // escribir `{ [eje]: valor }` a secas.
  assert.equal(v.accesosRapidos, 'circulos');
  // Y el objeto queda completo, como el que consume el portal.
  assert.deepEqual(Object.keys(v).sort(), Object.keys(resolveVariantes({})).sort());
});

test('los tres flags de barra son claves sueltas del tema, no de `variantes`', () => {
  for (const id of ['barraClasica', 'barraFlotante', 'barraOscura']) {
    const w = escrituraDeCampoForma({}, id, true);
    assert.deepEqual(w, { clave: id, valor: true });
  }
});

test('el acento vacío se guarda como null (hereda), nunca como cadena vacía', () => {
  assert.deepEqual(escrituraDeCampoForma({}, 'destacado', ''), { clave: 'destacado', valor: null });
  assert.deepEqual(escrituraDeCampoForma({}, 'destacado', undefined), { clave: 'destacado', valor: null });
  assert.deepEqual(escrituraDeCampoForma({}, 'destacado', '#D4AF37'), { clave: 'destacado', valor: '#D4AF37' });
});

test('un id desconocido no escribe nada en vez de inventarse una clave del tema', () => {
  assert.equal(escrituraDeCampoForma({}, 'noExiste', 'x'), null);
});

// ── Esquinas por pieza (`radioTema`) ────────────────────────────────────────
// El caso que obligó a inventar `numeroHeredado`: `--portal-radius-card` cae a
// TRES números distintos según quién la lee (20/24/26), así que no hay defecto
// que pintar y "vacío" tiene que significar hereda.

test('las esquinas son numeroHeredado con porDefecto null, nunca un número', () => {
  for (const pieza of ['card', 'boton', 'chip', 'acceso']) {
    const c = campo(`radio_${pieza}`) as { tipo: string; porDefecto: unknown };
    assert.ok(c, `falta radio_${pieza}`);
    assert.equal(c.tipo, 'numeroHeredado');
    assert.equal(c.porDefecto, null, 'un número aquí fijaría el valor al guardar');
  }
});

test('un tema sin radioTema se lee como "hereda" en las cuatro piezas', () => {
  const v = valoresFormaDesdeTema({});
  for (const pieza of ['card', 'boton', 'chip', 'acceso']) {
    assert.equal(v[`radio_${pieza}`], null);
  }
});

test('fijar una esquina no toca las demás', () => {
  const w = escrituraDeCampoForma({ radioTema: { card: 26 } }, 'radio_boton', 12);
  assert.ok(w);
  assert.equal(w.clave, 'radioTema');
  assert.deepEqual(w.valor, { card: 26, boton: 12 });
});

test('vaciar una esquina la BORRA del objeto — no la deja en undefined', () => {
  // `radioTema` es `.strict()` en el zod: una clave presente con `undefined`
  // tumbaría el objeto entero y se perderían TODAS las esquinas de golpe.
  const w = escrituraDeCampoForma({ radioTema: { card: 26, boton: 12 } }, 'radio_card', null);
  assert.ok(w);
  assert.deepEqual(w.valor, { boton: 12 });
  assert.equal(Object.prototype.hasOwnProperty.call(w.valor as object, 'card'), false);
});

test('vaciar la última esquina quita el campo entero, sin dejar un objeto vacío', () => {
  const w = escrituraDeCampoForma({ radioTema: { card: 26 } }, 'radio_card', null);
  assert.ok(w);
  assert.equal(w.valor, undefined);
});

test('el 0 es un valor real y sobrevive — esquina recta, no "hereda"', () => {
  const w = escrituraDeCampoForma({}, 'radio_card', 0);
  assert.deepEqual(w!.valor, { card: 0 });
  assert.equal(valoresFormaDesdeTema({ radioTema: { card: 0 } }).radio_card, 0);
});

// ── Escala de texto ─────────────────────────────────────────────────────────
// Mismo mecanismo que las esquinas, y por tanto las mismas trampas: era el
// último eje del tema sin control, y el modo de fallar que importa no es
// "no se guarda" sino "se guarda un número donde había herencia".

test('los tamaños de texto son numeroHeredado con porDefecto null, nunca un número', () => {
  const campos = CAMPOS_ESCALA_TEXTO;
  assert.equal(campos.length, 6);
  for (const c of campos) {
    assert.equal(c.tipo, 'numeroHeredado', `${c.id} debe poder quedarse VACÍO`);
    assert.equal(c.porDefecto, null, `${c.id}: un número por defecto mataría la herencia`);
  }
});

test('un tema sin escalaTexto se lee como "hereda" en las seis piezas', () => {
  const v = valoresFormaDesdeTema({});
  for (const c of CAMPOS_ESCALA_TEXTO) {
    assert.equal(v[c.id], null, `${c.id} debería heredar, no traer un número inventado`);
  }
});

test('fijar un tamaño no toca los demás', () => {
  const w = escrituraDeCampoForma({ escalaTexto: { seccion: 20 } }, 'texto_saludo', 24);
  assert.equal(w!.clave, 'escalaTexto');
  assert.deepEqual(w!.valor, { seccion: 20, saludo: 24 });
});

test('vaciar un tamaño lo BORRA del objeto — el zod es strict y un undefined lo tumbaría entero', () => {
  const w = escrituraDeCampoForma({ escalaTexto: { seccion: 20, saludo: 24 } }, 'texto_saludo', null);
  assert.deepEqual(w!.valor, { seccion: 20 });
  assert.ok(!('saludo' in (w!.valor as object)), 'la clave tiene que desaparecer, no quedarse en undefined');
});

test('vaciar el último tamaño quita el campo entero, sin dejar un objeto vacío', () => {
  const w = escrituraDeCampoForma({ escalaTexto: { seccion: 20 } }, 'texto_seccion', null);
  assert.equal(w!.valor, undefined);
});

test('los topes cubren lo que usan los temas de la biblioteca', () => {
  // `numeroBono` de Bloom es 60. Un máximo por debajo dejaría un tema
  // instalado fuera de rango: el control enseñaría un valor que él mismo
  // rechaza.
  for (const c of CAMPOS_ESCALA_TEXTO) {
    const campo = c as { min?: number; max?: number };
    assert.ok((campo.min ?? 0) <= 17, `${c.id}: el rótulo más pequeño de un tema es 17`);
    assert.ok((campo.max ?? 0) >= 60, `${c.id}: el número de bono de Bloom es 60`);
  }
});

test('los ids de texto y de esquina no chocan entre sí', () => {
  // Los dos grupos viven en el MISMO objeto plano del Inspector. Un id
  // repetido haría que tocar un tamaño escribiera una esquina, o al revés.
  const ids = CAMPOS_FORMA.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos entre los grupos de forma');
});
