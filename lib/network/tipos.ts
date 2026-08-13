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
export type PerfilNetworkPublico =
  Omit<PerfilNetwork, 'authUserId' | 'emailContacto' | 'telefonoContacto'> & { experienciaVerificada: boolean };

// Filtros del buscador (docs/NETWORK-IMPLEMENTATION-PLAN.md §4, §8). Todos
// opcionales: sin filtros, se listan todos los perfiles publicados.
export interface FiltroBusquedaNetwork {
  ciudad: string | null;
  especialidades: EspecialidadNetwork[];
  disponibilidad: DisponibilidadEstadoNetwork[];
  horarios: HorarioNetwork[];
  tipoTrabajo: TipoTrabajoNetwork[];
  experienciaMinima: number | null;
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
