'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, X } from 'lucide-react';
import { CAPITULOS } from '@/lib/guia/curriculo';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Primera vez aquí?» — la guía, asomándose donde hace falta.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// La guía vive en su pantalla, y quien no sabe que existe no va a ella. El
// momento en que una propietaria necesita que le expliquen Cobros es cuando
// abre Cobros, no cuando decide ponerse a aprender.
//
// ── Por qué una sola pieza y no una por pantalla ─────────────────────────────
// Montarla dentro de cada sección obligaba a tocar `calendario/page.tsx`
// (3.700 líneas), `clientas/page.tsx` (1.900) y compañía, y a que cada una
// recordara su propio enlace. Aquí vive el mapa entero: se monta una vez en el
// armazón y decide por la ruta.
//
// ── Por qué no satura ────────────────────────────────────────────────────────
// Tres frenos, y hacen falta los tres:
//   1. Solo en las secciones del mapa de abajo — no en las treinta y pico.
//   2. Se cierra y no vuelve, por navegador (mismo patrón que el tour y que
//      `panel-privacy`). Cerrarla es una respuesta, y repreguntar es el
//      comportamiento que el encargo pedía evitar.
//   3. Una sola línea, sin ilustración ni caja de color. Es una puerta, no un
//      anuncio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sección del panel → capítulo que la explica.
 *
 * Deliberadamente corto: solo las pantallas donde una propietaria nueva se
 * queda mirando sin saber qué hacer. Añadir aquí las treinta y pico rutas
 * convertiría la ayuda en ruido y la primera en cerrarse para siempre sería
 * justamente la útil.
 */
const CAPITULO_POR_SECCION: Record<string, string> = {
  '/calendario': 'tu-horario',
  '/cobros': 'cobrar',
  '/clientas': 'tus-alumnas',
  '/equipo': 'tu-equipo',
  '/automatizaciones': 'que-trabaje-solo',
  '/informes': 'entiende-tu-negocio',
  '/sustituciones': 'tu-equipo',
  '/migracion': 'tus-alumnas',
};

const CLAVE = 'guia-ayuda-cerrada';

/** Las secciones que la propietaria ya cerró, guardadas juntas. */
function leerCerradas(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    const v: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // Ventana privada, almacenamiento bloqueado o un JSON corrupto de una
    // versión anterior: sin memoria se enseña, que es el fallo benigno.
    return [];
  }
}

export function PrimeraVezAqui() {
  const pathname = usePathname();
  // La primera pantalla se pinta SIN la tira y aparece tras leer localStorage,
  // que no existe en SSR. Al revés —pintarla y esconderla— daría un parpadeo a
  // quien ya la cerró, que es peor que aparecer medio segundo tarde.
  const [cerradas, setCerradas] = useState<string[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCerradas(leerCerradas());
  }, []);

  // Coincidencia por sección, no por ruta exacta: `/clientas/abc` sigue siendo
  // Clientas. Se ordena de más larga a más corta para que un prefijo corto no
  // le robe la coincidencia a uno más específico si algún día se añade.
  const seccion = Object.keys(CAPITULO_POR_SECCION)
    .sort((a, b) => b.length - a.length)
    .find(s => pathname === s || pathname.startsWith(`${s}/`));

  if (!seccion || cerradas === null || cerradas.includes(seccion)) return null;

  const capitulo = CAPITULOS.find(c => c.id === CAPITULO_POR_SECCION[seccion]);
  if (!capitulo) return null;

  function cerrar() {
    if (!seccion) return;
    const siguiente = [...leerCerradas(), seccion];
    setCerradas(siguiente);
    try { localStorage.setItem(CLAVE, JSON.stringify(siguiente)); } catch { /* sin memoria, volverá a salir */ }
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <BookOpen size={15} className="text-brand-secondary shrink-0" />
      <p className="flex-1 min-w-0 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">¿Primera vez aquí?</span>{' '}
        {capitulo.resumen}{' '}
        <Link href={`/primeros-pasos/${capitulo.id}`} className="font-semibold text-brand-secondary hover:underline whitespace-nowrap">
          Ver guía
        </Link>
      </p>
      <button
        onClick={cerrar}
        aria-label="No volver a mostrar esta ayuda aquí"
        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
