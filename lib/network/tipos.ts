// Tipos compartidos de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §1.
import type {
  EspecialidadNetwork, HorarioNetwork, TipoTrabajoNetwork,
  TarifaRangoNetwork, DisponibilidadEstadoNetwork,
} from './catalogo.ts';

// Identidad profesional 1:1 con auth_user_id (NO con studio_id) — una
// persona puede no pertenecer a ningún estudio Tentare todavía.
export interface PerfilNetwork {
  id: string;
  authUserId: string;
  // Se genera al publicar (lib/network/slug.ts), null en draft/hidden/
  // suspended — /network/instructoras/[slug] no existe hasta entonces.
  slug: string | null;
  nombre: string;
  fotoUrl: string | null;
  ciudad: string | null;
  zona: string | null;
  radioKm: number | null;
  descripcion: string | null;
  especialidades: EspecialidadNetwork[];
  aniosExperiencia: number | null;
  tarifaRango: TarifaRangoNetwork | null;
  disponibilidadEstado: DisponibilidadEstadoNetwork;
  disponibilidadHorarios: HorarioNetwork[];
  tipoTrabajo: TipoTrabajoNetwork[];
  emailContacto: string | null;
  telefonoContacto: string | null;
  estado: 'draft' | 'published' | 'hidden' | 'suspended';
  // Solo el equipo de Tentare lo escribe (app/interno/network) — nunca desde
  // /network/mi-perfil. Empuja al principio del ranking (lib/network/
  // ranking.ts), no es un badge de confianza (esos son hechos verificables,
  // esto es una decisión editorial).
  destacado: boolean;
  identidadVerificadaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  ultimoAccesoEn: string | null;
}

// Campos que la propia dueña puede editar desde /network/mi-perfil. `estado`
// se gestiona aparte (Fase 3: publicación) — no se toca desde este formulario.
export type CambiosPerfilNetwork = Partial<
  Pick<
    PerfilNetwork,
    | 'nombre' | 'fotoUrl' | 'ciudad' | 'zona' | 'radioKm' | 'descripcion'
    | 'especialidades' | 'aniosExperiencia' | 'tarifaRango'
    | 'disponibilidadEstado' | 'disponibilidadHorarios' | 'tipoTrabajo'
    | 'emailContacto' | 'telefonoContacto'
  >
>;

// Fase 4 (buscador): lo que ve un estudio de OTRA persona en los resultados.
// Sin `authUserId` (identificador interno, sin uso del lado cliente) ni
// `emailContacto`/`telefonoContacto` (privados por diseño — docs/NETWORK-
// AUDIT.md §4: solo se revelan al aceptar una solicitud de contacto, Fase 9,
// nunca en un listado). El endpoint de búsqueda ni siquiera los consulta —
// no es solo que se omitan al servir la respuesta.
// `experienciaVerificada`: único badge que se calcula también en el
// LISTADO (buscar), no solo en el detalle — es la única señal barata de
// calcular en lote para N perfiles a la vez (una query con `.in(perfilId)`,
// sin N+1). El resto de badges (email, referencia, identidad, actividad)
// solo viven en `BadgesNetwork`, del detalle de UN perfil — ver
// app/api/network/buscar/route.ts para la justificación de coste.
// `resumenResenas`: mismo criterio de coste que `experienciaVerificada` —
// se calcula en LOTE para los N perfiles de un listado (una query con
// `.in(perfilId)` agrupada), nunca una consulta por tarjeta.
export type PerfilNetworkPublico =
  Omit<PerfilNetwork, 'authUserId' | 'emailContacto' | 'telefonoContacto'>
  & { experienciaVerificada: boolean; resumenResenas: ResumenResenas };

// Filtros del buscador (docs/NETWORK-IMPLEMENTATION-PLAN.md §4, §8). Todos
// opcionales: sin filtros, se listan todos los perfiles publicados.
export interface FiltroBusquedaNetwork {
  ciudad: string | null;
  especialidades: EspecialidadNetwork[];
  disponibilidad: DisponibilidadEstadoNetwork[];
  horarios: HorarioNetwork[];
  tipoTrabajo: TipoTrabajoNetwork[];
  experienciaMinima: number | null;
  // "Precio máximo" del rediseño del marketplace (README design_handoff):
  // el mock pide un slider continuo, pero el dato real es un rango
  // discreto (tarifaRango, no un número) — aquí se filtra por los rangos
  // seleccionados, honesto con lo que el dato puede responder de verdad.
  tarifaRango: TarifaRangoNetwork[];
}

// Historial laboral declarado — docs/NETWORK-IMPLEMENTATION-PLAN.md §3.
// `studioId` se queda en null desde el CRUD de Fase 6: enlazarla a un
// estudio Tentare real es parte del flujo de "Verificar experiencia"
// (Fase 7), no de darla de alta.
export interface ExperienciaNetwork {
  id: string;
  perfilId: string;
  studioId: string | null;
  nombreEstudio: string;
  fechaInicio: string;
  fechaFin: string | null;
  especialidades: EspecialidadNetwork[];
  descripcion: string | null;
  estadoVerificacion: 'sin_solicitar' | 'pendiente' | 'confirmada' | 'rechazada';
  creadoEn: string;
}

export type NuevaExperienciaNetwork = Pick<
  ExperienciaNetwork,
  'nombreEstudio' | 'fechaInicio' | 'fechaFin' | 'especialidades' | 'descripcion'
>;

// Lo que ve un estudio en el perfil público de otra persona: sin `perfilId`
// (identificador interno sin uso del lado cliente en ese contexto).
export type ExperienciaNetworkPublica = Omit<ExperienciaNetwork, 'perfilId'>;

// Badges de confianza (Fase 8) — ver lib/network/badges.ts para el cálculo
// y components/network/lista-badges.tsx para el render.
export interface BadgesNetwork {
  emailVerificado: boolean;
  experienciaVerificada: boolean;
  referenciaProfesional: boolean;
  identidadVerificada: boolean;
  activaRecientemente: boolean;
}

// Reseñas — brief §25: nunca "5 estrellas porque sí". Solo existen con
// origen real: un estudio con una solicitud de contacto ACEPTADA para ese
// perfil (red_resenas.solicitud_id, unique por studio+perfil). `estudioNombre`
// es del propio estudio que reseña, no de la persona — dato ya público en
// cualquier búsqueda de estudios, no es información privada de nadie.
export interface ResenaNetwork {
  id: string;
  puntuacion: number;
  comentario: string | null;
  estudioNombre: string;
  creadoEn: string;
}

// `promedio` es `null` con 0 reseñas — nunca 0 estrellas fabricadas
// (mismo criterio que Prediccion/Confianza en lib/decision/prediccion.ts:
// sin datos, null, no un número que finge saber algo).
export interface ResumenResenas {
  promedio: number | null;
  total: number;
}

// Mensajería interna (brief §9) — un hilo por solicitud de contacto YA
// ACEPTADA, no un concepto de "conversación" aparte. `remitenteSoyYo` se
// resuelve en el servidor (compara con quien pide el hilo), nunca se manda
// el auth_user_id del remitente al cliente sin necesidad.
export interface MensajeNetwork {
  id: string;
  cuerpo: string;
  remitenteSoyYo: boolean;
  creadoEn: string;
  leidoEn: string | null;
}
