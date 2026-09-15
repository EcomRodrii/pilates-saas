import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frasesPoliticaEstudio, type PoliticaEstudio } from './politica-estudio-textos.ts';

// Los valores de fábrica: con los que están hoy los 12 estudios de producción.
const FABRICA: PoliticaEstudio = {
  cancelacionVentanaHoras: 12,
  cancelacionDevolverBonoTardia: false,
  cancelacionClaseDevuelveBono: true,
  permiteListaEspera: true,
  listaEsperaPlazoAceptacionMinutos: 0,
  avisarAlumnas: true,
};

const textos = (p: PoliticaEstudio) => frasesPoliticaEstudio(p).map(f => f.texto);
const frase = (p: PoliticaEstudio, id: string) => frasesPoliticaEstudio(p).find(f => f.id === id);

test('de fábrica: lo que hace hoy un estudio que no ha tocado nada', () => {
  assert.deepEqual(textos(FABRICA), [
    'Si cancela con más de 12 h de antelación, recupera la sesión.',
    'Si cancela con menos de 12 h, no recupera la sesión.',
    'Si se cancela una clase entera —la cancelas tú, por el mínimo o por un cierre—, devuelve la sesión.',
    'Si se libera una plaza, se la da al momento a la primera de la lista de espera.',
    'Si una clase cambia de instructora, se mueve o se cancela en Sustituciones, avisa a sus alumnas por email y en su app.',
  ]);
});

test('cada frase se lee sola en su cajón: una línea (≤ 120) y la fila donde va', () => {
  for (const p of combinaciones()) {
    for (const f of frasesPoliticaEstudio(p)) {
      assert.ok(f.texto.length <= 120, `«${f.texto}» son ${f.texto.length} caracteres`);
      // Suelta, «no la recupera» no dice qué no se recupera.
      assert.doesNotMatch(f.texto, /\bla recupera\b/, f.texto);
    }
  }
  assert.equal(frase(FABRICA, 'cancela-tarde')!.tarjeta, 'cancelar-y-recuperar');
  assert.equal(frase(FABRICA, 'estudio-cancela')!.tarjeta, 'si-se-cancela-una-clase');
  assert.equal(frase(FABRICA, 'plaza-liberada')!.tarjeta, 'lista-de-espera');
});

test('cancelación: ventana × devolver en tardías', () => {
  for (const ventana of [0, -3, 1, 24]) {
    for (const tardia of [false, true]) {
      const p = { ...FABRICA, cancelacionVentanaHoras: ventana, cancelacionDevolverBonoTardia: tardia };
      const aTiempo = frase(p, 'cancela-a-tiempo');
      const tarde = frase(p, 'cancela-tarde');
      if (ventana > 0) {
        assert.equal(aTiempo?.texto, `Si cancela con más de ${ventana} h de antelación, recupera la sesión.`);
        assert.equal(tarde?.texto, tardia
          ? `Si cancela con menos de ${ventana} h, también recupera la sesión.`
          : `Si cancela con menos de ${ventana} h, no recupera la sesión.`);
      } else {
        // `esCancelacionTardia`/la RPC: ventana ≤ 0 = nunca tardía. Hablar de
        // «cancelar tarde» ahí sería inventarse una regla.
        assert.match(aTiempo?.texto ?? '', /cancele cuando cancele: no hay plazo de cancelación/);
        assert.equal(tarde, undefined);
        assert.ok(!textos(p).some(t => t.includes('menos de')));
      }
    }
  }
});

test('clase cancelada entera: el mínimo y el cierre siguen al mismo interruptor', () => {
  assert.match(frase({ ...FABRICA, cancelacionClaseDevuelveBono: true }, 'estudio-cancela')!.texto,
    /por el mínimo o por un cierre—, devuelve la sesión/);
  const apagado = frase({ ...FABRICA, cancelacionClaseDevuelveBono: false }, 'estudio-cancela')!.texto;
  assert.match(apagado, /por el mínimo o por un cierre—, no devuelve la sesión/);
  // Desde #1342 no hay ningún camino que devuelva «siempre».
  assert.ok(!textos({ ...FABRICA, cancelacionClaseDevuelveBono: false }).some(t => /siempre/.test(t)));
});

