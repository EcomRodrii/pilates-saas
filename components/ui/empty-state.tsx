import type { LucideIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

// Pantalla vacía. No es decoración: para quien acaba de entrar, es la primera
// clase que recibe. Tiene que decir qué es esta sección y cuál es el siguiente
// paso, con un botón que lo haga.
//
// El patrón sale de socios/page.tsx, que ya lo hacía bien, incluida la
// distinción entre "no hay nada todavía" y "no hay nada CON ESTE FILTRO" —
// confundirlas deja al usuario pensando que ha perdido los datos. Calendario y
// Pagos, en cambio, se quedan en un texto seco sin salida, y son justo donde
// aterriza el checklist de primeros pasos.
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: LucideIcon
  /** Qué falta, en positivo: "Aún no hay clientes". */
  title: React.ReactNode
  /** Por qué importa y qué pasa al hacerlo. Una o dos frases. */
  description?: React.ReactNode
  /** El botón que resuelve el vacío. Sin él, esto es un callejón sin salida. */
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p
          data-slot="empty-state-title"
          className="text-sm font-semibold text-balance"
        >
          {title}
        </p>
        {description && (
          <p
            data-slot="empty-state-description"
            className="max-w-sm text-sm text-muted-foreground text-balance"
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export { EmptyState }
