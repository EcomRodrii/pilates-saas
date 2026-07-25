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

async function pedir<T>(ruta: string): Promise<T> {
  const res = await fetch(`/api/interno${ruta}`, { headers: await authHeader() });
  if (res.status === 401) throw new SinAcceso('no-eres-del-equipo', 'Esta zona es solo para el equipo de Tentare.');
  if (res.status === 403) {
    const cuerpo = await res.json().catch(() => ({ error: '' }));
    throw new SinAcceso('te-falta-permiso', cuerpo.error || 'No tienes permiso para ver esto.');
  }
  if (!res.ok) throw new Error(`No se ha podido cargar (${res.status}).`);
  return res.json() as Promise<T>;
}

export interface SesionInterna {
  nombre: string; cargo: string | null; email: string; permisos: string[];
}

export interface Kpis {
  estudios: { total: number; conActividad: number; vacios: number; altasUltimos30d: number };
  ingresos: { mrr: number; arr: number; estudiosDePago: number; fuente: string };
  actividad: { socias: number; clases: number; reservasHoy: number; reservas7d: number; reservas30d: number };
  altasPorMes: Array<{ mes: string; altas: number }>;
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
  uso: { socias: number; clases: number; reservas30d: number; facturacionPropia30d: number };
  equipo: Array<{ nombre: string; rol: string; activo: boolean; tieneCuenta: boolean }>;
}

export const fetchSesionInterna = () => pedir<SesionInterna>('/sesion');
export const fetchKpis = () => pedir<Kpis>('/kpis');
export const fetchEstudios = (q = '') => pedir<{ estudios: EstudioFila[] }>(`/estudios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const fetchFichaEstudio = (id: string) => pedir<FichaEstudio>(`/estudios/${id}`);
