import Link from 'next/link';
import { Wrench, SlidersHorizontal, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Apariencia — EN MANTENIMIENTO (decisión del fundador, 2026-09-07).
//
// Esta ruta redirigía directa al editor de marca del portal
// (`/configuracion/apariencia/editor`). Ese editor se está rehaciendo, así que
// ahora se para aquí y se dice.
//
// ⚠️ Mantenimiento ≠ congelado. `lib/frozen-features.ts` ESCONDE un módulo
// entero «para que el usuario no sepa que existe»; aquí se quiere lo contrario:
// que se vea, que se entienda por qué no se puede tocar, y que haya una salida.
// Por eso no se toca el freeze — sería la herramienta equivocada.
//
// Lo publicado NO se toca: el portal y la página de reservas siguen con el tema
// que ya tuvieran. Esto solo cierra la puerta de EDICIÓN.
// ─────────────────────────────────────────────────────────────────────────────
export const metadata = { title: 'Apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-bold text-foreground">Apariencia</h1>

      <div className="mt-5 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Wrench size={17} className="text-muted-foreground" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">
              El editor de marca está en mantenimiento
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Estamos rehaciendo la parte que cambia el aspecto del portal de tus clientas y de
              tu página de reservas. Mientras tanto no se puede editar.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Lo que ya tienes publicado <strong className="font-semibold text-foreground">sigue
              funcionando igual</strong>: tus clientas ven tu marca como siempre. Solo está
              cerrada la edición.
            </p>
          </div>
        </div>
      </div>

      {/* La salida. Un solo botón: lo que SÍ se puede tocar hoy. */}
      <Link
        href="/configuracion/apariencia/panel"
        className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand"
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <SlidersHorizontal size={17} className="text-brand" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-foreground">
              Personalizar tu panel
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
              Los colores de tu software, qué módulos aparecen en tu menú y en qué orden, las
              secciones de tu Inicio, y si el menú va fijo a la izquierda o fijo arriba.
            </span>
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
