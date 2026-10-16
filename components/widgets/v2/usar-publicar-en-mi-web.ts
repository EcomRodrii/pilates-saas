'use client';

import { useEffect, useRef, useState } from 'react';
import { widgetPorId } from '@/lib/widgets/catalogo';
import {
  hayPendientes, pendientesDePublicar, resumenPublicacion, textoPendiente,
  type Pendientes, type ResultadoPublicacion, type Resumen,
} from '@/lib/widgets/publicar-en-mi-web';
import type { ConstructorWidgets } from '../usar-constructor';

// La barra única «Publicar en mi web» de «Tu web» v2 (decisión 1 del fundador,
// 15-oct-2026): qué está sin publicar, mandarlo y decir qué salió. Las reglas
// puras están en lib/widgets/publicar-en-mi-web.ts; las peticiones son las de
// siempre, sin cambios: /api/estudio/widget-estilo (`estiloWeb.aplicar`) y
// /api/estudio/widget-pieza (`aplicarPieza`, por cada pieza).
//
// ⚠️ Las reglas que este repo aprendió con los cobros (#500/#505/#560):
//   · el cerrojo va en un ref y se cierra ANTES del primer `await`: el doble
//     clic (o un clic mientras vuelve la respuesta) es UNA sola tanda. El estado
//     solo no basta: dos clics en el mismo tick ven el mismo render;
//   · en SECUENCIA, no en paralelo: el resultado de cada cosa se puede contar y
//     decir, y un e2e cuenta las peticiones sin carreras;
//   · nada se da por publicado sin la respuesta del servidor: lo pendiente no se
//     marca a mano, se vuelve a derivar de lo publicado, que solo cambia con lo
//     que contesta el servidor;
//   · a medias se dice a medias. No hay transacción entre las dos APIs: el
//     estilo puede quedar publicado y una pieza no (no es dinero, y se dice).

export type FaseBarra = 'reposo' | 'publicando';

export interface BarraPublicar {
  pendientes: Pendientes;
  /** «Sin publicar en tu web: …», o `null`. */
  texto: string | null;
  fase: FaseBarra;
  /** Lo que salió la última vez (se queda hasta el siguiente intento o hasta que caduca un acierto). */
  resumen: Resumen | null;
  /** El diálogo del estilo, abierto. */
  confirmando: boolean;
  setConfirmando: (v: boolean) => void;
  /** Lo que se ve: hay algo pendiente, se está publicando o hay algo que decir. */
  visible: boolean;
  /** Tras publicar SOLO el estilo se puede deshacer (lo de siempre de `useEstiloWeb`). */
  puedeDeshacer: boolean;
  /** «Publicar en mi web»: con estilo de por medio, primero la confirmación. */
  pedir: () => void;
  publicar: () => Promise<void>;
  descartar: () => void;
  deshacer: () => Promise<void>;
}

/** Cuánto se queda a la vista «Publicado» (un aviso con algo que no salió se queda). */
const PUBLICADO_MS = 8000;

export function usePublicarEnMiWeb(s: ConstructorWidgets): BarraPublicar {
  const { estiloWeb, publicacion } = s;
  const enVuelo = useRef(false);
  const [fase, setFase] = useState<FaseBarra>('reposo');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Lo último publicado fue solo el estilo: es lo único que se sabe deshacer.
  const [soloEstilo, setSoloEstilo] = useState(false);

  const pendientes = pendientesDePublicar({
    estilo: estiloWeb,
    copiados: s.copiados,
    publicadas: publicacion.publicadas,
    configs: s.configsCopiadas,
    nombre: id => widgetPorId(id)?.nombre ?? id,
  });

  // Un acierto se dice unos segundos y se va; lo que no salió se queda.
  useEffect(() => {
    if (resumen?.tono !== 'ok') return;
    const t = setTimeout(() => setResumen(null), PUBLICADO_MS);
    return () => clearTimeout(t);
  }, [resumen]);

  function pedir() {
    if (enVuelo.current || pendientes.bloqueo || !hayPendientes(pendientes)) return;
    if (pendientes.estilo) setConfirmando(true);
    else void publicar();
  }

  async function publicar() {
    // Lo que había pendiente al pulsar: es lo que se manda, y nada más.
    const p = pendientes;
    if (enVuelo.current || p.bloqueo || !hayPendientes(p)) return;
    enVuelo.current = true;
    setConfirmando(false);
    setFase('publicando');
    setResumen(null);
    setSoloEstilo(false);
    const resultados: ResultadoPublicacion[] = [];
    try {
      if (p.estilo) {
        const r = await estiloWeb.aplicar();
        resultados.push(r.ok ? { que: { tipo: 'estilo' }, ok: true } : { que: { tipo: 'estilo' }, ok: false, error: r.mensaje, motivo: r.motivo });
      }
      // Cada pieza sobre lo copiado que dejó la anterior (ver `aplicarPieza`).
      let copiados = s.copiados;
      for (const x of p.piezas) {
        const r = await s.aplicarPieza(x.id, { copiados, silencioso: true });
        const que = { tipo: 'pieza' as const, id: x.id, nombre: x.nombre };
        if (r.ok) {
          copiados = r.copiados;
          resultados.push({ que, ok: true });
        } else {
          resultados.push({ que, ok: false, error: r.error, ...(r.motivo ? { motivo: r.motivo } : {}) });
        }
      }
    } finally {
      enVuelo.current = false;
      setFase('reposo');
    }
    setResumen(resumenPublicacion(resultados));
    setSoloEstilo(resultados.length === 1 && resultados[0].que.tipo === 'estilo' && resultados[0].ok);
  }

  /** «Descartar»: lo de aquí vuelve a lo que hay en su web. Sin una sola petición a publicar. */
  function descartar() {
    if (enVuelo.current) return;
    if (pendientes.estilo) estiloWeb.descartar();
    if (pendientes.piezas.length) s.descartarPiezas(pendientes.piezas.map(x => x.id));
    setResumen(null);
  }

  /** Deshacer lo último, si fue solo el estilo. Si falla, lo dice `estiloWeb.mensajeFallo`. */
  async function deshacer() {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setFase('publicando');
    setResumen(null);
    let ok = false;
    try {
      ok = await estiloWeb.deshacer();
    } finally {
      enVuelo.current = false;
      setFase('reposo');
    }
    setSoloEstilo(false);
    if (ok) setResumen({ tono: 'ok', texto: 'Hemos vuelto a poner el estilo de antes en tu web.' });
  }

  const puedeDeshacer = soloEstilo && estiloWeb.anterior !== undefined && !estiloWeb.pendiente && estiloWeb.relectura === null;
  const texto = textoPendiente(pendientes);
  return {
    pendientes, texto, fase, resumen, confirmando, setConfirmando, puedeDeshacer,
    visible: hayPendientes(pendientes) || fase === 'publicando' || resumen !== null || estiloWeb.relectura !== null,
    pedir, publicar, descartar, deshacer,
  };
}
