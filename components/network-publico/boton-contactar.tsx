'use client';

// CTA "Contactar" del perfil público. Sin sesión → a /login (solo estudios
// contactan, nunca se revela email/teléfono aquí — brief punto 21). Con
// sesión, reusa el mismo endpoint que ya usaba el panel privado
// (contactarPerfilNetwork, POST /api/network/contacto) — si quien pulsa no
// es staff de un estudio, el servidor devuelve 401 y aquí se muestra tal
// cual, no se inventa un mensaje más amable para no fingir que funcionó.
import { useState } from 'react';
import { Loader2, X, Flag } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { contactarPerfilNetwork, reportarPerfilNetwork } from '@/lib/api-client';
import { capturarEvento } from '@/lib/posthog-cliente';

const MOTIVOS_REPORTE = [
  { valor: 'informacion_falsa', etiqueta: 'Información falsa' },
  { valor: 'suplantacion', etiqueta: 'Suplantación de identidad' },
  { valor: 'contenido_inapropiado', etiqueta: 'Contenido inapropiado' },
  { valor: 'certificacion_falsa', etiqueta: 'Certificación falsa' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export function BotonContactar({ perfilId, nombre }: { perfilId: string; nombre: string }) {
  const { user, loading } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    setEnviando(true);
    setError('');
    const res = await contactarPerfilNetwork(perfilId, mensaje);
    setEnviando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar.'); return; }
    setEnviado(true);
    // Sin perfilId/nombre — el embudo de conversión no necesita saber A QUIÉN, solo que pasó.
    capturarEvento('network_contacto_enviado');
  }

  if (loading) return null;

  if (!user) {
    // `?destino=` de /login está acotado a rutas /interno a propósito
    // (anti-phishing, ver app/login/page.tsx) — no sirve para volver aquí,
    // así que no se finge que sí. Tras iniciar sesión, /login resuelve por
    // sí solo a dónde va la cuenta.
    return (
      <a
        href="/login"
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-brand text-brand-foreground text-[13.5px] font-semibold hover:brightness-110 transition-all"
      >
        Inicia sesión para contactar con {nombre.split(' ')[0]}
      </a>
    );
  }

  return (
    <>
      <div>
        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-brand text-brand-foreground text-[13.5px] font-semibold hover:brightness-110 transition-all"
        >
          Contactar con {nombre.split(' ')[0]}
        </button>
        {/* Auditoría UX 2026-08-19: el único sitio donde se explicaba qué pasa
            tras contactar era el mensaje de éxito, DESPUÉS de enviar. Quien
            todavía no ha pulsado el botón no sabe si esto es una caja negra —
            una línea antes del clic, no solo después. */}
        <p className="mt-2 text-[12px] text-[#8E8E86]">
          Verificamos el email de cada perfil antes de publicarlo. Tu mensaje llega directo, sin comisión ni intermediarios.
        </p>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-semibold text-[#1A1A1A]">Contactar con {nombre}</p>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} className="text-[#8E8E86]" /></button>
            </div>
            {enviado ? (
              <p className="text-[13.5px] text-[#3A3A34]">Solicitud enviada. Si {nombre.split(' ')[0]} acepta, verás su contacto en tu bandeja.</p>
            ) : (
              <>
                <textarea
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                  placeholder="Preséntate y cuéntale qué buscas…"
                  className="w-full min-h-24 px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[13.5px] text-[#1A1A1A] resize-y focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
                <p className="mt-2 text-[12px] text-[#8E8E86]">
                  {nombre.split(' ')[0]} verá el nombre de tu estudio con tu mensaje. Su email y teléfono solo se comparten contigo si acepta responder.
                </p>
                {error && <p className="text-[12.5px] text-destructive mt-2">{error}</p>}
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="w-full mt-3 py-2.5 rounded-full bg-brand text-brand-foreground text-[13.5px] font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {enviando && <Loader2 size={14} className="animate-spin" />}
                  {enviando ? 'Enviando…' : 'Enviar solicitud'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function BotonReportar({ perfilId }: { perfilId: string }) {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_REPORTE[0].valor);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  if (!user) return null;

  async function enviar() {
    setEnviando(true);
    await reportarPerfilNetwork(perfilId, motivo, detalle || null);
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <>
      <button onClick={() => setAbierto(true)} className="text-[12px] text-[#8E8E86] hover:text-[#3A3A34] flex items-center gap-1">
        <Flag size={11} /> Reportar perfil
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-semibold text-[#1A1A1A]">Reportar este perfil</p>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} className="text-[#8E8E86]" /></button>
            </div>
            {enviado ? (
              <p className="text-[13.5px] text-[#3A3A34]">Gracias, lo revisaremos.</p>
            ) : (
              <>
                <select value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#E7E7E0] text-[13px] mb-2">
                  {MOTIVOS_REPORTE.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                </select>
                <textarea
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  placeholder="Detalles (opcional)"
                  className="w-full min-h-20 px-3 py-2 rounded-lg border border-[#E7E7E0] text-[13px] resize-y"
                />
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="w-full mt-3 py-2.5 rounded-full bg-destructive text-white text-[13px] font-semibold disabled:opacity-60"
                >
                  {enviando ? 'Enviando…' : 'Enviar reporte'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
