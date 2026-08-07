"use client";

import { createContext, useContext, useEffect } from "react";
import type { ThemeConfig } from "@/components/portal-tema/tipos-tema";

/**
 * El tema activo, por contexto.
 *
 * ⚠️ El encargo dice que «los componentes no necesitan un solo cambio» porque
 * leen `THEME` de `src/theme/config`. Eso es cierto SOLO si se compila un
 * bundle por tema, que es como venían los tres proyectos de diseño. Aquí los
 * tres conviven en una sola app y el tema se elige en runtime según el
 * estudio, así que el import estático no puede quedarse: pasa a contexto.
 *
 * Un solo consumidor de verdad — `useViewModel`, que ya expone `theme` y
 * `features` en el view model. El resto de componentes leen de ahí y no de
 * este contexto: dos lecturas distintas del mismo dato es el patrón de bug
 * más repetido de este repo.
 */
const TemaCtx = createContext<ThemeConfig | null>(null);

export function TemaProvider({ tema, children }: { tema: ThemeConfig; children: React.ReactNode }) {
  // Los tokens de los tres temas viven en el mismo bundle, cada uno bajo
  // `[data-theme="…"]`, así que activar un tema es poner el atributo — no
  // cargar una hoja u otra.
  //
  // ⚠️ Esto corre en un efecto, o sea DESPUÉS del primer pintado: en la ruta
  // real hay que renderizar `data-theme` también en el servidor (en el layout
  // del portal, que ya sabe el estudio) o se ve un parpadeo sin tintar. Con el
  // atributo ya puesto, este efecto escribe el mismo valor y no hace nada.
  useEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.getAttribute("data-theme");
    raiz.setAttribute("data-theme", tema.id);
    return () => {
      if (anterior === null) raiz.removeAttribute("data-theme");
      else raiz.setAttribute("data-theme", anterior);
    };
  }, [tema.id]);

  return <TemaCtx.Provider value={tema}>{children}</TemaCtx.Provider>;
}

export function useTema(): ThemeConfig {
  const value = useContext(TemaCtx);
  if (!value) throw new Error("useTema fuera de <TemaProvider>");
  return value;
}
