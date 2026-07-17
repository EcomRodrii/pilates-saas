'use client';

// Store del módulo de Contenido. Persistencia 100% en el navegador
// (localStorage) — NO usa Supabase ni studio-context, por lo que es imposible
// que afecte a los datos del gimnasio. Provee CRUD + registro de actividad.

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type {
  ContenidoState, Publicacion, Idea, Guion, Carrusel,
  ActividadContenido, TipoActividadContenido,
} from './types';
import { seedContenido, cid } from './seed';

const STORAGE_KEY = 'contenido-store-v1';

function nowIso() {
  return new Date().toISOString();
}

interface ContenidoContextValue extends ContenidoState {
  ready: boolean;
  // Publicaciones
  crearPublicacion: (p: Partial<Publicacion> & Pick<Publicacion, 'titulo'>) => Publicacion;
  actualizarPublicacion: (id: string, patch: Partial<Publicacion>) => void;
  eliminarPublicacion: (id: string) => void;
  duplicarPublicacion: (id: string) => void;
  // Ideas
  crearIdea: (i: Partial<Idea> & Pick<Idea, 'titulo'>) => Idea;
  actualizarIdea: (id: string, patch: Partial<Idea>) => void;
  eliminarIdea: (id: string) => void;
  // Guiones
  guardarGuion: (g: Omit<Guion, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Guion;
  actualizarGuion: (id: string, patch: Partial<Guion>) => void;
  eliminarGuion: (id: string) => void;
  duplicarGuion: (id: string) => void;
  // Carruseles
  guardarCarrusel: (c: Omit<Carrusel, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Carrusel;
  actualizarCarrusel: (id: string, patch: Partial<Carrusel>) => void;
  eliminarCarrusel: (id: string) => void;
  duplicarCarrusel: (id: string) => void;
  // Utilidad
  resetDemo: () => void;
}

const ContenidoContext = createContext<ContenidoContextValue | null>(null);

export function ContenidoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContenidoState>({
    publicaciones: [], ideas: [], guiones: [], carruseles: [], actividad: [],
  });
  const [ready, setReady] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidratar desde localStorage o sembrar demo la primera vez.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setState(JSON.parse(raw) as ContenidoState);
      } else {
        const seeded = seedContenido(new Date());
        setState(seeded);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      }
    } catch {
      setState(seedContenido(new Date()));
    }
    setReady(true);
  }, []);

  // Persistir (con debounce) tras cada cambio.
  useEffect(() => {
    if (!ready) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, 200);
  }, [state, ready]);

  function logActividad(tipo: TipoActividadContenido, descripcion: string) {
    const act: ActividadContenido = { id: cid('act'), tipo, descripcion, ts: nowIso() };
    setState((s) => ({ ...s, actividad: [act, ...s.actividad].slice(0, 40) }));
  }

  const api = useMemo<ContenidoContextValue>(() => ({
    ...state,
    ready,

    crearPublicacion: (p) => {
      const iso = nowIso();
      const nueva: Publicacion = {
        id: cid('pub'),
        titulo: p.titulo,
        contenido: p.contenido ?? '',
        tipo: p.tipo ?? 'post',
        estado: p.estado ?? 'borrador',
        plataformas: p.plataformas ?? ['instagram'],
        fechaProgramada: p.fechaProgramada ?? iso,
        fechaPublicada: p.estado === 'publicada' ? (p.fechaPublicada ?? iso) : undefined,
        hashtags: p.hashtags ?? [],
        guionId: p.guionId,
        carruselId: p.carruselId,
        metricas: p.metricas,
        createdAt: iso,
        updatedAt: iso,
      };
      setState((s) => ({ ...s, publicaciones: [nueva, ...s.publicaciones] }));
      logActividad(
        nueva.estado === 'publicada' ? 'publicacion_publicada' : 'publicacion_creada',
        `${nueva.estado === 'publicada' ? 'Publicada' : 'Creada'} "${nueva.titulo}"`,
      );
      return nueva;
    },
    actualizarPublicacion: (id, patch) => {
      setState((s) => ({
        ...s,
        publicaciones: s.publicaciones.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p),
      }));
    },
    eliminarPublicacion: (id) => {
      setState((s) => ({ ...s, publicaciones: s.publicaciones.filter((p) => p.id !== id) }));
    },
    duplicarPublicacion: (id) => {
      setState((s) => {
        const orig = s.publicaciones.find((p) => p.id === id);
        if (!orig) return s;
        const iso = nowIso();
        const copia: Publicacion = {
          ...orig, id: cid('pub'), titulo: `${orig.titulo} (copia)`,
          estado: 'borrador', fechaPublicada: undefined, metricas: undefined,
          createdAt: iso, updatedAt: iso,
        };
        return { ...s, publicaciones: [copia, ...s.publicaciones] };
      });
    },

    crearIdea: (i) => {
      const iso = nowIso();
      const nueva: Idea = {
        id: cid('idea'), titulo: i.titulo, notas: i.notas ?? '',
        estado: i.estado ?? 'nueva', plataformaSugerida: i.plataformaSugerida,
        tags: i.tags ?? [], createdAt: iso, updatedAt: iso,
      };
      setState((s) => ({ ...s, ideas: [nueva, ...s.ideas] }));
      logActividad('idea_creada', `Nueva idea: ${nueva.titulo}`);
      return nueva;
    },
    actualizarIdea: (id, patch) => {
      setState((s) => ({
        ...s, ideas: s.ideas.map((i) => i.id === id ? { ...i, ...patch, updatedAt: nowIso() } : i),
      }));
    },
    eliminarIdea: (id) => {
      setState((s) => ({ ...s, ideas: s.ideas.filter((i) => i.id !== id) }));
    },

    guardarGuion: (g) => {
      const iso = nowIso();
      const existente = g.id ? state.guiones.find((x) => x.id === g.id) : undefined;
      const saved: Guion = existente
        ? { ...existente, ...g, updatedAt: iso }
        : { ...g, id: g.id ?? cid('guion'), createdAt: iso, updatedAt: iso };
      setState((s) => existente
        ? { ...s, guiones: s.guiones.map((x) => x.id === saved.id ? saved : x) }
        : { ...s, guiones: [saved, ...s.guiones] });
      logActividad('guion_generado', `Guion guardado: ${g.titulo || g.tema}`);
      return saved;
    },
    actualizarGuion: (id, patch) => {
      setState((s) => ({
        ...s, guiones: s.guiones.map((g) => g.id === id ? { ...g, ...patch, updatedAt: nowIso() } : g),
      }));
    },
    eliminarGuion: (id) => {
      setState((s) => ({ ...s, guiones: s.guiones.filter((g) => g.id !== id) }));
    },
    duplicarGuion: (id) => {
      setState((s) => {
        const o = s.guiones.find((g) => g.id === id);
        if (!o) return s;
        const iso = nowIso();
        return { ...s, guiones: [{ ...o, id: cid('guion'), titulo: `${o.titulo} (copia)`, createdAt: iso, updatedAt: iso }, ...s.guiones] };
      });
    },

    guardarCarrusel: (c) => {
      const iso = nowIso();
      const existente = c.id ? state.carruseles.find((x) => x.id === c.id) : undefined;
      const saved: Carrusel = existente
        ? { ...existente, ...c, updatedAt: iso }
        : { ...c, id: c.id ?? cid('carr'), createdAt: iso, updatedAt: iso };
      setState((s) => existente
        ? { ...s, carruseles: s.carruseles.map((x) => x.id === saved.id ? saved : x) }
        : { ...s, carruseles: [saved, ...s.carruseles] });
      logActividad('carrusel_generado', `Carrusel guardado: ${c.tema}`);
      return saved;
    },
    actualizarCarrusel: (id, patch) => {
      setState((s) => ({
        ...s, carruseles: s.carruseles.map((c) => c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c),
      }));
    },
    eliminarCarrusel: (id) => {
      setState((s) => ({ ...s, carruseles: s.carruseles.filter((c) => c.id !== id) }));
    },
    duplicarCarrusel: (id) => {
      setState((s) => {
        const o = s.carruseles.find((c) => c.id === id);
        if (!o) return s;
        const iso = nowIso();
        return { ...s, carruseles: [{ ...o, id: cid('carr'), tema: `${o.tema} (copia)`, slides: o.slides.map((sl) => ({ ...sl, id: cid('sl') })), createdAt: iso, updatedAt: iso }, ...s.carruseles] };
      });
    },

    resetDemo: () => {
      const seeded = seedContenido(new Date());
      setState(seeded);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch { /* */ }
    },
  }), [state, ready]);

  return <ContenidoContext.Provider value={api}>{children}</ContenidoContext.Provider>;
}

export function useContenido(): ContenidoContextValue {
  const ctx = useContext(ContenidoContext);
  if (!ctx) throw new Error('useContenido debe usarse dentro de <ContenidoProvider>');
  return ctx;
}
