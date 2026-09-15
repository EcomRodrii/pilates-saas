'use client';

import { useId, useRef, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { hayCambios as formularioCambiado, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import type { Studio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { labelCls } from '@/components/configuracion/estilos';

// Lo que comparten los formularios que editan la fila del estudio desde tres
// secciones distintas: «Nombre y dirección» y «Contacto» (Mi estudio, cada uno en
// su cajón), «Textos de tu app» (Marca) y «Datos fiscales e IVA» (Cobros y
// facturas).
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
        ? <p role="alert" className="mt-1 text-xs font-medium text-destructive">{error}</p>
        : ayuda && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ayuda}</p>}
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
    }
  }

  return {
    form,
    setForm,
    base,
    hayCambios: formularioCambiado(form, base),
    guardar,
    descartar: () => setForm(base),
  };
}
