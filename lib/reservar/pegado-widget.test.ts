import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS_DE_EJECUCION, pegadoDesde } from './pegado-widget.ts';
import { CLAVES_FIRMA, firmaDeUrl } from '../widgets/firma-contenido.ts';
import { FIRMA_CONTENIDO_VALIDA } from '../widgets/pegado.ts';
import { WIDGETS, esDisponible } from '../widgets/catalogo.ts';
import { CONFIG_POR_DEFECTO } from '../widgets/config.ts';
import { firmaContenidoDe, urlEmbebido, type EntradaIntegracion } from '../widgets/integracion.ts';
import { urlPopupPermitida } from '../widgets/popup-url.ts';

const PROPIO = 'https://www.tentare.app';
const WEB = 'http://albapilates.example.com';
const CODIGO = 'embed=1&tab=clases&ref=web-horario';

/** El iframe pegado en su web, con la política de referrer por defecto. */
function enSuWeb(query: string, cambios: Partial<Parameters<typeof pegadoDesde>[0]> = {}) {
  return pegadoDesde({
    params: new URLSearchParams(query),
    enMarco: true,
    ancestros: [WEB],
    referrer: `${WEB}/`,
    propio: PROPIO,
    ...cambios,
  });
}

test('el código de siempre, dentro de su web: incrustado, su web y la firma de lo que carga', () => {
  const p = enSuWeb(CODIGO);
  assert.deepEqual(p, { forma: 'incrustado', anfitrion: WEB, firma: firmaDeUrl(new URLSearchParams(CODIGO)) });
  assert.match(p!.firma, FIRMA_CONTENIDO_VALIDA);
});

test('`ventana=1` (lo pone el script del popup) es «se abre encima», con la MISMA firma', () => {
  const p = enSuWeb(`${CODIGO}&ventana=1`);
  assert.equal(p?.forma, 'ventana');
  // La forma va en su columna: la versión es la misma pieza abriéndose encima.
  assert.equal(p?.firma, enSuWeb(CODIGO)?.firma);
});

test('⚠️ sin `embed=1` es la página suelta (botón o enlace): no se manda NADA', () => {
  for (const query of ['tab=clases&ref=web-horario', 'embed=0&tab=clases', 'embed=true&tab=clases', 'embed=&tab=clases']) {
    assert.equal(enSuWeb(query), null, query);
  }
});

test('⚠️ `embed=1` a pantalla completa (sin marco): nada, aunque traiga referrer', () => {
  assert.equal(enSuWeb(CODIGO, { enMarco: false, ancestros: [] }), null);
  assert.equal(enSuWeb(CODIGO, { enMarco: false, ancestros: null, referrer: 'https://l.instagram.example.com/' }), null);
});

test('⚠️ cada parámetro de ejecución anula el pegado, también vacío o con otro valor', () => {
  assert.equal(PARAMS_DE_EJECUCION.length, 8);
  for (const k of PARAMS_DE_EJECUCION) {
    for (const v of ['1', '', 'ok']) {
      assert.equal(enSuWeb(`${CODIGO}&${k}=${v}`), null, `${k}=${v}`);
    }
  }
  // La redirección de la nativa, tal cual (app/widget-bundle/main.tsx).
  assert.equal(enSuWeb('sesion=ses-1&directo=1&ref=web-horario&embed=1'), null);
});

test('guardián: ningún parámetro de ejecución es parte de la firma', () => {
  const firma: readonly string[] = CLAVES_FIRMA;
  for (const k of PARAMS_DE_EJECUCION) assert.equal(firma.includes(k), false, k);
});

test('la cima de `ancestorOrigins` gana al referrer (el marco de Wix dentro de su web)', () => {
  const p = enSuWeb(CODIGO, {
    // [padre, …, cima]: el padre es el marco de Wix; la cima, su web.
    ancestros: ['https://usuaria-wixsite.filesusr.example.com', 'https://www.albapilates.example.com'],
    referrer: 'https://usuaria-wixsite.filesusr.example.com/html/abc.html',
  });
  assert.equal(p?.anfitrion, 'https://www.albapilates.example.com');
});

test('sin `ancestorOrigins` (Firefox), el referrer; y de él solo el ORIGEN, nunca la ruta ni la query', () => {
  const p = enSuWeb(CODIGO, { ancestros: null, referrer: 'https://albapilates.example.com/horarios/reformer?utm_source=x&nombre=ana#reservar' });
  assert.equal(p?.anfitrion, 'https://albapilates.example.com');
  // Una lista vacía tampoco se queda sin web si hay referrer.
  assert.equal(enSuWeb(CODIGO, { ancestros: [], referrer: `${WEB}/clases` })?.anfitrion, WEB);
});

