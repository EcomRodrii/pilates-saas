// Fila de Postgres (snake_case) ↔ PerfilNetwork (camelCase). Mismo patrón
// que el resto del repo (p.ej. mapInstructorPublico en supabase-data-admin).
import type {
  PerfilNetwork, PerfilNetworkPublico, ExperienciaNetwork, ExperienciaNetworkPublica,
} from './tipos.ts';

export interface FilaRedPerfil {
  id: string;
  auth_user_id: string;
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
  identidad_verificada_en: string | null;
  creado_en: string;
  actualizado_en: string;
  ultimo_acceso_en: string | null;
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
    identidadVerificadaEn: f.identidad_verificada_en,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    ultimoAccesoEn: f.ultimo_acceso_en,
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

export function mapFilaAPerfilPublico(f: FilaRedPerfilPublica, experienciaVerificada: boolean): PerfilNetworkPublico {
  return {
    id: f.id,
    experienciaVerificada,
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
    identidadVerificadaEn: f.identidad_verificada_en,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
    ultimoAccesoEn: f.ultimo_acceso_en,
  };
}
