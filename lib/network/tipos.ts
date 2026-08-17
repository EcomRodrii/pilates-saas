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
  // 'en_revision': el wizard está completo y la instructora lo ha enviado,
  // pero todavía no es 'published' — eso lo decide el equipo de Tentare
  // desde /interno/network (evitar spam/perfiles falsos, feedback directo
  // del fundador). Nunca lo pone el dueño directamente: ni la API ni la
  // RLS (migración red_perfiles_en_revision) se lo permiten.
  estado: 'draft' | 'en_revision' | 'published' | 'hidden' | 'suspended';
  // Solo el equipo de Tentare lo escribe (app/interno/network) — nunca desde
  // /network/mi-perfil. Empuja al principio del ranking (lib/network/
  // ranking.ts), no es un badge de confianza (esos son hechos verificables,
  // esto es una decisión editorial).
  destacado: boolean;
  identidadVerificadaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  ultimoAccesoEn: string | null;
  // Paso 10 del wizard ("Tu perfil") — públicos, en la propia red_perfiles
  // (a diferencia de PerfilIdentidadNetwork, que es privada por diseño).
  idiomas: string[];
  instagram: string | null;
  linkedin: string | null;
  web: string | null;
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
    | 'idiomas' | 'instagram' | 'linkedin' | 'web'
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
// `certificacionVerificada`: mismo criterio de coste que `experienciaVerificada`
// — se calcula en LOTE para los N perfiles de un listado (una query con
// `.in(perfilId)` sobre red_certificaciones filtrada a estado='verificado'),
// nunca una consulta por tarjeta. Una certificación 'pendiente'/'en_revision'
// NO cuenta — mismo criterio que "Formación verificada" del perfil público
// (docs/README): no se enseña como logro solo por haberla subido.
export type PerfilNetworkPublico =
  Omit<PerfilNetwork, 'authUserId' | 'emailContacto' | 'telefonoContacto'>
  & { experienciaVerificada: boolean; certificacionVerificada: boolean; resumenResenas: ResumenResenas };

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
  // Fase 2 "búsqueda avanzada" — identidad va directo a SQL
  // (`identidad_verificada_en is not null`); experiencia se resuelve
  // post-query, sobre el mismo Set ya calculado en lote para el badge de
  // cada tarjeta (`buscarPerfilesPublico`) — ningún cálculo nuevo, solo se
  // usa también para filtrar, no solo para pintar.
  soloIdentidadVerificada: boolean;
  soloExperienciaVerificada: boolean;
  // Mismo criterio que soloExperienciaVerificada: red_certificaciones ya se
  // consulta en lote para calcular `certificacionVerificada` de cada
  // tarjeta — filtrar por ella no añade ninguna consulta nueva.
  soloCertificacionVerificada: boolean;
  // Reseñas ya se agregan en lote para pintar `resumenResenas` en cada
  // tarjeta — mismo dato, filtrado después en vez de un `HAVING` en SQL
  // (supabase-js no hace GROUP BY).
  valoracionMinima: number | null;
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

// Formalizar contratación (siguiente fase) — doble confirmación sobre el
// hilo YA aceptado. `estado='confirmada'` solo cuando el alta real en
// `instructores` se ejecutó; con las dos marcas rellenas pero `estado`
// todavía `'pendiente'`, la UI debe leerlo como "confirmado por las 2
// partes, falta que alguien con permiso de equipo lo complete" — no como un
// error ni como "aún no ha confirmado nadie".
export interface FormalizacionNetwork {
  id: string;
  tipoContrato: 'temporal' | 'indefinido';
  estudioConfirmadoEn: string | null;
  instructoraConfirmadaEn: string | null;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
}

// Fase 2 (onboarding con verificación) — datos PRIVADOS de la persona
// (DNI/pasaporte, dirección, fecha de nacimiento). Tabla aparte de
// red_perfiles a propósito (ver la migración red_perfiles_identidad): esa
// tabla da el row completo a cualquier authenticated cuando el perfil está
// publicado, y esto nunca puede llegar ahí. Nunca pasa por
// lib/network/publico.ts.
export interface PerfilIdentidadNetwork {
  perfilId: string;
  apellido1: string | null;
  apellido2: string | null;
  fechaNacimiento: string | null;
  paisResidencia: string | null;
  tipoDocumento: 'DNI' | 'NIE' | 'Pasaporte' | null;
  numeroDocumento: string | null;
  direccionCp: string | null;
  direccionCiudad: string | null;
  direccionProvincia: string | null;
  direccionPais: string | null;
  telefonoVerificadoEn: string | null;
  emailVerificadoEn: string | null;
}

