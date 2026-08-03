import type { PortalSession } from '@/lib/portal-auth';
import type { Socio } from '@/lib/types';

// Sesión de muestra compartida por TODAS las pantallas de /portal-preview —
// esa ruta nunca tiene una socia real (ver app/portal-preview/[slug]/layout.tsx,
// sin PortalAuthProvider). Antes solo vivía dentro de portal-preview-home-client.tsx;
// se extrae aquí para que Clases/Bonos (y lo que se añada después) usen
// exactamente el mismo socioId, no uno distinto por pantalla.
export const SESION_MUESTRA: PortalSession = { socioId: 'preview-socia', nombre: 'Vista previa', email: '' };

// Ficha de socia de muestra (Fase 4 del Theme Builder — Perfil). A diferencia
// de Home/Clases/Bonos (que solo necesitan el socioId de la sesión para
// filtrar el catálogo REAL del estudio), Perfil pinta campos propios de la
// ficha (nombre, foto, alta) que no existen para un socioId ficticio —
// `socios.find(s => s.id === session.socioId)` siempre da `undefined` en
// preview. Se inyecta esta ficha completa en vez de intentar sintetizarla.
export const SOCIO_MUESTRA: Socio = {
  id: SESION_MUESTRA.socioId,
  studioId: '',
  nombre: 'Vista',
  apellidos: 'Previa',
  email: '',
  telefono: null,
  nif: null,
  fechaAlta: new Date().toISOString().slice(0, 10),
  activo: true,
  avatar: null,
  fotoUrl: null,
  metodoPagoPreferido: undefined,
  sepaMandateId: null,
  fechaNacimiento: null,
  direccion: null,
};
