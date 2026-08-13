'use client';

import { Eye, EyeOff, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PerfilNetwork } from '@/lib/network/tipos';

const ESTADO_INFO: Record<PerfilNetwork['estado'], { texto: string; chipBg: string; chipText: string; label: string }> = {
  draft: { texto: 'Tu perfil todavía no es visible para ningún estudio.', chipBg: '#F1F2EA', chipText: '#5A6142', label: 'Borrador' },
  published: { texto: 'Tu perfil es visible para los estudios que buscan en Tentare Network.', chipBg: '#EAF6EE', chipText: '#276749', label: 'Publicado' },
  hidden: { texto: 'Has ocultado tu perfil: no aparece en el buscador.', chipBg: '#F1F2EA', chipText: '#5A6142', label: 'Oculto' },
  suspended: { texto: 'Tu perfil ha sido suspendido por moderación. Contacta con soporte si crees que es un error.', chipBg: '#FDEAEA', chipText: '#B42318', label: 'Suspendido' },
};

export function TarjetaEstadoPublicacion({
  perfil, cambiando, error, onPublicar, onOcultar,
}: {
  perfil: PerfilNetwork;
  cambiando: boolean;
  error: string;
  onPublicar: () => void;
  onOcultar: () => void;
}) {
  const info = ESTADO_INFO[perfil.estado];
  const esSuspendido = perfil.estado === 'suspended';

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mb-1.5"
          style={{ backgroundColor: info.chipBg, color: info.chipText }}
        >
          {info.label}
        </span>
        <p className="text-[13px] text-muted-foreground">{info.texto}</p>
        {error && <p className="text-[12px] text-destructive mt-1.5">{error}</p>}
      </div>
      {!esSuspendido && (
        <button
          onClick={perfil.estado === 'published' ? onOcultar : onPublicar}
          disabled={cambiando}
          className={cn(
            'shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60',
            perfil.estado === 'published'
              ? 'bg-card border border-border text-foreground hover:bg-muted'
              : 'bg-brand text-brand-foreground hover:brightness-95',
          )}
        >
          {cambiando ? (
            <Loader2 size={13} className="animate-spin" />
          ) : perfil.estado === 'published' ? (
            <EyeOff size={13} />
          ) : (
            <Eye size={13} />
          )}
          {perfil.estado === 'published' ? 'Ocultar perfil' : 'Publicar perfil'}
        </button>
      )}
      {esSuspendido && <ShieldAlert size={18} className="text-destructive shrink-0 mt-0.5" />}
    </div>
  );
}
