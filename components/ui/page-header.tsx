import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { cn } from "@/lib/utils"

// Cabecera única para todas las pantallas del dashboard.
//
// Antes cada página se inventaba la suya: cinco tamaños distintos de <h1>
// (text-[26px], text-2xl, text-xl, text-[22px], text-[15px]), tres pesos
// tipográficos, subtítulo unas veces sí y otras no, y el botón primario en un
// sitio distinto en cada sitio. Eso es lo que impide que aprender una pantalla
// sirva para entender las demás.
//
// Un solo <h1> por página, siempre igual, y las acciones siempre arriba a la
// derecha (debajo del título en móvil).
function PageHeader({
  title,
  description,
  actions,
  back,
  badge,
  className,
  ...props
}: React.ComponentProps<"header"> & {
  title: React.ReactNode
  /** Una frase: qué se hace aquí. Es la ayuda más barata de toda la app. */
  description?: React.ReactNode
  /** Acción primaria de la pantalla. Como mucho dos; el resto, en un menú. */
  actions?: React.ReactNode
  /**
   * Flecha de volver, para pantallas que son un paso dentro de un flujo (los
   * importadores). `label` es el nombre accesible: "Volver a Clientes", no
   * "Volver" a secas, que no dice adónde.
   */
  back?: { href: string; label: string }
  /** Contador o estado junto al título: "12 vídeos", nº de no leídos. */
  badge?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Link
            href={back.href}
            aria-label={back.label}
            data-slot="page-header-back"
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
          </Link>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              data-slot="page-header-title"
              className="text-2xl leading-tight font-bold text-balance"
            >
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p
              data-slot="page-header-description"
              className="text-sm text-muted-foreground text-balance"
            >
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div
          data-slot="page-header-actions"
          className="flex shrink-0 items-center gap-2"
        >
          {actions}
        </div>
      )}
    </header>
  )
}

export { PageHeader }
