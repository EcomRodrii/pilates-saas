// Fila de Postgres (snake_case) ↔ PerfilNetwork (camelCase). Mismo patrón
// que el resto del repo (p.ej. mapInstructorPublico en supabase-data-admin).
import type {
  PerfilNetwork, PerfilNetworkPublico, ExperienciaNetwork, ExperienciaNetworkPublica, ResumenResenas,
  PerfilIdentidadNetwork, VerificacionIdentidadNetwork, CertificacionNetwork,
  VacanteNetwork, CandidaturaNetwork, ReferenciaNetwork, MediaNetwork,
} from './tipos.ts';

export interface FilaRedPerfil {
  id: string;
  auth_user_id: string;
  slug: string | null;
  nombre: string;
  foto_url: string | null;
  ciudad: string | null;
  zona: string | null;
  radio_km: number | null;
  descripcion: string | null;
  especialidades: string[];
  anios_experiencia: number | null;
  tarifa_rango: string | null;
  disponibilidad_estado: string;
  disponibilidad_horarios: string[];
  tipo_trabajo: string[];
  email_contacto: string | null;
  telefono_contacto: string | null;
  estado: string;
  destacado: boolean;
  identidad_verificada_en: string | null;
  creado_en: string;
  actualizado_en: string;
  ultimo_acceso_en: string | null;
  idiomas: string[];
  instagram: string | null;
  linkedin: string | null;
  web: string | null;
  mostrar_estudios_actuales: boolean;
  lat: number | null;
  lng: number | null;
}

// Subconjunto público: el endpoint de búsqueda ni siquiera consulta
// email_contacto/telefono_contacto/auth_user_id (ver
// app/api/network/buscar/route.ts, SELECT_COLUMNAS_PUBLICAS) — esta fila no
// tiene esas columnas, no es que se descarten aquí.
export type FilaRedPerfilPublica = Omit<FilaRedPerfil, 'auth_user_id' | 'email_contacto' | 'telefono_contacto'>;

export function mapFilaAPerfil(f: FilaRedPerfil): PerfilNetwork {
  return {
    id: f.id,
    authUserId: f.auth_user_id,
    slug: f.slug,
    nombre: f.nombre,
    fotoUrl: f.foto_url,
    ciudad: f.ciudad,
    zona: f.zona,
    radioKm: f.radio_km,
    descripcion: f.descripcion,
    especialidades: f.especialidades as PerfilNetwork['especialidades'],
    aniosExperiencia: f.anios_experiencia,
    tarifaRango: f.tarifa_rango as PerfilNetwork['tarifaRango'],
    disponibilidadEstado: f.disponibilidad_estado as PerfilNetwork['disponibilidadEstado'],
    disponibilidadHorarios: f.disponibilidad_horarios as PerfilNetwork['disponibilidadHorarios'],
    tipoTrabajo: f.tipo_trabajo as PerfilNetwork['tipoTrabajo'],
    emailContacto: f.email_contacto,
    telefonoContacto: f.telefono_contacto,
    estado: f.estado as PerfilNetwork['estado'],
    destacado: f.destacado,
    identidadVerificadaEn: f.identidad_verificada_en,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    ultimoAccesoEn: f.ultimo_acceso_en,
    idiomas: f.idiomas,
    instagram: f.instagram,
    linkedin: f.linkedin,
    web: f.web,
    mostrarEstudiosActuales: f.mostrar_estudios_actuales,
    lat: f.lat,
    lng: f.lng,
  };
}

export interface FilaRedExperiencia {
  id: string;
  perfil_id: string;
  studio_id: string | null;
  nombre_estudio: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  especialidades: string[];
  descripcion: string | null;
  estado_verificacion: string;
  creado_en: string;
}

export function mapFilaAExperiencia(f: FilaRedExperiencia): ExperienciaNetwork {
  return {
    id: f.id,
    perfilId: f.perfil_id,
    studioId: f.studio_id,
    nombreEstudio: f.nombre_estudio,
    fechaInicio: f.fecha_inicio,
    fechaFin: f.fecha_fin,
    especialidades: f.especialidades as ExperienciaNetwork['especialidades'],
    descripcion: f.descripcion,
    estadoVerificacion: f.estado_verificacion as ExperienciaNetwork['estadoVerificacion'],
    creadoEn: f.creado_en,
  };
}

