"use client"

import { createContext, useContext, type ReactNode } from "react"

import { anfitrionPortal } from "@/lib/panel-portal"

// A dónde va el portal de un diálogo, popover o tooltip de Base UI.
//
// Sin `container`, Base UI lo cuelga de <body>, que está FUERA de `.dark` (ver
// lib/panel-portal.ts): en modo oscuro todos los diálogos del panel salían
// blancos. Base UI elige el destino en este orden: `container` → el portal que
// lo contiene → <body>. El segundo paso no se puede perder: un InfoTip dentro
// de un diálogo se monta DENTRO del portal del diálogo, y por eso el diálogo
// modal no lo trata como «de fuera» (no lo esconde al lector de pantalla ni le
// quita el foco). Con el anfitrión puesto siempre, lo sacaría como hermano.
//
// Por eso el anfitrión solo lo recibe el portal de PRIMER nivel. Los anidados
// no reciben nada y Base UI los mete en el de su padre, que ya vive en `.dark`.
const DentroDeUnPortal = createContext(false)

/** Envuelve el contenido de un popup de Base UI: lo que se abra dentro es anidado. */
export function DentroDePortal({ children }: { children: ReactNode }) {
  return <DentroDeUnPortal.Provider value>{children}</DentroDeUnPortal.Provider>
}

// Base UI lee `.current` al MONTAR el portal (efecto de layout), cuando el
// anfitrión ya está en el DOM. Con `anfitrionPortal()` evaluado al renderizar,
// un diálogo que nace abierto en el primer render del panel lo pediría antes de
// que el anfitrión exista y se quedaría en <body>.
const ANFITRION = {
  get current() {
    return anfitrionPortal()
  },
}

/** El `container` para el `.Portal` de Base UI: el anfitrión del panel, o nada si va anidado. */
export function useDestinoPortal() {
  return useContext(DentroDeUnPortal) ? undefined : ANFITRION
}
