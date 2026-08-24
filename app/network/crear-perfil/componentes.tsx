'use client';

// Piezas visuales compartidas por varios pasos del wizard
// (app/network/crear-perfil) — extraídas tal cual del final del componente
// de página, sin rediseñarlas (F0 del roadmap de Tentare Network 2.0:
// partir el wizard en componentes por paso sin cambiar comportamiento).
//
// ShellCentrado la usa PasoCuenta (pantallas sin sesión: alta y código OTP).
// DropzoneDocumento/EstadoDocumento/EstadoPill las usan PasoIdentidad
// (documento de identidad) y PasoFormacion (certificado de cada formación)
// — mismo componente, dos documentos distintos, así que viven aquí en vez
// de duplicarse o colgar de uno solo de los dos pasos.
import Image from 'next/image';
import { Loader2, Upload, X, Clock3, ShieldCheck } from 'lucide-react';
import type { VerificacionIdentidadNetwork } from '@/lib/network/tipos';
import { NW_MUTED, NW_BORDE, NW_FONDO, NW_ESTADO } from '@/components/network-v2/tokens';

// Split-screen en escritorio (lg+): antes era una columna de 384px centrada
// en toda la pantalla, con ~60% de aire vacío a los lados y sin ninguna
// imagen ni contexto de marca — la pantalla con MENOS orientación de todo
// el wizard justo en el primer contacto de la usuaria (hallazgo de la
// auditoría UX). Reutiliza /disciplinas/pilates.jpg — la misma foto real
// que ya usa SeccionHeroNetwork/SeccionCtaFinal para Network, no una
// encargada de nuevo (mismo criterio de marca: el producto se distingue
// por su color, no rehaciendo el material). En móvil/tablet, columna
// centrada como antes — el panel de foto se oculta, no se apila encima.
export function ShellCentrado({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex" style={{ background: NW_FONDO }}>
      <div className="flex items-center justify-center px-6 py-16 lg:flex-1 lg:py-24">
        <div className="max-w-sm w-full">{children}</div>
      </div>
      <div className="hidden lg:block lg:flex-1 relative">
        <Image src="/disciplinas/pilates.jpg" alt="" fill sizes="50vw" style={{ objectFit: 'cover' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(26,26,26,.05), rgba(26,26,26,.35))' }} />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="text-[22px] font-extrabold leading-tight text-white">
            La red profesional de instructoras de Pilates y Yoga.
          </p>
          <p className="mt-2 text-[14px] text-white/85">
            Publica tu perfil una vez. Los estudios te contactan a ti.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DropzoneDocumento({
  etiqueta, subiendo, error, inputRef, onArchivo,
}: {
  etiqueta: string; subiendo: boolean; error: string; inputRef: React.RefObject<HTMLInputElement | null>; onArchivo: (f: File) => void;
}) {
  return (
    <div>
      <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onArchivo(f); }} />
      <button
        type="button" disabled={subiendo} onClick={() => inputRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl text-[13px] font-semibold disabled:opacity-60"
        style={{ border: `1.5px dashed ${NW_BORDE}`, color: NW_MUTED }}
      >
        {subiendo ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
        {subiendo ? 'Subiendo…' : etiqueta}
      </button>
      {error && <p className="text-[12.5px] text-destructive mt-1.5">{error}</p>}
    </div>
  );
}

export function EstadoDocumento({ estado, motivo }: { estado: VerificacionIdentidadNetwork['estado']; motivo: string | null }) {
  if (estado === 'verificado') return <EstadoPill estilo="verificada" texto="Verificada" />;
  if (estado === 'rechazado') {
    return (
      <div className="p-3 rounded-xl" style={{ background: NW_ESTADO.rechazada.fondo }}>
        <div className="flex items-center gap-1.5"><X size={14} style={{ color: NW_ESTADO.rechazada.color }} /><span className="text-[12.5px] font-bold" style={{ color: NW_ESTADO.rechazada.color }}>Rechazada</span></div>
        {motivo && <p className="text-[12px] mt-1" style={{ color: NW_ESTADO.rechazada.color }}>{motivo}</p>}
      </div>
    );
  }
  return <EstadoPill estilo="pendiente" texto={estado === 'en_revision' ? 'En revisión' : 'Pendiente de verificación'} />;
}

export function EstadoPill({ estilo, texto }: { estilo: 'verificada' | 'pendiente' | 'rechazada'; texto: string }) {
  const c = NW_ESTADO[estilo];
  const Icono = estilo === 'verificada' ? ShieldCheck : Clock3;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: c.fondo, color: c.color }}>
      <Icono size={13} /> {texto}
    </span>
  );
}