test('⚠️ dentro de la propia Tentare (onboarding, portal, vista previa de un despliegue): nada', () => {
  // El onboarding (components/onboarding/listo-para-reservar.tsx) incrusta /reservar sin `vista-previa`.
  assert.equal(enSuWeb(CODIGO, { ancestros: [PROPIO], referrer: `${PROPIO}/onboarding` }), null);
  // El apex cuenta como `www`, que es adonde redirige.
  assert.equal(enSuWeb(CODIGO, { ancestros: ['https://tentare.app'] }), null);
  // El origen que sirve la página, sea cual sea (local, previsualizaciones).
  assert.equal(enSuWeb(CODIGO, { ancestros: ['http://localhost:3000'], propio: 'http://localhost:3000' }), null);
  const previa = 'https://tentare-git-rama.vercel.app';
  assert.equal(enSuWeb(CODIGO, { ancestros: [previa], propio: previa }), null);
  // El canónico también desde una vista previa: el onboarding de producción no es su web.
  assert.equal(enSuWeb(CODIGO, { ancestros: [PROPIO], propio: previa }), null);
  // Firefox en el onboarding: el referrer del mismo origen llega con la ruta entera.
  assert.equal(enSuWeb(CODIGO, { ancestros: null, referrer: `${PROPIO}/configuracion?tab=web` }), null);
});

test('⚠️ otro `*.vercel.app`: la carga cuenta (forma y firma), pero sin nombrar la web', () => {
  // Puede ser la web de un estudio alojada en Vercel: descartarla entera la
  // dejaba fuera de la portada para siempre. Tampoco se nombra: podría ser una
  // vista previa de Tentare (y el servidor anula esa dirección igualmente).
  const firma = firmaDeUrl(new URLSearchParams(CODIGO));
  for (const web of ['https://albapilates.vercel.app', 'https://tentare-git-rama.vercel.app']) {
    assert.deepEqual(enSuWeb(CODIGO, { ancestros: [web] }), { forma: 'incrustado', anfitrion: null, firma }, web);
    assert.deepEqual(enSuWeb(`${CODIGO}&ventana=1`, { ancestros: null, referrer: `${web}/clases` }), { forma: 'ventana', anfitrion: null, firma }, web);
  }
});

test('«null» o vacío: firma y forma, pero sin dirección (una web que no nos la dice)', () => {
  const firma = firmaDeUrl(new URLSearchParams(CODIGO));
  for (const cambios of [
    { ancestros: ['null'] },                  // iframe sandbox sin allow-same-origin
    { ancestros: null, referrer: '' },        // `no-referrer` en Firefox
    { ancestros: [], referrer: '' },
    { ancestros: null, referrer: 'null' },
    { ancestros: ['https://192.168.1.10'] },  // una IP no es la dirección de su web
  ]) {
    assert.deepEqual(enSuWeb(CODIGO, cambios), { forma: 'incrustado', anfitrion: null, firma }, JSON.stringify(cambios));
  }
});

test('lo que añada su web a la URL (utm, fbclid) no cambia la firma', () => {
  assert.equal(
    enSuWeb(`ref=web-horario&utm_source=x&tab=clases&fbclid=abc&embed=1`)?.firma,
    enSuWeb(CODIGO)?.firma,
  );
});

// ── De punta a punta: lo que genera el panel es lo que la página reconoce ────

test('la firma que manda la página es la que el panel guarda al copiar (iframe y popup)', () => {
  const origen = PROPIO;
  let vistas = 0;
  for (const widget of WIDGETS.filter(esDisponible)) {
    const e: EntradaIntegracion = { widget, config: { ...CONFIG_POR_DEFECTO, sesion: 'ses-1' }, origen, slug: 'pilates-centro', colorEstudio: '#7A2E4F' };
    if (widget.metodos.includes('iframe')) {
      const url = new URL(urlEmbebido(e, 'iframe'));
      const p = enSuWeb(url.search.slice(1));
      assert.ok(p, `${widget.id}/iframe no se reconoce como pegado`);
      assert.equal(p.forma, 'incrustado');
      assert.equal(p.firma, firmaContenidoDe(e, 'iframe'), `${widget.id}/iframe`);
      vistas++;
    }
    if (widget.metodos.includes('popup')) {
      // El camino real: el script del popup reescribe la URL antes de abrirla.
      const abierta = urlPopupPermitida(urlEmbebido(e, 'popup'), origen);
      assert.ok(abierta, `${widget.id}/popup rechazado por el runtime`);
      const p = enSuWeb(new URL(abierta).search.slice(1));
      assert.ok(p, `${widget.id}/popup no se reconoce como pegado`);
      assert.equal(p.forma, 'ventana');
      assert.equal(p.firma, firmaContenidoDe(e, 'popup'), `${widget.id}/popup`);
      vistas++;
    }
  }
  assert.ok(vistas > 0, 'la matriz no ha comprobado nada');
});
