// La tramitación automática de las apps de estudio. La corre el workflow «Apps de estudio ·
// automático» (.github/workflows/apps-estudio-automatico.yml); también se puede correr a mano.
//
//   node scripts/apps-automatico.mjs sincronizar
//       Para cada app pedida: le pone su nombre en App Store Connect y la activa; mira en Apple su
//       compilación y su versión y mueve el estado en Tentare (en pruebas, en revisión, publicada,
//       rechazada). Deja en GITHUB_OUTPUT `compilar` la lista de slugs que hay que compilar.
//   node scripts/apps-automatico.mjs certificados
//       Los ids de los certificados de desarrollo de la cuenta (JSON), para saber cuáles crea una
//       compilación.
//   node scripts/apps-automatico.mjs revocar <antes.json>
//       Revoca los certificados de desarrollo que NO estaban en <antes.json> (los que ha creado esta
//       compilación). Ninguno más.
//   node scripts/apps-automatico.mjs fallo <slug> "<detalle>"
//       Le cuenta al servidor que la compilación de esa app ha fallado (aviso al equipo).
//   node scripts/apps-automatico.mjs slug <ficha|slug>
//       Para el job de compilar: de la ficha opaca que deja «sincronizar» saca el slug, lo oculta en
//       el registro y lo deja en GITHUB_ENV como SLUG.
//
// ⚠️ El repo es público y los registros de Actions también: nada de nombres de estudio, slugs ni
// bundles a la vista. En Actions se enmascaran (`::add-mask::`) antes de escribir nada, y la lista
// para compilar lleva fichas opacas (hash del id del estudio), no slugs.
//
// Necesita ASC_KEY_ID, ASC_ISSUER_ID y ASC_KEY_P8 (secretos de GitHub) y APPS_AUTOMATICO_SECRET (el
// mismo en GitHub y en Vercel). Nada de esto se imprime nunca.
//
// ⚠️ Lo que NO hace: ENVIAR una app a revisión de Apple. Eso lo decide el equipo (guía 4.2.6 y el
// cuestionario de privacidad, que solo se contesta en la web). Cuando Apple la revisa o la publica,
// esto lo ve y lo apunta solo.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ASC_API, credencialesDe, cuerpoNombre, errorAsc, tokenAsc } from '../lib/nativo/asc.ts';
import { certificadosNuevos, estadoDeBuild, faseDeVersion, pasoDe } from '../lib/nativo/automatico.ts';

const [orden, ...args] = process.argv.slice(2);
const ORIGEN = (process.env.TENTARE_ORIGEN ?? 'https://www.tentare.app').replace(/\/$/, '');

function parar(m) { console.error(`\n✖ ${m}\n`); process.exit(1); }

// Solo las órdenes que hablan con Apple necesitan la clave de App Store Connect.
const conApple = ['sincronizar', 'certificados', 'revocar'].includes(orden);
const cred = credencialesDe(process.env);
if (conApple && 'falta' in cred) parar(`Faltan o no tienen buen formato: ${cred.falta.join(', ')}.`);
const secreto = process.env.APPS_AUTOMATICO_SECRET?.trim();

/** En Actions, que estos valores salgan como *** en el registro (público). Fuera de Actions, nada. */
function ocultar(...valores) {
  if (!process.env.GITHUB_ACTIONS) return;
  for (const v of valores) if (typeof v === 'string' && v.trim().length >= 3) console.log(`::add-mask::${v.trim()}`);
}
/** La ficha opaca de una app en la lista de compilar: no dice qué estudio es. Mayúsculas: no puede ser un slug. */
const fichaDe = (studioId) => `X${createHash('sha256').update(studioId).digest('hex').slice(0, 12).toUpperCase()}`;

class ErrorApple extends Error { constructor(estado, texto) { super(texto); this.estado = estado; } }

