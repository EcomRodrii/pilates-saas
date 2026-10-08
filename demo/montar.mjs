// Une los capítulos grabados en UN vídeo con su voz, y deja el índice.
//
//   node demo/montar.mjs            → demo/salida/demo-configuracion.mp4 + capítulos
//   node demo/montar.mjs estudio    → solo ese capítulo (prueba)
//
// Para cada capítulo: el vídeo de Playwright (webm) + una voz por frase, puesta en
// el instante exacto en que el guion la dijo (demo/salida/cronologia-<id>.json).
// Después se pegan por orden y se escribe:
//   · demo/salida/capitulos.vtt           — el índice, en el formato que lee cualquier reproductor
//   · demo/salida/ffmetadata.txt          — los capítulos dentro del propio mp4
//   · lib/configuracion/demo-capitulos.ts — lo que enseña el apartado «Demo» (con -- --escribir-indice)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'demo/salida');
const PARTES = join(SALIDA, 'partes');
mkdirSync(PARTES, { recursive: true });

const soloEstos = process.argv.slice(2).filter(a => !a.startsWith('-'));
const escribirIndice = process.argv.includes('--escribir-indice');
// Cuánto va el audio por detrás (+) o por delante (−) del vídeo: se calibra con `demo/calibrar.mjs`.
const AJUSTE_MS = Number(process.env.DEMO_AJUSTE_MS ?? '0');

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const duracion = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const cronologias = readdirSync(SALIDA)
  .filter(f => /^cronologia-.+\.json$/.test(f))
  .map(f => JSON.parse(readFileSync(join(SALIDA, f), 'utf8')))
  .filter(c => c.video && existsSync(c.video))
  .sort((a, b) => a.numero - b.numero)
  .filter(c => soloEstos.length === 0 || soloEstos.includes(c.capitulo));

if (cronologias.length === 0) { console.error('No hay capítulos grabados en demo/salida.'); process.exit(1); }

const partes = [];
for (const c of cronologias) {
  const salida = join(PARTES, `${String(c.numero).padStart(2, '0')}-${c.capitulo}.mp4`);
  const voces = c.voces.filter(v => existsSync(v.archivo));
  const entradas = ['-i', c.video, ...voces.flatMap(v => ['-i', v.archivo])];
  const retardos = voces.map((v, i) => {
    const ms = Math.max(0, Math.round(v.inicioMs + c.inicioGuionMs + AJUSTE_MS));
    return `[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`;
  });
  const mezcla = voces.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${voces.length}:normalize=0:dropout_transition=0[mezcla]`;
  const dur = duracion(c.video);
  console.log(`▶ ${c.capitulo}: ${dur.toFixed(1)} s, ${voces.length} frases`);
  ffmpeg([
    ...entradas,
    '-filter_complex', `${retardos.join(';')};${mezcla};[mezcla]apad[audio];[0:v]fps=25,format=yuv420p[video]`,
    '-map', '[video]', '-map', '[audio]', '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '29', '-c:a', 'aac', '-b:a', '56k', '-ar', '44100', '-ac', '1',
    '-movflags', '+faststart', salida,
  ]);
  partes.push({ c, archivo: salida, dur: duracion(salida) });
}

// ── La portada: la imagen que eligió el fundador, 4 s al principio, sin voz ──
// Con la imagen ancha (1,9:1) en el centro y ella misma desenfocada de fondo, para llenar 1440×900.
const PORTADA = join(RAIZ, 'public/demo/portada-demo-configuracion.jpg');
const INTRO_SEG = existsSync(PORTADA) && soloEstos.length === 0 ? 4 : 0;
const intro = join(PARTES, '00-portada.mp4');
if (INTRO_SEG > 0) {
  ffmpeg([
    '-loop', '1', '-framerate', '25', '-t', String(INTRO_SEG), '-i', PORTADA,
    '-f', 'lavfi', '-t', String(INTRO_SEG), '-i', 'anullsrc=r=44100:cl=mono',
    '-filter_complex', '[0:v]split[a][b];[a]scale=1440:900:force_original_aspect_ratio=increase,crop=1440:900,boxblur=40:5[bg];[b]scale=1440:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=25,format=yuv420p[v]',
    '-map', '[v]', '-map', '1:a', '-t', String(INTRO_SEG),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-c:a', 'aac', '-b:a', '56k', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', intro,
  ]);
}

// ── Pegarlos ──
const lista = join(SALIDA, 'partes.txt');
writeFileSync(lista, [...(INTRO_SEG > 0 ? [intro] : []), ...partes.map(p => p.archivo)].map(f => `file '${f}'`).join('\n'));
const final = join(SALIDA, soloEstos.length ? `prueba-${soloEstos.join('-')}.mp4` : 'demo-configuracion.mp4');
const sinNormalizar = join(SALIDA, 'sin-normalizar.mp4');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', sinNormalizar]);
// La voz de ElevenLabs sale baja (≈ −32 dB de media): se lleva a −16 LUFS, lo normal en vídeo hablado.
ffmpeg(['-i', sinNormalizar, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '56k', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', final]);

// ── El índice ──
let t = INTRO_SEG;
const capitulos = partes.map(p => {
  const inicio = t;
  t += p.dur;
  return {
    seccion: p.c.capitulo,
    titulo: p.c.titulo,
    inicioSeg: Math.round(inicio),
    // El instante en que empieza a hablarse de cada ajuste, dentro del vídeo final.
    momentos: p.c.momentos.map(m => ({ tarjeta: m.tarjeta, inicioSeg: Math.round(inicio + (m.ms + p.c.inicioGuionMs) / 1000) })),
  };
});
const total = Math.round(t);

const vtt = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s - h * 3600 - m * 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}`; };
writeFileSync(join(SALIDA, 'capitulos.vtt'), 'WEBVTT\n\n' + partes.map((p, i) => `${vtt(capitulos[i].inicioSeg)} --> ${vtt(capitulos[i].inicioSeg + p.dur)}\n${p.c.titulo}\n`).join('\n'));
writeFileSync(join(SALIDA, 'capitulos.json'), JSON.stringify({ duracionSeg: total, capitulos }, null, 1));

if (escribirIndice) {
  const ts = `// GENERADO por demo/montar.mjs — no se edita a mano (ver lib/configuracion/demo.ts).
import type { SeccionId, TarjetaId } from './secciones.ts';

export interface MomentoDemo {
  /** La tarjeta (o herramienta) de la que habla el vídeo en ese minuto. */
  readonly tarjeta: TarjetaId;
  readonly inicioSeg: number;
}

export interface CapituloDemo {
  readonly seccion: SeccionId;
  readonly inicioSeg: number;
  readonly momentos: readonly MomentoDemo[];
}

export const DURACION_DEMO_SEG: number | null = ${total};

export const CAPITULOS_DEMO: readonly CapituloDemo[] = ${JSON.stringify(capitulos.map(({ seccion, inicioSeg, momentos }) => ({ seccion, inicioSeg, momentos })), null, 2)
    .replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};
`;
  writeFileSync(join(RAIZ, 'lib/configuracion/demo-capitulos.ts'), ts);
  console.log('Índice escrito en lib/configuracion/demo-capitulos.ts');
}
console.log(`Hecho: ${final} (${(t / 60).toFixed(1)} min)`);