export function mapFilaAExperienciaPublica(f: Omit<FilaRedExperiencia, 'perfil_id'>): ExperienciaNetworkPublica {
  return {
    id: f.id,
    studioId: f.studio_id,
    nombreEstudio: f.nombre_estudio,
    fechaInicio: f.fecha_inicio,
    fechaFin: f.fecha_fin,
    especialidades: f.especialidades as ExperienciaNetworkPublica['especialidades'],
    descripcion: f.descripcion,
    estadoVerificacion: f.estado_verificacion as ExperienciaNetworkPublica['estadoVerificacion'],
    creadoEn: f.creado_en,
  };
}

// Fila de red_perfil_media. `path` NUNCA sale de este módulo hacia el
// cliente (es la clave del objeto en el bucket privado) — mapFilaAMedia
// recibe la URL firmada aparte y no toca `path`.
export interface FilaRedPerfilMedia {
  id: string;
  perfil_id: string;
  path: string;
  orden: number;
  creado_en: string;
}

export function mapFilaAMedia(f: Pick<FilaRedPerfilMedia, 'id' | 'orden'>, url: string): MediaNetwork {
  return { id: f.id, url, orden: f.orden };
}

export interface FilaRedReferencia {
  id: string;
  perfil_id: string;
  nombre_referente: string;
  email_referente: string;
  relacion: string | null;
  estado: string;
  solicitado_en: string;
  resuelto_en: string | null;
}

export function mapFilaAReferencia(f: FilaRedReferencia): ReferenciaNetwork {
  return {
    id: f.id,
    perfilId: f.perfil_id,
    nombreReferente: f.nombre_referente,
    emailReferente: f.email_referente,
    relacion: f.relacion,
    estado: f.estado as ReferenciaNetwork['estado'],
    solicitadoEn: f.solicitado_en,
    resueltoEn: f.resuelto_en,
  };
}

export function mapFilaAPerfilPublico(
  f: FilaRedPerfilPublica, experienciaVerificada: boolean, resumenResenas: ResumenResenas = { promedio: null, total: 0 },
  certificacionVerificada = false, referenciaProfesional = false,
): PerfilNetworkPublico {
  return {
    id: f.id,
    slug: f.slug,
    experienciaVerificada,
    certificacionVerificada,
    referenciaProfesional,
    resumenResenas,
    nombre: f.nombre,
    fotoUrl: f.foto_url,
    ciudad: f.ciudad,
    zona: f.zona,
    radioKm: f.radio_km,
    descripcion: f.descripcion,
    especialidades: f.especialidades as PerfilNetworkPublico['especialidades'],
    aniosExperiencia: f.anios_experiencia,
    tarifaRango: f.tarifa_rango as PerfilNetworkPublico['tarifaRango'],
    disponibilidadEstado: f.disponibilidad_estado as PerfilNetworkPublico['disponibilidadEstado'],
    disponibilidadHorarios: f.disponibilidad_horarios as PerfilNetworkPublico['disponibilidadHorarios'],
    tipoTrabajo: f.tipo_trabajo as PerfilNetworkPublico['tipoTrabajo'],
    estado: f.estado as PerfilNetworkPublico['estado'],
    destacado: f.destacado,
    identidadVerificadaEn: f.identidad_verificada_en,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    ultimoAccesoEn: f.ultimo_acceso_en,
    idiomas: f.idiomas,
    instagram: f.instagram,
    linkedin: f.linkedin,
    web: f.web,
    lat: f.lat,
    lng: f.lng,
  };
}

// ── Fase 2: verificación de identidad y certificaciones ──────────────────

export interface FilaRedPerfilIdentidad {
  perfil_id: string;
  apellido1: string | null;
  apellido2: string | null;
  fecha_nacimiento: string | null;
  pais_residencia: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  direccion_cp: string | null;
  direccion_ciudad: string | null;
  direccion_provincia: string | null;
  direccion_pais: string | null;
  telefono_verificado_en: string | null;
  email_verificado_en: string | null;
}

export function mapFilaAPerfilIdentidad(f: FilaRedPerfilIdentidad): PerfilIdentidadNetwork {
  return {
    perfilId: f.perfil_id,
    apellido1: f.apellido1,
    apellido2: f.apellido2,
    fechaNacimiento: f.fecha_nacimiento,
    paisResidencia: f.pais_residencia,
    tipoDocumento: f.tipo_documento as PerfilIdentidadNetwork['tipoDocumento'],
    numeroDocumento: f.numero_documento,
    direccionCp: f.direccion_cp,
    direccionCiudad: f.direccion_ciudad,
    direccionProvincia: f.direccion_provincia,
    direccionPais: f.direccion_pais,
    telefonoVerificadoEn: f.telefono_verificado_en,
    emailVerificadoEn: f.email_verificado_en,
  };
}