async function apple(metodo, ruta, cuerpo) {
  const res = await fetch(`${ASC_API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokenAsc(cred)}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ErrorApple(res.status, `${metodo} ${ruta.split('?')[0]} → ${errorAsc(res.status, datos)}`);
  return datos;
}

async function tentare(metodo, cuerpo) {
  if (!secreto) parar('Falta APPS_AUTOMATICO_SECRET (el mismo en Vercel y en los secretos de GitHub).');
  const res = await fetch(`${ORIGEN}/api/automatico/apps-estudio`, {
    method: metodo,
    headers: { Authorization: `Bearer ${secreto}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Tentare contestó ${res.status}: ${datos?.error ?? 'sin detalle'}`);
  return datos;
}

// El día de MADRID, el mismo con el que el servidor fecha la nota (`hoyEnEstudio`).
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** ¿Ya se avisó hoy de esto? (para no mandar el mismo correo en cada pasada) */
const yaAvisado = (nota, evento, extra = '') => (nota ?? '').split('\n').some((l) => l.startsWith(`${hoy()} · automático: ${evento}`) && l.includes(extra));
/** Las compilaciones fallidas de hoy: a partir de dos, no se reintenta hasta mañana. */
const fallosDeHoy = (nota) => (nota ?? '').split('\n').filter((l) => l.startsWith(`${hoy()} · automático: fallo`)).length;

async function ponerNombre(ascAppId, nombre) {
  const infos = (await apple('GET', `/v1/apps/${ascAppId}/appInfos`))?.data ?? [];
  const info = infos.find((i) => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(i.attributes?.appStoreState ?? i.attributes?.state)) ?? infos[0];
  if (!info) throw new Error('la app no tiene información editable');
  const locs = (await apple('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`))?.data ?? [];
  const loc = locs.find((l) => l.attributes.locale === 'es-ES') ?? locs[0];
  if (!loc) throw new Error('la app no tiene ningún idioma');
  if (loc.attributes.name === nombre) return;
  await apple('PATCH', `/v1/appInfoLocalizations/${loc.id}`, cuerpoNombre(loc.id, nombre));
}

async function ultimaBuild(ascAppId) {
  const r = await apple('GET', `/v1/builds?filter[app]=${ascAppId}&sort=-uploadedDate&limit=1&fields[builds]=processingState,uploadedDate`);
  return estadoDeBuild(r?.data?.[0]?.attributes?.processingState);
}

async function faseTienda(ascAppId) {
  const r = await apple('GET', `/v1/apps/${ascAppId}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=appVersionState,appStoreState,createdDate`);
  const versiones = (r?.data ?? []).slice().sort((a, b) => String(b.attributes?.createdDate ?? '').localeCompare(String(a.attributes?.createdDate ?? '')));
  const v = versiones[0]?.attributes;
  return faseDeVersion(v?.appVersionState ?? v?.appStoreState);
}

