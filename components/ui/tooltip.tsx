"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { InfoIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

// Dos componentes con la misma pinta y propósitos DISTINTOS. Elegir mal rompe
// la accesibilidad, así que la diferencia importa:
//
//   Tooltip → etiqueta visual de apoyo. El navegador la OCULTA en táctil y los
//     lectores de pantalla no la leen. Solo para repetir en texto lo que un
//     icono ya comunica. Nunca para información que el usuario no pueda
//     deducir de otra forma. El disparador necesita su propio nombre
//     accesible: usa <IconButton>, que lo pone solo.
//
//   InfoTip → el icono (i) de ayuda junto a una etiqueta. Es un Popover, así
//     que SÍ funciona en táctil (POS y kiosco lo son) y SÍ lo leen los
//     lectores de pantalla. Se abre al pasar el ratón y también al pulsar.
//
// Y para la explicación de un campo, ninguno de los dos: va debajo de la
// etiqueta, siempre visible, con la prop `description` de <Field>. Esconder
// tras un hover lo que el usuario necesita para decidir es justo lo contrario
// de "que se entienda sin formación".

// Opcional: agrupa los tooltips para que, una vez abierto uno, los siguientes
// aparezcan al instante en vez de esperar el retardo. Sin él todo funciona.
function TooltipProvider({ ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider {...props} />
}

const tooltipPopupClass =
  "z-50 max-w-64 origin-[var(--transform-origin)] rounded-lg bg-popover px-2 py-1 text-xs text-popover-foreground ring-1 ring-foreground/10 shadow-md transition-[transform,opacity] duration-100 ease-out data-starting-style:opacity-0 data-starting-style:scale-98 data-ending-style:opacity-0 data-ending-style:scale-98 data-instant:transition-none"

function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 8,
}: {
  /** Texto corto. Debe coincidir con el nombre accesible del disparador. */
  content: React.ReactNode
  /** Un único elemento. Recibe las props del disparador por composición. */
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        render={children}
      />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset}>
          <TooltipPrimitive.Popup
            data-slot="tooltip"
            className={tooltipPopupClass}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

function InfoTip({
  children,
  label = "Más información",
  side = "top",
  sideOffset = 8,
  className,
}: {
  /** La explicación. Admite varias frases; se lee en táctil y con lector. */
  children: React.ReactNode
  /** Nombre accesible del icono. Concrétalo: "Qué es un bono". */
  label?: string
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  className?: string
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={200}
        data-slot="infotip-trigger"
        aria-label={label}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:text-foreground",
          className
        )}
      >
        <InfoIcon className="size-3.5" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset}>
          <PopoverPrimitive.Popup
            data-slot="infotip"
            className={cn(
              tooltipPopupClass,
              "max-w-72 px-3 py-2 text-xs leading-relaxed"
            )}
          >
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider, InfoTip }
