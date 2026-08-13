// Cliente del panel interno: envuelve fetch con la cabecera Authorization y
// convierte los códigos de estado en mensajes que se entienden. Distinguir 401
// de 403 importa: "no eres del equipo" y "esto no te toca" se arreglan de forma
// muy distinta.
import { authHeader } from '../api-client.ts';

export class SinAcceso extends Error {
  constructor(public readonly tipo: 'no-eres-del-equipo' | 'te-falta-permiso', mensaje: string) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/interno${ruta}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader()) },
  });
  if (res.status === 401) throw new SinAcceso('no-eres-del-equipo', 'Esta zona es solo para el equipo de Tentare.');
  if (res.status === 403) {
    const cuerpo = await res.json().catch(() => ({ error: '' }));
    throw new SinAcceso('te-falta-permiso', cuerpo.error || 'No tienes permiso para ver esto.');
  }
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({ error: '' }));
    throw new Error(cuerpo.error || `No se ha podido completar (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export interface SesionInterna {
  nombre: string; cargo: string | null; email: string; permisos: string[];
}

export interface Kpis {
  estudios: { total: number; conActividad: number; vacios: number; altasUltimos30d: number; suspendidos: number };
  actividad: { socias: number; clases: number; reservasHoy: number; reservas7d: number; reservas30d: number };
  altasPorMes: Array<{ mes: string; altas: number }>;
  onboarding: {
    activados: number;
    totalConActividad: number;
    pasoMasBloqueante: { id: string; label: string; pendientes: number } | null;
  };
}

export interface LineaFacturacionCliente {
  tipo: 'estudio' | 'cadena';
  id: string; nombre: string; sedes: number;
  planEnBd: string | null; estadoEnBd: string | null;
  estado: 'pagando' | 'en_prueba' | 'impago' | 'cancelado' | 'manual' | 'descuadre';
  eurosMes: number; renuevaEl: string | null; diasDePrueba: number | null;
  stripeCustomerId: string | null; motivoDescuadre: string | null;
}

export interface Facturacion {
  lineas: LineaFacturacionCliente[];
  mrrEuros: number; mrrEnPruebaEuros: number;
  pagando: number; enPrueba: number; impagos: number; manuales: number; descuadres: number;
  pruebasQueAcaban: LineaFacturacionCliente[];
  stripeDisponible: boolean;
  /** Por qué no se pudo preguntar a Stripe. null si se preguntó bien. */
  avisoStripe: string | null;
  suscripcionesEnStripe: number;
}

export interface EstudioFila {
  id: string; slug: string; nombre: string; plan: string;
  email: string | null; telefono: string | null; creadoEn: string;
  tieneClienteStripe: boolean; socias: number; clases: number; equipo: number;
  ultimaClase: string | null; vacio: boolean;
}

export interface FichaEstudio {
  estudio: { id: string; slug: string; nombre: string; plan: string; email: string | null; telefono: string | null; direccion: string | null; creadoEn: string };
  duena: { email: string | null; ultimoAcceso: string | null; alta: string | null } | null;
  pagos: { tieneClienteStripe: boolean; clienteStripeId: string | null; cobraConStripeConnect: boolean };
  suspension: { suspendido: boolean; desde: string | null; motivo: string | null };
  uso: { socias: number; clases: number; reservas30d: number; facturacionPropia30d: number };
  equipo: Array<{ nombre: string; rol: string; activo: boolean; tieneCuenta: boolean }>;
}

export const fetchSesionInterna = () => pedir<SesionInterna>('/sesion');
export const fetchKpis = () => pedir<Kpis>('/kpis');
export const fetchFacturacion = () => pedir<Facturacion>('/facturacion');
export const fetchEstudios = (q = '') => pedir<{ estudios: EstudioFila[] }>(`/estudios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const fetchFichaEstudio = (id: string) => pedir<FichaEstudio>(`/estudios/${id}`);

export interface MiembroEquipo {
  userId: string; email: string | null; nombre: string; cargo: string | null;
  activo: boolean; creadoEn: string; ultimoAcceso: string | null; permisos: string[];
}

export const fetchEquipo = () => pedir<{ equipo: MiembroEquipo[]; yo: string }>('/equipo');

export const altaEnEquipo = (
  cuerpo: { email: string; nombre: string; cargo: string; permisos: string[]; password?: string },
) => pedir<{ ok: true; userId: string; cuentaCreada: boolean }>('/equipo', {
  method: 'POST', body: JSON.stringify(cuerpo),
});

export const cambiarMiembro = (userId: string, cuerpo: { activo?: boolean; permisos?: string[]; cargo?: string | null }) =>
  pedir<{ ok: true; sinCambios: boolean }>(`/equipo/${userId}`, { method: 'PATCH', body: JSON.stringify(cuerpo) });

export interface EstudioOrigen {
  id: string; nombre: string; comoNosConocio: string | null; creadoEn: string;
}

export interface Crecimiento {
  leads: import('./crecimiento.ts').Lead[];
  estudios: EstudioOrigen[];
  peticiones: import('./crecimiento.ts').Peticion[];
}

export const fetchCrecimiento = () => pedir<Crecimiento>('/crecimiento');

export const guardarLead = (cuerpo: Record<string, unknown>) =>
  pedir<{ ok: true; id: string }>('/crecimiento', { method: 'POST', body: JSON.stringify(cuerpo) });

export interface EntradaAuditoria {
  id: number; ocurrido_en: string; actor_nombre: string; accion: string;
  objetivo_tipo: string | null; objetivo_id: string | null; resumen: string;
  antes: unknown; despues: unknown; ip: string | null; user_agent: string | null;
}

export const fetchAuditoria = (objetivoId?: string) =>
  pedir<{ entradas: EntradaAuditoria[] }>(`/auditoria${objetivoId ? `?objetivoId=${encodeURIComponent(objetivoId)}` : ''}`);

// Acciones sobre un estudio. Devuelven el error del servidor tal cual: los
// mensajes ya están escritos para leerse ("Escribe un motivo de al menos…").
export const accionEstudio = (id: string, cuerpo: Record<string, unknown>) =>
  pedir<{ ok: true; avisoStripe?: boolean }>(`/estudios/${id}/acciones`, {
    method: 'POST', body: JSON.stringify(cuerpo),
  });

// Changelog de "Actualizaciones" — antes lib/novedades.ts hardcodeado.
export type EtiquetaCambio = 'NUEVA_FUNCIONALIDAD' | 'MEJORA' | 'RENDIMIENTO' | 'ARREGLO';

export interface CambioChangelog {
  id: string; etiqueta: EtiquetaCambio; texto: string; orden: number;
}

export interface VersionChangelog {
  id: string; version: string; titulo: string; fecha_publicacion: string;
  estado: 'borrador' | 'publicado'; publicado_en: string | null;
  changelog_cambios: CambioChangelog[];
}

export const fetchChangelog = () => pedir<{ versiones: VersionChangelog[] }>('/changelog');

export const crearVersionChangelog = (cuerpo: { version: string; titulo: string; fechaPublicacion: string }) =>
  pedir<{ ok: true; id: string }>('/changelog', { method: 'POST', body: JSON.stringify(cuerpo) });

export const guardarVersionChangelog = (
  id: string,
  cuerpo: { version?: string; titulo?: string; fechaPublicacion?: string; cambios?: Array<{ texto: string; etiqueta: EtiquetaCambio }> },
) => pedir<{ ok: true }>(`/changelog/${id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) });

export const publicarVersionChangelog = (id: string) =>
  pedir<{ ok: true }>(`/changelog/${id}`, { method: 'PATCH', body: JSON.stringify({ publicar: true }) });

export const borrarVersionChangelog = (id: string) =>
  pedir<{ ok: true }>(`/changelog/${id}`, { method: 'DELETE' });

// Moderación de Tentare Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §10.
export interface PerfilNetworkInterno {
  id: string; nombre: string; ciudad: string | null; estado: string; destacado: boolean;
  creado_en: string; actualizado_en: string; ultimo_acceso_en: string | null;
}
export const fetchPerfilesNetworkInterno = (params: { q?: string; estado?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.estado) qs.set('estado', params.estado);
  return pedir<{ perfiles: PerfilNetworkInterno[] }>(`/network/perfiles?${qs.toString()}`);
};
export const cambiarEstadoPerfilNetworkInterno = (id: string, estado: string) =>
  pedir<{ ok: true }>('/network/perfiles', { method: 'PATCH', body: JSON.stringify({ id, estado }) });
export const destacarPerfilNetworkInterno = (id: string, destacado: boolean) =>
  pedir<{ ok: true }>('/network/perfiles', { method: 'PATCH', body: JSON.stringify({ id, destacado }) });

export interface VerificacionNetworkInterna {
  id: string; estado: string; solicitadoEn: string; resueltoEn: string | null;
  estudioNombre: string; profesionalNombre: string;
}
export const fetchVerificacionesNetworkInterno = (estado: string) =>
  pedir<{ verificaciones: VerificacionNetworkInterna[] }>(`/network/verificaciones?estado=${encodeURIComponent(estado)}`);

export interface ReporteNetworkInterno {
  id: string; motivo: string; detalle: string | null; estado: string;
  creadoEn: string; revisadoEn: string | null; perfilId: string | null; perfilNombre: string;
}
export const fetchReportesNetworkInterno = (estado: string) =>
  pedir<{ reportes: ReporteNetworkInterno[] }>(`/network/reportes?estado=${encodeURIComponent(estado)}`);
export const resolverReporteNetworkInterno = (id: string, estado: 'revisado' | 'resuelto') =>
  pedir<{ ok: true }>('/network/reportes', { method: 'PATCH', body: JSON.stringify({ id, estado }) });

export interface ResenaNetworkInterna {
  id: string; puntuacion: number; comentario: string | null; estado: string;
  creadoEn: string; perfilId: string | null; perfilNombre: string; estudioNombre: string;
}
export const fetchResenasNetworkInterno = (estado: string) =>
  pedir<{ resenas: ResenaNetworkInterna[] }>(`/network/resenas?estado=${encodeURIComponent(estado)}`);
export const moderarResenaNetworkInterno = (id: string, estado: 'publicada' | 'oculta') =>
  pedir<{ ok: true }>('/network/resenas', { method: 'PATCH', body: JSON.stringify({ id, estado }) });

// Fase 3 del rediseño de Tentare Network — a diferencia de
// VerificacionNetworkInterna (solo lectura, resuelve el estudio), estas dos
// colas SÍ las resuelve el equipo de Tentare: documento de identidad y
// certificaciones, ambas con motivo obligatorio al rechazar.
export interface VerificacionIdentidadNetworkInterna {
  id: string; estado: string; motivoRechazo: string | null;
  creadoEn: string; resueltoEn: string | null;
  perfilId: string | null; perfilNombre: string; perfilSlug: string | null;
}
export const fetchVerificacionesIdentidadNetworkInterno = (estado: string) =>
  pedir<{ verificaciones: VerificacionIdentidadNetworkInterna[] }>(`/network/verificaciones-identidad?estado=${encodeURIComponent(estado)}`);
export const resolverVerificacionIdentidadNetworkInterno = (id: string, aprobar: boolean, motivo?: string) =>
  pedir<{ ok: true }>('/network/verificaciones-identidad', { method: 'PATCH', body: JSON.stringify({ id, aprobar, motivo }) });

export interface CertificacionNetworkInterna {
  id: string; nombre: string; institucion: string; anio: number | null; duracion: string | null;
  estado: string; motivoRechazo: string | null; creadoEn: string; resueltoEn: string | null;
  perfilId: string | null; perfilNombre: string; perfilSlug: string | null;
}
export const fetchCertificacionesNetworkInterno = (estado: string) =>
  pedir<{ certificaciones: CertificacionNetworkInterna[] }>(`/network/certificaciones?estado=${encodeURIComponent(estado)}`);
export const resolverCertificacionNetworkInterno = (id: string, aprobar: boolean, motivo?: string) =>
  pedir<{ ok: true }>('/network/certificaciones', { method: 'PATCH', body: JSON.stringify({ id, aprobar, motivo }) });

// URL firmada de 5 min — se pide bajo demanda (clic en "Ver documento"), no
// al cargar la lista: el bucket no tiene SELECT para nadie salvo
// service-role, así que cada vista del documento es una llamada nueva.
export const obtenerUrlDocumentoNetworkInterno = (id: string, tipo: 'identidad' | 'certificacion') =>
  pedir<{ url: string }>(`/network/verificaciones-identidad/documento?id=${encodeURIComponent(id)}&tipo=${tipo}`);

export interface AnaliticaNetwork {
  perfiles: {
    total: number; publicados: number; borradores: number; suspendidos: number; ocultos: number;
    altasUltimos30d: number; activosUltimos30d: number;
  };
  solicitudes: { total: number; pendientes: number; aceptadas: number; rechazadas: number; tasaAceptacion: number | null };
  resenas: { total: number; publicadas: number; pendientes: number; promedioGeneral: number | null };
  altasPorMes: Array<{ mes: string; altas: number }>;
}
export const fetchAnaliticaNetworkInterno = () => pedir<AnaliticaNetwork>('/network/analitica');