async function sincronizar() {
  const { apps, cuposLibres } = await tentare('GET');
  console.log(`${apps.length} app(s) de estudio · ${cuposLibres} hueco(s) libre(s) en el lote.`);
  const compilar = new Set();

  for (const app of apps) ocultar(app.estudio, app.slug, app.bundleId, app.nombreApp);
  for (const app of apps) {
    const etiqueta = `${app.estudio} (${app.bundleId}, ${app.estado})`;
    try {
      const necesitaApple = ['EN_PREPARACION', 'EN_PRUEBAS', 'EN_REVISION', 'PUBLICADA'].includes(app.estado) && app.ascAppId && app.pagada;
      const apple_ = necesitaApple
        ? { build: app.estado === 'EN_PREPARACION' ? await ultimaBuild(app.ascAppId) : undefined, fase: app.estado === 'EN_PREPARACION' ? undefined : await faseTienda(app.ascAppId) }
        : {};
      const paso = pasoDe(app, apple_);

      if (paso.tipo === 'nada') { console.log(`· ${etiqueta}: nada que hacer`); continue; }

      if (paso.tipo === 'avisar') {
        if (!yaAvisado(app.notaInterna, 'fallo', 'sin hueco')) {
          await tentare('POST', { studioId: app.studioId, evento: 'fallo', detalle: 'sin hueco del lote: hay que crear la app a mano en App Store Connect' });
        }
        console.log(`· ${etiqueta}: necesita a una persona (sin hueco del lote)`);
        continue;
      }

      if (paso.tipo === 'preparar') {
        try {
          await ponerNombre(app.ascAppId, app.nombreApp);
        } catch (e) {
          if (e instanceof ErrorApple && e.estado === 409) {
            const marca = `«${app.nombreApp}»`;
            if (!yaAvisado(app.notaInterna, 'nombre-cogido', marca)) {
              await tentare('POST', { studioId: app.studioId, evento: 'nombre-cogido', detalle: `${marca}: ${e.message}` });
            }
            console.log(`· ${etiqueta}: el nombre ${marca} no se puede poner (${e.message})`);
            continue;
          }
          throw e;
        }
        await tentare('POST', { studioId: app.studioId, cambio: { estado: 'EN_PREPARACION', activa: true }, evento: 'preparada' });
        console.log(`✔ ${etiqueta}: nombre puesto y activada → en preparación`);
        if (app.slug) compilar.add(fichaDe(app.studioId));
        continue;
      }

      if (paso.tipo === 'compilar') {
        if (fallosDeHoy(app.notaInterna) >= 2) { console.log(`· ${etiqueta}: ya ha fallado dos veces hoy; se reintenta mañana`); continue; }
        // Apple dio la última compilación por no válida: cuenta como fallo (si no, se recompilaba
        // cada media hora sin fin y sin que nadie se enterara).
        if (apple_.build === 'fallida') {
          await tentare('POST', { studioId: app.studioId, evento: 'fallo', detalle: 'Apple ha marcado la última compilación como no válida; se vuelve a compilar' });
        }
        if (app.slug) compilar.add(fichaDe(app.studioId));
        console.log(`· ${etiqueta}: a compilar`);
        continue;
      }

      if (paso.tipo === 'cambiar') {
        await tentare('POST', {
          studioId: app.studioId,
          cambio: { estado: paso.estado, ...(paso.urlTienda ? { urlTienda: paso.urlTienda } : {}) },
          evento: paso.evento,
        });
        console.log(`✔ ${etiqueta} → ${paso.estado}`);
      }
    } catch (e) {
      console.error(`✖ ${etiqueta}: ${e.message}`);
      if (!yaAvisado(app.notaInterna, 'fallo')) {
        await tentare('POST', { studioId: app.studioId, evento: 'fallo', detalle: e.message.slice(0, 300) }).catch(() => {});
      }
    }
  }

  const lista = JSON.stringify([...compilar]);
  console.log(`Para compilar: ${lista}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `compilar=${lista}\n`);
}

async function certificadosDeDesarrollo() {
  const r = await apple('GET', '/v1/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=200&fields[certificates]=certificateType');
  return (r?.data ?? []).map((c) => c.id);
}

try {
  if (orden === 'sincronizar') await sincronizar();
  else if (orden === 'certificados') console.log(JSON.stringify(await certificadosDeDesarrollo()));
  else if (orden === 'revocar') {
    const antes = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    if (!Array.isArray(antes)) parar('El fichero de antes no es una lista.');
    const nuevos = certificadosNuevos(antes, await certificadosDeDesarrollo());
    for (const id of nuevos) { await apple('DELETE', `/v1/certificates/${id}`); console.log(`✔ Revocado el certificado de desarrollo ${id} (creado por esta compilación).`); }
    if (nuevos.length === 0) console.log('Esta compilación no ha creado certificados de desarrollo.');
  } else if (orden === 'slug') {
    // De la ficha opaca (o de un slug escrito a mano en el workflow) al slug, oculto en el registro.
    const [valor] = args;
    const { apps } = await tentare('GET');
    for (const a of apps) ocultar(a.estudio, a.slug, a.bundleId, a.nombreApp);
    const app = apps.find((a) => fichaDe(a.studioId) === valor || a.slug === valor);
    if (!app?.slug) parar('No hay ninguna app de estudio con esa ficha.');
    if (!process.env.GITHUB_ENV) parar('Esta orden es para Actions (falta GITHUB_ENV).');
    fs.appendFileSync(process.env.GITHUB_ENV, `SLUG=${app.slug}\n`);
    console.log('✔ App encontrada.');
  } else if (orden === 'fallo') {
    const [slug, detalle] = args;
    const { apps } = await tentare('GET');
    for (const a of apps) ocultar(a.estudio, a.slug, a.bundleId, a.nombreApp);
    const app = apps.find((a) => a.slug === slug);
    if (app) await tentare('POST', { studioId: app.studioId, evento: 'fallo', detalle: `compilación: ${(detalle ?? 'falló').slice(0, 250)}` });
  } else {
    parar('Uso: sincronizar | certificados | revocar <antes.json> | slug <ficha> | fallo <slug> "<detalle>"');
  }
} catch (e) {
  parar(e.message);
}
