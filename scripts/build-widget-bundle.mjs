#!/usr/bin/env node
// Compila app/widget-bundle/main.tsx a public/widget.js — el script que un
// estudio incrusta en su propia web (Modo B, sin iframe). Corre APARTE de
// `next build` (encadenado antes vía el script npm `build:widget`, ver
// package.json): esbuild, no webpack/Next, porque el bundle tiene que ser un
// único fichero autocontenido (React/react-dom/lucide-react incluidos, un
// sitio de terceros no los tiene cargados) — Next no produce ese tipo de
// salida sin un plugin adicional para algo que en realidad es un caso de uso
// pequeño y aislado.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// El bundle corre en el navegador de un sitio de terceros: no hay proceso
// Node ahí, así que `process.env.NEXT_PUBLIC_*` (que Next normalmente inlinea
// en build) tiene que quedar como STRING LITERAL en el propio JS compilado.
// Mismas dos variables que ya lee lib/db/supabase.ts/-portal.ts — nada nuevo,
// solo hay que dárselas a esbuild explícitamente porque no pasa por Next.
function leerEnvLocal(clave) {
  const envPath = path.join(raiz, '.env.local');
  if (!fs.existsSync(envPath)) return process.env[clave] ?? '';
  const linea = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .find(l => l.startsWith(`${clave}=`));
  return linea ? linea.slice(clave.length + 1).trim() : (process.env[clave] ?? '');
}
const SUPABASE_URL = leerEnvLocal('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = leerEnvLocal('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('✘ Faltan NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local — el widget no podría autenticar a ninguna socia.');
  process.exit(1);
}

await esbuild.build({
  entryPoints: [path.join(raiz, 'app/widget-bundle/main.tsx')],
  outfile: path.join(raiz, 'public/widget.js'),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.css': 'text' },
  alias: { '@': raiz },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
  },
  logLevel: 'info',
});

console.log('✔ public/widget.js generado');
