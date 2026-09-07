'use client';

// El estado de «Personalizar tu panel»: menú (orden, ocultos y posición) e
// Inicio (orden y ocultos), sobre el MISMO `studio_layout`.
//
// ⚠️ Un solo hook para las tres cosas del menú y las dos de Inicio, y un solo
// guardado. Son campos del mismo documento: repartirlos en varios hooks con su
// propio botón haría que guardar uno pisara lo que el otro tenía sin guardar.
//
// ⚠️ `menuPosition` ya existía en `layout-runtime.ts` (MENU_POSICIONES) con su
// validación y su sitio en el esquema — declarado y sin cablear. Se usa ese, no
// una columna nueva: dos fuentes para el mismo ajuste es lo que este repo
// prohíbe, y ya costó una migración de ida y vuelta.

import { useCallback, useEffect, useState } from 'react';
import { type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { usePermisos } from '@/lib/permisos';
import { fetchLayout, guardarLayoutApi } from '@/lib/api-client';
import { ordenarItemsMenu, type MenuPosicion } from '@/lib/layout-runtime';
import { MODULOS, NO_OCULTABLES } from '@/lib/nav-config';
import { HOME_SECCIONES, HOME_FIJAS_PRIMERO } from '@/lib/home-sections';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ItemOrdenable } from '@/components/panel/lista-ordenable';

// Las de HOME_FIJAS_PRIMERO no se listan: son avisos de estado que aparecen y
// desaparecen solos, no contenido que tenga sentido arrastrar (mismo criterio
// que el editor de Inicio original).
const SECCIONES_HOME = HOME_SECCIONES.filter(s => !HOME_FIJAS_PRIMERO.includes(s.id));

function mover<T>(lista: T[], e: DragEndEvent, clave: (x: T) => string): T[] {
  const { active, over } = e;
  if (!over || active.id === over.id) return lista;
  const i = lista.findIndex(x => clave(x) === active.id);
  const j = lista.findIndex(x => clave(x) === over.id);
  return i < 0 || j < 0 ? lista : arrayMove(lista, i, j);
}

// `use…` y no `usar…`: el prefijo es SINTAXIS (lo exige la regla de hooks de
// React), no nombre de dominio — mismo criterio que el resto del repo, donde
// el andamiaje va en inglés y el negocio en español.
export function usePersonalizacionPanel() {
  const { puedeVer } = usePermisos();

  const [modulos, setModulos] = useState<ItemOrdenable[]>([]);
  const [modulosOcultos, setModulosOcultos] = useState<Set<string>>(new Set());
  const [posicion, setPosicion] = useState<MenuPosicion>('lateral');
  const [seccionesHome, setSeccionesHome] = useState<string[]>(SECCIONES_HOME.map(s => s.id));
  const [homeOcultos, setHomeOcultos] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(() => {
    // Solo los módulos que este rol puede ver: ofrecer ocultar algo que ya no
    // ves es un control que no hace nada.
    const visibles = MODULOS.filter(m => puedeVer(m.href));
    fetchLayout()
      .then(l => {
        setModulos(ordenarItemsMenu(visibles, l.orden).map(m => ({
          id: m.href, label: m.label, fijo: NO_OCULTABLES.includes(m.href),
        })));
        setModulosOcultos(new Set(l.ocultos));
        setPosicion(l.menuPosition);
        const todas = SECCIONES_HOME.map(s => s.id);
        setSeccionesHome([
          ...l.home.orden.filter(h => todas.includes(h)),
          ...todas.filter(h => !l.home.orden.includes(h)),
        ]);
        setHomeOcultos(new Set(l.home.ocultos));
        setEstado('listo');
        setSucio(false);
      })
      .catch(() => {
        // Fallar en ABIERTO: se listan los módulos con su orden de fábrica en
        // vez de dejar la pantalla vacía. Lo que no se hace es dejar guardar
        // encima de un layout que no se ha podido leer — eso borraría el suyo.
        setModulos(visibles.map(m => ({ id: m.href, label: m.label, fijo: NO_OCULTABLES.includes(m.href) })));
        setEstado('error');
      });
  }, [puedeVer]);

  useEffect(cargar, [cargar]);

  const tocado = () => { setSucio(true); setAviso(null); };

  return {
    estado, guardando, sucio, aviso,
    modulos, modulosOcultos, posicion, seccionesHome, homeOcultos,
    secciones: SECCIONES_HOME,

    moverModulo: (e: DragEndEvent) => { setModulos(p => mover(p, e, x => x.id)); tocado(); },
    ocultarModulo: (id: string) => {
      if (NO_OCULTABLES.includes(id)) return;
      setModulosOcultos(p => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
      tocado();
    },
    moverSeccion: (e: DragEndEvent) => { setSeccionesHome(p => mover(p, e, x => x)); tocado(); },
    ocultarSeccion: (id: string) => {
      setHomeOcultos(p => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
      tocado();
    },
    elegirPosicion: (p: MenuPosicion) => { setPosicion(p); tocado(); },

    async guardar() {
      setGuardando(true);
      setAviso(null);
      try {
        await guardarLayoutApi({
          orden: modulos.map(m => m.id),
          ocultos: [...modulosOcultos],
          menuPosition: posicion,
          home: { orden: seccionesHome, ocultos: [...homeOcultos] },
        });
        // El menú escucha esto y se recoloca en el sitio, sin recargar.
        window.dispatchEvent(new CustomEvent('tentare-layout-changed'));
        setSucio(false);
        setAviso({ tipo: 'ok', texto: 'Guardado y aplicado.' });
      } catch (e) {
        setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
      } finally {
        setGuardando(false);
      }
    },

    descartar: cargar,
  };
}
