// Datos de ejemplo deterministas para el módulo de Contenido.
// Se generan relativos a `now` para que el dashboard y el calendario tengan
// publicaciones "de esta semana" y "próximas" con sentido.

import type {
  ContenidoState, Publicacion, Idea, Guion, Carrusel,
  Plataforma, TipoPublicacion, MetricasPublicacion,
} from './types';

let counter = 0;
// ID único y estable entre recargas: contador + marca temporal + aleatorio.
// (La persistencia local no re-siembra si ya hay datos, así que los ids creados
// en runtime NO pueden colisionar con los de sesiones anteriores.)
export function cid(prefix = 'c'): string {
  counter += 1;
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function atHour(base: Date, h: number, m = 0): string {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Métricas realistas y deterministas a partir de un índice.
function metricasPara(i: number, tipo: TipoPublicacion): MetricasPublicacion {
  const base = 800 + ((i * 733) % 5200);
  const mult = tipo === 'reel' || tipo === 'video' ? 3.4 : tipo === 'carrusel' ? 1.8 : 1;
  const alcance = Math.round(base * mult);
  const visualizaciones = Math.round(alcance * (tipo === 'reel' || tipo === 'video' ? 2.6 : 1.15));
  const likes = Math.round(alcance * (0.045 + ((i * 13) % 40) / 1000));
  const comentarios = Math.round(likes * (0.06 + ((i * 7) % 20) / 400));
  const guardados = Math.round(likes * (0.12 + ((i * 11) % 30) / 300));
  return {
    alcance,
    visualizaciones,
    likes,
    comentarios,
    guardados,
    interacciones: likes + comentarios + guardados,
  };
}

const TITULOS_PUBLICADAS = [
  '5 errores al empezar en el gym',
  'Rutina full-body de 20 minutos',
  'Lo que nadie te cuenta del descanso',
  'Meal prep para toda la semana',
  '3 estiramientos para la espalda',
  'Cómo mantener la motivación',
  'Mitos sobre las proteínas',
  'Antes y después: 90 días',
];
const TITULOS_PROGRAMADAS = [
  'Reto de movilidad — Día 1',
  'Receta post-entreno en 5 min',
  'Tour por nuestras instalaciones',
  'Testimonio real de una clienta',
  'Tips para dormir mejor',
];
const TITULOS_BORRADOR = [
  'Serie: hábitos saludables (guion)',
  'Q&A con el entrenador',
  'Comparativa de bandas elásticas',
];

const PLATS: Plataforma[][] = [
  ['instagram', 'tiktok'],
  ['instagram'],
  ['youtube'],
  ['instagram', 'facebook'],
  ['tiktok'],
  ['linkedin'],
  ['instagram', 'tiktok', 'youtube'],
];
const TIPOS: TipoPublicacion[] = ['reel', 'carrusel', 'post', 'video', 'reel', 'carrusel', 'historia'];

const HASHTAGS = ['#fitness', '#gym', '#salud', '#bienestar', '#rutina', '#motivacion', '#entrenamiento', '#pilates'];

function pub(
  now: Date, i: number, titulo: string, estado: Publicacion['estado'], offsetDays: number, hora: number,
): Publicacion {
  const fecha = atHour(addDays(now, offsetDays), hora);
  const tipo = TIPOS[i % TIPOS.length];
  const iso = new Date().toISOString();
  return {
    id: cid('pub'),
    titulo,
    contenido: `${titulo}. Contenido pensado para aportar valor y fomentar el guardado y la conversación.`,
    tipo,
    estado,
    plataformas: PLATS[i % PLATS.length],
    fechaProgramada: fecha,
    fechaPublicada: estado === 'publicada' ? fecha : undefined,
    hashtags: HASHTAGS.slice(i % 3, (i % 3) + 4),
    metricas: estado === 'publicada' ? metricasPara(i, tipo) : undefined,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function seedContenido(now: Date): ContenidoState {
  counter = 0;
  const iso = new Date().toISOString();

  const publicaciones: Publicacion[] = [];

  // Publicadas — repartidas en las últimas 3 semanas (algunas esta semana).
  const publicadasOffsets = [-1, -2, -3, -5, -6, -9, -12, -15];
  TITULOS_PUBLICADAS.forEach((t, i) => {
    publicaciones.push(pub(now, i, t, 'publicada', publicadasOffsets[i] ?? -(i + 1), 9 + (i % 8)));
  });

  // Programadas — próximos días.
  const programadasOffsets = [0, 1, 2, 4, 6];
  TITULOS_PROGRAMADAS.forEach((t, i) => {
    publicaciones.push(pub(now, i + 20, t, 'programada', programadasOffsets[i] ?? i + 1, 10 + (i % 6)));
  });

  // Borradores / pendientes — sin fecha fija (usamos hoy como ancla visual).
  TITULOS_BORRADOR.forEach((t, i) => {
    publicaciones.push(pub(now, i + 40, t, 'borrador', 3 + i * 2, 12));
  });

  const ideas: Idea[] = [
    { id: cid('idea'), titulo: 'Serie "mitos del fitness"', notas: 'Desmontar 1 mito por semana en formato reel corto.', estado: 'nueva', plataformaSugerida: 'tiktok', tags: ['serie', 'educativo'], createdAt: iso, updatedAt: iso },
    { id: cid('idea'), titulo: 'Colaboración con nutricionista', notas: 'Directo conjunto respondiendo dudas de la comunidad.', estado: 'en_proceso', plataformaSugerida: 'instagram', tags: ['directo', 'colaboracion'], createdAt: iso, updatedAt: iso },
    { id: cid('idea'), titulo: 'Behind the scenes de una clase', notas: 'Mostrar el ambiente real del estudio.', estado: 'nueva', plataformaSugerida: 'instagram', tags: ['bts'], createdAt: iso, updatedAt: iso },
    { id: cid('idea'), titulo: 'Carrusel: guía de respiración', notas: 'Técnicas de respiración para principiantes.', estado: 'usada', plataformaSugerida: 'instagram', tags: ['carrusel', 'guia'], createdAt: iso, updatedAt: iso },
  ];

  const guiones: Guion[] = [
    {
      id: cid('guion'),
      tema: 'Cómo mantener la constancia en el gym',
      titulo: 'La constancia gana al talento',
      gancho: '¿Empiezas con todo y a las 2 semanas lo dejas? No es falta de motivación.',
      desarrollo: 'La motivación es un pico, los hábitos son la base. Empieza con sesiones cortas de 20 min, agenda el entreno como una cita innegociable y mide el progreso más allá de la báscula. Rodéate de una comunidad que te empuje los días que no te apetece.',
      cta: 'Guarda este vídeo y compártelo con esa persona que necesita volver al gym.',
      descripcion: 'Deja de depender de la motivación. Estos 3 principios te ayudan a construir el hábito que sí dura. 💪',
      hashtags: ['#constancia', '#habitos', '#fitness', '#motivacion'],
      duracionSegundos: 45,
      plataforma: 'instagram',
      createdAt: iso, updatedAt: iso,
    },
  ];

  const carruseles: Carrusel[] = [
    {
      id: cid('carr'),
      tema: 'Guía de respiración para principiantes',
      estilo: 'gradient',
      plataforma: 'instagram',
      slides: [
        { id: cid('sl'), tipo: 'portada', titulo: 'Respira mejor,\nentrena mejor', cuerpo: 'La guía que necesitabas para dominar tu respiración' },
        { id: cid('sl'), tipo: 'contenido', titulo: '1. Respiración diafragmática', cuerpo: 'Inhala por la nariz llevando el aire al abdomen, no al pecho.' },
        { id: cid('sl'), tipo: 'contenido', titulo: '2. Exhala en el esfuerzo', cuerpo: 'Suelta el aire en la fase de mayor esfuerzo del ejercicio.' },
        { id: cid('sl'), tipo: 'contenido', titulo: '3. Ritmo constante', cuerpo: 'Evita aguantar la respiración: mantén un ritmo fluido.' },
        { id: cid('sl'), tipo: 'cta', titulo: '¿Te ha servido?', cuerpo: 'Guarda el carrusel y síguenos para más 👉' },
      ],
      createdAt: iso, updatedAt: iso,
    },
  ];

  const actividad: ContenidoState['actividad'] = [
    { id: cid('act'), tipo: 'publicacion_publicada', descripcion: `Se publicó "${TITULOS_PUBLICADAS[0]}"`, ts: atHour(addDays(now, -1), 9) },
    { id: cid('act'), tipo: 'carrusel_generado', descripcion: 'Carrusel IA generado: Guía de respiración', ts: atHour(addDays(now, -1), 16) },
    { id: cid('act'), tipo: 'guion_generado', descripcion: 'Guion IA generado: La constancia gana al talento', ts: atHour(addDays(now, -2), 11) },
    { id: cid('act'), tipo: 'publicacion_creada', descripcion: `Programada "${TITULOS_PROGRAMADAS[0]}"`, ts: atHour(addDays(now, -2), 18) },
    { id: cid('act'), tipo: 'idea_creada', descripcion: 'Nueva idea: Serie "mitos del fitness"', ts: atHour(addDays(now, -3), 10) },
  ];

  return { publicaciones, ideas, guiones, carruseles, actividad };
}
