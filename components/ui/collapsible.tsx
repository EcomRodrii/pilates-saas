"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

// Divulgación progresiva: enseñar solo lo que hace falta ahora y guardar el
// resto detrás de un clic.
//
// Hoy no existía ninguna primitiva para esto, y se nota: el diálogo de clases
// recurrentes suelta 16 controles de golpe, la pestaña Estudio 16 campos en 9
// secciones todas abiertas (incluida la "Zona de riesgo", siempre a la vista),
// y Configuración acumula 84 ajustes repartidos en 15 pestañas.
//
// <AdvancedOptions> es el caso concreto que hay que repetir: lo esencial
// visible, lo demás plegado. Si un formulario pasa de ~7 controles, lo que
// sobra casi siempre cabe aquí dentro.

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-4 [&>svg]:transition-transform data-panel-open:[&>svg]:rotate-180",
        className
      )}
      {...props}
    />
  )
}

function CollapsiblePanel({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      // Lista de clases del ejemplo oficial de Base UI. La animación va por
      // altura usando --collapsible-panel-height, que la propia librería
      // calcula y escribe en el elemento.
      className={cn(
        "flex h-[var(--collapsible-panel-height)] flex-col overflow-hidden transition-[height] duration-150 ease-[ease-out] [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0",
        className
      )}
      {...props}
    />
  )
}

function AdvancedOptions({
  label = "Opciones avanzadas",
  children,
  className,
  defaultOpen = false,
}: {
  label?: string
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("w-full", className)}>
      <CollapsibleTrigger>
        <ChevronDownIcon aria-hidden="true" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-col gap-4 pt-4">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
  AdvancedOptions,
}
