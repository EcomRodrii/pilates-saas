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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
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
  // Matroska con el audio SIN comprimir (PCM): la voz se comprime UNA sola vez, al final, y no en
  // cada capítulo. El vídeo ya viene codificado de la grabación (nucleo.ts): aquí se copia tal cual.
  const salida = join(PARTES, `${String(c.numero).padStart(2, '0')}-${c.capitulo}.mkv`);
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
    '-filter_complex', `${retardos.join(';')};${mezcla};[mezcla]apad[audio]`,
    '-map', '0:v', '-map', '[audio]', '-t', String(dur),
    '-c:v', 'copy', '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '1', salida,
  ]);
  partes.push({ c, archivo: salida, dur: duracion(salida) });
}

// ── Pegarlos ──
const lista = join(SALIDA, 'partes.txt');
writeFileSync(lista, partes.map(p => `file '${p.archivo}'`).join('\n'));
const final = join(SALIDA, soloEstos.length ? `prueba-${soloEstos.join('-')}.mp4` : 'master.mp4');
const unido = join(SALIDA, 'unido.mkv');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', unido]);

// ── La voz: una ganancia FIJA hasta dejar el pico en −2 dB. Nada de `loudnorm`: en una sola pasada,
// con tanto silencio entre frases, sube la ganancia a lo bestia y el limitador distorsiona la voz
// (así salió el v2: picos de +4 dB). Con ganancia fija no hay nada que distorsionar. ──
const analisis = spawnSync('ffmpeg', ['-hide_banner', '-i', unido, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
const pico = Number(`${analisis.stderr}`.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? 'NaN');
if (Number.isNaN(pico)) throw new Error('no he podido medir el pico de la voz');
const ganancia = Math.min(Math.max(-2 - pico, 0), 12);
console.log(`Pico de la voz: ${pico} dB → ganancia fija de ${ganancia.toFixed(1)} dB`);
ffmpeg(['-i', unido, '-c:v', 'copy', '-af', `volume=${ganancia.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', final]);
rmSync(unido, { force: true });

// ── La versión WEB: Supabase Storage (plan gratuito) no admite ficheros de más de 50 MB y el master pesa
// ~80 MB. Se recomprime desde el master (UI limpia: a crf 26 no se distingue) para quedar por debajo.
const web = join(SALIDA, 'demo-configuracion.mp4');
if (soloEstos.length === 0) {
  ffmpeg(['-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', web]);
  const mb = statSync(web).size / 1e6;
  console.log(`Versión web: ${mb.toFixed(1)} MB${mb > 52 ? ' ⚠️ MÁS DE 50 MB: Supabase la rechazará' : ''}`);
}

// ── El índice ──
let t = 0;
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
console.log(`Hecho: ${soloEstos.length ? final : web} (${(t / 60).toFixed(1)} min); master sin recomprimir: ${final}`);
