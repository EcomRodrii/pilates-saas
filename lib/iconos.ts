// Canon de iconos del producto: UN icono por concepto, con su alias semántico.
//
// Lucide es la única familia de iconos UI de Tentare (outline, grosor 2).
// Este módulo existe porque la auditoría de 2026-08-20 encontró 5 iconos
// distintos para "éxito", 6 para "alerta", 7 para "dinero" y 9 para
// "calendario" repartidos por 213 ficheros. Los re-exports son tree-shakeable:
// importar un alias NO arrastra el resto del catálogo al bundle.
//
// Reglas de uso:
// - Código nuevo importa de aquí (`import { IconoEditar } from '@/lib/iconos'`),
//   no de 'lucide-react' directo, cuando el concepto está en esta tabla.
// - Si un concepto no está, se importa de lucide-react como siempre — este
//   módulo no pretende envolver los ~200 iconos, solo fijar los ambiguos.
// - Distinción deliberada que ya existía en el repo y aquí queda escrita:
//   ExternalLink = enlace que SALE de la app; ArrowUpRight = navegación
//   interna tipo "ir a". No son intercambiables.
// - Los emoji de niveles/logros/automatizaciones son DATO de negocio editable
//   por la usuaria, no iconos de UI — no se sustituyen por Lucide.
export {
  // Acciones
  Pencil as IconoEditar,
  Trash2 as IconoBorrar,
  Plus as IconoAnadir,
  X as IconoCerrar,
  Search as IconoBuscar,
  // Dos iconos de filtro con reparto deliberado, no un duplicado: el embudo
  // (Filter) acompaña a controles de filtrado inline en listas; los sliders
  // (SlidersHorizontal) abren una hoja/panel de filtros (patrón del
  // marketplace de Network). No intercambiar.
  Filter as IconoFiltro,
  SlidersHorizontal as IconoPanelFiltros,
  Download as IconoDescargar,
  Upload as IconoSubir,
  Copy as IconoCopiar,
  Loader2 as IconoCargando,

  // Estado
  Check as IconoHecho,
  CheckCircle2 as IconoExito,
  AlertTriangle as IconoAviso,
  XCircle as IconoFallo,
  Info as IconoInfo,
  Clock as IconoPendiente,

  // Dominio
  Calendar as IconoCalendario,
  Users as IconoClientas,
  User as IconoPersona,
  CreditCard as IconoCobro,
  Landmark as IconoSepa,
  Coins as IconoCreditos,
  Bell as IconoNotificaciones,
  BadgeCheck as IconoVerificado,

  // Navegación
  ExternalLink as IconoEnlaceExterno,
  ArrowUpRight as IconoIrA,
  ChevronRight as IconoChevron,
  ArrowLeft as IconoVolver,
} from 'lucide-react';

// Escala de tamaños (prop `size` numérica, la sintaxis dominante del repo).
// `inline` gana a 13px porque 273 usos ya estaban en 14 frente a 234 en 13;
// `nav` respeta los 15px que el sidebar usa desde siempre.
export const TAMANO_ICONO = {
  /** Icono junto a texto: filas, chips, etiquetas. */
  inline: 14,
  /** Entradas de navegación (sidebar, tab bars). */
  nav: 15,
  /** Botones de acción e IconButton. */
  accion: 16,
  /** Tile de EmptyState y cabeceras destacadas. */
  tile: 26,
} as const;
