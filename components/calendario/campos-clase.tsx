'use client';

// Las piezas de formulario que comparten «Nueva clase», «Editar clase» y
// «Nueva clase fija» del calendario. Vivían dentro de la página; salen aquí
// para que el formulario de nueva clase (su propio fichero, con su estado) no
// tenga que copiarlas. Mismo marcado que tenían.

import { useId, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { cn } from '@/lib/utils';

export const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors';
export const selectCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors appearance-none';

// ─── Aviso de aforo mayor que la sala ─────────────────────────────────────────

export function AvisoAforoSala({ salas, salaId, aforo }: {
  salas: { id: string; nombre: string; capacidad: number }[];
  salaId: string;
  aforo: number;
}) {
  const sala = salas.find(s => s.id === salaId);
  if (!sala || !Number.isFinite(aforo) || aforo <= sala.capacidad) return null;
  return (
    <p role="alert" className="mt-1.5 text-[11px] leading-snug text-[var(--warning)]">
      «{sala.nombre}» tiene {sala.capacidad} plaza{sala.capacidad === 1 ? '' : 's'}.
      Con {aforo} estarías vendiendo {aforo - sala.capacidad} más de las que caben.
    </p>
  );
}

// ─── FormField wrapper ────────────────────────────────────────────────────────

export function FormField({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const { htmlFor, control } = useCampoAsociado(children);
  const descAutoId = useId();
  const idDesc = description ? `${descAutoId}-desc` : undefined;
  const controlDescrito = idDesc && isValidElement(control)
    ? cloneElement(control as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': idDesc })
    : control;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
    </div>
  );
}

// ─── DiaPill ─────────────────────────────────────────────────────────────────

export function DiaPill({ label, nombre, active, onClick }: { label: string; nombre: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // La letra sola («M», «X») no dice qué día es a un lector de pantalla, ni
      // si está marcado.
      aria-label={nombre}
      aria-pressed={active}
      className={cn(
        // Con el dedo, 44 px de alto y el ancho que le toque en la fila de siete;
        // con ratón, el círculo de 36 px de siempre.
        'h-11 w-full rounded-full text-[13px] font-bold transition-colors pointer-fine:h-9 pointer-fine:w-9 pointer-fine:text-[12px]',
        active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:bg-border'
      )}
    >
      {label}
    </button>
  );
}

export const DIA_PILLS: { label: string; nombre: string; day: number }[] = [
  { label: 'L', nombre: 'Lunes', day: 1 }, { label: 'M', nombre: 'Martes', day: 2 }, { label: 'X', nombre: 'Miércoles', day: 3 },
  { label: 'J', nombre: 'Jueves', day: 4 }, { label: 'V', nombre: 'Viernes', day: 5 }, { label: 'S', nombre: 'Sábado', day: 6 },
  { label: 'D', nombre: 'Domingo', day: 0 },
];
