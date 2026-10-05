// `true` durante `ms` cada vez que `activo` pasa de false a true (nunca al
// montarse ya en true): el 'hecho' breve del veredicto (lib/tenti/momentos.ts),
// «acaba de terminar», y no «terminó alguna vez».
//
// El paso de false a true se detecta durante el render (estado derivado, el
// patrón de React para «lo que cambió desde el render anterior»); el efecto
// solo programa el final.

import { useEffect, useState } from 'react';

export function useDuranteUnMomento(activo: boolean, ms: number): boolean {
  const [visto, setVisto] = useState(activo);
  const [vigente, setVigente] = useState(false);
  if (activo !== visto) {
    setVisto(activo);
    if (activo) setVigente(true);
  }
  useEffect(() => {
    if (!vigente) return;
    const t = setTimeout(() => setVigente(false), ms);
    return () => clearTimeout(t);
  }, [vigente, ms]);
  return vigente;
}
