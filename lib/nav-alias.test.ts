// Renombrar una sección no puede borrarla del ⌘K.
//
// El buscador global casa las secciones SOLO contra su rótulo
// (`components/search/global-search.tsx`), así que al pasar «Membresías» a
// «Paquetes» quien llevaba meses buscando por el nombre viejo dejaba de
// encontrar nada. De ahí `NavItemDef.alias`.
//
// Este fichero fija las dos mitades: que el alias existe donde hace falta, y
// que la puntuación del buscador lo tiene en cuenta sin adelantar al rótulo
// real — un alias que ganara al nombre actual sería peor que no tenerlo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULOS } from './nav-config.ts';
import { normalizar } from './tareas.ts';

// Copia exacta de la fórmula de `global-search.tsx`. Vive aquí porque la de
// allí está dentro de un `useMemo` de un componente cliente y no se puede
// importar; si alguna de las dos cambia sin la otra, este test deja de
// significar lo que dice.
function puntuar(m: { label: string; alias?: string[] }, consulta: string): number {
  const nq = normalizar(consulta);
  const nl = normalizar(m.label);
  const porAlias = (m.alias ?? []).some(a => normalizar(a).includes(nq)) ? 50 : 0;
  return nl.startsWith(nq) ? 100 : nl.includes(nq) ? 70 : porAlias;
}

const paquetes = MODULOS.find(m => m.href === '/productos');

test('la sección de paquetes sigue existiendo y se llama así', () => {
  assert.ok(paquetes, 'no hay ningún módulo en /productos');
  assert.equal(paquetes!.label, 'Paquetes');
});

test('⚠️ «membresías», el nombre viejo, sigue encontrando la sección', () => {
  assert.ok(puntuar(paquetes!, 'membresias') > 0);
  assert.ok(puntuar(paquetes!, 'Membresías') > 0, 'con tildes y mayúsculas también');
});

test('el nombre actual gana al alias', () => {
  assert.ok(
    puntuar(paquetes!, 'paquetes') > puntuar(paquetes!, 'membresias'),
    'un alias no puede puntuar como el rótulo real',
  );
});

test('los otros nombres por los que se busca esto también valen', () => {
  for (const termino of ['planes', 'tarifas', 'bonos']) {
    assert.ok(puntuar(paquetes!, termino) > 0, `«${termino}» no encuentra la sección`);
  }
});

test('una consulta que no tiene nada que ver no la encuentra', () => {
  assert.equal(puntuar(paquetes!, 'instructoras'), 0);
});

test('los alias van en minúsculas y sin tildes, como espera `normalizar`', () => {
  for (const m of MODULOS) {
    for (const a of m.alias ?? []) {
      assert.equal(a, normalizar(a), `alias sin normalizar en ${m.href}: «${a}»`);
    }
  }
});
