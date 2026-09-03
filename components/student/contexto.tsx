'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { EstudioStudent } from '@/lib/student/estudio';

// El ÚNICO contexto de la Student PWA, y a propósito es diminuto.
//
// El paquete de diseño importa `studio` como una constante global desde 12
// ficheros. Aquí el estudio depende del slug de la URL, así que hace falta
// algún transporte — pero no un contexto de estado.
//
// Lo que lleva: el estudio ya resuelto en servidor. Nada más. No hay carga, ni
// refresco, ni escrituras, ni suscripciones. Los datos de la alumna (clases,
// reservas, bonos) los pide cada pantalla a su adaptador y los guarda en su
// propio estado: así una pantalla no re-renderiza a las demás, que es
// justamente lo que hace inmanejable a `StudioProvider`.
//
// Regla para quien siga: si alguna vez hace falta añadir un campo mutable a
// este contexto, es señal de que ese estado pertenece a una pantalla.

interface ValorStudent {
  estudio: EstudioStudent;
  /** Atajo: `estudio.slug`. Se usa en cada href, y leerlo así evita
   *  desestructurar el estudio entero en componentes que solo navegan. */
  slug: string;
}

const StudentContext = createContext<ValorStudent | null>(null);

export function StudentProvider({ estudio, children }: { estudio: EstudioStudent; children: ReactNode }) {
  // Sin `useMemo`: `estudio` viene de un Server Component y es estable entre
  // renders del layout, así que memoizar solo añadiría ruido.
  return (
    <StudentContext.Provider value={{ estudio, slug: estudio.slug }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useEstudio(): ValorStudent {
  const v = useContext(StudentContext);
  if (!v) throw new Error('useEstudio() fuera de <StudentProvider>. Toda pantalla de la alumna cuelga de app/portal/[slug]/layout.tsx.');
  return v;
}

/** Construye una ruta de la app de la alumna. `ruta('/bonos')` → `/portal/x/bonos`. */
export function usePortalHref(): (ruta?: string) => string {
  const { slug } = useEstudio();
  return (ruta = '') => `/portal/${encodeURIComponent(slug)}${ruta}`;
}
