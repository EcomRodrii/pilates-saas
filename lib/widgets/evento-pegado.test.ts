import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL } from '../legal-info.ts';
import { TIPOS_EVENTO_WIDGET } from '../reservar/eventos.ts';
import { firmaDeUrl } from './firma-contenido.ts';
import { FIRMA_CONTENIDO_VALIDA, FORMAS_PEGADAS } from './pegado.ts';
import { pegadoDelEvento, propiosDeLaPeticion, type PegadoDelEvento } from './evento-pegado.ts';

// Como la ruta en desarrollo: el canónico de Tentare y el origen que atiende.
const PROPIOS = propiosDeLaPeticion('http://localhost:3000');
const TENTARE = new URL(LEGAL.url).origin;
const APEX = `https://${new URL(LEGAL.url).hostname.replace(/^www\./, '')}`;
const WEB = 'https://albapilates.example.com';
const FIRMA = firmaDeUrl(new URLSearchParams('embed=1&tab=clases&ref=web-horario'));
const NADA = { forma: null, anfitrion: null, firma: null };

type Entrada = Parameters<typeof pegadoDelEvento>[0];

function desde(parcial: Partial<Entrada>): PegadoDelEvento {
  return pegadoDelEvento({
    tipo: 'widget_loaded', cuerpo: {}, studioIdEnUrl: false, origenCabecera: null, propios: PROPIOS, ...parcial,
  });
}

// El POST de la página (/reservar, iframe o popup): mismo origen, sin `?studioId=`.
function dePagina(cuerpo: Entrada['cuerpo'], tipo = 'widget_loaded'): PegadoDelEvento {
  return desde({ tipo, cuerpo, origenCabecera: 'http://localhost:3000' });
}

// El POST del bundle de la nativa: desde la web del estudio, con `?studioId=`,
// y esa web autorizada por el estudio (lo resuelve la ruta con `origenPermitido`).
function deNativa(origenCabecera: string, cuerpo: Entrada['cuerpo'] = {}, tipo = 'widget_loaded'): PegadoDelEvento {
  return desde({ tipo, cuerpo, studioIdEnUrl: true, origenCabecera, nativaAutorizada: true });
}

test('FIRMA de ejemplo: una firma de verdad, con el formato del CHECK', () => {
  assert.match(FIRMA, FIRMA_CONTENIDO_VALIDA);
});

// ── Solo la carga ────────────────────────────────────────────────────────────

test('⚠️ cualquier otro tipo no guarda nada, ni de la página ni de la nativa', () => {
  const cuerpo = { forma: 'incrustado', anfitrion: WEB, firma: FIRMA };
  for (const tipo of TIPOS_EVENTO_WIDGET.filter(t => t !== 'widget_loaded')) {
    assert.deepEqual(dePagina(cuerpo, tipo), NADA, `página ${tipo}`);
    assert.deepEqual(deNativa(WEB, cuerpo, tipo), NADA, `nativa ${tipo}`);
  }
  assert.deepEqual(dePagina(cuerpo, 'otro'), NADA);
});

// ── La nativa ────────────────────────────────────────────────────────────────

test('⚠️ la nativa sale de la cabecera Origin e ignora lo que diga el cuerpo', () => {
  assert.deepEqual(deNativa(WEB), { forma: 'nativa', anfitrion: WEB, firma: null });
  // Un cuerpo que se hace pasar por un iframe de otra web no cambia nada.
  assert.deepEqual(
    deNativa(WEB, { forma: 'incrustado', anfitrion: 'https://otra.example.com', firma: FIRMA }),
    { forma: 'nativa', anfitrion: WEB, firma: null },
  );
  assert.deepEqual(deNativa(WEB, { forma: 'nativa' }), { forma: 'nativa', anfitrion: WEB, firma: null });
});

test('la nativa en una web http es su web (no «una web que no nos dice su dirección»)', () => {
  assert.deepEqual(deNativa('http://albapilates.example.com'), {
    forma: 'nativa', anfitrion: 'http://albapilates.example.com', firma: null,
  });
});

test('la nativa con una cabecera que no es una web: la carga cuenta, la dirección no', () => {
  // IP, `null` (iframe sandbox), basura: se descarta el anfitrión, no la visita.
  for (const origen of ['http://192.168.1.10', 'null', 'no es una url', 'https://usuaria@albapilates.example.com']) {
    assert.deepEqual(deNativa(origen), { forma: 'nativa', anfitrion: null, firma: null }, origen);
  }
});

