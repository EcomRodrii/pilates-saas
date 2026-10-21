// ─────────────────────────────────────────────────────────────────────────────
// Guardia: dentro del producto, los textos no prometen lo que no pasa (21-oct-2026).
//
// Panel, ayuda del panel, correos, avisos y app de la alumna. Hasta el 21-oct
// decían, entre otras cosas, que la facturación venía apagada (viene encendida),
// que una rectificativa «hay que transmitirla aparte» a la AEAT (sin Veri*Factu
// no se transmite nada), que las cuotas se cobraban solas por SEPA guardado (el
// SEPA de Stripe se retiró: la domiciliación va por remesa), que con el widget se
// reserva y se paga «sin salir de tu web» (sin sesión, el widget sin marco lleva
// a la página de Tentare, y el pago va por Stripe), que el plan Estudio era «el
// más elegido» (ningún estudio lo tenía), un correo que prometía «te devolvemos
// el dinero» en nombre de un estudio que no lo había decidido, y un aviso de
// penalización que decía «por cancelar dentro de la ventana permitida» (es por
// cancelar FUERA). Se cambiaron por la frase verdadera; esta guardia falla si
// una vuelve.
//
// Qué NO mira, a propósito:
//   · La web comercial (WEB_COMERCIAL): sus frases las decide el fundador y se
//     proponen en el PR, no se cambian por iniciativa propia (.claude/tentare-os.md).
//     Lo que la web comparte con el producto (lib/billing/catalogo-planes.ts,
//     lib/faqs.ts…) SÍ se mira: se pinta en el panel.
//   · Las líneas de comentario, que tienen que poder contar por qué se quitó algo.
//   · Los tests (`*.test.ts`), que nombran las frases para comprobar que no están.
//
// Si una frase de la lista es verdad en algún sitio concreto, va en EXCEPCIONES
// con su motivo: nunca se quita de la lista.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const DIRECTORIOS = ['app', 'components', 'lib'];
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|json)$/;

/** La web comercial: fuera de esta guardia (ver arriba). Prefijos de ruta. */
const WEB_COMERCIAL = [
  'app/page.tsx', 'app/funcionalidades/', 'app/recursos/', 'app/precios/', 'app/comparativa/',
  'app/soluciones/', 'app/glosario/', 'app/empieza/', 'app/sobre-tentare/', 'app/seguridad/', 'app/(legal)/',
  'components/landing/', 'components/web/', 'components/funcionalidades/', 'components/comparativa/',
  'components/soluciones/', 'components/recursos/', 'components/glosario/',
  'lib/landing/', 'lib/recursos/', 'lib/seo/',
  // Los correos de prospección a estudios: venta, no producto.
  'lib/ai/prospeccion-email-prompt.ts',
];

/** Las promesas falsas, en minúsculas y sin tildes (se comparan así). */
const FRASES = [
  // Facturación: viene encendida y, sin Veri*Factu, no lleva cadena ni se transmite.
  'solo las emite con tu envio a la aeat',
  'hay que transmitirla aparte',
  'numerada y encadenada',
  'facturas con huella encadenada',
  // El SEPA de Stripe se retiró: no hay «SEPA guardado» que se cobre solo.
  'tarjeta o sepa guardad',
  'cobra online con tarjeta o sepa',
  // El widget: el pago va por Stripe y, sin sesión, el sin marco lleva a Tentare.
  'sin salir de tu web',
  'no sale de tu web',
  'no salen de tu web',
  // Planes: ningún estudio en Estudio; la caja la tiene vedada la gerencia, no
  // recepción; las campañas están apagadas.
  'el mas elegido',
  'recepcion no entra en la caja',
  'notas de sesion, campanas',
  // La alumna confirma su email con un código: eso le abre la cuenta.
  'reserva sin cuenta',
  // Ningún estudio ha decidido devolver el dinero: el correo no lo promete por él.
  'te devolvemos el dinero',
  'te devolvamos el dinero',
  // La penalización es por cancelar FUERA del plazo.
  'por cancelar dentro de',
  // Por email le llegan igual: lo que necesita la app instalada son los avisos al móvil.
  'solo llegan desde la app instalada',
];

/** Fichero → frases que puede nombrar, con el motivo. */
const EXCEPCIONES: Record<string, { frases: string[]; motivo: string }> = {
  'components/reservar/planes-publicos.tsx': {
    frases: ['el mas elegido'],
    motivo: 'La insignia de /reservar sale de las ventas reales del estudio (planMasElegido, '
      + 'lib/estudio-publico.ts: solo con dos o más ventas y sin empate). Es un dato, no un eslogan.',
  },
};

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const esComentario = (linea: string) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(linea);
const esWebComercial = (f: string) => WEB_COMERCIAL.some((p) => f === p || f.startsWith(p));

function ficheros(dir: string): string[] {
  return readdirSync(join(raiz, dir)).flatMap((nombre) => {
    const rel = `${dir}/${nombre}`;
    if (statSync(join(raiz, rel)).isDirectory()) return ficheros(rel);
    if (!EXTENSIONES.test(nombre) || /\.test\.tsx?$/.test(nombre)) return [];
    return [rel];
  });
}

test('ningún texto del producto vuelve a prometer lo que no pasa', () => {
  const infracciones: string[] = [];
  for (const f of DIRECTORIOS.flatMap(ficheros)) {
    if (esWebComercial(f)) continue;
    const permitidas = EXCEPCIONES[f]?.frases ?? [];
    readFileSync(join(raiz, f), 'utf8').split('\n').forEach((linea, i) => {
      if (esComentario(linea)) return;
      const texto = normalizar(linea);
      for (const frase of FRASES) {
        if (texto.includes(frase) && !permitidas.includes(frase)) infracciones.push(`${f}:${i + 1} «${frase}»`);
      }
    });
  }
  assert.deepEqual(infracciones, [], 'Vuelve una frase falsa al producto. Cámbiala por lo que pasa de verdad (o, si allí es verdad, ponla en EXCEPCIONES con su motivo):');
});

test('la lista se compara normalizada, cada excepción sigue haciendo falta y la web sigue fuera', () => {
  for (const frase of FRASES) assert.equal(frase, normalizar(frase), `«${frase}» tiene que ir en minúsculas y sin tildes`);
  for (const [f, { frases }] of Object.entries(EXCEPCIONES)) {
    assert.ok(!esWebComercial(f), `${f} es web comercial: no necesita excepción`);
    const texto = normalizar(readFileSync(join(raiz, f), 'utf8'));
    for (const frase of frases) {
      assert.ok(FRASES.includes(frase), `${f}: «${frase}» no está en la lista`);
      assert.ok(texto.includes(frase), `${f} ya no dice «${frase}»: quita la excepción`);
    }
  }
  // Lo compartido con el panel no es web, aunque /precios lo pinte también.
  for (const f of ['lib/billing/catalogo-planes.ts', 'lib/billing/entitlements.ts', 'lib/faqs.ts']) {
    assert.equal(esWebComercial(f), false, `${f} se pinta en el panel: la guardia tiene que mirarlo`);
  }
});

test('la guardia ve la frase con tildes y mayúsculas, y no ve la de un comentario', () => {
  assert.ok(normalizar('«El más elegido»').includes('el mas elegido'));
  assert.ok(normalizar('Reservan y pagan SIN SALIR DE TU WEB.').includes('sin salir de tu web'));
  assert.equal(esComentario('  // decía «hay que transmitirla aparte»'), true);
  assert.equal(esComentario("  body: 'Se te ha cobrado por cancelar dentro de la ventana',"), false);
});
