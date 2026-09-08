import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardarProgresoWizard, leerProgresoWizard, olvidarProgresoWizard } from './borrador-wizard.ts';

function conStorageFalso<T>(fn: () => T): T {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  };
  try {
    return fn();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

test('guarda y recupera paso + respuestas del mismo estudio', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('studio-1', 3, { centros: '1 estudio', clases: ['Reformer', 'Mat'] });
    const r = leerProgresoWizard('studio-1');
    assert.equal(r?.paso, 3);
    assert.equal(r?.ans.centros, '1 estudio');
    assert.deepEqual(r?.ans.clases, ['Reformer', 'Mat']);
  });
});

test('no devuelve nada de un estudio distinto (mismo navegador, alta distinta)', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('studio-1', 2, { centros: '1 estudio' });
    assert.equal(leerProgresoWizard('studio-2'), null);
  });
});

test('sin borrador guardado: null', () => {
  conStorageFalso(() => {
    assert.equal(leerProgresoWizard('studio-1'), null);
  });
});

test('olvidarProgresoWizard borra el borrador', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('studio-1', 5, { centros: '1 estudio' });
    olvidarProgresoWizard();
    assert.equal(leerProgresoWizard('studio-1'), null);
  });
});

test('borrador manipulado con basura no rompe la lectura', () => {
  conStorageFalso(() => {
    window.localStorage.setItem('tentare-onboarding-wizard', JSON.stringify({
      studioId: 'studio-1', paso: -1, ans: { centros: 'x'.repeat(999) }, guardadoEn: Date.now(),
    }));
    assert.equal(leerProgresoWizard('studio-1'), null); // paso negativo: descartado entero
  });
});

test('valores fuera de las listas conocidas (localStorage editado a mano) se filtran, no rompen', () => {
  conStorageFalso(() => {
    window.localStorage.setItem('tentare-onboarding-wizard', JSON.stringify({
      studioId: 'studio-1', paso: 1,
      ans: { centros: 123, clases: ['ok', 456, 'x'.repeat(999)] },
      guardadoEn: Date.now(),
    }));
    const r = leerProgresoWizard('studio-1');
    assert.equal(r?.ans.centros, undefined);
    assert.deepEqual(r?.ans.clases, ['ok']);
  });
});

// El aforo se guarda por sala, y el índice ES la sala. Este saneado se olvidó
// de `aforos` al principio: el asistente lo pintaba bien y al recargar la
// pestaña las plazas desaparecían del resumen.
test('el borrador conserva un aforo por sala', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('stu-1', 5, { salas: '2 salas', aforos: ['8 plazas', '12 o más'] });
    const leido = leerProgresoWizard('stu-1');
    assert.deepEqual(leido?.ans.aforos, ['8 plazas', '12 o más']);
  });
});

test('un hueco en los aforos NO desplaza a las siguientes salas', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('stu-1', 5, { salas: '3 salas', aforos: ['', '18 plazas'] });
    const leido = leerProgresoWizard('stu-1');
    assert.deepEqual(leido?.ans.aforos, ['', '18 plazas'], 'la sala 2 sigue siendo la sala 2');
  });
});

test('un borrador manipulado con basura en aforos no rompe la lectura', () => {
  conStorageFalso(() => {
    guardarProgresoWizard('stu-1', 5, { aforos: [{ x: 1 } as unknown as string, '8 plazas'] });
    const leido = leerProgresoWizard('stu-1');
    assert.deepEqual(leido?.ans.aforos, ['', '8 plazas']);
  });
});
