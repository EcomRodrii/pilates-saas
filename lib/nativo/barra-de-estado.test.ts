import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTO_BARRA_DE_ESTADO, fotoBajoLaBarra, tintaBarraDeEstado, vigilarTintaSobreFoto, type TintaBarra } from './barra-de-estado.ts';

test('tintaBarraDeEstado: letras oscuras sobre crema, que es lo de siempre', () => {
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false }), 'oscura');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false, sobreFoto: false }), 'oscura');
});

test('tintaBarraDeEstado: letras claras sobre la foto de portada o con «Carbón»', () => {
  assert.equal(tintaBarraDeEstado({ fondoOscuro: false, sobreFoto: true }), 'clara');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: true }), 'clara');
  assert.equal(tintaBarraDeEstado({ fondoOscuro: true, sobreFoto: true }), 'clara');
});

test('fotoBajoLaBarra: mientras el borde de abajo de la foto quede por debajo de la hora', () => {
  assert.equal(fotoBajoLaBarra(290), true);
  assert.equal(fotoBajoLaBarra(ALTO_BARRA_DE_ESTADO + 1), true);
  assert.equal(fotoBajoLaBarra(ALTO_BARRA_DE_ESTADO), false);
  assert.equal(fotoBajoLaBarra(-40), false); // ya se ha ido por arriba
});

/** Una `window` de mentira: guarda los oyentes y deja disparar el scroll. */
function ventanaFalsa() {
  const oyentes = new Map<string, Set<() => void>>();
  return {
    oyentes,
    addEventListener: (tipo: string, f: () => void) => { (oyentes.get(tipo) ?? oyentes.set(tipo, new Set()).get(tipo)!).add(f); },
    removeEventListener: (tipo: string, f: () => void) => { oyentes.get(tipo)?.delete(f); },
    disparar: (tipo: string) => { for (const f of oyentes.get(tipo) ?? []) f(); },
  };
}

test('vigilarTintaSobreFoto: clara al entrar con la foto detrás, oscura al bajar y otra vez clara al subir', () => {
  const ventana = ventanaFalsa();
  const llamadas: TintaBarra[] = [];
  let bajo = true;
  const dejar = vigilarTintaSobreFoto({
    fondoOscuro: false, sobreFoto: () => bajo, aplicar: (t) => llamadas.push(t),
    ventana: ventana as unknown as Window,
  });
  assert.deepEqual(llamadas, ['clara']);
  bajo = false; ventana.disparar('scroll');
  bajo = true; ventana.disparar('scroll');
  assert.deepEqual(llamadas, ['clara', 'oscura', 'clara']);
  dejar();
});

test('vigilarTintaSobreFoto: solo llama al puente cuando la tinta cambia, no en cada scroll', () => {
  const ventana = ventanaFalsa();
  const llamadas: TintaBarra[] = [];
  const dejar = vigilarTintaSobreFoto({
    fondoOscuro: false, sobreFoto: () => true, aplicar: (t) => llamadas.push(t), ventana: ventana as unknown as Window,
  });
  for (let i = 0; i < 30; i++) ventana.disparar('scroll');
  ventana.disparar('resize');
  assert.deepEqual(llamadas, ['clara']);
  dejar();
});

test('vigilarTintaSobreFoto: al salir de la pantalla devuelve la tinta normal y deja de escuchar', () => {
  const ventana = ventanaFalsa();
  const llamadas: TintaBarra[] = [];
  const dejar = vigilarTintaSobreFoto({
    fondoOscuro: false, sobreFoto: () => true, aplicar: (t) => llamadas.push(t), ventana: ventana as unknown as Window,
  });
  dejar();
  assert.deepEqual(llamadas, ['clara', 'oscura']);
  assert.equal(ventana.oyentes.get('scroll')?.size ?? 0, 0);
  assert.equal(ventana.oyentes.get('resize')?.size ?? 0, 0);
  ventana.disparar('scroll');
  assert.deepEqual(llamadas, ['clara', 'oscura']);
});

test('vigilarTintaSobreFoto: con un estilo oscuro («Carbón») la barra es clara siempre, también al salir', () => {
  const ventana = ventanaFalsa();
  const llamadas: TintaBarra[] = [];
  let bajo = true;
  const dejar = vigilarTintaSobreFoto({
    fondoOscuro: true, sobreFoto: () => bajo, aplicar: (t) => llamadas.push(t), ventana: ventana as unknown as Window,
  });
  bajo = false; ventana.disparar('scroll');
  dejar();
  assert.deepEqual(llamadas, ['clara', 'clara']);
});
