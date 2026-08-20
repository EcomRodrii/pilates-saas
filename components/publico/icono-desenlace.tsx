import type { LucideIcon } from 'lucide-react';

// Héroe visual de las pantallas públicas de token (confirmar reserva, aceptar
// sustitución, valorar, baja, disponibilidad). Antes era un emoji a text-4xl/
// text-5xl (✅ 🎉 🔒…) — el mismo mensaje que el resto del producto dibuja con
// Lucide salía aquí en otro lenguaje visual según la pantalla (auditoría
// 2026-08-20). Círculo tintado + icono, coherente con el EmptyState del panel
// y el patrón "outcome" del portal. Sin hooks a propósito: estas páginas son
// Server Components.
export function IconoDesenlace({
  icono: Icono,
  tono = 'neutro',
}: {
  icono: LucideIcon;
  tono?: 'exito' | 'neutro';
}) {
  return (
    <div
      className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
        tono === 'exito' ? 'bg-success/10 text-success' : 'bg-slate-100 text-slate-500'
      }`}
    >
      <Icono size={26} aria-hidden="true" />
    </div>
  );
}
