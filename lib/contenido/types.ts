// Modelo de dominio del módulo de Contenido (redes sociales).
// Aislado del dominio de gimnasio: persistencia 100% cliente (localStorage),
// no toca Supabase ni studio-context. Ver lib/contenido/store.tsx.

export type Plataforma =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'linkedin'
  | 'twitter';

export const PLATAFORMAS: Plataforma[] = [
  'instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'twitter',
];

export interface PlataformaMeta {
  id: Plataforma;
  label: string;
  color: string;      // color de marca (para chips/gráficos)
  abbr: string;       // 2 letras para avatar
}

export const PLATAFORMA_META: Record<Plataforma, PlataformaMeta> = {
  instagram: { id: 'instagram', label: 'Instagram', color: '#E1306C', abbr: 'IG' },
  tiktok:    { id: 'tiktok',    label: 'TikTok',    color: '#00B8C6', abbr: 'TT' },
  youtube:   { id: 'youtube',   label: 'YouTube',   color: '#FF0000', abbr: 'YT' },
  facebook:  { id: 'facebook',  label: 'Facebook',  color: '#1877F2', abbr: 'FB' },
  linkedin:  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2', abbr: 'IN' },
  twitter:   { id: 'twitter',   label: 'X',         color: '#000000', abbr: 'X'  },
};

export type EstadoPublicacion = 'borrador' | 'programada' | 'publicada';

export const ESTADO_META: Record<EstadoPublicacion, { label: string; color: string; dot: string }> = {
  borrador:   { label: 'Pendiente',  color: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
  programada: { label: 'Programada', color: 'text-blue-600 dark:text-blue-400',     dot: 'bg-blue-500' },
  publicada:  { label: 'Publicada',  color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
};

export type TipoPublicacion = 'reel' | 'carrusel' | 'post' | 'historia' | 'video';

export const TIPO_PUBLICACION_LABEL: Record<TipoPublicacion, string> = {
  reel: 'Reel',
  carrusel: 'Carrusel',
  post: 'Post',
  historia: 'Historia',
  video: 'Vídeo',
};

export interface MetricasPublicacion {
  alcance: number;
  interacciones: number;   // likes + comentarios + guardados
  visualizaciones: number;
  likes: number;
  comentarios: number;
  guardados: number;
}

export interface Publicacion {
  id: string;
  titulo: string;
  contenido: string;
  tipo: TipoPublicacion;
  estado: EstadoPublicacion;
  plataformas: Plataforma[];
  fechaProgramada: string;        // ISO — día/hora de publicación (o programación)
  fechaPublicada?: string;        // ISO — cuando estado === 'publicada'
  hashtags: string[];
  metricas?: MetricasPublicacion; // solo publicaciones publicadas
  createdAt: string;
  updatedAt: string;
}

export type EstadoIdea = 'nueva' | 'en_proceso' | 'usada' | 'descartada';

export const ESTADO_IDEA_META: Record<EstadoIdea, { label: string; color: string }> = {
  nueva:      { label: 'Nueva',       color: 'text-blue-600 dark:text-blue-400' },
  en_proceso: { label: 'En proceso',  color: 'text-amber-600 dark:text-amber-400' },
  usada:      { label: 'Usada',       color: 'text-emerald-600 dark:text-emerald-400' },
  descartada: { label: 'Descartada',  color: 'text-muted-foreground' },
};

export interface Idea {
  id: string;
  titulo: string;
  notas: string;
  estado: EstadoIdea;
  plataformaSugerida?: Plataforma;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type TipoActividadContenido =
  | 'publicacion_creada'
  | 'publicacion_publicada'
  | 'idea_creada';

export interface ActividadContenido {
  id: string;
  tipo: TipoActividadContenido;
  descripcion: string;
  ts: string;   // ISO
}

// Estado completo persistido en localStorage.
export interface ContenidoState {
  publicaciones: Publicacion[];
  ideas: Idea[];
  actividad: ActividadContenido[];
}
