'use client';

// "Compartir perfil" — pedido explícito del rediseño del perfil público
// (2026-08-31): copiar el enlace, sin depender de la Web Share API (no
// disponible en todos los navegadores de escritorio) para que el botón
// funcione igual en cualquier sitio. Mismo patrón de feedback que el resto
// de "copiar" del repo: cambia el propio texto del botón un momento, sin
// toast aparte.
import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

export function BotonCompartirPerfil({ url, compacto = false }: { url: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Portapapeles bloqueado (permisos, contexto no seguro): sin feedback
      // falso de éxito — el botón simplemente no cambia.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition-opacity hover:opacity-70"
      style={{ color: 'inherit' }}
      aria-label="Copiar enlace del perfil"
    >
      {copiado ? <Check size={14} /> : <Share2 size={14} />}
      {!compacto && (copiado ? 'Enlace copiado' : 'Compartir perfil')}
    </button>
  );
}
