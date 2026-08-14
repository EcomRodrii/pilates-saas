'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Handshake, Check } from 'lucide-react';
import {
  fetchMensajesNetwork, enviarMensajeNetwork,
  fetchFormalizacionNetwork, proponerOConfirmarFormalizacionNetwork,
} from '@/lib/api-client';
import type { MensajeNetwork, FormalizacionNetwork } from '@/lib/network/tipos';
import { cn } from '@/lib/utils';

const hora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const TIPO_CONTRATO_LABEL = { temporal: 'temporal', indefinido: 'indefinido' } as const;

// Hilo de mensajería (brief §9) — el mismo componente sirve para el lado
// estudio y el lado instructora: la API resuelve quién es "yo"
// (remitenteSoyYo) según qué tipo de sesión mande el token, así que aquí no
// hace falta saber en qué lado estamos. Polling simple cada 5s mientras el
// hilo está abierto — sin Realtime en esta ronda, no hace falta para un MVP
// de mensajería de bajo volumen.
export function HiloMensajes({ solicitudId }: { solicitudId: string }) {
  const [mensajes, setMensajes] = useState<MensajeNetwork[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const finRef = useRef<HTMLDivElement>(null);

  const [formalizacion, setFormalizacion] = useState<FormalizacionNetwork | null>(null);
  const [miLado, setMiLado] = useState<'estudio' | 'instructora' | null>(null);
  const [cargandoFormalizacion, setCargandoFormalizacion] = useState(true);
  const [proponiendo, setProponiendo] = useState(false);
  const [tipoElegido, setTipoElegido] = useState<'temporal' | 'indefinido'>('indefinido');
  const [enviandoFormalizacion, setEnviandoFormalizacion] = useState(false);
  const [errorFormalizacion, setErrorFormalizacion] = useState('');

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const r = await fetchMensajesNetwork(solicitudId);
      if (vivo) setMensajes(r);
    }
    void cargar();
    const id = setInterval(cargar, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, [solicitudId]);

  useEffect(() => {
    let vivo = true;
    async function cargarFormalizacion() {
      const r = await fetchFormalizacionNetwork(solicitudId);
      if (!vivo) return;
      setFormalizacion(r?.formalizacion ?? null);
      setMiLado(r?.miLado ?? null);
      setCargandoFormalizacion(false);
    }
    void cargarFormalizacion();
    // Mismo polling que los mensajes: si la otra parte confirma, o si quien
    // completa el alta es la propietaria abriendo el hilo más tarde, se
    // refleja aquí sin recargar la página.
    const id = setInterval(cargarFormalizacion, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, [solicitudId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes?.length]);

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setEnviando(true); setError('');
    const res = await enviarMensajeNetwork(solicitudId, cuerpo);
    setEnviando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar.'); return; }
    setTexto('');
    setMensajes(await fetchMensajesNetwork(solicitudId));
  }

  async function enviarPropuesta() {
    setEnviandoFormalizacion(true); setErrorFormalizacion('');
    const res = await proponerOConfirmarFormalizacionNetwork(solicitudId, tipoElegido);
    setEnviandoFormalizacion(false);
    if (!res.ok) { setErrorFormalizacion(res.error); return; }
    setFormalizacion(res.formalizacion);
    setMiLado(res.miLado);
    setProponiendo(false);
  }

  async function confirmar() {
    setEnviandoFormalizacion(true); setErrorFormalizacion('');
    const res = await proponerOConfirmarFormalizacionNetwork(solicitudId);
    setEnviandoFormalizacion(false);
    if (!res.ok) { setErrorFormalizacion(res.error); return; }
    setFormalizacion(res.formalizacion);
    setMiLado(res.miLado);
  }

  return (
    <div className="flex flex-col h-[480px]">
      {!cargandoFormalizacion && (
        <TarjetaFormalizacion
          formalizacion={formalizacion}
          miLado={miLado}
          proponiendo={proponiendo}
          setProponiendo={setProponiendo}
          tipoElegido={tipoElegido}
          setTipoElegido={setTipoElegido}
          enviando={enviandoFormalizacion}
          error={errorFormalizacion}
          onProponer={enviarPropuesta}
          onConfirmar={confirmar}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!mensajes ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : mensajes.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">
            Todavía no hay mensajes. Escribe el primero.
          </p>
        ) : (
          mensajes.map(m => (
            <div key={m.id} className={cn('flex flex-col max-w-[80%]', m.remitenteSoyYo ? 'ml-auto items-end' : 'items-start')}>
              <div className={cn(
                'rounded-2xl px-3 py-2 text-[13px] whitespace-pre-line',
                m.remitenteSoyYo ? 'bg-brand text-brand-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
              )}>
                {m.cuerpo}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">{hora(m.creadoEn)}</span>
            </div>
          ))
        )}
        <div ref={finRef} />
      </div>

      {error && <p className="text-[11px] text-destructive px-4">{error}</p>}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground"
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="p-2 rounded-lg bg-brand text-brand-foreground disabled:opacity-50"
        >
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

// Formalizar contratación (siguiente fase) — "las 2 aceptan" antes de que
// aparezca en el equipo. Vive encima del hilo porque es donde ya se
// negocian clases/horario/tarifa; un botón suelto en otra pantalla habría
// desconectado la propuesta de la conversación que la justifica.
function TarjetaFormalizacion({
  formalizacion, miLado, proponiendo, setProponiendo, tipoElegido, setTipoElegido,
  enviando, error, onProponer, onConfirmar,
}: {
  formalizacion: FormalizacionNetwork | null;
  miLado: 'estudio' | 'instructora' | null;
  proponiendo: boolean;
  setProponiendo: (v: boolean) => void;
  tipoElegido: 'temporal' | 'indefinido';
  setTipoElegido: (v: 'temporal' | 'indefinido') => void;
  enviando: boolean;
  error: string;
  onProponer: () => void;
  onConfirmar: () => void;
}) {
  if (formalizacion?.estado === 'confirmada') {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-emerald-50 text-emerald-800 text-[12.5px]">
        <Check size={14} className="shrink-0" />
        Ya formáis equipo — contrato {TIPO_CONTRATO_LABEL[formalizacion.tipoContrato]}.
      </div>
    );
  }

  if (formalizacion && formalizacion.estado === 'pendiente') {
    const miMarca = miLado === 'estudio' ? formalizacion.estudioConfirmadoEn : formalizacion.instructoraConfirmadaEn;
    const otraMarca = miLado === 'estudio' ? formalizacion.instructoraConfirmadaEn : formalizacion.estudioConfirmadoEn;

    if (miMarca && otraMarca) {
      return (
        <div className="px-4 py-2.5 border-b border-border bg-muted text-[12.5px] text-muted-foreground">
          Las dos partes habéis confirmado ({TIPO_CONTRATO_LABEL[formalizacion.tipoContrato]}). Completando el alta…
        </div>
      );
    }
    if (miMarca && !otraMarca) {
      return (
        <div className="px-4 py-2.5 border-b border-border bg-muted text-[12.5px] text-muted-foreground">
          Propuesta enviada ({TIPO_CONTRATO_LABEL[formalizacion.tipoContrato]}). Esperando confirmación.
        </div>
      );
    }
    return (
      <div className="px-4 py-2.5 border-b border-border bg-amber-50 space-y-2">
        <p className="text-[12.5px] text-amber-900">
          {miLado === 'estudio'
            ? <>La instructora propone que la contrates como <strong>{TIPO_CONTRATO_LABEL[formalizacion.tipoContrato]}</strong>.</>
            : <>El estudio propone contratarte como <strong>{TIPO_CONTRATO_LABEL[formalizacion.tipoContrato]}</strong>.</>}{' '}
          ¿Confirmas?
        </p>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <button
          onClick={onConfirmar}
          disabled={enviando}
          className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
        >
          {enviando ? 'Confirmando…' : 'Confirmar'}
        </button>
      </div>
    );
  }

  if (!proponiendo) {
    return (
      <div className="px-4 py-2 border-b border-border">
        <button
          onClick={() => setProponiendo(true)}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
        >
          <Handshake size={14} /> Formalizar contratación
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-muted space-y-2">
      <p className="text-[12.5px] font-medium text-foreground">Proponer contratación</p>
      <div className="flex items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={tipoElegido === 'temporal'} onChange={() => setTipoElegido('temporal')} />
          Temporal
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={tipoElegido === 'indefinido'} onChange={() => setTipoElegido('indefinido')} />
          Indefinido
        </label>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={onProponer}
          disabled={enviando}
          className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Enviar propuesta'}
        </button>
        <button onClick={() => setProponiendo(false)} className="text-[12px] text-muted-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