export interface FilaRedVerificacionIdentidad {
  id: string;
  perfil_id: string;
  estado: string;
  motivo_rechazo: string | null;
  documento_path: string;
  documento_path_reverso: string | null;
  creado_en: string;
  resuelto_en: string | null;
}

export function mapFilaAVerificacionIdentidad(f: FilaRedVerificacionIdentidad): VerificacionIdentidadNetwork {
  return {
    id: f.id,
    perfilId: f.perfil_id,
    estado: f.estado as VerificacionIdentidadNetwork['estado'],
    motivoRechazo: f.motivo_rechazo,
    documentoPath: f.documento_path,
    documentoPathReverso: f.documento_path_reverso,
    creadoEn: f.creado_en,
    resueltoEn: f.resuelto_en,
  };
}

export interface FilaRedCertificacion {
  id: string;
  perfil_id: string;
  nombre: string;
  institucion: string;
  anio: number | null;
  duracion: string | null;
  documento_path: string;
  estado: string;
  motivo_rechazo: string | null;
  creado_en: string;
}

export function mapFilaACertificacion(f: FilaRedCertificacion): CertificacionNetwork {
  return {
    id: f.id,
    perfilId: f.perfil_id,
    nombre: f.nombre,
    institucion: f.institucion,
    anio: f.anio,
    duracion: f.duracion,
    documentoPath: f.documento_path,
    estado: f.estado as CertificacionNetwork['estado'],
    motivoRechazo: f.motivo_rechazo,
    creadoEn: f.creado_en,
  };
}

// ── Fase 2: vacantes y candidaturas ───────────────────────────────────────

export interface FilaRedVacante {
  id: string;
  studio_id: string;
  titulo: string;
  especialidades: string[];
  horarios: string[];
  tipo_trabajo: string;
  tarifa_rango: string;
  requisitos: string | null;
  descripcion: string;
  estado: string;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
}

export function mapFilaAVacante(
  f: FilaRedVacante, extra: { estudioNombre?: string | null; estudioCiudad?: string | null; totalCandidaturas?: number | null } = {},
): VacanteNetwork {
  return {
    id: f.id,
    studioId: f.studio_id,
    titulo: f.titulo,
    especialidades: f.especialidades as VacanteNetwork['especialidades'],
    horarios: f.horarios as VacanteNetwork['horarios'],
    tipoTrabajo: f.tipo_trabajo as VacanteNetwork['tipoTrabajo'],
    tarifaRango: f.tarifa_rango as VacanteNetwork['tarifaRango'],
    requisitos: f.requisitos,
    descripcion: f.descripcion,
    estado: f.estado as VacanteNetwork['estado'],
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    cerradoEn: f.cerrado_en,
    estudioNombre: extra.estudioNombre ?? null,
    estudioCiudad: extra.estudioCiudad ?? null,
    totalCandidaturas: extra.totalCandidaturas ?? null,
  };
}

export interface FilaRedCandidatura {
  id: string;
  vacante_id: string;
  perfil_id: string;
  mensaje: string | null;
  notas_estudio: string | null;
  estado: string;
  solicitud_id: string | null;
  creado_en: string;
  actualizado_en: string;
  resuelto_en: string | null;
}

export function mapFilaACandidatura(
  f: FilaRedCandidatura,
  extra: { perfilNombre?: string | null; perfilFotoUrl?: string | null; vacanteTitulo?: string | null; estudioNombre?: string | null; ocultarNotasEstudio?: boolean } = {},
): CandidaturaNetwork {
  return {
    id: f.id,
    vacanteId: f.vacante_id,
    perfilId: f.perfil_id,
    mensaje: f.mensaje,
    notasEstudio: extra.ocultarNotasEstudio ? null : f.notas_estudio,
    estado: f.estado as CandidaturaNetwork['estado'],
    solicitudId: f.solicitud_id,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    resueltoEn: f.resuelto_en,
    perfilNombre: extra.perfilNombre ?? null,
    perfilFotoUrl: extra.perfilFotoUrl ?? null,
    vacanteTitulo: extra.vacanteTitulo ?? null,
    estudioNombre: extra.estudioNombre ?? null,
  };
}
