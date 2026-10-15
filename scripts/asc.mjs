// Órdenes de la API de App Store Connect para las apps de estudio.
//
//   node scripts/asc.mjs comprobar
//       Lista las apps de la cuenta. Sirve para comprobar que la clave funciona; no cambia nada.
//   node scripts/asc.mjs nombre <bundle> "<nombre>" [--locale es-ES] [--en-serio]
//       Cambia el nombre de una app en App Store Connect. Sin --en-serio solo dice qué haría.
//   node scripts/asc.mjs registrar-cupos <desde> <hasta> [--en-serio]
//       Registra los identificadores del lote (app.tentare.cupo-NNN) con sus capacidades.
//       Sin --en-serio solo dice qué haría.
//
// Necesita ASC_KEY_ID, ASC_ISSUER_ID y ASC_KEY_P8 en el entorno: los pone GitHub Actions
// desde sus secretos. Nunca escribe la clave ni el token en ningún sitio.

import {
  ASC_API, CAPACIDADES, bundleDeCupo, credencialesDe, cuerpoBundleId, cuerpoCapacidad, cuerpoNombre, errorAsc, tokenAsc,
} from '../lib/nativo/asc.ts';

const [orden, ...resto] = process.argv.slice(2);
const flag = (n) => resto.includes(`--${n}`);
const valor = (n) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto[i + 1] : undefined; };
const posicionales = resto.filter((a, i) => !a.startsWith('--') && resto[i - 1] !== '--locale');
const EN_SERIO = flag('en-serio');

function parar(m) { console.error(`\n✖ ${m}\n`); process.exit(1); }

const cred = credencialesDe(process.env);
if ('falta' in cred) parar(`Faltan o no tienen buen formato: ${cred.falta.join(', ')}. (Se leen de los secretos de GitHub Actions.)`);

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(`${ASC_API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokenAsc(cred)}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${ruta.split('?')[0]} → ${errorAsc(res.status, datos)}`);
  return datos;
}

async function appPorBundle(bundle) {
  const r = await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundle)}&fields[apps]=name,bundleId`);
  const app = r?.data?.[0];
  if (!app) parar(`No hay ninguna app en App Store Connect con el bundle ${bundle}.`);
  return app;
}

try {
  if (orden === 'comprobar') {
    const r = await api('GET', '/v1/apps?limit=200&fields[apps]=name,bundleId');
    const apps = r?.data ?? [];
    console.log(`✔ La clave funciona. ${apps.length} app${apps.length === 1 ? '' : 's'} en la cuenta:`);
    for (const a of apps) console.log(`  · ${a.attributes.name} — ${a.attributes.bundleId} (id ${a.id})`);
  } else if (orden === 'nombre') {
    const [bundle, nombre] = posicionales;
    const locale = valor('locale') ?? 'es-ES';
    if (!bundle || !nombre) parar('Uso: nombre <bundle> "<nombre>" [--locale es-ES] [--en-serio]');
    if (nombre.length > 30) parar('Apple no admite nombres de más de 30 caracteres.');
    const app = await appPorBundle(bundle);
    const infos = (await api('GET', `/v1/apps/${app.id}/appInfos`))?.data ?? [];
    // La que aún se puede editar: la que no está ya publicada.
    const info = infos.find((i) => !['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(i.attributes?.appStoreState ?? i.attributes?.state)) ?? infos[0];
    if (!info) parar('La app no tiene información editable.');
    const locs = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`))?.data ?? [];
    const loc = locs.find((l) => l.attributes.locale === locale);
    if (!loc) parar(`La app no tiene el idioma ${locale}. Tiene: ${locs.map((l) => l.attributes.locale).join(', ') || 'ninguno'}.`);
    console.log(`App ${app.attributes.name} (${bundle}) · ${locale}: «${loc.attributes.name}» → «${nombre}»`);
    if (!EN_SERIO) { console.log('Ensayo: no se ha cambiado nada. Añade --en-serio para hacerlo.'); process.exit(0); }
    await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, cuerpoNombre(loc.id, nombre));
    console.log('✔ Nombre cambiado.');
  } else if (orden === 'registrar-cupos') {
    const desde = Number(posicionales[0]); const hasta = Number(posicionales[1]);
    if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde || hasta - desde > 49) {
      parar('Uso: registrar-cupos <desde> <hasta> (como mucho 50 de una vez) [--en-serio]');
    }
    for (let n = desde; n <= hasta; n++) {
      const id = bundleDeCupo(n);
      const ya = (await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(id)}&fields[bundleIds]=identifier`))?.data ?? [];
      if (ya.some((b) => b.attributes.identifier === id)) { console.log(`· ${id}: ya existe`); continue; }
      if (!EN_SERIO) { console.log(`· ${id}: se registraría con ${CAPACIDADES.join(', ')}`); continue; }
      const creado = await api('POST', '/v1/bundleIds', cuerpoBundleId(id, `Tentare cupo ${String(n).padStart(3, '0')}`));
      for (const c of CAPACIDADES) await api('POST', '/v1/bundleIdCapabilities', cuerpoCapacidad(creado.data.id, c));
      console.log(`✔ ${id}: registrado con ${CAPACIDADES.join(', ')}`);
    }
    if (!EN_SERIO) console.log('\nEnsayo: no se ha registrado nada. Añade --en-serio para hacerlo.');
  } else {
    parar('Órdenes: comprobar · nombre <bundle> "<nombre>" · registrar-cupos <desde> <hasta>');
  }
} catch (e) {
  parar(e.message);
}