test('⚠️ `?studioId=` con Origin de Tentare no es la nativa: cuenta el cuerpo', () => {
  for (const origen of [TENTARE, APEX, 'http://localhost:3000', 'https://tentare-git-rama.vercel.app']) {
    assert.deepEqual(deNativa(origen), NADA, `sin cuerpo, ${origen}`);
    assert.deepEqual(deNativa(origen, { forma: 'nativa', anfitrion: WEB }), NADA, `nativa en el cuerpo, ${origen}`);
    assert.deepEqual(
      deNativa(origen, { forma: 'incrustado', anfitrion: WEB, firma: FIRMA }),
      { forma: 'incrustado', anfitrion: WEB, firma: FIRMA },
      `iframe, ${origen}`,
    );
  }
});

test('⚠️ sin `?studioId=` no hay nativa, aunque la cabecera sea de otra web (un Origin a secas no lo demuestra)', () => {
  assert.deepEqual(desde({ origenCabecera: WEB }), NADA);
  assert.deepEqual(desde({ origenCabecera: WEB, cuerpo: { forma: 'nativa', anfitrion: WEB } }), NADA);
  // Y con `?studioId=` pero sin cabecera tampoco (un curl, un navegador viejo).
  assert.deepEqual(desde({ studioIdEnUrl: true, origenCabecera: null }), NADA);
  assert.deepEqual(desde({ studioIdEnUrl: true, origenCabecera: '' }), NADA);
});

test('⚠️ la nativa desde una web que el estudio NO autorizó no cuenta: ni forma, ni web', () => {
  assert.deepEqual(desde({ studioIdEnUrl: true, origenCabecera: WEB }), NADA);
  assert.deepEqual(desde({ studioIdEnUrl: true, origenCabecera: WEB, nativaAutorizada: false }), NADA);
  // Ni aunque el cuerpo diga que es un iframe: con `?studioId=` y una web ajena
  // manda la cabecera, no el cuerpo.
  assert.deepEqual(
    desde({ studioIdEnUrl: true, origenCabecera: WEB, nativaAutorizada: false, cuerpo: { forma: 'incrustado', anfitrion: WEB, firma: FIRMA } }),
    NADA,
  );
});

// ── La página: dentro de una página o encima ─────────────────────────────────

test('⚠️ la forma del cuerpo solo cuenta si la petición sale de Tentare', () => {
  const cuerpo = { forma: 'incrustado', anfitrion: WEB, firma: FIRMA };
  // Sin cabecera, con la de otra web o con la de un iframe sandbox: nada.
  for (const origenCabecera of [null, '', WEB, 'https://otra.example.com', 'null']) {
    assert.deepEqual(desde({ origenCabecera, cuerpo }), NADA, String(origenCabecera));
  }
  // Desde Tentare (el canónico, el apex o el despliegue que atiende), sí.
  for (const origenCabecera of [TENTARE, APEX, 'http://localhost:3000']) {
    assert.deepEqual(desde({ origenCabecera, cuerpo }), { forma: 'incrustado', anfitrion: WEB, firma: FIRMA }, origenCabecera);
  }
});

test('iframe y popup: forma, anfitrión y firma tal cual los manda la página', () => {
  assert.deepEqual(dePagina({ forma: 'incrustado', anfitrion: WEB, firma: FIRMA }), { forma: 'incrustado', anfitrion: WEB, firma: FIRMA });
  assert.deepEqual(dePagina({ forma: 'ventana', anfitrion: WEB, firma: FIRMA }), { forma: 'ventana', anfitrion: WEB, firma: FIRMA });
});

test('⚠️ http://albapilates.example.com se acepta como anfitrión', () => {
  assert.deepEqual(
    dePagina({ forma: 'incrustado', anfitrion: 'http://albapilates.example.com', firma: FIRMA }),
    { forma: 'incrustado', anfitrion: 'http://albapilates.example.com', firma: FIRMA },
  );
});

test('⚠️ del anfitrión solo se guarda el origen, nunca la ruta ni la query', () => {
  assert.deepEqual(
    dePagina({ forma: 'incrustado', anfitrion: `${WEB}/horarios?utm_source=x&socia=1#reservar`, firma: FIRMA }),
    { forma: 'incrustado', anfitrion: WEB, firma: FIRMA },
  );
});

test('⚠️ «nativa» en el cuerpo de una petición del mismo origen no vale: nada', () => {
  assert.deepEqual(dePagina({ forma: 'nativa', anfitrion: WEB, firma: FIRMA }), NADA);
  assert.deepEqual(dePagina({ forma: 'nativa', anfitrion: WEB }), NADA);
});

test('una forma que no es de iframe ni de popup: nada (botón y enlace no mandan)', () => {
  for (const forma of [undefined, null, '', 'pagina', 'boton', 'enlace', 'INCRUSTADO', ' incrustado', 1, {}, ['incrustado']]) {
    assert.deepEqual(dePagina({ forma, anfitrion: WEB, firma: FIRMA }), NADA, String(forma));
  }
});

