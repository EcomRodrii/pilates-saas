'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, AtSign, CalendarCheck, Check, CircleHelp, Globe, Mail, MessageCircle, Phone, Plus,
  Smartphone, Sparkles, Store, Trash2, UserPlus, Users, XCircle, type LucideIcon,
} from 'lucide-react';
import { MenuAcciones, type AccionMenu } from '@/components/clientas/ficha/piezas-ficha';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import {
  BASE_LEGAL_CONSULTA_MANUAL, CANALES_CONSULTA_MANUAL, ETIQUETA_CANAL_CONSULTA, LIMITES_CONSULTA, enlaceRespuesta,
  type CanalConsulta, type CanalConsultaManual,
} from '@/lib/contacto/consulta';
import { apuntarInteresada, descartarConsulta, eliminarConsulta, marcarAtendida, type ConsultaContacto } from '@/lib/contacto/consultas-cliente';
import type { ResultadoEstado } from '@/lib/clientas/estado';
import { colorDeAvatar, fechaCorta, haceCuanto } from '@/lib/clientas/textos';
import { conversionDePruebas } from '@/lib/clientas/conversion-pruebas';

// «Interesadas y pruebas»: quien todavía está entrando, en tres listas cortas,
// cada una con su siguiente paso. No es un tablero de arrastrar tarjetas: el
// paso de una lista a otra lo dan los hechos (reservar la prueba, venir,
// comprar), nunca alguien moviendo una tarjeta a mano.
//
//   · Preguntaron — las consultas de su web todavía sin atender y las fichas que
//     nunca han venido ni comprado.
//   · Con su prueba reservada — estado «De prueba» con la clase por llegar.
//   · Vinieron a la prueba y no han comprado — «De prueba» con la clase ya hecha.
//
// Las que solo preguntaron por la web NO tienen ficha (decisión cerrada: no
// reciben la bienvenida ni cuentan como clientas) hasta que se dan de alta.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ICONO_CANAL: Record<CanalConsulta, LucideIcon> = {
  FORMULARIO: Globe,
  INSTAGRAM: AtSign,
  LLAMADA: Phone,
  WHATSAPP: MessageCircle,
  EN_PERSONA: Store,
  RECOMENDADA: Users,
  OTRO: CircleHelp,
};

