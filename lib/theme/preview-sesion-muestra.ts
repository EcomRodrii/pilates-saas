import type { PortalSession } from '@/lib/portal-auth';

// Sesión de muestra compartida por TODAS las pantallas de /portal-preview —
// esa ruta nunca tiene una socia real (ver app/portal-preview/[slug]/layout.tsx,
// sin PortalAuthProvider). Antes solo vivía dentro de portal-preview-home-client.tsx;
// se extrae aquí para que Clases/Bonos (y lo que se añada después) usen
// exactamente el mismo socioId, no uno distinto por pantalla.
export const SESION_MUESTRA: PortalSession = { socioId: 'preview-socia', nombre: 'Vista previa', email: '' };