test('⚠️ un anfitrión de Tentare, de *.vercel.app o una IP se descarta; la forma y la firma se quedan', () => {
  for (const anfitrion of [
    TENTARE, APEX, `${TENTARE}/onboarding`, 'http://localhost:3000', 'https://tentare-git-rama.vercel.app',
    'http://192.168.1.10', 'null', '', 42, null, undefined,
  ]) {
    assert.deepEqual(
      dePagina({ forma: 'ventana', anfitrion, firma: FIRMA }),
      { forma: 'ventana', anfitrion: null, firma: FIRMA },
      String(anfitrion),
    );
  }
});

test('una firma inválida no tira la visita: firma null, forma y anfitrión se quedan', () => {
  for (const firma of ['zz', 'c1', 'c1ABC', 'c1abcdefgh', ` ${FIRMA}`, 12345, null, undefined, {}]) {
    assert.deepEqual(
      dePagina({ forma: 'incrustado', anfitrion: WEB, firma }),
      { forma: 'incrustado', anfitrion: WEB, firma: null },
      String(firma),
    );
  }
});

test('propiosDeLaPeticion: el canónico de Tentare y el de la petición, con el apex como www', () => {
  assert.deepEqual(propiosDeLaPeticion('http://localhost:3000'), [TENTARE, 'http://localhost:3000']);
  assert.deepEqual(propiosDeLaPeticion(APEX), [TENTARE, TENTARE]);
});

// ── Lo que devuelve cabe en la BD ────────────────────────────────────────────

// La migración, por NOMBRE: la versión la pone `apply_migration` al aplicarla.
const MIGRACIONES = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const FICHERO = readdirSync(MIGRACIONES).find(n => n.endsWith('_widget_eventos_visto_en_su_web.sql'));
const SQL = FICHERO ? readFileSync(join(MIGRACIONES, FICHERO), 'utf8') : '';

function extraer(re: RegExp): string {
  const m = SQL.match(re);
  assert.ok(m, `no encuentro ${re} en la migración`);
  return m[1];
}

test('⚠️ los CHECKs de la migración son los de lib/widgets/pegado.ts', () => {
  assert.ok(FICHERO, 'falta la migración *_widget_eventos_visto_en_su_web.sql');
  assert.equal(extraer(/firma ~ '([^']+)'/), FIRMA_CONTENIDO_VALIDA.source);
  const formas = extraer(/forma in \(([^)]+)\)/).split(',').map(f => f.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(formas, [...FORMAS_PEGADAS]);
  assert.match(SQL, /length\(anfitrion\) <= 300/);
});

test('⚠️ nada de lo que devuelve lo rechazaría la BD (se perdería la visita entera)', () => {
  const anfitrionValido = new RegExp(extraer(/anfitrion ~ '([^']+)'/));
  const firmaValida = new RegExp(extraer(/firma ~ '([^']+)'/));
  const valores: unknown[] = [
    undefined, null, '', 'null', 42, WEB, 'http://albapilates.example.com', `${WEB}/ruta?q=1`, 'http://localhost:3000',
    'http://127.0.0.1:5173', TENTARE, APEX, 'https://x.vercel.app', 'http://192.168.1.10', 'javascript:alert(1)',
    'https://AlbaPilates.Example.COM:8443/x', 'incrustado', 'ventana', 'nativa', 'pagina', FIRMA, 'zz', 'c1ABC',
  ];
  let casos = 0;
  for (const tipo of [...TIPOS_EVENTO_WIDGET, 'otro']) {
    for (const [studioIdEnUrl, nativaAutorizada] of [[false, false], [true, false], [true, true]] as const) {
      for (const origenCabecera of [null, WEB, 'http://localhost:3000', TENTARE, 'null', 'http://192.168.1.10']) {
        for (const forma of valores) {
          for (const anfitrion of valores) {
            for (const firma of [undefined, FIRMA, 'zz', 7]) {
              const r = pegadoDelEvento({ tipo, cuerpo: { forma, anfitrion, firma }, studioIdEnUrl, origenCabecera, propios: PROPIOS, nativaAutorizada });
              const donde = JSON.stringify({ tipo, studioIdEnUrl, nativaAutorizada, origenCabecera, forma, anfitrion, firma, r });
              // widget_eventos_anfitrion_es_origen
              assert.ok(r.anfitrion === null || (r.anfitrion.length <= 300 && anfitrionValido.test(r.anfitrion)), donde);
              // widget_eventos_forma_valida
              assert.ok(r.forma === null || FORMAS_PEGADAS.includes(r.forma), donde);
              // widget_eventos_firma_valida
              assert.ok(r.firma === null || firmaValida.test(r.firma), donde);
              // widget_eventos_pegado_solo_al_cargar
              assert.ok(
                (r.anfitrion === null && r.forma === null && r.firma === null) || (tipo === 'widget_loaded' && r.forma !== null),
                donde,
              );
              casos++;
            }
          }
        }
      }
    }
  }
  assert.ok(casos > 10_000);
});