export function InteresadasYPruebas({
  consultas, cargandoConsultas, errorConsultas, estados, hoyISO, puedeGestionar, onAbrirClienta, onDarDeAlta, onRecargar,
}: {
  consultas: ConsultaContacto[];
  cargandoConsultas: boolean;
  /** No se pudieron leer las consultas: se dice, para no pintar «nadie preguntó». */
  errorConsultas?: boolean;
  estados: ReadonlyMap<string, ResultadoEstado>;
  hoyISO: string | null;
  puedeGestionar: boolean;
  onAbrirClienta: (id: string) => void;
  onDarDeAlta: (c: ConsultaContacto) => void;
  onRecargar: () => void;
}) {
  const { socios, suscripciones, planesTarifa, studio } = useStudio();
  const { user } = useAuth();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<ConsultaContacto | null>(null);
  const [apuntando, setApuntando] = useState(false);

  const hoy = hoyISO ?? '';
  const porEstado = (e: ResultadoEstado['estado']) =>
    socios.filter(s => estados.get(s.id)?.estado === e);
  const interesadas = porEstado('INTERESADA');
  const pruebas = porEstado('DE_PRUEBA');
  const reservadas = pruebas.filter(s => (estados.get(s.id)?.desde ?? '') > hoy);
  const vinieron = pruebas.filter(s => (estados.get(s.id)?.desde ?? '') <= hoy);

  // «De 12 pruebas en septiembre, 5 compraron»: solo con 5 casos o más, para no
  // enseñar un porcentaje que no se sostiene.
  const conversion = useMemo(
    () => (hoyISO ? conversionDePruebas(suscripciones, planesTarifa, hoyISO) : []),
    [suscripciones, planesTarifa, hoyISO],
  );

  async function atender(c: ConsultaContacto) {
    if (ocupada || !user?.id) return;
    setOcupada(c.id);
    setError(null);
    const r = await marcarAtendida(c.id, user.id);
    setOcupada(null);
    if (!r.ok) { setError(r.error); return; }
    onRecargar();
  }

  async function descartar(c: ConsultaContacto) {
    if (ocupada || !user?.id) return;
    setOcupada(c.id);
    setError(null);
    const r = await descartarConsulta(c.id, user.id);
    setOcupada(null);
    if (!r.ok) { setError(r.error); return; }
    onRecargar();
  }

  async function borrar(c: ConsultaContacto) {
    if (ocupada) return;
    setOcupada(c.id);
    setError(null);
    const r = await eliminarConsulta(c.id);
    setOcupada(null);
    setConfirmarBorrar(null);
    if (!r.ok) { setError(r.error); return; }
    onRecargar();
  }

  const nada = !cargandoConsultas && !errorConsultas && consultas.length === 0 && interesadas.length === 0 && pruebas.length === 0;

  return (
    <div className="space-y-4">
      {conversion.length > 0 && (
        <p className="text-[14px] text-foreground">
          {conversion.map((c, i) => (
            <span key={c.mes}>
              {i === 0
                ? <strong className="font-semibold">De {c.pruebas} pruebas en {MESES[c.mesIndice]}, {c.compraron} {c.compraron === 1 ? 'compró' : 'compraron'}.</strong>
                : <span className="text-muted-foreground"> En {MESES[c.mesIndice]}, {c.compraron} de {c.pruebas}.</span>}
            </span>
          ))}
        </p>
      )}

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
      {errorConsultas && (
        <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning/12 px-3 py-2 text-[13px] text-foreground">
          <span className="inline-flex items-center gap-1.5"><AlertTriangle size={15} className="shrink-0 text-warning" aria-hidden />No se han podido leer las consultas de tu web.</span>
          <button type="button" onClick={onRecargar} className="font-semibold underline underline-offset-2">Volver a intentarlo</button>
        </p>
      )}

      {nada && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
          <p className="text-[14px] font-semibold text-foreground">Nadie está entrando ahora mismo</p>
          <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
            Cuando alguien pregunte desde tu web, reserve su clase de prueba o venga a ella, aparece aquí con su siguiente paso.
            {puedeGestionar && ' Si alguien te pregunta por teléfono o por Instagram, apúntala para no perderle la pista.'}
          </p>
          {puedeGestionar && (
            <button type="button" onClick={() => setApuntando(true)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:brightness-95">
              <Plus size={15} aria-hidden /> Apuntar interesada
            </button>
          )}
        </div>
      )}

      {(consultas.length > 0 || interesadas.length > 0) && (
        <Bloque
          titulo="Preguntaron"
          cuantas={consultas.length + interesadas.length}
          nota="Las que preguntaron (por tu web o apuntadas a mano) no tienen ficha ni cuentan como alumnas activas de tu plan. No reciben nada automático hasta que las das de alta."
          accion={puedeGestionar ? (
            <button type="button" onClick={() => setApuntando(true)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted">
              <Plus size={14} aria-hidden /> Apuntar interesada
            </button>
          ) : undefined}
        >
          {consultas.map(c => {
            const wa = enlaceWhatsApp(c.telefono, `¡Hola ${c.nombre.split(' ')[0] ?? ''}! Te escribo de ${studio?.nombre ?? 'el estudio'} por lo que nos preguntaste.`);
            const correo = c.email ? enlaceRespuesta(c.email, studio?.nombre ?? '') : null;
            const tel = c.telefono ? c.telefono.replace(/[^0-9+]/g, '') : '';
            const textoCanal = c.canal === 'FORMULARIO'
              ? (c.origen && c.origen !== 'web-contacto' ? `Desde «${c.origen}»` : ETIQUETA_CANAL_CONSULTA.FORMULARIO)
              : ETIQUETA_CANAL_CONSULTA[c.canal];
            // Lo de a diario a la vista (WhatsApp o correo, y darla de alta); el
            // resto, en «⋯»: el otro canal, llamar y cerrar la consulta.
            const mas: AccionMenu[] = [
              ...(wa && correo ? [{ texto: 'Responder por correo', icono: Mail, onClick: () => { window.location.href = correo; } }] : []),
              ...(tel ? [{ texto: 'Llamar', icono: Phone, onClick: () => { window.location.href = `tel:${tel}`; } }] : []),
              { texto: 'Ya la he atendido', icono: Check, onClick: () => void atender(c), separar: Boolean((wa && correo) || tel) },
              { texto: 'No le interesa: descartar', icono: XCircle, onClick: () => void descartar(c) },
              { texto: 'Borrar la consulta', icono: Trash2, onClick: () => setConfirmarBorrar(c), peligro: true },
            ];
            return (
              <Fila
                key={c.id}
                nombre={c.nombre || 'Sin nombre'}
                canal={[ICONO_CANAL[c.canal], textoCanal]}
                cuando={c.creadaEn && hoyISO ? haceCuanto(hoyEnEstudio(new Date(c.creadaEn)), hoyISO) : ''}
                detalle={c.mensaje}
              >
                {ocupada === c.id && <span role="status" className="text-[12.5px] text-muted-foreground">Guardando…</span>}
                {wa
                  ? <Accion href={wa} externo icono={MessageCircle}>WhatsApp</Accion>
                  : correo ? <Accion href={correo} icono={Mail}>Responder</Accion> : null}
                {puedeGestionar && (
                  <Accion onClick={() => onDarDeAlta(c)} icono={UserPlus} disabled={ocupada !== null}>Dar de alta</Accion>
                )}
                {puedeGestionar && (
                  <MenuAcciones
                    acciones={mas}
                    claseBoton="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted [@media(pointer:fine)]:size-9"
                  />
                )}
              </Fila>
            );
          })}
          {interesadas.map(s => {
            const r = estados.get(s.id);
            const wa = enlaceWhatsApp(s.telefono, `¡Hola ${s.nombre}! Te escribo de ${studio?.nombre ?? 'el estudio'}.`);
            return (
              <Fila
                key={s.id}
                nombre={`${s.nombre} ${s.apellidos ?? ''}`.trim()}
                avatar={{ id: s.avatar, apellidos: s.apellidos }}
                canal={[Smartphone, 'Tiene ficha, sin venir ni comprar']}
                cuando={r?.desde && hoyISO ? `desde ${fechaCorta(r.desde, hoyISO)}` : ''}
              >
                {wa && <Accion href={wa} externo icono={MessageCircle}>WhatsApp</Accion>}
                <Accion onClick={() => onAbrirClienta(s.id)} icono={CalendarCheck}>Ver su ficha</Accion>
              </Fila>
            );
          })}
        </Bloque>
      )}

      {reservadas.length > 0 && (
        <Bloque titulo="Con su prueba reservada" cuantas={reservadas.length} nota="El día antes le llega el recordatorio de su clase, como a todas.">
          {reservadas.map(s => {
            const desde = estados.get(s.id)?.desde;
            const wa = enlaceWhatsApp(s.telefono, `¡Hola ${s.nombre}! Te esperamos en tu clase de prueba en ${studio?.nombre ?? 'el estudio'}.`);
            return (
              <Fila
                key={s.id}
                nombre={`${s.nombre} ${s.apellidos ?? ''}`.trim()}
                avatar={{ id: s.avatar, apellidos: s.apellidos }}
                canal={[Sparkles, 'Clase de prueba']}
                cuando={desde && hoyISO ? `el ${fechaCorta(desde, hoyISO)}` : ''}
              >
                {wa && <Accion href={wa} externo icono={MessageCircle}>WhatsApp</Accion>}
                <Accion onClick={() => onAbrirClienta(s.id)} icono={CalendarCheck}>Ver su ficha</Accion>
              </Fila>
            );
          })}
        </Bloque>
      )}

      {vinieron.length > 0 && (
        <Bloque titulo="Vinieron a la prueba y no han comprado" cuantas={vinieron.length} nota="El mejor momento es la primera semana. Salen solas de aquí en cuanto compran.">
          {vinieron.map(s => {
            const desde = estados.get(s.id)?.desde;
            const wa = enlaceWhatsApp(s.telefono, `¡Hola ${s.nombre}! ¿Qué tal te fue la clase de prueba en ${studio?.nombre ?? 'el estudio'}?`);
            return (
              <Fila
                key={s.id}
                nombre={`${s.nombre} ${s.apellidos ?? ''}`.trim()}
                avatar={{ id: s.avatar, apellidos: s.apellidos }}
                canal={[Sparkles, 'Clase de prueba']}
                cuando={desde && hoyISO ? `vino el ${fechaCorta(desde, hoyISO)}` : ''}
              >
                {wa && <Accion href={wa} externo icono={MessageCircle}>WhatsApp</Accion>}
                <Accion onClick={() => onAbrirClienta(s.id)} icono={UserPlus}>Venderle un plan</Accion>
              </Fila>
            );
          })}
        </Bloque>
      )}

      {apuntando && (
        <DialogoApuntarInteresada
          onCerrar={() => setApuntando(false)}
          onHecho={() => { setApuntando(false); onRecargar(); }}
          onVerFicha={(id) => { setApuntando(false); onAbrirClienta(id); }}
        />
      )}

      <ConfirmDialog
        open={confirmarBorrar !== null}
        onOpenChange={(o) => { if (!o) setConfirmarBorrar(null); }}
        titulo="Borrar esta consulta"
        descripcion="Se borra para siempre lo que escribió. Si quieres conservarla, márcala como atendida."
        textoConfirmar={ocupada ? 'Borrando…' : 'Borrar'}
        destructivo
        onConfirm={() => { if (confirmarBorrar) void borrar(confirmarBorrar); }}
      />
    </div>
  );
}

function Bloque({ titulo, cuantas, nota, accion, children }: { titulo: string; cuantas: number; nota: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground">{titulo} <span className="font-normal text-muted-foreground">· {cuantas}</span></h2>
          <p className="text-[12.5px] text-muted-foreground text-pretty">{nota}</p>
        </div>
        {accion}
      </header>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function Fila({ nombre, avatar, canal, cuando, detalle, children }: {
  nombre: string;
  avatar?: { id?: string | null; apellidos?: string | null };
  canal: [LucideIcon, string];
  cuando: string;
  detalle?: string;
  children: React.ReactNode;
}) {
  const [Icono, textoCanal] = canal;
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ProfileAvatar avatarId={avatar?.id ?? null} nombre={nombre} apellidos={avatar?.apellidos ?? ''} color={colorDeAvatar(nombre)} size="sm" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">{nombre}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Icono size={13} aria-hidden />{textoCanal}</span>
            {cuando && <span>· {cuando}</span>}
          </p>
          {detalle && (
            <button type="button" onClick={() => setAbierto(v => !v)} className={cn('mt-0.5 block text-left text-[13px] text-foreground', !abierto && 'line-clamp-1')}>
              {detalle}
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-12 sm:pl-0">{children}</div>
    </li>
  );
}

function Accion({ children, icono: Icono, href, externo, onClick, disabled }: {
  children: React.ReactNode; icono: LucideIcon; href?: string; externo?: boolean; onClick?: () => void; disabled?: boolean;
}) {
  const cls = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50 [@media(pointer:fine)]:min-h-9';
  if (href) {
    if (externo) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}><Icono size={15} aria-hidden />{children}</a>;
    // mailto:/tel: son enlaces normales; solo lo del propio panel va por el router.
    return href.startsWith('/')
      ? <Link href={href} className={cls}><Icono size={15} aria-hidden />{children}</Link>
      : <a href={href} className={cls}><Icono size={15} aria-hidden />{children}</a>;
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}><Icono size={15} aria-hidden />{children}</button>;
}

/**
 * Apuntar a mano a alguien que preguntó (por teléfono, Instagram, en la puerta).
 * No crea ficha: queda en «Preguntaron» para contestarle. Si ya es clienta con
 * ese email, lo dice y lleva a su ficha en vez de duplicarla.
 */
function DialogoApuntarInteresada({ onCerrar, onHecho, onVerFicha }: {
  onCerrar: () => void;
  onHecho: () => void;
  onVerFicha: (socioId: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [canal, setCanal] = useState<CanalConsultaManual | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ texto: string; socioId?: string } | null>(null);
  const completo = nombre.trim() && (telefono.trim() || email.trim()) && canal && mensaje.trim();

  async function guardar() {
    if (enviando || !completo || !canal) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await apuntarInteresada({ nombre, email: email.trim() || null, telefono: telefono.trim() || null, canal, mensaje });
      if (!r.ok) { setError({ texto: r.error, socioId: r.socioId }); return; }
      onHecho();
    } finally {
      setEnviando(false);
    }
  }

  const campo = 'w-full min-h-11 rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:min-h-10 [@media(pointer:fine)]:text-[13.5px]';
  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><UserPlus size={20} aria-hidden /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground">Apuntar a alguien que preguntó</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{BASE_LEGAL_CONSULTA_MANUAL}</DialogDescription>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Nombre</span>
          <input value={nombre} onChange={e => setNombre(e.target.value.slice(0, LIMITES_CONSULTA.nombre))} autoComplete="off" className={campo} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Teléfono</span>
            <input value={telefono} onChange={e => setTelefono(e.target.value.slice(0, LIMITES_CONSULTA.telefono))} inputMode="tel" autoComplete="off" className={campo} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Email</span>
            <input value={email} onChange={e => setEmail(e.target.value.slice(0, LIMITES_CONSULTA.email))} type="email" inputMode="email" autoComplete="off" className={campo} />
          </label>
        </div>
        <p className="-mt-1 text-[11.5px] text-muted-foreground">Con uno de los dos basta, para poder contestarle.</p>

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">Por dónde llegó</legend>
          <div className="flex flex-wrap gap-1.5">
            {CANALES_CONSULTA_MANUAL.map(c => {
              const Icono = ICONO_CANAL[c];
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={canal === c}
                  onClick={() => setCanal(c)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                    canal === c ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  <Icono size={14} aria-hidden />{ETIQUETA_CANAL_CONSULTA[c]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Qué preguntó</span>
          <textarea
            rows={3}
            value={mensaje}
            onChange={e => setMensaje(e.target.value.slice(0, LIMITES_CONSULTA.mensaje))}
            placeholder="Ej.: Quiere empezar en octubre, por las tardes. Pregunta por el bono de 10."
            className="w-full resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:text-[13.5px]"
          />
        </label>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {error.texto}
              {error.socioId && (
                <> <button type="button" onClick={() => onVerFicha(error.socioId!)} className="font-semibold underline underline-offset-2">Ver su ficha</button></>
              )}
            </span>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={!completo || enviando} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">
            {enviando ? 'Apuntando…' : 'Apuntarla'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
