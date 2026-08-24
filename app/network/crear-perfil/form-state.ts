// Tipos y builders del estado de formulario del wizard de onboarding
// (app/network/crear-perfil). Extraído del componente de página tal cual
// (F0 del roadmap de Tentare Network 2.0: partir el wizard en componentes
// por paso sin cambiar comportamiento) — ni la forma ni la lógica de estos
// builders cambia, solo su fichero.
import type { PerfilNetwork, PerfilIdentidadNetwork } from '@/lib/network/tipos';

export interface FormState {
  ciudad: string; zona: string; radioKm: string;
  especialidades: PerfilNetwork['especialidades'];
  aniosExperiencia: string;
  tarifaRango: PerfilNetwork['tarifaRango'] | undefined;
  disponibilidadEstado: PerfilNetwork['disponibilidadEstado'];
  disponibilidadHorarios: PerfilNetwork['disponibilidadHorarios'];
  tipoTrabajo: PerfilNetwork['tipoTrabajo'];
  descripcion: string;
  idiomasTexto: string;
  instagram: string; linkedin: string; web: string;
}

export function formVacio(): FormState {
  return {
    ciudad: '', zona: '', radioKm: '', especialidades: [], aniosExperiencia: '',
    tarifaRango: undefined, disponibilidadEstado: 'no_disponible', disponibilidadHorarios: [], tipoTrabajo: [],
    descripcion: '', idiomasTexto: '', instagram: '', linkedin: '', web: '',
  };
}

export function formDesdePerfil(p: PerfilNetwork): FormState {
  return {
    ciudad: p.ciudad ?? '', zona: p.zona ?? '', radioKm: p.radioKm != null ? String(p.radioKm) : '',
    especialidades: p.especialidades, aniosExperiencia: p.aniosExperiencia != null ? String(p.aniosExperiencia) : '',
    tarifaRango: p.tarifaRango ?? undefined, disponibilidadEstado: p.disponibilidadEstado,
    disponibilidadHorarios: p.disponibilidadHorarios, tipoTrabajo: p.tipoTrabajo,
    descripcion: p.descripcion ?? '', idiomasTexto: p.idiomas.join(', '),
    instagram: p.instagram ?? '', linkedin: p.linkedin ?? '', web: p.web ?? '',
  };
}

export interface IdentidadForm {
  apellido1: string; apellido2: string; fechaNacimiento: string; paisResidencia: string;
  tipoDocumento: 'DNI' | 'NIE' | 'Pasaporte' | ''; numeroDocumento: string;
  direccionCp: string; direccionCiudad: string; direccionProvincia: string; direccionPais: string;
}

export function identidadVacia(): IdentidadForm {
  return {
    apellido1: '', apellido2: '', fechaNacimiento: '', paisResidencia: '',
    tipoDocumento: '', numeroDocumento: '', direccionCp: '', direccionCiudad: '', direccionProvincia: '', direccionPais: '',
  };
}

export function identidadDesdeApi(i: PerfilIdentidadNetwork): IdentidadForm {
  return {
    apellido1: i.apellido1 ?? '', apellido2: i.apellido2 ?? '', fechaNacimiento: i.fechaNacimiento ?? '',
    paisResidencia: i.paisResidencia ?? '', tipoDocumento: i.tipoDocumento ?? '', numeroDocumento: i.numeroDocumento ?? '',
    direccionCp: i.direccionCp ?? '', direccionCiudad: i.direccionCiudad ?? '', direccionProvincia: i.direccionProvincia ?? '',
    direccionPais: i.direccionPais ?? '',
  };
}