test('lista de espera: permitida × plazo de aceptación', () => {
  for (const permite of [false, true]) {
    for (const plazo of [0, -5, 15, 60, 90]) {
      const f = frase({ ...FABRICA, permiteListaEspera: permite, listaEsperaPlazoAceptacionMinutos: plazo }, 'plaza-liberada')!;
      if (!permite) {
        assert.equal(f.texto, 'Con la clase llena, nadie más puede apuntarse a la lista de espera.');
        assert.deepEqual(f.respaldo, ['permiteListaEspera']);
      } else if (plazo <= 0) {
        assert.equal(f.texto, 'Si se libera una plaza, se la da al momento a la primera de la lista de espera.');
      } else {
        const esperado = plazo === 60 ? '1 h' : `${plazo} min`;
        assert.equal(f.texto,
          `Si se libera una plaza, la primera de la lista tiene ${esperado} para aceptarla; si no, pasa a la siguiente.`);
      }
    }
  }
});

test('aviso a las alumnas: encendido, apagado y sin leer', () => {
  assert.match(frase({ ...FABRICA, avisarAlumnas: true }, 'cambia-la-clase')!.texto, /avisa a sus alumnas por email y en su app/);
  assert.match(frase({ ...FABRICA, avisarAlumnas: false }, 'cambia-la-clase')!.texto, /no avisa a sus alumnas/);
  // Sin el valor no se afirma nada: ni «avisa» ni «no avisa».
  assert.equal(frase({ ...FABRICA, avisarAlumnas: null }, 'cambia-la-clase'), undefined);
});

// ─── Ninguna frase sin un valor detrás ───────────────────────────────────────
// Para CADA combinación: (1) toda frase declara qué campos la deciden y a qué
// control lleva; (2) cambiar un campo que NO está en su respaldo no la mueve.

const VARIANTES: { [K in keyof PoliticaEstudio]: PoliticaEstudio[K][] } = {
  cancelacionVentanaHoras: [0, 12],
  cancelacionDevolverBonoTardia: [false, true],
  cancelacionClaseDevuelveBono: [false, true],
  permiteListaEspera: [false, true],
  listaEsperaPlazoAceptacionMinutos: [0, 30],
  avisarAlumnas: [null, false, true],
};
const CAMPOS = Object.keys(VARIANTES) as (keyof PoliticaEstudio)[];

function combinaciones(): PoliticaEstudio[] {
  let acc: Partial<PoliticaEstudio>[] = [{}];
  for (const campo of CAMPOS) {
    acc = acc.flatMap(p => (VARIANTES[campo] as unknown[]).map(v => ({ ...p, [campo]: v })));
  }
  return acc as PoliticaEstudio[];
}

test('cada combinación: toda frase tiene respaldo, y solo su respaldo la mueve', () => {
  const todas = combinaciones();
  assert.equal(todas.length, 96);
  for (const p of todas) {
    const frases = frasesPoliticaEstudio(p);
    assert.equal(new Set(frases.map(f => f.id)).size, frases.length, 'una frase por hecho');
    for (const f of frases) {
      assert.ok(f.respaldo.length > 0, `«${f.texto}» no tiene ningún valor detrás`);
      assert.ok(f.tarjeta, `«${f.texto}» no dice en qué cajón se lee`);
      for (const campo of CAMPOS.filter(c => !f.respaldo.includes(c))) {
        for (const otro of VARIANTES[campo] as unknown[]) {
          const movida = frasesPoliticaEstudio({ ...p, [campo]: otro }).find(x => x.id === f.id);
          assert.equal(movida?.texto, f.texto, `«${f.texto}» cambia con ${campo}, que no está en su respaldo`);
        }
      }
    }
  }
});
