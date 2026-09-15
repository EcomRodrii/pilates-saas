'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { hayCambios as formularioCambiado, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import type { Studio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { labelCls, btnSecondary } from '@/components/configuracion/estilos';

// Lo que comparten los formularios que editan la fila del estudio desde tres
// secciones distintas: «Datos y contacto» (Mi estudio), «Textos de tu app» (Mi
// app y mi web) y «Datos fiscales e IVA» (Cobros y facturas).
//
// Eran UN solo formulario con un solo «Guardar» (TabEstudioGeneral) que mandaba
// los diecisiete campos a la vez. Partido, cada uno manda SOLO los suyos: un
// `updateStudio` parcial. La lista blanca de columnas (lib/supabase-data.ts,
// `dbUpdateStudio`, y el GRANT por columnas de la migr 20260910171150) ya
// escribía campo a campo, y la RLS de `studios` es por fila, no por columna: un
// UPDATE con menos columnas pasa por la misma cerradura que uno con todas.
//
// ⚠️ Lo que NO puede perderse al partirlo (#2027):
//  - un campo solo se pone al día con el servidor si no se ha tocado
//    (lib/configuracion/formulario-sincronizado.ts): guardar el logo, o
//    cualquier otro formulario, cambia `studio` de referencia y no puede borrar
//    lo que se está escribiendo aquí;
//  - «Guardado» solo con la fila confirmada (`updateStudio` cuenta filas);
//  - un ref contra el doble toque, porque dos toques llegan antes de que el
//    botón se repinte deshabilitado.

/**
 * Campo de texto con etiqueta ASOCIADA de verdad.
 *
 * Antes solo "Web" tenía `<label htmlFor>`; los otros doce usaban un `<p>`, o
 * sea que un lector de pantalla anunciaba "cuadro de edición" a secas doce
 * veces seguidas.
 */
export function Campo({
  label,
  ayuda,
  error,
  className,
  children,
}: {
  label: string;
  ayuda?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {children(id)}
      {error
        ? <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{error}</p>
        : ayuda && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

/**
 * El estado de un formulario sobre la fila del estudio: lo que hay en pantalla
 * (`form`), lo último que se sabe del servidor (`base`) y cómo guardar.
 *
 * `aFormulario` saca de `studio` SOLO los campos de este formulario; lo que no
 * esté ahí ni se compara ni se manda.
 */
export function useFormularioEstudio<T extends object>(
  aFormulario: (s: Studio | null) => T,
  showToast: (m: string) => void,
) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<T>(() => aFormulario(studio));
  const [base, setBase] = useState<T>(() => aFormulario(studio));
  const guardandoRef = useRef(false);
  const [guardando, setGuardando] = useState(false);

  // Se pone al día cuando `studio` cambia de referencia (llega de la BD, se
  // guarda el logo u otro formulario) — durante el render, no en un efecto: así
  // no hay un primer pintado con el valor viejo. Lo que se ha tocado se queda.
  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    const servidor = aFormulario(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  /**
   * Manda `cambios` —que tienen que ser los campos de este formulario y nada
   * más— y solo con la fila confirmada los da por guardados.
   *
   * `textoGuardado: null` = quien llama cuenta el resultado (la barra de
   * guardar de la sección): aquí no se enseña nada, ni el éxito ni el error.
   * Devuelve `null` si ya había un guardado en vuelo.
   */
  async function guardar(cambios: Partial<Studio>, textoGuardado: string | null): Promise<ResultadoEscritura | null> {
    if (guardandoRef.current) return null;
    const enviado = form;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const res = await updateStudio(cambios);
      // Si no, lo escrito se queda en pantalla y la barra sigue ahí.
      if (!res.ok) {
        if (textoGuardado !== null) showToast(res.error);
        return res;
      }
      // Lo guardado, normalizado (recortes, vacío → NULL), pasa a ser la base.
      // Lo que se haya tecleado MIENTRAS se guardaba no se pisa.
      const guardado = aFormulario({ ...studio, ...cambios } as Studio);
      setForm(f => sincronizarFormulario(f, enviado, guardado));
      setBase(guardado);
      if (textoGuardado !== null) showToast(textoGuardado);
      return res;
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return {
    form,
    setForm,
    base,
    hayCambios: formularioCambiado(form, base),
    guardando,
    guardar,
    descartar: () => setForm(base),
  };
}

/**
 * La barra de «Tienes cambios sin guardar» de un formulario. Solo aparece con
 * cambios sin guardar.
 *
 * `sticky` y no `fixed`: se queda dentro del bloque de su tarjeta, sin taparle
 * nada al menú. Por encima de la barra de navegación del móvil (56 px + zona
 * segura, `fixed bottom-0 z-30`): pegada a 0 quedaba debajo de ella.
 *
 * `data-barra-guardar`: mientras está, el botón flotante de ayuda por WhatsApp
 * se aparta en el móvil y el iPad (globals.css), porque caía encima de
 * «Guardar».
 */
export function BarraCambiosEstudio({
  visible,
  guardando,
  textoGuardar,
  onGuardar,
  onDescartar,
}: {
  visible: boolean;
  guardando: boolean;
  textoGuardar: string;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      data-barra-guardar=""
      className="sticky z-20 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.5rem)] -mx-1 px-1 pb-1 lg:bottom-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="min-w-0 text-[12.5px] text-muted-foreground">
          Tienes cambios sin guardar.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onDescartar}
            disabled={guardando}
            className={cn(btnSecondary, 'text-[12px]')}
          >
            Descartar
          </button>
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2 text-[12px] font-medium text-brand-foreground transition-colors hover:brightness-95 disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : textoGuardar}
          </button>
        </div>
      </div>
    </div>
  );
}
