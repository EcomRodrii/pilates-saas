'use client';

import { useEffect, useRef, useState } from 'react';
import { authHeader } from '@/lib/api-client';

// La web REAL del estudio detrás del widget en la vista previa de «Tu web» v2.
//
// Pregunta al servidor (/api/estudio/vista-previa-web) si la web autorizada del
// estudio deja que la enseñemos aquí. Si sí, trae un permiso firmado y de vida
// corta con el que se pide /vista-previa-web, el documento que la enmarca. El
// navegador NO manda ninguna dirección: la web sale de lo guardado, en el
// servidor (app/api/estudio/vista-previa-web/route.ts).
//
//  · Sin web autorizada (`conDominio` falso), NO se hace ninguna petición.
//  · Solo se pregunta cuando la vista previa se ve (`activo`): no al montar la portada.
//  · «Probar de nuevo» se salta la caché del servidor, no su tope.
//  · Cualquier fallo de red o de respuesta es «sin saber»: se enseña el ejemplo.

export type FaseWebReal = 'sin-dominio' | 'comprobando' | 'se-deja' | 'no-se-deja' | 'sin-saber' | 'tope';

type Resultado = { fase: 'se-deja'; permiso: string; en: number } | { fase: 'no-se-deja' | 'sin-saber' | 'tope' };

/** El permiso vale 10 minutos; antes de que caduque se pide otro (un cambio de móvil a ordenador monta otro marco). */
const REFRESCAR_A_LOS_MS = 8 * 60 * 1000;

async function preguntar(forzar: boolean): Promise<Resultado> {
  try {
    const res = await fetch('/api/estudio/vista-previa-web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ forzar }),
    });
    if (!res.ok) return { fase: 'sin-saber' };
    const d = await res.json().catch(() => null) as { estado?: unknown; permiso?: unknown } | null;
    if (d?.estado === 'se-deja' && typeof d.permiso === 'string' && d.permiso) return { fase: 'se-deja', permiso: d.permiso, en: Date.now() };
    if (d?.estado === 'no-se-deja' || d?.estado === 'tope') return { fase: d.estado };
    return { fase: 'sin-saber' };
  } catch {
    return { fase: 'sin-saber' };
  }
}

export function useWebReal({ activo, conDominio, clave }: {
  /** La vista previa se ve (en la columna o en la hoja). */
  activo: boolean;
  /** Hay una web autorizada y quien mira es la propietaria. */
  conDominio: boolean;
  /** Cambia con la lista de webs autorizadas: otra lista, otra pregunta. */
  clave: string;
}) {
  const [resultado, setResultado] = useState<{ clave: string; r: Resultado } | null>(null);
  const pedida = useRef<string | null>(null);

  useEffect(() => {
    if (!activo || !conDominio || pedida.current === clave) return;
    pedida.current = clave;
    let vivo = true;
    void preguntar(false).then(r => { if (vivo) setResultado({ clave, r }); });
    return () => { vivo = false; };
  }, [activo, conDominio, clave]);

  // Derivado: lo que se sabe de ESTA lista de webs; sin respuesta aún (o de otra lista), comprobando.
  const r = resultado && resultado.clave === clave ? resultado.r : null;
  const fase: FaseWebReal = !conDominio ? 'sin-dominio' : (r?.fase ?? 'comprobando');
  const permiso = r?.fase === 'se-deja' ? r.permiso : null;

  /** «Probar de nuevo»: sin caché, con tope. */
  function probar() {
    setResultado(null);
    void preguntar(true).then(nueva => setResultado({ clave, r: nueva }));
  }
  /** Antes de enseñarla otra vez: si el permiso está por caducar, se pide otro (con la caché del servidor, sin gastar tope). */
  function renovarSiCaduca() {
    if (r?.fase !== 'se-deja' || Date.now() - r.en < REFRESCAR_A_LOS_MS) return;
    void preguntar(false).then(nueva => setResultado({ clave, r: nueva }));
  }

  return {
    fase,
    /** La dirección del documento que enmarca su web (con el permiso), o `null`. */
    src: permiso ? `/vista-previa-web?t=${encodeURIComponent(permiso)}` : null,
    probar,
    renovarSiCaduca,
  };
}
