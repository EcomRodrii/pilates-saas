'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Chip, Colores } from '@/components/etiquetas/etiquetas-ui';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import {
  MAX_NOMBRE_ETIQUETA, efectoDeRenombrar, estiloDeEtiqueta, listaDeEtiquetas,
  motivoNombreNoValido, normalizarNombre, type ColorEtiqueta, type EtiquetaEnLista,
} from '@/lib/etiquetas/etiquetas';
import { inputCls, btnPrimary, btnSecondary, Field } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCajonAjuste } from '@/components/configuracion/shell/cajon-ajuste';
import { useNavegacionConfig } from '@/components/configuracion/shell/contexto';
import type { MostrarToast } from '@/components/ui/toast';

// ─── Etiquetas ────────────────────────────────────────────────────────────────
//
// El cajón de su fila en Alta de alumnas: las etiquetas del estudio con su color y a cuántas alumnas se las has puesto.
// Aquí se CREAN (antes la ficha solo ofrecía siete fijas) y se cambian de golpe: renombrar —o juntar con otra— y
// eliminar tocan a todas las alumnas que la tienen, y por eso antes de confirmar se dice a cuántas.
//
// Quién tiene cada etiqueta sigue en la ficha de cada alumna (`socios.tags`): lo que se lista aquí es el catálogo y lo que
// ya hay puesto en las fichas, junto (lib/etiquetas/etiquetas.ts). Una etiqueta puesta en alguna ficha sin estar en el
// catálogo se lista igual, en gris; al darle color o crearla pasa al catálogo.

