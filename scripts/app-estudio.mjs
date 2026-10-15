// Compila y sube a TestFlight la app de tienda de UN estudio (nombre, icono y color
// suyos), desde la cuenta de Apple de Tentare. Un solo comando:
//
//   npm run app:estudio -- <slug>                 → icono, compilación y subida
//   npm run app:estudio -- <slug> --solo-icono    → deja el icono en build/app-estudio/<slug>/ y para
//   npm run app:estudio -- <slug> --sin-subir     → compila y comprueba, sin subir
//
// Opciones: --origen <url> (por defecto https://www.tentare.app), --respuesta <fichero.json>
// (en vez de preguntar al servidor, para ensayar).
//
// Antes: la fila del estudio en `apps_estudio` tiene que existir y estar ACTIVA (el
// servidor no da su nombre ni su icono si no), y el App ID/registro en App Store Connect
// existir con el mismo bundle id. Ver docs/APP-IOS.md, «Apps por estudio».
//
// ⚠️ Nada de esto envía la app a revisión de Apple: sube a App Store Connect, donde queda
// para TestFlight. Enviarla a revisión es otra decisión (guía 4.2.6).
//
// ⚠️ Nunca `CODE_SIGNING_ALLOWED=NO`: exporta sin entitlements (sin notificaciones, sin
// Entrar con Apple, sin enlaces universales) y la app sale rota. Aquí se exporta primero a un
// IPA, se comprueba lo firmado y solo entonces se sube.
//
// Toca ficheros VERSIONADOS (el icono y el arranque de `ios/App/App/Assets.xcassets`), y
// los deja como estaban al terminar, salga bien o mal. Necesita `node_modules` al día
// (`npm ci`): los plugins nativos que entran en la app salen de ahí.

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pngRgb } from './lib/png-rgb.mjs';
import { esAppDeEstudio } from '../lib/app-nativa/app-estudio.ts';
import { argumentosDeClave } from '../lib/nativo/automatico.ts';
import {
  entitlementsCompletos, equipoDeXcconfig, numeroDeBuild, opcionesDeExport, pngSinAlfa, urlIcono1024,
} from '../lib/nativo/compilar-estudio.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = 'ios/App/App/Assets.xcassets';
// `cap sync` reescribe este fichero (versionado) con los plugins que haya en node_modules.
const PAQUETE_SPM = 'ios/App/CapApp-SPM/Package.swift';
const XCCONFIG = path.join(REPO, 'ios/identidad.local.xcconfig');
const LADO_ICONO = 1024;
const LADO_SPLASH = 2732;
const LADO_ICONO_SPLASH = 400;

// ─── Argumentos ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const slug = args.find((a, i) => !a.startsWith('--') && !['--origen', '--respuesta'].includes(args[i - 1] ?? ''));
const ORIGEN = (valor('origen') ?? 'https://www.tentare.app').replace(/\/$/, '');
const SOLO_ICONO = flag('solo-icono');
const SIN_SUBIR = flag('sin-subir');

/** En Actions (registro público): que estos valores salgan como ***. Fuera de Actions, nada. */
function ocultar(...valores) {
  if (!process.env.GITHUB_ACTIONS) return;
  for (const v of valores) if (typeof v === 'string' && v.trim().length >= 3) console.log(`::add-mask::${v.trim()}`);
}
ocultar(slug);

function parar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}
if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) parar('Uso: npm run app:estudio -- <slug> [--solo-icono | --sin-subir]');

function ejecutar(cmd, argv, opciones = {}) {
  console.log(`\n$ ${[cmd, ...argv].join(' ')}`);
  const r = spawnSync(cmd, argv, { cwd: REPO, stdio: 'inherit', ...opciones });
  if (r.status !== 0) throw new Error(`«${cmd}» terminó con error (${r.status ?? r.signal}).`);
}

