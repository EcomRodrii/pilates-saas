'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Lo que ve alguien de fuera cuando el estudio tiene su página escondida
// mientras la prepara.
//
// Dos estados, y la diferencia importa: con clave configurada se ofrece
// entrar; sin ella no se pinta ningún campo. Un formulario que no abre con
// ninguna clave es una crueldad y además invita a probar — ver
// `veredictoPagina` en lib/publico/acceso-pagina.ts.

export function PaginaOculta({
  nombre, slug, pideClave,
}: {
  nombre: string;
  slug: string;
  pideClave: boolean;
}) {
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/public/acceso-pagina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, clave }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
        // ⚠️ Se lee el CUERPO y no se asume éxito: es el patrón de bug más
        // repetido de este repo —anunciar que ha ido bien con el servidor
        // diciendo que no— y aquí sería literalmente dejar pasar a nadie.
        setError(cuerpo?.error ?? 'La clave no es correcta.');
        return;
      }
      // Recarga entera y no un router.refresh(): quien decide es el layout del
      // servidor leyendo la cookie que acaba de ponerse.
      window.location.reload();
    } catch (err) {
      setError(mensajeSeguro((err as Error).message, ERROR_RED));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-background">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Lock size={20} className="text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[20px] font-bold text-foreground">{nombre}</h1>
          <p className="text-[14px] text-muted-foreground leading-snug">
            Estamos preparando esta página. Vuelve dentro de poco.
          </p>
        </div>

        {pideClave && (
          <form onSubmit={entrar} className="space-y-2.5 text-left">
            <label className="block space-y-1">
              <span className="text-[13px] font-medium text-foreground">¿Tienes la clave?</span>
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoComplete="off"
                className="w-full text-[14px] px-3 py-2.5 rounded-xl border border-border bg-background"
              />
            </label>
            {error && <p className="text-[12.5px] text-destructive" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={enviando || clave.length === 0}
              className="w-full text-[14px] font-semibold px-4 py-2.5 rounded-xl bg-brand text-brand-foreground disabled:opacity-50"
            >
              {enviando ? 'Comprobando…' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