export type CambiosPerfilIdentidadNetwork = Partial<
  Omit<PerfilIdentidadNetwork, 'perfilId' | 'telefonoVerificadoEn' | 'emailVerificadoEn'>
>;

export type EstadoVerificacionDocumento = 'pendiente' | 'en_revision' | 'verificado' | 'rechazado';

// Verificación de identidad por documento (paso 02 del wizard) — una fila
// "viva" (pendiente/en_revision) por perfil; tras un rechazo se inserta una
// nueva, el historial no se sobrescribe (ver índice único parcial en la
// migración). `documentoPath` es una ruta del bucket privado
// red-documentos-identidad, nunca una URL — el documento solo lo puede leer
// el equipo de Tentare, con una URL firmada generada server-side (Fase 3).
export interface VerificacionIdentidadNetwork {
  id: string;
  perfilId: string;
  estado: EstadoVerificacionDocumento;
  motivoRechazo: string | null;
  documentoPath: string;
  creadoEn: string;
  resueltoEn: string | null;
}

// Certificación/formación (paso 06 del wizard) — N filas por perfil, mismo
// ciclo de estados que la verificación de identidad. "Formación verificada"
// solo aparece en el perfil público cuando estado === 'verificado', nunca
// solo por haberla subido (README: "una certificación no se marca verificada
// solo por subirla").
export interface CertificacionNetwork {
  id: string;
  perfilId: string;
  nombre: string;
  institucion: string;
  anio: number | null;
  duracion: string | null;
  documentoPath: string;
  estado: EstadoVerificacionDocumento;
  motivoRechazo: string | null;
  creadoEn: string;
}

export type NuevaCertificacionNetwork = Pick<CertificacionNetwork, 'nombre' | 'institucion' | 'anio' | 'duracion' | 'documentoPath'>;

// Vacantes + candidaturas (Fase 2, "marketplace bidireccional") — un
// estudio publica "Buscamos instructora", una instructora aplica. Sin
// ciudad propia: se lee de studios.ciudad (ver migración).
export interface VacanteNetwork {
  id: string;
  studioId: string;
  titulo: string;
  especialidades: EspecialidadNetwork[];
  horarios: HorarioNetwork[];
  tipoTrabajo: TipoTrabajoNetwork;
  tarifaRango: TarifaRangoNetwork;
  requisitos: string | null;
  descripcion: string | null;
  estado: 'draft' | 'published' | 'closed';
  creadoEn: string;
  actualizadoEn: string;
  cerradoEn: string | null;
  // Solo relleno en el marketplace público / detalle público — el nombre y
  // ciudad del estudio que publica, para no obligar a otro fetch aparte.
  estudioNombre: string | null;
  estudioCiudad: string | null;
  // Solo relleno en "Mis vacantes" (lado estudio): cuántas candidaturas
  // tiene, sin columna contadora nueva — se calcula en la query.
  totalCandidaturas: number | null;
}

export type NuevaVacanteNetwork = Pick<
  VacanteNetwork, 'titulo' | 'especialidades' | 'horarios' | 'tipoTrabajo' | 'tarifaRango' | 'requisitos' | 'descripcion'
>;
export type CambiosVacanteNetwork = Partial<NuevaVacanteNetwork>;

export type EstadoCandidatura = 'recibida' | 'contactada' | 'entrevista' | 'propuesta' | 'aceptada' | 'rechazada' | 'retirada';

export interface CandidaturaNetwork {
  id: string;
  vacanteId: string;
  perfilId: string;
  mensaje: string | null;
  // Solo visible para el estudio — nunca se manda a la instructora.
  notasEstudio: string | null;
  estado: EstadoCandidatura;
  solicitudId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  resueltoEn: string | null;
  // Solo relleno del lado estudio (lista de candidaturas de una vacante).
  perfilNombre: string | null;
  perfilFotoUrl: string | null;
  // Solo relleno del lado instructora (mis candidaturas).
  vacanteTitulo: string | null;
  estudioNombre: string | null;
}
