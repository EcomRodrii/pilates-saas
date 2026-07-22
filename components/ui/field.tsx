"use client"

import { Field as FieldPrimitive } from "@base-ui/react/field"
import * as React from "react"

import { cn } from "@/lib/utils"

// Campo de formulario con etiqueta, explicación y error.
//
// La razón de que exista: hoy solo un 15-20 % de los campos lleva explicación,
// y los que no la llevan son justo los conceptuales — tab-planes.tsx pide
// elegir entre MENSUAL, BONO y PUNTUAL sin una línea que diga en qué se
// diferencian, que es la decisión más importante que toma una dueña al montar
// el estudio. La causa era estructural: el helper anterior tenía la firma
// { label, children } y no había ni dónde escribir la explicación. Aquí
// `description` es un hueco de primera clase.
//
// Base UI enlaza solo el aria-describedby y el htmlFor si el control es un
// componente suyo — <Input>, <Textarea>, <Select> de components/ui/ lo son. Un
// <input> nativo suelto se verá bien pero NO quedará enlazado: usa los del
// sistema de diseño.

function FieldRoot({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        "flex items-center gap-1.5 text-sm leading-none font-medium select-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  ...props
}: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn(
        "text-xs leading-relaxed text-muted-foreground text-balance",
        className
      )}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn("text-xs leading-relaxed text-destructive", className)}
      {...props}
    />
  )
}

function Field({
  label,
  description,
  error,
  required,
  hint,
  children,
  className,
  ...props
}: Omit<FieldPrimitive.Root.Props, "children"> & {
  label: React.ReactNode
  /**
   * Qué es esto y cómo decidir, en una o dos frases. Va DEBAJO de la etiqueta
   * y ENCIMA del control a propósito: se lee antes de decidir, no después de
   * haberse equivocado. Tono de referencia (tab-estudio.tsx, el mejor fichero
   * de la app hoy): "0 = sin penalización", "Vacío = sin límite", "recomendado".
   */
  description?: React.ReactNode
  /** Mensaje en español, concreto y accionable. Nunca el error del backend. */
  error?: string
  required?: boolean
  /** Un <InfoTip> junto a la etiqueta, para el detalle largo que no cabe. */
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <FieldRoot className={className} {...props}>
      <FieldLabel>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(obligatorio)</span>}
        {hint}
      </FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      {children}
      {error && <FieldError match>{error}</FieldError>}
    </FieldRoot>
  )
}

export { Field, FieldRoot, FieldLabel, FieldDescription, FieldError }
