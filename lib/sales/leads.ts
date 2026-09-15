// CRUD y lógica de negocio para sales leads
// Fase 1: operaciones básicas del CRM

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types.ts';

type SalesLead = Database['public']['Tables']['sales_leads']['Row'];
type SalesLeadInsert = Database['public']['Tables']['sales_leads']['Insert'];
type SalesLeadUpdate = Database['public']['Tables']['sales_leads']['Update'];

export interface ListLeadsOptions {
  estado?: SalesLead['estado'];
  owner_id?: string;
  studio_id?: string | null;
  ciudad?: string;
  search?: string; // búsqueda en nombre estudio + ciudad
  limit?: number;
  offset?: number;
}

export interface MoveLeadOptions {
  lead_id: string;
  nuevo_estado: SalesLead['estado'];
  actor_id: string;
  notas?: string;
}

/**
 * Normalizar email: lowercase, trim
 */
export function normalizarEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalizar teléfono a E.164 (básico: solo España)
 * +34 XXX XXX XXX → +34XXXXXXXXX
 * 0034 XXX XXX → +34XXXXXXXXX
 * 0 XXX XXX → +34XXXXXXXXX
 */
export function normalizarTelefono(telefono: string | undefined | null): string | null {
  if (!telefono) return null;
  const limpio = telefono.replace(/\D/g, '');
  if (!limpio) return null;

  // Remover prefijo 0034 (formato antiguo español con dos ceros)
  if (limpio.startsWith('0034')) return `+34${limpio.slice(4)}`;

  // Ya empieza con 34 (vino como +34)
  if (limpio.startsWith('34')) return `+${limpio}`;

  // Empieza con 0 (vino como 0 XXX XXX)
  if (limpio.startsWith('0')) return `+34${limpio.slice(1)}`;

  // Cualquier otro caso: asumir es local sin prefijo
  return `+34${limpio}`;
}

/**
 * Extraer dominio de URL
 */
