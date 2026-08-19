import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, PARA_QUIEN, novedadesFrenteAlAnterior, resumenCorto } from './catalogo-planes.ts';
import { PLANES, PLAN_ENTITLEMENTS, type Plan } from './entitlements.ts';

test('ninguna fila promete menos en un plan caro que en uno barato', () => {
  // La escalera BASE → ESTUDIO → CADENA no puede tener escalones hacia abajo:
  // pagar más y perder algo es un error de catálogo, no una decisión.
  const peso = { no: 0, si: 1 } as const;
  for (const cat of CATEGORIAS) {
    for (const fila of cat.filas) {
      for (let i = 1; i < PLANES.length; i++) {
        const antes = fila.valor(PLANES[i - 1]);
        const ahora = fila.valor(PLANES[i]);
        if (antes.tipo === 'texto' || ahora.tipo === 'texto') continue;
        assert.ok(
          peso[ahora.tipo] >= peso[antes.tipo],
          `«${fila.nombre}» está en ${PLANES[i - 1]} y desaparece en ${PLANES[i]}`,
        );
      }
    }
  }
});

test('el tope de alumnas que se anuncia es el que aplica el servidor', () => {
  // El fallo más caro de una página de precios: prometer un límite distinto
  // del que impone `puedeAnadirSocia`. Aquí se comprueba contra la MISMA
  // constante, no contra un número escrito a mano.
  const fila = CATEGORIAS.flatMap((c) => c.filas).find((f) => f.nombre === 'Alumnas activas');
  assert.ok(fila, 'la fila del tope de alumnas tiene que existir');
  for (const p of PLANES) {
    const v = fila.valor(p);
    assert.equal(v.tipo, 'texto');
    const max = PLAN_ENTITLEMENTS[p].maxSocios;
    if (v.tipo === 'texto') {
      if (max === Infinity) assert.match(v.texto, /Sin límite/);
      else assert.ok(v.texto.includes(String(max)), `${p}: "${v.texto}" no menciona ${max}`);
    }
  }
});

test('las filas de feature siguen al entitlement real, no a un texto suelto', () => {
  const fila = (nombre: string) =>
    CATEGORIAS.flatMap((c) => c.filas).find((f) => f.nombre === nombre);

  const casos: [string, keyof (typeof PLAN_ENTITLEMENTS)['BASE']['features']][] = [
    ['Modo autónomo y modo Vacaciones', 'sustitucionesAutonomas'],
    ['App con tu marca', 'marca'],
    ['Centro de Control', 'decisiones'],
    ['Varias sedes en un mismo panel', 'multiCentro'],
  ];
  for (const [nombre, feature] of casos) {
    const f = fila(nombre);
    assert.ok(f, `falta la fila «${nombre}»`);
    for (const p of PLANES) {
      const esperado = PLAN_ENTITLEMENTS[p].features[feature] ? 'si' : 'no';
      assert.equal(f.valor(p).tipo, esperado, `${nombre} en ${p}`);
    }
  }
});

test('cada plan estrena algo respecto al anterior', () => {
  // Si un plan no añadiera nada visible, la página de precios estaría pidiendo
  // más dinero sin poder decir a cambio de qué.
  assert.deepEqual(novedadesFrenteAlAnterior('BASE', null), []);
  for (let i = 1; i < PLANES.length; i++) {
    const nuevas = novedadesFrenteAlAnterior(PLANES[i], PLANES[i - 1]);
    assert.ok(nuevas.length > 0, `${PLANES[i]} no añade nada frente a ${PLANES[i - 1]}`);
  }
});

test('el resumen corto cabe en una tarjeta y empieza por el tope', () => {
  for (const p of PLANES) {
    const i = PLANES.indexOf(p);
    const bullets = resumenCorto(p, i > 0 ? PLANES[i - 1] : null);
    assert.ok(bullets.length > 0 && bullets.length <= 4, `${p}: ${bullets.length} puntos`);
    assert.match(bullets[0], /alumnas/i, `${p}: el primer punto debe ser el tope de alumnas`);
  }
});

test('los tres planes tienen su «para quién», y no se repiten', () => {
  const ganchos = new Set<string>();
  for (const p of PLANES as Plan[]) {
    assert.ok(PARA_QUIEN[p].para.length > 0, `${p} sin descripción`);
    ganchos.add(PARA_QUIEN[p].gancho);
  }
  assert.equal(ganchos.size, PLANES.length, 'dos planes comparten gancho');
});

test('no hay categorías ni filas duplicadas', () => {
  const ids = CATEGORIAS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'hay categorías con el mismo id');
  const filas = CATEGORIAS.flatMap((c) => c.filas.map((f) => f.nombre));
  assert.equal(new Set(filas).size, filas.length, 'hay filas repetidas entre categorías');
});

test('no se anuncia ningún módulo congelado', () => {
  // Kiosko, Caja/POS, Oferta digital, Comunidad y Chat siguen existiendo en el
  // código pero nadie puede llegar a ellos (lib/frozen-features.ts). Venderlos
  // aquí sería prometer una pantalla inalcanzable.
  const todo = CATEGORIAS.flatMap((c) => c.filas.map((f) => `${f.nombre} ${f.detalle ?? ''}`)).join(' ').toLowerCase();
  for (const congelado of ['kiosko', 'punto de venta', 'datáfono', 'vídeos a la carta', 'oferta digital', 'comunidad', 'chat de equipo']) {
    assert.ok(!todo.includes(congelado), `el catálogo menciona «${congelado}», que está congelado`);
  }
});
