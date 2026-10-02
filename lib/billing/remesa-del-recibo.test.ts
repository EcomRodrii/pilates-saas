import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivosParaNoSerRemesa, TEXTO_SIN_DOMICILIACION, TEXTO_SIN_REMESAS } from './remesa-del-recibo.ts';

// «El banco lo ha cobrado» y «El banco lo devolvió» desde EN_CURSO solo valen
// para lo que pudo salir en una remesa. Un EN_CURSO del «Reintentar» de antes no
// lo cobró ningún banco: darlo por cobrado inventaría un ingreso.

type Fila = Record<string, unknown>;

function montar(o: {
  estudio?: Fila | null;
  recibos?: Fila[];
  mandatos?: Fila[];
  errores?: { studios?: boolean; recibos?: boolean; mandatos_sepa?: boolean };
}) {
  const consultas: { tabla: string; filtros: Record<string, unknown> }[] = [];
  const admin = {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const respuesta = () => {
        const error = o.errores?.[tabla as keyof NonNullable<typeof o.errores>] ? { message: 'boom' } : null;
        if (tabla === 'recibos') return { data: error ? null : (o.recibos ?? []), error };
        if (tabla === 'mandatos_sepa') return { data: error ? null : (o.mandatos ?? []), error };
        return { data: null, error };
      };
      const c = {
        select() { return c; },
        eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
        in(campo: string, valores: unknown[]) { filtros[`in:${campo}`] = valores; return c; },
        maybeSingle() {
          consultas.push({ tabla, filtros });
          const error = o.errores?.studios ? { message: 'boom' } : null;
          return Promise.resolve({ data: error ? null : (o.estudio === undefined ? CON_REMESAS : o.estudio), error });
        },
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
          consultas.push({ tabla, filtros });
          return Promise.resolve(respuesta()).then(ok, ko);
        },
      };
      return c;
    },
  };
  return { admin: admin as never, consultas };
}

const CON_REMESAS = { sepa_acreedor_id: 'ES00ZZZ', sepa_iban: 'ES1200000000000000000000', sepa_titular: 'Estudio' };

test('pudo salir en una remesa: el estudio las hace y la clienta tiene domiciliación', async () => {
  const m = montar({ recibos: [{ id: 'rec-1', socio_id: 'soc-1' }], mandatos: [{ socio_id: 'soc-1' }] });
  const r = await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-1']);
  assert.deepEqual(r, { ok: true, motivoPorRecibo: new Map([['rec-1', null]]) });
});

test('el estudio no hace remesas (le falta acreedor, IBAN o titular): ninguno pudo salir en una', async () => {
  for (const falta of ['sepa_acreedor_id', 'sepa_iban', 'sepa_titular']) {
    const m = montar({ estudio: { ...CON_REMESAS, [falta]: null }, recibos: [{ id: 'rec-1', socio_id: 'soc-1' }], mandatos: [{ socio_id: 'soc-1' }] });
    const r = await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-1']);
    assert.deepEqual(r, { ok: true, motivoPorRecibo: new Map([['rec-1', TEXTO_SIN_REMESAS]]) }, falta);
    assert.equal(m.consultas.some(c => c.tabla === 'mandatos_sepa'), false, `${falta}: ni se miran los mandatos`);
  }
});

test('cada recibo según su clienta: con mandato pudo ir, sin mandato (o sin clienta) no', async () => {
  const m = montar({
    recibos: [{ id: 'rec-1', socio_id: 'soc-1' }, { id: 'rec-2', socio_id: 'soc-2' }, { id: 'rec-3', socio_id: null }],
    mandatos: [{ socio_id: 'soc-1' }],
  });
  const r = await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-1', 'rec-2', 'rec-3']);
  assert.ok(r.ok);
  assert.equal(r.motivoPorRecibo.get('rec-1'), null);
  assert.equal(r.motivoPorRecibo.get('rec-2'), TEXTO_SIN_DOMICILIACION);
  assert.equal(r.motivoPorRecibo.get('rec-3'), TEXTO_SIN_DOMICILIACION);
});

test('todo acotado al estudio de la sesión: recibos y mandatos de otro estudio no cuentan', async () => {
  const m = montar({ recibos: [{ id: 'rec-1', socio_id: 'soc-1' }], mandatos: [{ socio_id: 'soc-1' }] });
  await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-1']);
  const porTabla = new Map(m.consultas.map(c => [c.tabla, c.filtros]));
  assert.equal(porTabla.get('studios')?.id, 'studio-1');
  assert.equal(porTabla.get('recibos')?.studio_id, 'studio-1');
  assert.equal(porTabla.get('mandatos_sepa')?.studio_id, 'studio-1');
  assert.deepEqual(porTabla.get('mandatos_sepa')?.['in:socio_id'], ['soc-1']);
});

test('un recibo que no es del estudio no aparece: lo rechaza quien cobra', async () => {
  const m = montar({ recibos: [], mandatos: [] });
  const r = await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-ajeno']);
  assert.ok(r.ok);
  assert.equal(r.motivoPorRecibo.has('rec-ajeno'), false);
});

test('sin poder leer el estudio, los recibos o los mandatos: no se sabe (y quien llama no cobra ni devuelve)', async () => {
  for (const tabla of ['studios', 'recibos', 'mandatos_sepa'] as const) {
    const m = montar({ recibos: [{ id: 'rec-1', socio_id: 'soc-1' }], mandatos: [{ socio_id: 'soc-1' }], errores: { [tabla]: true } });
    assert.deepEqual(await motivosParaNoSerRemesa(m.admin, 'studio-1', ['rec-1']), { ok: false }, tabla);
  }
});

test('sin recibos que mirar, no se consulta nada', async () => {
  const m = montar({});
  assert.deepEqual(await motivosParaNoSerRemesa(m.admin, 'studio-1', []), { ok: true, motivoPorRecibo: new Map() });
  assert.equal(m.consultas.length, 0);
});
