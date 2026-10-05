// Quién puede usar el asistente: la propietaria y la gerencia (fundador,
// 5-oct-2026). Recepción e instructoras, no. La ÚNICA lista: la ruta, ⌘K y la
// barra del Centro de Control la leen de aquí. Qué herramientas se le ofrecen a
// cada rol lo decide cada herramienta con lib/permisos-reglas.ts
// (`herramientasDelRol`, en herramientas/definiciones.ts): a la gerente, nada
// de dinero.

import type { Rol } from '../types.ts';

export const ROLES_ASISTENTE = ['PROPIETARIO', 'MANAGER'] as const;

export function puedeUsarAsistente(rol: Rol): boolean {
  return (ROLES_ASISTENTE as readonly Rol[]).includes(rol);
}
