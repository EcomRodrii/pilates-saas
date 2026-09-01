'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X, Loader2, MessageCircle, Inbox } from 'lucide-react';
import { Toast, useToast } from '@/components/ui/toast';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { HiloMensajes } from '@/components/network/hilo-mensajes';
import { useAuth } from '@/lib/auth-context';
import {
  fetchSolicitudesContactoNetwork, resolverSolicitudContactoNetwork, type SolicitudContactoRecibida,
} from '@/lib/api-client';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO, NW_ESTADO } from '@/components/network-v2/tokens';
import { selloTemporal } from '@/lib/avisos-portal';

// Rediseño 2026-09 (Fase 6 del mockup del fundador) — tokens NW_* en vez de
// cardCls de panel, mismo criterio que fases 1-5. Comportamiento intacto
// (mismo resolverSolicitudContactoNetwork/HiloMensajes en DashboardSheet).
//
// Copy de los botones ajustado a lo que de verdad hacen: "Aceptar y
// compartir contacto" en vez de "Aceptar" a secas — aceptar SÍ revela el
// email/teléfono privado a ese estudio (docs/NETWORK-IMPLEMENTATION-PLAN.md
// §9/§11), así que decirlo explícito en el botón no es más "bonito", es más
// preciso. "Ahora no" en vez de "Rechazar" — más fiel al tono del resto del
// rediseño, mismo significado (marca `rechazada`).
//
// El mockup mostraba una valoración de estudio (★ 4,9) y una etiqueta "busca
// X" por tarjeta — ninguna de las dos existe en el modelo (no hay rating de
// estudio visible a instructoras, y la solicitud no lleva la especialidad
// que busca el estudio) — se omiten, mismo criterio de "nunca fabricar" que
// ya aplicaron las fases anteriores.
const ESTADO_ESTILO: Record<SolicitudContactoRecibida['estado'], { texto: string; fondo: string; color: string }> = {
  pendiente: { texto: 'Pendiente', fondo: NW_ESTADO.pendiente.fondo, color: NW_ESTADO.pendiente.color },
  aceptada: { texto: 'Aceptada', fondo: NW_ESTADO.verificada.fondo, color: NW_ESTADO.verificada.color },
  rechazada: { texto: 'Rechazada', fondo: NW_SAND, color: NW_MUTED_2 },
};

export default function SolicitudesNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [solicitudes, setSolicitudes] = useState<SolicitudContactoRecibida[]>([]);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const [hiloAbierto, setHiloAbierto] = useState<SolicitudContactoRecibida | null>(null);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchSolicitudesContactoNetwork().then(r => { if (vivo) { setSolicitudes(r); setCargando(false); } });
    return () => { vivo = false; };
  }, [user]);

  async function resolver(id: string, aceptar: boolean) {
    setResolviendoId(id);
    const res = await resolverSolicitudContactoNetwork(id, aceptar);
    setResolviendoId(null);
    if (!res.ok) { showToast(res.error ?? 'No se ha podido resolver'); return; }
    setSolicitudes(prev => prev.map(s => (
      s.id === id ? { ...s, estado: aceptar ? 'aceptada' : 'rechazada', resueltoEn: new Date().toISOString() } : s
    )));
    showToast(aceptar ? 'Solicitud aceptada' : 'Solicitud rechazada');
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente');

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>Solicitudes de contacto</h1>
          <p className="text-[13px] mt-0.5" style={{ color: NW_MUTED }}>Estudios que quieren hablar contigo. Tu email y teléfono solo se comparten si aceptas.</p>
        </div>
        <Link
          href="/network/mis-mensajes"
          className="shrink-0 px-3.5 py-2 rounded-full text-[12px] font-bold transition-opacity hover:opacity-80"
          style={{ background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
        >
          Mensajes
        </Link>
      </div>

      {cargandoSesion || !user || cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin" style={{ color: NW_MUTED }} />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: NW_SAND }}>
          <Inbox size={22} style={{ color: NW_MUTED_2 }} className="mx-auto mb-2" />
          <p className="text-[13px] mb-3" style={{ color: NW_MUTED }}>Todavía no has recibido ninguna solicitud.</p>
          <Link
            href="/network/mi-perfil"
            className="inline-block px-5 py-2.5 rounded-full text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: NW_PRODUCTO }}
          >
            Revisa tu perfil
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {[...pendientes, ...resueltas].map(s => {
            const estilo = ESTADO_ESTILO[s.estado];
            return (
              <div key={s.id} className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-bold" style={{ color: NW_TINTA }}>
                        {s.estudioNombre}{s.estudioCiudad ? ` · ${s.estudioCiudad}` : ''}
                      </p>
                      <span className="text-[11px]" style={{ color: NW_MUTED_2 }}>{selloTemporal(s.creadoEn)}</span>
                    </div>
                    {s.mensaje && <p className="text-[13px] mt-1.5" style={{ color: NW_TINTA }}>«{s.mensaje}»</p>}
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: estilo.fondo, color: estilo.color }}>
                    {estilo.texto}
                  </span>
                </div>
                {s.estado === 'pendiente' && (
                  <div className="flex items-center gap-2 mt-3.5 flex-wrap">
                    <button
                      onClick={() => resolver(s.id, true)}
                      disabled={resolviendoId === s.id}
                      className="px-3.5 py-2 rounded-full text-white text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-90"
                      style={{ background: NW_PRODUCTO }}
                    >
                      {resolviendoId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Aceptar y compartir contacto
                    </button>
                    <button
                      onClick={() => resolver(s.id, false)}
                      disabled={resolviendoId === s.id}
                      className="px-3.5 py-2 rounded-full text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-80"
                      style={{ background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
                    >
                      <X size={14} /> Ahora no
                    </button>
                    <button
                      onClick={() => setHiloAbierto(s)}
                      className="px-3.5 py-2 rounded-full text-[12.5px] font-bold flex items-center gap-1.5 transition-opacity hover:opacity-80"
                      style={{ background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
                    >
                      <MessageCircle size={14} /> Mensajes
                    </button>
                  </div>
                )}
                {s.estado === 'aceptada' && (
                  <Link
                    href={`/network/mis-mensajes?hilo=${s.id}`}
                    className="inline-flex items-center gap-1.5 mt-3.5 px-3.5 py-2 rounded-full text-white text-[12.5px] font-bold transition-opacity hover:opacity-90"
                    style={{ background: NW_PRODUCTO }}
                  >
                    <MessageCircle size={14} /> Enviar mensaje
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DashboardSheet
        open={Boolean(hiloAbierto)}
        onClose={() => setHiloAbierto(null)}
        label={hiloAbierto ? `Mensajes con ${hiloAbierto.estudioNombre}` : 'Mensajes'}
        sheetClassName="bg-card rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
      >
        {hiloAbierto && (
          <>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[13px] font-semibold text-foreground">{hiloAbierto.estudioNombre}</p>
            </div>
            <HiloMensajes solicitudId={hiloAbierto.id} />
          </>
        )}
      </DashboardSheet>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
