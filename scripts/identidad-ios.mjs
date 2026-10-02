// Escribe ios/identidad.local.xcconfig con la identidad de la app que se va a
// compilar. Lo encadena `npm run cap:sync` antes de `cap sync ios`.
//
//   npm run cap:sync                                   → la app «Tentare»
//   TENTARE_APP_ID=app.tentare.luz TENTARE_APP_NAME="Luz" npm run cap:sync
//                                                      → la app de un estudio
//   TENTARE_APPLE_TEAM_ID=XXXXXXXXXX npm run cap:sync  → firma con ese equipo
//
// El bundle id y el nombre salen de capacitor.config.ts (que ya lee
// TENTARE_APP_ID / TENTARE_APP_NAME): una sola fuente, para que la carcasa
// web (capacitor.config.json) y el proyecto de Xcode no puedan discrepar.
// Ver ios/tentare.xcconfig y docs/APP-IOS.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { identidadDesde, xcconfigDeIdentidad } from '../lib/nativo/identidad-app.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: config } = await import(pathToFileURL(path.join(REPO, 'capacitor.config.ts')).href);

const identidad = identidadDesde({
  appId: config.appId,
  appName: config.appName,
  equipo: process.env.TENTARE_APPLE_TEAM_ID ?? '',
});

const destino = path.join(REPO, 'ios/identidad.local.xcconfig');
fs.writeFileSync(destino, xcconfigDeIdentidad(identidad));
console.log(`ios/identidad.local.xcconfig → ${identidad.bundleId} · «${identidad.nombre}»`
  + (identidad.equipo ? ` · equipo ${identidad.equipo}` : ' · equipo: el que se elija en Xcode'));
