"use client"

import type { LucideIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Botón de solo icono. `label` es OBLIGATORIO y hace tres cosas a la vez:
// nombre accesible, texto para lectores de pantalla y contenido del tooltip.
//
// Existe porque el patrón manual (<button><Trash2/></button>) se repitió 50
// veces y en 28 de ellas nadie puso aria-label: botones que no se puede saber
// qué hacen, ni mirándolos ni con lector, algunos en Pagos y Mensajería, donde
// equivocarse cuesta dinero o manda un email a una clienta. Aquí el tipo no
// compila sin `label`, así que ese fallo deja de ser posible.
//
// El tooltip no se ve en táctil (es una limitación del patrón, no un fallo):
// por eso el aria-label va siempre, y por eso el icono debe ser reconocible
// por sí solo. Si la acción no se entiende sin leer el tooltip, usa un botón
// normal con texto.
function IconButton({
  label,
  icon: Icon,
  side = "top",
  className,
  variant = "ghost",
  size = "icon",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children"> & {
  /** Qué hace el botón, en imperativo: "Eliminar factura", "Enviar recordatorio". */
  label: string
  icon: LucideIcon
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <Tooltip content={label} side={side}>
      <Button
        data-slot="icon-button"
        aria-label={label}
        variant={variant}
        size={size}
        className={cn(className)}
        {...props}
      >
        <Icon aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}

export { IconButton }