export function TabEtiquetas({ showToast }: { showToast: MostrarToast }) {
  const { etiquetas, etiquetasCargadas, socios, crearEtiqueta, cambiarColorEtiqueta, renombrarEtiqueta, eliminarEtiqueta } = useStudio();
  const puedeEditar = puedeGestionarClientas(useRol());
  const uid = useId();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<ColorEtiqueta>('azul');
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [errorRenombrar, setErrorRenombrar] = useState<string | null>(null);
  const [colorDe, setColorDe] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<EtiquetaEnLista | null>(null);
  const ocupado = useRef(false);

  const lista = listaDeEtiquetas(etiquetas, socios);
  const nombres = lista.map(e => e.nombre);

  // Un nombre a medio escribir cuenta como cambio sin guardar: cerrar el cajón (o irse) pregunta.
  const cajon = useCajonAjuste();
  const nav = useNavegacionConfig();
  const aMedias = nombre.trim() !== '' || editando !== null;
  const descartar = useCallback(() => { setNombre(''); setError(null); setEditando(null); setErrorRenombrar(null); }, []);
  useEffect(() => {
    if (!aMedias || !cajon) return;
    return cajon.marcarCambios(descartar);
  }, [aMedias, cajon, descartar]);
  useEffect(() => {
    if (!aMedias || !nav) return;
    return nav.marcarSinGuardar('altas');
  }, [aMedias, nav]);

  async function crear() {
    const limpio = normalizarNombre(nombre);
    const motivo = motivoNombreNoValido(limpio, nombres);
    if (motivo) { setError(motivo); return; }
    // Un ref contra el doble toque: el segundo llega antes del repintado.
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const res = await crearEtiqueta(limpio, color);
      if (!res.ok) { setError(res.error); return; }
      showToast(`Etiqueta «${limpio}» creada`);
      setNombre('');
      setError(null);
    } finally {
      ocupado.current = false;
    }
  }

  async function darColor(e: EtiquetaEnLista, c: ColorEtiqueta) {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      // Sin fila en el catálogo (solo está puesta en fichas): darle color es crearla.
      const res = e.id ? await cambiarColorEtiqueta(e.id, c) : await crearEtiqueta(e.nombre, c);
      if (!res.ok) { showToast(res.error, { variant: 'error' }); return; }
      setColorDe(null);
    } finally {
      ocupado.current = false;
    }
  }

  function empezarARenombrar(e: EtiquetaEnLista) {
    setEditando(e.nombre);
    setNuevoNombre(e.nombre);
    setErrorRenombrar(null);
    setColorDe(null);
  }

  async function renombrar(e: EtiquetaEnLista) {
    const limpio = normalizarNombre(nuevoNombre);
    const efecto = efectoDeRenombrar(lista, e.nombre, limpio);
    // Juntar con otra que ya existe es válido (es la fusión); lo que no vale es vacío o demasiado largo.
    const motivo = motivoNombreNoValido(limpio, efecto.seFunde ? [] : nombres, e.nombre);
    if (motivo) { setErrorRenombrar(motivo); return; }
    if (limpio === e.nombre) { setEditando(null); return; }
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const res = await renombrarEtiqueta(e.nombre, limpio);
      if (!res.ok) { setErrorRenombrar(res.error); return; }
      showToast(efecto.seFunde ? `«${e.nombre}» se ha juntado con «${limpio}»` : `Etiqueta renombrada a «${limpio}»`);
      setEditando(null);
      setErrorRenombrar(null);
    } finally {
      ocupado.current = false;
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <p className="text-pretty text-sm text-muted-foreground">
        Para agrupar a tus alumnas a tu manera —«Mamás», «Mañanas», «Vienen con su pareja»—. Las pones en la ficha de cada una o a varias a la vez desde
        Alumnas, y en Alumnas filtras por ellas.
      </p>

      {puedeEditar ? (
        <section aria-labelledby={`${uid}-nueva`} className="space-y-4">
          <h3 id={`${uid}-nueva`} className="text-sm font-semibold text-foreground">Nueva etiqueta</h3>
          <Field label="Nombre" description={`Hasta ${MAX_NOMBRE_ETIQUETA} caracteres. «VIP» y «vip» son la misma.`}>
            <input
              className={inputCls}
              placeholder="Ej. Mamás"
              aria-label="Nombre de la etiqueta"
              maxLength={MAX_NOMBRE_ETIQUETA + 10}
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }}
              aria-invalid={error ? true : undefined}
            />
            {error && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{error}</p>}
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Color</p>
            <Colores valor={color} onElegir={setColor} etiqueta="Color de la etiqueta nueva" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void crear()} className={btnPrimary}><Plus size={14} aria-hidden /> Añadir etiqueta</button>
            {nombre.trim() !== '' && <Chip nombre={normalizarNombre(nombre)} color={color} />}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Solo quien lleva las alumnas puede crear o cambiar etiquetas.</p>
      )}

      <section aria-labelledby={`${uid}-lista`} className="space-y-2">
        <h3 id={`${uid}-lista`} className="text-sm font-semibold text-foreground">Las de tu estudio ({lista.length})</h3>
        {!etiquetasCargadas && lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes ninguna. Crea la primera arriba y úsala desde la ficha de una alumna.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lista.map(e => {
              const enEdicion = editando === e.nombre;
              const efecto = enEdicion ? efectoDeRenombrar(lista, e.nombre, nuevoNombre) : null;
              return (
                <li key={e.nombre} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Chip nombre={e.nombre} color={e.color} />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {e.usos === 0 ? 'Sin alumnas' : e.usos === 1 ? '1 alumna' : `${e.usos} alumnas`}
                    </span>
                    {puedeEditar && (
                      <>
                        <button
                          type="button"
                          onClick={() => setColorDe(colorDe === e.nombre ? null : e.nombre)}
                          aria-expanded={colorDe === e.nombre}
                          aria-label={`Cambiar el color de ${e.nombre}`}
                          className="zona-tactil rounded-lg p-1.5 hover:bg-muted"
                        >
                          <span className="block size-3.5 rounded-full" style={{ backgroundColor: estiloDeEtiqueta(e.color).color }} aria-hidden />
                        </button>
                        <button type="button" onClick={() => empezarARenombrar(e)} className="zona-tactil rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Renombrar ${e.nombre}`}>
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button type="button" onClick={() => setAEliminar(e)} className="zona-tactil rounded-lg p-1.5 text-destructive hover:bg-muted" aria-label={`Eliminar ${e.nombre}`}>
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                  {puedeEditar && colorDe === e.nombre && (
                    <Colores valor={e.color} onElegir={c => void darColor(e, c)} etiqueta={`Color de ${e.nombre}`} />
                  )}
                  {puedeEditar && enEdicion && (
                    <div className="space-y-2">
                      <Field label="Nuevo nombre">
                        <input
                          className={inputCls}
                          value={nuevoNombre}
                          aria-label="Nuevo nombre"
                          maxLength={MAX_NOMBRE_ETIQUETA + 10}
                          autoFocus
                          onChange={ev => { setNuevoNombre(ev.target.value); setErrorRenombrar(null); }}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter') { ev.preventDefault(); void renombrar(e); }
                            if (ev.key === 'Escape') { ev.stopPropagation(); setEditando(null); }
                          }}
                          aria-invalid={errorRenombrar ? true : undefined}
                        />
                        {errorRenombrar && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{errorRenombrar}</p>}
                      </Field>
                      {efecto && normalizarNombre(nuevoNombre) !== '' && normalizarNombre(nuevoNombre) !== e.nombre && (
                        <p className="text-pretty text-xs text-muted-foreground" role="status">
                          {efecto.seFunde
                            ? `Ya existe «${normalizarNombre(nuevoNombre)}»: las dos se juntan en una${efecto.alumnas > 0 ? ` y ${efecto.alumnas === 1 ? 'se cambia a 1 alumna' : `se cambian ${efecto.alumnas} alumnas`}` : ''}.`
                            : efecto.alumnas === 0 ? 'Ninguna alumna la tiene todavía.'
                            : efecto.alumnas === 1 ? 'Se cambiará en 1 alumna.' : `Se cambiará en ${efecto.alumnas} alumnas.`}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void renombrar(e)} className={btnPrimary}><Check size={14} aria-hidden /> Guardar</button>
                        <button type="button" onClick={() => { setEditando(null); setErrorRenombrar(null); }} className={btnSecondary}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={o => { if (!o) setAEliminar(null); }}
        titulo={aEliminar ? `¿Eliminar «${aEliminar.nombre}»?` : '¿Eliminar la etiqueta?'}
        descripcion={aEliminar
          ? aEliminar.usos === 0
            ? 'Ninguna alumna la tiene: solo desaparece de tu lista.'
            : `Se quita de ${aEliminar.usos === 1 ? '1 alumna' : `${aEliminar.usos} alumnas`}. Las alumnas no se borran, solo pierden la etiqueta.`
          : ''}
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={async () => {
          const e = aEliminar;
          setAEliminar(null);
          if (!e) return;
          const res = await eliminarEtiqueta(e.nombre);
          if (res.ok) showToast(`Etiqueta «${e.nombre}» eliminada`);
          else showToast(res.error, { variant: 'error' });
        }}
      />
    </div>
  );
}
