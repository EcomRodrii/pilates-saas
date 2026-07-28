import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratioContraste } from './wcag-contrast.ts';
import { MODO_TOKENS, FONDOS_CON_TEXTO, TEXTO_CON_INFORMACION, type Modo } from './portal-paleta.ts';

const MODOS: Modo[] = ['dia', 'noche'];

// El diseño del portal traía siete colores de texto por debajo de AA, y no eran
// decorativos: el nombre de la instructora, la sala, el día de la clase. Se
// oscurecieron lo mínimo. Esto impide que vuelvan a subir sin querer la próxima
// vez que alguien "ajuste un gris".
test('todo texto con información pasa AA sobre los fondos donde se pinta', () => {
  for (const modo of MODOS) {
    const t = MODO_TOKENS[modo];
    for (const token of TEXTO_CON_INFORMACION) {
      for (const fondo of FONDOS_CON_TEXTO) {
        const r = ratioContraste(t[token], t[fondo]);
        assert.ok(r !== null, `${modo}.${token} sobre ${fondo}: color inválido`);
        assert.ok(r >= 4.5, `${modo}.${token} (${t[token]}) sobre ${fondo} (${t[fondo]}) = ${r?.toFixed(2)}:1, hace falta 4.5`);
      }
    }
  }
});

// `micro` es la excepción consciente: versalitas hiperespaciadas que susurran.
// Pasarlas a AA costaba −15,5 de luminosidad y aplanaba la jerarquía. El test no
// exige que pase — exige que SIGA SIENDO una excepción reconocida y no se cuele
// como color de contenido: si algún día pasa AA, mejor, pero que se note.
test('micro es decorativo y está por debajo de los grises de contenido', () => {
  for (const modo of MODOS) {
    const t = MODO_TOKENS[modo];
    const rMicro = ratioContraste(t.micro, t.surface)!;
    const rMuted = ratioContraste(t.muted, t.surface)!;
    assert.ok(rMicro < rMuted,
      `${modo}: micro (${rMicro.toFixed(2)}) debería ser más tenue que muted (${rMuted.toFixed(2)}); si ya no lo es, usa muted y borra micro`);
  }
});

// El texto sobre el fondo de marca lo deriva el tema por contraste, pero el
// crema/oliva del propio portal también tiene que aguantar solo.
test('la tinta principal aguanta sobre las dos superficies', () => {
  for (const modo of MODOS) {
    const t = MODO_TOKENS[modo];
    for (const fondo of FONDOS_CON_TEXTO) {
      assert.ok(ratioContraste(t.ink, t[fondo])! >= 7,
        `${modo}: ink sobre ${fondo} debería llegar a AAA (7:1), es el texto que más se lee`);
    }
  }
});

// El diseño solo existe en claro; la noche está derivada a mano. Si alguien la
// toca sin mirar, esto avisa: los dos modos tienen que ofrecer la misma
// jerarquía, no uno plano y otro con relieve.
test('los dos modos mantienen la misma jerarquía de grises', () => {
  for (const modo of MODOS) {
    const t = MODO_TOKENS[modo];
    const r = (c: string) => ratioContraste(c, t.surface)!;
    assert.ok(r(t.ink) > r(t.muted), `${modo}: ink debe destacar sobre muted`);
    assert.ok(r(t.muted) > r(t.micro), `${modo}: muted debe destacar sobre micro`);
  }
});
