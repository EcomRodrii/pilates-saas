'use client';

import { useEffect, useRef, useState } from 'react';
import { aplicarEstiloWidgetsApi, fetchThemePublicado, type ResultadoAplicarEstiloWeb } from '@/lib/api-client';
import {
  COLOR_OTRO_INICIAL, WIDGET_WEB_NEUTRO, esNeutro, leerWidgetWeb, mismoWidgetWeb, type WidgetWeb,
} from '@/lib/reservar/estilo-web-tipos';
import { baseEstiloWeb, validarEstiloWeb, type BaseEstiloWeb, type ErrorEstiloWeb } from '@/lib/reservar/estilo-web';

// El estilo de los widgets en su web, en el panel: lo que hay aplicado, el
// borrador que la dueña prueba y el envío (Fase B del constructor, 28-sep-2026).
//
// Vive en `ConstructorWidgets` y no en el paso «Cómo se ve»: la vista previa y
// «Ponlo en tu web» también lo leen, y ese paso se vuelve a montar con cada
// widget (`key={w.id}`) —el borrador es del ESTUDIO, no se pierde por cambiar
// de widget—.
//
// El borrador es estado de React y nada más, como en «Apariencia de tu app»:
// no se guarda en `config_draft`, que un `POST /api/theme/publish` sin cuerpo
// publicaría entero. Solo existe en su web al aplicarlo.
//
// ⚠️ Las tres reglas que este repo aprendió con los cobros (#500/#505/#560)
// valen igual aquí, porque esto cambia a la vez todas las webs de un estudio:
//   · «Aplicado en tu web» solo con la respuesta de verdad del servidor
//     (`aplicarEstiloWidgetsApi` ya no da por buena una respuesta vacía).
//   · `envio = 'aplicando'` ANTES del `await`, y un cerrojo en un ref: el doble
//     clic (o un clic mientras vuelve la respuesta) no manda otra petición. El
//     estado solo no basta: dos clics en el mismo tick ven el mismo render.
//   · Deshacer vuelve a lo que el servidor LEYÓ al aplicar (`anterior`), no a lo
//     que el panel creía que había, y manda `esperado`: si otra pestaña lo cambió
//     entretanto, el servidor responde 409 en lugar de pisarlo.

export type FaseCargaEstilo = 'cargando' | 'error-carga' | 'listo';
export type EnvioEstilo = 'reposo' | 'aplicando' | 'aplicado' | 'fallo';

export interface EstiloWebPanel {
  fase: FaseCargaEstilo;
  /** Lo que hay en su web ahora. `null` = nada elegido (se ve como su app). */
  publicado: WidgetWeb | null;
  /** Con qué se resuelve (su app y su color). `null` hasta que carga. */
  base: BaseEstiloWeb | null;
  /** Lo que se ve en el panel y en la vista previa. Siempre completo. */
  borrador: WidgetWeb;
  /** El borrador cambia algo de lo que hay en su web. */
  pendiente: boolean;
  /** Lo que impide aplicarlo: el mismo veredicto que dará el servidor. */
  errores: ErrorEstiloWeb[];
  envio: EnvioEstilo;
  /** Por qué no se aplicó (o no se deshizo). Se enseña con `role=alert`. */
  mensajeFallo: string | null;
  /** Lo que había antes de aplicar, para Deshacer. `undefined` = nada que deshacer. */
  anterior: WidgetWeb | null | undefined;
  /** Lo último que salió bien, para su aviso. */
  ultimo: 'aplicar' | 'deshacer' | null;
  /** Sube con cada acierto: la vista previa se vuelve a montar con lo publicado de verdad. */
  version: number;
  cambiar: (parcial: Partial<WidgetWeb>) => void;
  descartar: () => void;
  aplicar: () => Promise<void>;
  deshacer: () => Promise<void>;
  reintentarCarga: () => void;
}

function motivoDe(r: Exclude<ResultadoAplicarEstiloWeb, { ok: true }>): string {
  return r.motivo === 'contraste' ? r.errores[0].mensaje : r.mensaje;
}