// ─── 1. Qué app es ─────────────────────────────────────────────────────────
async function leerApp() {
  const ruta = valor('respuesta');
  if (ruta) return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const res = await fetch(`${ORIGEN}/api/public/app/app-estudio?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) {
    parar(`«${slug}» no tiene una app ACTIVA en apps_estudio. La fila se crea (y se activa) a propósito; este script no la crea.`);
  }
  if (!res.ok) parar(`El servidor contestó ${res.status} al pedir la app de «${slug}».`);
  return res.json();
}

// ─── 2. Icono y arranque ───────────────────────────────────────────────────
/** Descarga el icono del estudio a 1024 px (el mismo que ven sus alumnas) y lo compone en RGB sin alfa. */
async function componerImagenes(app) {
  const url = urlIcono1024(ORIGEN, app.icono);
  console.log(`Icono: ${url}`);
  const res = await fetch(url);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!res.ok || bytes.length === 0) parar(`No se pudo descargar el icono (${res.status}, ${bytes.length} bytes).`);
  if (!(res.headers.get('content-type') ?? '').includes('image/png')) parar('El icono no llegó como PNG.');
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    const componer = async ({ lado, fondo, caja, esquina }) => {
      const base64 = await pagina.evaluate(async ({ dataUrl, lado, fondo, caja, esquina }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const lienzo = document.createElement('canvas');
        lienzo.width = lado; lienzo.height = lado;
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = fondo;
        ctx.fillRect(0, 0, lado, lado);
        if (esquina > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(caja.x, caja.y, caja.lado, caja.lado, esquina);
          ctx.clip();
        }
        ctx.drawImage(img, caja.x, caja.y, caja.lado, caja.lado);
        if (esquina > 0) ctx.restore();
        const rgba = ctx.getImageData(0, 0, lado, lado).data;
        const rgb = new Uint8Array((rgba.length / 4) * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; }
        let binario = '';
        for (let i = 0; i < rgb.length; i += 0x8000) binario += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
        return btoa(binario);
      }, { dataUrl, lado, fondo, caja, esquina });
      return pngRgb(Buffer.from(base64, 'base64'), lado, lado);
    };

    // El icono de la tienda: a sangre, sobre blanco (aplana cualquier transparencia).
    const icono = await componer({ lado: LADO_ICONO, fondo: '#FFFFFF', caja: { x: 0, y: 0, lado: LADO_ICONO }, esquina: 0 });
    // El arranque: el icono del estudio, con las esquinas de iOS, en el centro de un cuadrado claro u oscuro.
    const centro = { x: Math.round((LADO_SPLASH - LADO_ICONO_SPLASH) / 2), y: Math.round((LADO_SPLASH - LADO_ICONO_SPLASH) / 2), lado: LADO_ICONO_SPLASH };
    const esquina = Math.round(LADO_ICONO_SPLASH * 0.2237);
    const splash = await componer({ lado: LADO_SPLASH, fondo: '#F8FAFC', caja: centro, esquina });
    const splashOscuro = await componer({ lado: LADO_SPLASH, fondo: '#111827', caja: centro, esquina });
    return { icono, splash, splashOscuro };
  } finally {
    await navegador.close();
  }
}

// ─── Principal ─────────────────────────────────────────────────────────────
const app = await leerApp();
if (!esAppDeEstudio(app) || typeof app.bundleId !== 'string' || typeof app.nombreApp !== 'string') {
  parar('La respuesta del servidor no tiene la forma de una app de estudio.');
}
ocultar(app.nombre, app.bundleId, app.nombreApp);
console.log(`App de «${app.nombre}» → ${app.bundleId} · «${app.nombreApp}»`);

const imagenes = await componerImagenes(app);
if (!pngSinAlfa(imagenes.icono, LADO_ICONO)) parar('El icono compuesto no es de 1024×1024 sin alfa.');

const vista = path.join(REPO, 'build/app-estudio', slug);
fs.mkdirSync(vista, { recursive: true });
fs.writeFileSync(path.join(vista, 'AppIcon-1024.png'), imagenes.icono);
fs.writeFileSync(path.join(vista, 'splash.png'), imagenes.splash);
fs.writeFileSync(path.join(vista, 'splash-oscuro.png'), imagenes.splashOscuro);
console.log(`Vista previa en build/app-estudio/${slug}/ (${(imagenes.icono.length / 1024).toFixed(0)} KB el icono)`);
if (SOLO_ICONO) { console.log('\n--solo-icono: no se toca nada más. Mira el icono antes de seguir.'); process.exit(0); }

// Los ficheros versionados que se van a pisar tienen que estar limpios: si no, el
// `git checkout` del final se llevaría un cambio ajeno.
const sucio = spawnSync('git', ['status', '--porcelain', '--', ASSETS, PAQUETE_SPM], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
if (sucio) parar(`Hay cambios sin guardar en ${ASSETS} o ${PAQUETE_SPM}; guárdalos o descártalos antes:\n${sucio}`);

const xcconfigAnterior = fs.existsSync(XCCONFIG) ? fs.readFileSync(XCCONFIG, 'utf8') : null;
const equipo = process.env.TENTARE_APPLE_TEAM_ID || equipoDeXcconfig(xcconfigAnterior ?? '');
if (!equipo) parar('Falta el Team ID de Apple: TENTARE_APPLE_TEAM_ID=XXXXXXXXXX npm run app:estudio -- <slug>  (o el que ya esté en ios/identidad.local.xcconfig).');

const build = numeroDeBuild();
// En GitHub Actions no hay cuenta de Xcode: firma la clave de App Store Connect (ASC_KEY_PATH,
// ASC_KEY_ID, ASC_ISSUER_ID). En el Mac del equipo no hacen falta y no se pasan.
const clave = argumentosDeClave(process.env);
if (clave.length) console.log('Firma: con la clave de App Store Connect (sin cuenta de Xcode).');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `app-estudio-${slug}-`));
const archivo = path.join(tmp, 'App.xcarchive');
let terminadoBien = false;

try {
  fs.copyFileSync(path.join(vista, 'AppIcon-1024.png'), path.join(REPO, ASSETS, 'AppIcon.appiconset/AppIcon-1024.png'));
  fs.copyFileSync(path.join(vista, 'splash.png'), path.join(REPO, ASSETS, 'Splash.imageset/splash.png'));
  fs.copyFileSync(path.join(vista, 'splash-oscuro.png'), path.join(REPO, ASSETS, 'Splash.imageset/splash-oscuro.png'));

  const env = { ...process.env, TENTARE_APP_ID: app.bundleId, TENTARE_APP_NAME: app.nombreApp, TENTARE_APPLE_TEAM_ID: equipo };
  ejecutar('node', ['scripts/identidad-ios.mjs'], { env });
  ejecutar('npx', ['cap', 'sync', 'ios'], { env });

  // `cap sync` arma la lista de plugins nativos con lo que hay en node_modules. Si cambia el
  // fichero versionado, a este árbol le faltan (o le sobran) plugins respecto a `main` y la
  // app saldría incompleta, sin brillo de pantalla o sin calendario, sin ningún error.
  const cambioSpm = spawnSync('git', ['diff', '--stat', '--', PAQUETE_SPM], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  if (cambioSpm) throw new Error(`node_modules no coincide con package.json: «cap sync» ha cambiado ${PAQUETE_SPM}. Haz «npm ci» y vuelve a empezar.\n${cambioSpm}`);

  ejecutar('xcodebuild', [
    'archive', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release',
    '-destination', 'generic/platform=iOS', '-archivePath', archivo, '-allowProvisioningUpdates', ...clave,
    `CURRENT_PROJECT_VERSION=${build}`,
  ]);

  // Primero a un IPA en disco, y se COMPRUEBA lo firmado antes de subir. En el archivo las
  // notificaciones van en `development`: solo el IPA para App Store las lleva en `production`.
  const exportacion = path.join(tmp, 'export');
  const opcionesExport = path.join(tmp, 'ExportOptions.plist');
  fs.writeFileSync(opcionesExport, opcionesDeExport(equipo, 'export'));
  ejecutar('xcodebuild', ['-exportArchive', '-archivePath', archivo, '-exportOptionsPlist', opcionesExport, '-exportPath', exportacion, '-allowProvisioningUpdates', ...clave]);
  const ipa = fs.readdirSync(exportacion).find((f) => f.endsWith('.ipa'));
  if (!ipa) throw new Error('La exportación no dejó ningún .ipa.');
  const descomprimido = path.join(tmp, 'ipa');
  ejecutar('unzip', ['-q', path.join(exportacion, ipa), '-d', descomprimido]);
  const firma = spawnSync('codesign', ['-d', '--entitlements', ':-', path.join(descomprimido, 'Payload/App.app')], { encoding: 'utf8' });
  const { ok, faltan } = entitlementsCompletos(`${firma.stdout}\n${firma.stderr}`);
  if (!ok) throw new Error(`El IPA no lleva: ${faltan.join('; ')}. No se sube.`);
  console.log('\n✔ Entitlements del IPA: notificaciones en producción, Entrar con Apple y enlaces universales.');

  if (SIN_SUBIR) {
    console.log(`\n--sin-subir: IPA comprobado en ${path.join(exportacion, ipa)}`);
  } else {
    fs.writeFileSync(opcionesExport, opcionesDeExport(equipo, 'upload'));
    ejecutar('xcodebuild', ['-exportArchive', '-archivePath', archivo, '-exportOptionsPlist', opcionesExport, '-exportPath', path.join(tmp, 'subida'), '-allowProvisioningUpdates', ...clave]);
    console.log(`\n✔ Subida a App Store Connect: ${app.bundleId} · build ${build}. Aparece en TestFlight tras procesarse.`);
  }
  terminadoBien = true;
} catch (e) {
  console.error(`\n✖ ${e.message}`);
} finally {
  // Deja el árbol como estaba: los ficheros versionados, la identidad local y el JSON de Capacitor.
  spawnSync('git', ['checkout', '--', ASSETS, PAQUETE_SPM], { cwd: REPO, stdio: 'inherit' });
  if (xcconfigAnterior !== null) fs.writeFileSync(XCCONFIG, xcconfigAnterior); else fs.rmSync(XCCONFIG, { force: true });
  const envLimpio = { ...process.env };
  delete envLimpio.TENTARE_APP_ID; delete envLimpio.TENTARE_APP_NAME;
  spawnSync('npx', ['cap', 'sync', 'ios'], { cwd: REPO, stdio: 'ignore', env: envLimpio });
  // Este `cap sync` también reescribe el fichero de plugins; se vuelve a dejar el de `main`.
  spawnSync('git', ['checkout', '--', PAQUETE_SPM], { cwd: REPO, stdio: 'ignore' });
  console.log('\nÁrbol restaurado: icono, arranque, identidad y configuración de Capacitor como estaban.');
}
process.exit(terminadoBien ? 0 : 1);
