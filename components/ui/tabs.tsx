"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

// ⚠️ `w-fit` + `inline-flex` significa "tan ancha como sus pestañas", sin techo:
// con etiquetas largas la lista se sale del viewport y ensancha la PÁGINA
// entera. Medido en Configuración → Estudio a 390px de ancho: la lista llegaba
// a 519px y el documento sacaba 129px de scroll horizontal — el sitio se movía
// de lado al arrastrar, y la última pestaña seguía sin alcanzarse.
//
// El arreglo es `max-w-full` + `overflow-x-auto`: la lista deja de empujar y
// pasa a desplazarse dentro de su propia caja, que es lo que ya hacía la tira
// de pestañas de primer nivel (app/(dashboard)/configuracion/page.tsx). Solo en
// horizontal: en vertical las pestañas se apilan y no hay nada que desbordar.
//
// ⚠️ Y va con 5px de relleno abajo para el variante `line`, que pinta el indicador
// de la pestaña activa en `after:bottom-[-5px]`, es decir FUERA de la caja: un
// contenedor con scroll lo recortaría (`overflow-x: auto` obliga al eje Y a
// dejar de ser `visible`). Con `pb-[5px]` —y `h-fit`, porque el alto fijo de
// 2rem no deja sitio para ese relleno— el indicador cae dentro de la caja. Hoy
// no lo usa ninguna pantalla —las cuatro montan el variante por defecto, que
// no dibuja nada fuera—, así que este tramo no cambia nada visible: está para
// que el fallo no espere a la primera que estrene `line`.
const tabsListVariants = cva(
  // `justify-start`, no `justify-center`: con `w-fit` el ancho ya es el del
  // contenido, así que centrar no hacía nada cuando cabía — pero en cuanto la
  // lista desborda y pasa a desplazarse, `justify-center` reparte el exceso a
  // los DOS lados y la primera pestaña queda cortada por la izquierda, fuera
  // del alcance del scroll. Se vio en Estudio a 390px: "General", que además
  // era la activa, no aparecía por ninguna parte. Los números decían 0 de
  // overflow y "la lista scrollea": parecía arreglado.
  "group/tabs-list inline-flex w-fit items-center justify-start rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-horizontal/tabs:max-w-full group-data-horizontal/tabs:overflow-x-auto group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=line]:group-data-horizontal/tabs:h-fit data-[variant=line]:group-data-horizontal/tabs:pb-[5px]",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
