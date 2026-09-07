import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primeraVezConPlan } from './matricula-online.ts';

type Fila = Record<string, unknown>;

function fakeAdmin(opts: { sociosPorEmail?: Fila[]; countSuscripciones?: number; errorSocios?: boolean; errorSuscripciones?: boolean } = {}) {
  return {
    from(tabla: string) {
      if (tabla === 'socios') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve(
                    opts.errorSocios ? { data: null, error: { message: 'fallo' } }
                      : { data: opts.sociosPorEmail?.[0] ?? null, error: null },
                  ),
                }),
              }),
            }),
          }),
        };
      }
      // suscripciones
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve(
              opts.errorSuscripciones ? { count: null, error: { message: 'fallo' } }
                : { count: opts.countSuscripciones ?? 0, error: null },
            ),
          }),
        }),
      };
    },
  } as never;
}

test('con socioId conocido: sin suscripciones previas → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ countSuscripciones: 0 }), 'studio-1', 'soc-1', null);
  assert.equal(r, true);
});

test('con socioId conocido: YA tiene una suscripción → no es primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ countSuscripciones: 1 }), 'studio-1', 'soc-1', null);
  assert.equal(r, false);
});

test('sin socioId ni email: no hay ficha que pueda tener planes previos → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin(), 'studio-1', null, null);
  assert.equal(r, true);
});

test('sin socioId, email SIN ficha existente → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ sociosPorEmail: [] }), 'studio-1', null, 'nueva@example.com');
  assert.equal(r, true);
});

test('sin socioId, email CON ficha existente y suscripciones previas → no es primera vez', async () => {
  const r = await primeraVezConPlan(
    fakeAdmin({ sociosPorEmail: [{ id: 'soc-2' }], countSuscripciones: 1 }),
    'studio-1', null, 'yaesta@example.com',
  );
  assert.equal(r, false);
});

test('sin socioId, email CON ficha existente pero SIN ninguna suscripción → sí es primera vez', async () => {
  // Ficha existente (p.ej. un lead nunca convertido) sin ningún plan real.
  const r = await primeraVezConPlan(
    fakeAdmin({ sociosPorEmail: [{ id: 'soc-3' }], countSuscripciones: 0 }),
    'studio-1', null, 'lead@example.com',
  );
  assert.equal(r, true);
});

test('⚠️ fail-safe: un fallo leyendo socios NO cobra matrícula (ante la duda, no se cobra)', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ errorSocios: true }), 'studio-1', null, 'x@example.com');
  assert.equal(r, false);
});

test('⚠️ fail-safe: un fallo leyendo suscripciones NO cobra matrícula', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ errorSuscripciones: true }), 'studio-1', 'soc-1', null);
  assert.equal(r, false);
});

test('un email con comodín "*" no se deja resolver (fail-closed)', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ sociosPorEmail: [] }), 'studio-1', null, 'x*@example.com');
  assert.equal(r, false);
});