export function useEstiloWeb(): EstiloWebPanel {
  const [fase, setFase] = useState<FaseCargaEstilo>('cargando');
  const [intento, setIntento] = useState(0);
  const [publicado, setPublicado] = useState<WidgetWeb | null>(null);
  const [base, setBase] = useState<BaseEstiloWeb | null>(null);
  const [borrador, setBorrador] = useState<WidgetWeb>(() => ({ ...WIDGET_WEB_NEUTRO }));
  const [envio, setEnvio] = useState<EnvioEstilo>('reposo');
  const [mensajeFallo, setMensajeFallo] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<WidgetWeb | null | undefined>(undefined);
  const [ultimo, setUltimo] = useState<'aplicar' | 'deshacer' | null>(null);
  const [version, setVersion] = useState(0);
  // El cerrojo del envío: se lee y se escribe solo en los manejadores, nunca al pintar.
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(tema => {
        if (!vivo) return;
        const leido = leerWidgetWeb(tema.widgetWeb);
        const actual = esNeutro(leido) ? null : leido;
        setPublicado(actual);
        setBorrador(actual ? { ...actual } : { ...WIDGET_WEB_NEUTRO });
        setBase(baseEstiloWeb(tema.primary, tema.appAlumna));
        setFase('listo');
      })
      // Sin lo publicado no hay con qué comparar el borrador, ni `esperado` que
      // mandar: no se deja aplicar nada a ciegas.
      .catch(() => { if (vivo) setFase('error-carga'); });
    return () => { vivo = false; };
  }, [intento]);

  const pendiente = fase === 'listo' && !mismoWidgetWeb(borrador, publicado);
  const errores = base && pendiente && !esNeutro(borrador) ? validarEstiloWeb(borrador, base) : [];

  function cambiar(parcial: Partial<WidgetWeb>) {
    if (enVuelo.current) return;
    setBorrador(b => {
      const n = { ...b, ...parcial };
      // «Otro color» va siempre con su color, y ninguna otra web lleva uno.
      if (parcial.web !== undefined) n.colorWeb = parcial.web === 'otro' ? (parcial.colorWeb ?? b.colorWeb ?? COLOR_OTRO_INICIAL) : null;
      return n;
    });
    // Lo de «hace un momento» o el fallo de antes ya no hablan de este borrador.
    if (envio !== 'reposo') setEnvio('reposo');
    setMensajeFallo(null);
    setUltimo(null);
  }

  function descartar() {
    if (enVuelo.current) return;
    setBorrador(publicado ? { ...publicado } : { ...WIDGET_WEB_NEUTRO });
    setEnvio('reposo');
    setMensajeFallo(null);
  }

  async function aplicar() {
    if (enVuelo.current || !pendiente || errores.length > 0) return;
    enVuelo.current = true;
    setEnvio('aplicando');
    setMensajeFallo(null);
    setUltimo(null);
    const r = await aplicarEstiloWidgetsApi({ estilo: borrador, esperado: publicado, motivo: 'aplicar' });
    enVuelo.current = false;
    if (!r.ok) {
      // El borrador se queda: lo que eligió no se pierde por un fallo de red.
      setEnvio('fallo');
      setMensajeFallo(motivoDe(r));
      return;
    }
    setPublicado(r.aplicado);
    if (r.aplicado) setBorrador({ ...r.aplicado });
    setAnterior(r.anterior);
    setEnvio('aplicado');
    setUltimo('aplicar');
    setVersion(v => v + 1);
  }

  async function deshacer() {
    if (enVuelo.current || anterior === undefined || pendiente) return;
    enVuelo.current = true;
    setEnvio('aplicando');
    setMensajeFallo(null);
    setUltimo(null);
    const r = await aplicarEstiloWidgetsApi({ estilo: anterior, esperado: publicado, motivo: 'deshacer' });
    enVuelo.current = false;
    if (!r.ok) {
      setEnvio('fallo');
      setMensajeFallo(motivoDe(r));
      return;
    }
    setPublicado(r.aplicado);
    setBorrador(r.aplicado ? { ...r.aplicado } : { ...WIDGET_WEB_NEUTRO });
    setAnterior(undefined);
    setEnvio('reposo');
    setUltimo('deshacer');
    setVersion(v => v + 1);
  }

  function reintentarCarga() {
    setFase('cargando');
    setIntento(n => n + 1);
  }

  return {
    fase, publicado, base, borrador, pendiente, errores, envio, mensajeFallo, anterior, ultimo, version,
    cambiar, descartar, aplicar, deshacer, reintentarCarga,
  };
}
