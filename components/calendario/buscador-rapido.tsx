'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { buscarSesiones, type SesionBuscable } from '@/lib/calendario-busqueda';

// Fase 2 del calendario — command-palette pequeño para saltar a una clase
// por instructora/sala/tipo sin navegar semana a semana. Deliberadamente
// SEPARADO del input "Buscar clase..." de FiltrosCalendario: ese filtra lo
// ya cargado en la ventana visible (punto 9 del rediseño); este busca en
// TODO el estudio y salta de fecha — cambiarle el comportamiento a aquel
// habría sido una regresión silenciosa de un filtro que ya funciona.
export interface BuscadorRapidoProps {
  candidatas: SesionBuscable[];
  onSeleccionar: (id: string) => void;
}

export function BuscadorRapido({ candidatas, onSeleccionar }: BuscadorRapidoProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  const resultados = abierto ? buscarSesiones(candidatas, texto, new Date()) : [];

  function seleccionar(id: string) {
    onSeleccionar(id);
    setAbierto(false);
    setTexto('');
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        aria-label="Buscar clase en todo el estudio"
        title="Buscar clase en todo el estudio"
        className="flex items-center justify-center w-9 h-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search size={15} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-72 rounded-xl border border-border bg-card shadow-lg overflow-hidden menu-pop-in">
            <input
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Instructora, sala o tipo de clase…"
              className="w-full border-b border-border px-3.5 py-2.5 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {texto.trim() && (
              <div className="max-h-72 overflow-y-auto" data-testid="buscador-resultados">
                {resultados.length === 0 ? (
                  <p className="px-3.5 py-3 text-xs text-muted-foreground">Sin resultados</p>
                ) : (
                  resultados.map(r => (
                    <button
                      key={r.id}
                      onClick={() => seleccionar(r.id)}
                      className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left hover:bg-muted transition-colors"
                    >
                      <span className="text-sm font-semibold text-foreground">{r.tipoClaseNombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' · '}
                        {new Date(r.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{r.salaNombre}{' · '}{r.instructorNombre}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