export function extraerDominio(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Crear un lead nuevo
 */
export async function crearLead(
  admin: ReturnType<typeof createClient<Database>>,
  data: {
    email: string;
    estudio_nombre?: string | null;
    nombre_contacto?: string | null;
    telefono?: string | null;
    ciudad?: string | null;
    origen?: SalesLeadInsert['origen'];
    source_url?: string | null;
    owner_id?: string | null;
  }
): Promise<SalesLead> {
  const normalizado: SalesLeadInsert = {
    email: normalizarEmail(data.email),
    estudio_nombre: data.estudio_nombre || null,
    nombre_contacto: data.nombre_contacto || null,
    telefono: data.telefono || null,
    phone_normalized: normalizarTelefono(data.telefono),
    ciudad: data.ciudad || null,
    origen: data.origen || 'MANUAL',
    source_url: data.source_url || null,
    owner_id: data.owner_id || null,
    estado: 'NUEVO',
    email_status: 'UNKNOWN',
  };

  const { data: lead, error } = await admin
    .from('sales_leads')
    .insert([normalizado])
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear el lead: ${error.message}`);
  return lead;
}

/**
 * Obtener un lead por ID
 */
export async function obtenerLead(
  admin: ReturnType<typeof createClient<Database>>,
  lead_id: string
): Promise<SalesLead | null> {
  const { data, error } = await admin
    .from('sales_leads')
    .select('*')
    .eq('id', lead_id)
    .eq('borrado_en', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no encontrado
    throw error;
  }
  return data;
}

/**
 * Listar leads con filtros
 */
export async function listarLeads(
  admin: ReturnType<typeof createClient<Database>>,
  opciones: ListLeadsOptions = {}
): Promise<{ leads: SalesLead[]; total: number }> {
  const limit = opciones.limit || 50;
  const offset = opciones.offset || 0;

  let query = admin
    .from('sales_leads')
    .select('*', { count: 'exact' })
    .eq('borrado_en', null);

  if (opciones.estado) {
    query = query.eq('estado', opciones.estado);
  }
  if (opciones.owner_id) {
    query = query.eq('owner_id', opciones.owner_id);
  }
  if (opciones.studio_id !== undefined) {
    if (opciones.studio_id === null) {
      query = query.is('studio_id', null);
    } else {
      query = query.eq('studio_id', opciones.studio_id);
    }
  }
  if (opciones.ciudad) {
    query = query.eq('ciudad', opciones.ciudad);
  }

  // Búsqueda full-text
  if (opciones.search) {
    query = query.or(`estudio_nombre.ilike.%${opciones.search}%,ciudad.ilike.%${opciones.search}%`);
  }

  query = query
    .order('creado_en', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`No se pudieron listar leads: ${error.message}`);

  return {
    leads: data || [],
    total: count || 0,
  };
}

/**
 * Mover lead entre estados (con validación de transición)
 */
export async function moverLead(
  admin: ReturnType<typeof createClient<Database>>,
  opciones: MoveLeadOptions
): Promise<SalesLead> {
  // Validación: transiciones permitidas
  const transicionesValidas: Record<string, string[]> = {
    NUEVO: ['INVESTIGANDO', 'NO_CONTACTAR', 'INVALID'],
    INVESTIGANDO: ['LISTO', 'NO_CONTACTAR', 'NO_INTERESADO'],
    LISTO: ['CONTACTADO', 'NO_CONTACTAR'],
    CONTACTADO: ['RESPONDIO', 'NO_INTERESADO', 'BOUNCE'],
    RESPONDIO: ['INTERESADO', 'NO_INTERESADO', 'DEMO'],
    INTERESADO: ['DEMO', 'TRIAL', 'NO_INTERESADO'],
    DEMO: ['TRIAL', 'NO_INTERESADO'],
    TRIAL: ['CLIENTE', 'NO_INTERESADO'],
    CLIENTE: [], // estado terminal
    NO_INTERESADO: [], // estado terminal
    NO_CONTACTAR: [], // estado terminal
    BOUNCE: [], // estado terminal
    UNSUBSCRIBED: [], // estado terminal
    INVALID: [], // estado terminal
  };

  // Obtener estado actual
  const lead = await obtenerLead(admin, opciones.lead_id);
  if (!lead) throw new Error('Lead no encontrado');

  const transiciones = transicionesValidas[lead.estado] || [];
  if (!transiciones.includes(opciones.nuevo_estado)) {
    throw new Error(
      `Transición no permitida: ${lead.estado} → ${opciones.nuevo_estado}`
    );
  }

  // Actualizar
  const { data, error } = await admin
    .from('sales_leads')
    .update({
      estado: opciones.nuevo_estado,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', opciones.lead_id)
    .select()
    .single();

  if (error) throw new Error(`No se pudo mover el lead: ${error.message}`);

  // Log event
  await crearEvento(admin, {
    lead_id: opciones.lead_id,
    tipo: 'LEAD_MOVED',
    actor_id: opciones.actor_id,
    detalles: {
      de: lead.estado,
      a: opciones.nuevo_estado,
      notas: opciones.notas,
    },
  });

  return data;
}

/**
 * Actualizar campos de un lead
 */
export async function actualizarLead(
  admin: ReturnType<typeof createClient<Database>>,
  lead_id: string,
  datos: SalesLeadUpdate,
  actor_id?: string
): Promise<SalesLead> {
  const actualizado: SalesLeadUpdate = {
    ...datos,
    actualizado_en: new Date().toISOString(),
  };

  // Normalizar email si se proporciona
  if (datos.email) {
    actualizado.email = normalizarEmail(datos.email);
  }

  // Normalizar teléfono si se proporciona
  if (datos.telefono) {
    actualizado.phone_normalized = normalizarTelefono(datos.telefono);
  }

  // Extraer dominio si se proporciona URL
  if (datos.website) {
    actualizado.website_domain = extraerDominio(datos.website);
  }

  const { data, error } = await admin
    .from('sales_leads')
    .update(actualizado)
    .eq('id', lead_id)
    .select()
    .single();

  if (error) throw new Error(`No se pudo actualizar el lead: ${error.message}`);

  // Log event
  if (actor_id) {
    await crearEvento(admin, {
      lead_id,
      tipo: 'LEAD_UPDATED',
      actor_id,
      detalles: { cambios: Object.keys(datos) },
    });
  }

  return data;
}

/**
 * Marcar como borrado (soft delete)
 */
export async function borrarLead(
  admin: ReturnType<typeof createClient<Database>>,
  lead_id: string,
  actor_id: string
): Promise<void> {
  const { error } = await admin
    .from('sales_leads')
    .update({
      borrado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', lead_id);

  if (error) throw new Error(`No se pudo borrar el lead: ${error.message}`);

  await crearEvento(admin, {
    lead_id,
    tipo: 'LEAD_UPDATED',
    actor_id,
    detalles: { accion: 'borrado' },
  });
}

/**
 * Agregar o remover tag
 */
export async function actualizarTags(
  admin: ReturnType<typeof createClient<Database>>,
  lead_id: string,
  tags: string[],
  actor_id: string
): Promise<SalesLead> {
  const { data, error } = await admin
    .from('sales_leads')
    .update({ tags, actualizado_en: new Date().toISOString() })
    .eq('id', lead_id)
    .select()
    .single();

  if (error) throw new Error(`No se pudieron actualizar tags: ${error.message}`);

  await crearEvento(admin, {
    lead_id,
    tipo: 'TAG_ADDED',
    actor_id,
    detalles: { tags },
  });

  return data;
}

/**
 * Helper: crear evento de auditoría
 */
async function crearEvento(
  admin: ReturnType<typeof createClient<Database>>,
  data: {
    lead_id?: string;
    tipo: string;
    actor_id?: string;
    detalles?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin
    .from('sales_events')
    .insert([{
      lead_id: data.lead_id || null,
      tipo: data.tipo,
      actor_id: data.actor_id || null,
      detalles: data.detalles || {},
    }]);

  if (error) {
    console.error('Error creando evento:', error);
    // No lanzar: los eventos de auditoría no deben bloquear la operación
  }
}
