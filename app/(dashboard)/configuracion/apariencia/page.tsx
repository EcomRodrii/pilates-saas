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
//
// ⚠️ LA SALIDA TIENE QUE DECIR QUE EL COLOR SÍ SE CAMBIA. «Personalizar tu
// panel» edita el color del tema PUBLICADO, que es el mismo que ve el portal
// (ver el comentario de `apariencia/panel/page.tsx`). Esta pantalla lo
// presentaba como «los colores de tu software» y una propietaria que quería su
// color en la página de reservas se fue creyendo que no podía (evaluación del
// 13-sep). Lo cerrado es la portada y el diseño del portal, no el color.
// ─────────────────────────────────────────────────────────────────────────────
export const metadata = { title: 'Apariencia' };

export default function AparienciaPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-bold text-foreground">Apariencia</h1>

      {/* Lo que SÍ se puede tocar va primero: es lo que ha venido a hacer. */}
      <Link
        href="/configuracion/apariencia/panel"
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand"
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
            <SlidersHorizontal size={17} className="text-brand" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-foreground">
              Tu color y tu panel
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
              El color de tu marca —el mismo que ven tus alumnas en tu página de reservas y en su
              app—, qué módulos aparecen en tu menú y en qué orden, y las secciones de tu Inicio.
            </span>
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </Link>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Wrench size={17} className="text-muted-foreground" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">
              La portada y el diseño de tu portal, en mantenimiento
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Estamos rehaciendo el editor de la portada, la tipografía y las secciones del portal de
              tus alumnas. Mientras tanto eso no se puede editar; tu logo se cambia en Configuración →
              Estudio y tu color, aquí arriba.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Lo que ya tienes publicado <strong className="font-semibold text-foreground">sigue
              funcionando igual</strong>: tus clientas ven tu marca como siempre.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
