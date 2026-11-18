'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// El asistente como COLUMNA a la derecha (marco a sangre, `SHELL_NUEVO`, 18-nov-2026): como el
// panel lateral de Shopify, el lienzo se encoge para hacerle sitio en vez de taparse. Solo guarda
// si está abierta; el chat y su estado viven en `VistaChat`, que ya sabe pintarse sin columna de
// conversaciones (`flotante`).

/** Ancho de la columna, margen de 4 px incluido: lo que el lienzo cede a la derecha. */
export const ANCHO_COLUMNA_ASISTENTE = 356;

interface Valor {
  abierta: boolean;
  /** La pregunta con la que se abrió (la del compositor de Inicio): el chat la envía al montarse. */
  pregunta: string | null;
  abrir: (pregunta?: string) => void;
  cerrar: () => void;
  alternar: () => void;
}

const Ctx = createContext<Valor>({ abierta: false, pregunta: null, abrir: () => {}, cerrar: () => {}, alternar: () => {} });

export function ColumnaAsistenteProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const [pregunta, setPregunta] = useState<string | null>(null);
  const abrir = useCallback((p?: string) => { setPregunta(p?.trim() ? p.trim().slice(0, 500) : null); setAbierta(true); }, []);
  const cerrar = useCallback(() => { setAbierta(false); setPregunta(null); }, []);
  const alternar = useCallback(() => setAbierta(v => { if (v) setPregunta(null); return !v; }), []);
  const valor = useMemo(() => ({ abierta, pregunta, abrir, cerrar, alternar }), [abierta, pregunta, abrir, cerrar, alternar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useColumnaAsistente(): Valor {
  return useContext(Ctx);
}
