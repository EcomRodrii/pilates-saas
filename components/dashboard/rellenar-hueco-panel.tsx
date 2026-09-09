'use client';

import { useMemo, useState } from 'react';
import { Users, MessageCircle, Send, Loader2 } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { authHeader } from '@/lib/api-client';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { candidatasParaRellenar, TEXTO_MOTIVO_CANDIDATA, type ClaseDelDia } from '@/lib/hoy-agenda';
import { fechaLargaEstudio, horaEstudio, hoyEnEstudio } from '@/lib/utils';
import type { Reserva, Sesion } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// «Rellenar hueco» — el paso intermedio que faltaba.
//
// Antes, el radar de ocupación de la home tenía un solo botón: «Avisar a
// candidatas», que mandaba WhatsApp a TODAS de golpe sin enseñar a quién ni por
// qué. Esto abre la lista primero: quién encaja, la razón de cada una, y solo
// entonces la acción.
//
// Cero reglas de negocio nuevas. Quién puede entrar sale de
// `candidatasParaHueco` (booking-logic), la MISMA que aplica el servidor al
// mandar; el orden y la frase salen de `candidatasParaRellenar` (hoy-agenda).
// Las dos acciones son endpoints que ya existían:
//   · lista de espera → POST /api/reservas/ofrecer-plaza (el mismo de la
//     franja de decisiones del calendario, con su plazo y su RPC atómica).
//   · resto           → POST /api/marketing/hueco/avisar, ahora con la
//     selección. El servidor recalcula igualmente: la selección solo QUITA.
// ─────────────────────────────────────────────────────────────────────────────

export interface RellenarHuecoPanelProps {
  abierto: boolean;
  onCerrar: () => void;
  clase: ClaseDelDia | null;
  sesion: Sesion | null;
  nombreClase: string;
  /** Reservas frescas de ESTA sesión (las del día que se está mirando). */
  reservasSesion: readonly Reserva[];
  onAviso: (mensaje: string) => void;
  /** Para que la agenda vuelva a pedir el día tras ofrecer una plaza. */
  onCambio: () => void;
}

const MAX_CANDIDATAS = 12;

export function RellenarHuecoPanel({
  abierto, onCerrar, clase, sesion, nombreClase, reservasSesion, onAviso, onCambio,
}: RellenarHuecoPanelProps) {
  const { socios, sesiones, reservas, suscripciones, planesTarifa, studio } = useStudio();
  const rol = useRol();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState<'avisar' | 'ofrecer' | null>(null);
  // ⚠️ El resultado se pinta DENTRO del cajón, no solo con un toast.
  //
  // Se reportó que «Avisar a 1 seleccionada no hace nada». Sí hacía: llamaba al
  // servidor, el servidor contestaba —y la respuesta era invisible—. El `Toast`
  // es `fixed z-50` y vive en el árbol de la página; este cajón se porta a
  // `body` con el mismo z-50, así que va DESPUÉS en el DOM y lo tapa. Con un
  // error el cajón no se cierra, así que el aviso se quedaba debajo para
  // siempre: desde fuera, un botón muerto.
  const [resultado, setResultado] = useState<{ mal: boolean; texto: string } | null>(null);

  const socioById = useMemo(() => new Map(socios.map(s => [s.id, s])), [socios]);

  // El histórico completo lo necesita «ya ha venido a esta clase» y la
  // costumbre horaria, que el endpoint del día no puede saber. Pero las filas
  // de ESTA sesión se toman de la carga fresca del día: si no, la lista de
  // espera podría venir de un contexto cargado hace media hora y ofrecerle la
  // plaza a quien ya la aceptó.
  const candidatas = useMemo(() => {
    if (!sesion || !abierto) return [];
    const historico = reservas.filter(r => r.sesionId !== sesion.id);
    return candidatasParaRellenar({
      sesion,
      sesiones,
      socios,
      reservas: [...historico, ...reservasSesion],
      suscripciones,
      planesTarifa,
      hoyISO: hoyEnEstudio(),
      ahora: new Date(),
      limite: MAX_CANDIDATAS,
    });
  }, [abierto, sesion, sesiones, socios, reservas, reservasSesion, suscripciones, planesTarifa]);

  const enEspera = candidatas.filter(c => c.motivos[0] === 'LISTA_ESPERA');
  const avisables = candidatas.filter(c => c.motivos[0] !== 'LISTA_ESPERA');
  const seleccionadas = avisables.filter(c => seleccion.has(c.socioId));

  function alternar(socioId: string) {
    setResultado(null);
    setSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(socioId)) next.delete(socioId); else next.add(socioId);
      return next;
    });
  }

  function cerrar() {
    setSeleccion(new Set());
    setResultado(null);
    onCerrar();
  }

  const mensajeWhatsApp = sesion && studio
    ? `¡Hola! Se ha quedado un hueco en ${nombreClase} el ${fechaLargaEstudio(sesion.inicio)} a las ${horaEstudio(sesion.inicio)} en ${studio.nombre}. ¿Te lo guardo?`
    : '';

  async function ofrecerPlaza() {
    if (!sesion) return;
    setEnviando('ofrecer');
    setResultado(null);
    try {
      const res = await fetch('/api/reservas/ofrecer-plaza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ sesionId: sesion.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultado({ mal: true, texto: data?.error ?? 'No se ha podido ofrecer la plaza' });
        return;
      }
      onAviso(data.resultado === 'confirmada'
        ? 'Plaza confirmada a la siguiente en la lista'
        : 'Oferta de plaza enviada');
      onCambio();
      cerrar();
    } catch {
      setResultado({ mal: true, texto: 'No hemos podido conectar. Revisa tu conexión e inténtalo otra vez.' });
    } finally {
      // En `finally`: sin esto, una excepción dejaba el botón en «Ofreciendo…»
      // para siempre y no había forma de reintentar sin recargar.
      setEnviando(null);
    }
  }

  async function avisar() {
    if (!sesion || seleccionadas.length === 0) return;
    setEnviando('avisar');
    setResultado(null);
    try {
      const res = await fetch('/api/marketing/hueco/avisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ sesionId: sesion.id, socioIds: seleccionadas.map(c => c.socioId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 503 = este estudio no tiene su WhatsApp Business conectado (la
        // integración es de cada estudio, no de la plataforma: Configuración →
        // Integraciones). No es un fallo pasajero — por ahí no se va a poder
        // mandar nada hasta que se conecte, así que se señala el icono de
        // WhatsApp de cada fila, que abre el mensaje ya escrito y no depende de
        // ninguna credencial.
        setResultado({
          mal: true,
          texto: res.status === 503
            ? `${data?.error ?? 'El envío automático no está disponible'}. Puedes escribirles una a una con el icono de WhatsApp de su fila.`
            : data?.error ?? 'No se ha podido avisar',
        });
        return;
      }
      // El servidor puede haber descartado a alguna por consentimiento, por
      // teléfono o por haberla avisado ya hace poco. Se dice, no se calla.
      const enviados = data.enviados ?? 0;
      const partes = [`${enviados} aviso${enviados === 1 ? '' : 's'} enviado${enviados === 1 ? '' : 's'}`];
      if (data.sinTelefono) partes.push(`${data.sinTelefono} sin teléfono`);
      if (data.sinConsentimiento) partes.push(`${data.sinConsentimiento} sin consentimiento de marketing`);
      if (data.errores) partes.push(`${data.errores} con error`);
      const texto = partes.join(' · ');
      // Cero enviados NO es un éxito, aunque el servidor conteste 200: se queda
      // en el panel explicando por qué, en vez de cerrarse con un toast que
      // suena a hecho.
      if (enviados === 0) { setResultado({ mal: true, texto }); return; }
      onAviso(texto);
      cerrar();
    } catch {
      setResultado({ mal: true, texto: 'No hemos podido conectar. Revisa tu conexión e inténtalo otra vez.' });
    } finally {
      setEnviando(null);
    }
  }

  if (!clase || !sesion) return null;

  return (
    <DashboardDrawer open={abierto} onClose={cerrar} label={`Rellenar hueco en ${nombreClase}`} portal>
      <div className="border-b border-border px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rellenar hueco</p>
        <h2 className="mt-1 text-[17px] font-bold text-foreground">{nombreClase}</h2>
        <p className="text-[12px] text-muted-foreground">
          {horaEstudio(sesion.inicio)}–{horaEstudio(sesion.fin)} · {clase.huecos} plaza{clase.huecos === 1 ? '' : 's'} disponible{clase.huecos === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Quién encaja se decide con el histórico de asistencia y los bonos,
            que viajan en la carga general del panel. Si todavía no ha llegado,
            se dice — una lista vacía aquí se leería como «no hay nadie», que es
            una respuesta distinta y falsa. */}
        {socios.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Buscando a quién puede encajar…
          </div>
        ) : candidatas.length === 0 ? (
          <EmptyState
            icono={Users}
            titulo="No hay nadie que encaje"
            descripcion="Nadie tiene ahora mismo bono o plan activo para esta clase y haber venido antes. Puedes apuntar a quien quieras desde la propia clase."
            compacto
          />
        ) : (
          <>
            {enEspera.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 text-[12px] font-semibold text-foreground">En lista de espera</h3>
                <p className="mb-2.5 text-[11px] text-muted-foreground">
                  Van por orden. Se ofrece a la primera y, si no acepta a tiempo, pasa a la siguiente.
                </p>
                <ul className="flex flex-col gap-1.5">
                  {enEspera.map((c, i) => {
                    const socia = socioById.get(c.socioId);
                    return (
                      <li key={c.socioId} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted-foreground">
                          {c.posicionEspera ?? i + 1}
                        </span>
                        <ProfileAvatar
                          size="sm"
                          nombre={socia?.nombre ?? '?'}
                          apellidos={socia?.apellidos}
                          avatarId={socia?.avatar}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {socia ? `${socia.nombre} ${socia.apellidos}` : 'Clienta'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {TEXTO_MOTIVO_CANDIDATA.LISTA_ESPERA}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  onClick={() => void ofrecerPlaza()}
                  disabled={enviando !== null}
                >
                  {enviando === 'ofrecer'
                    ? <><Loader2 size={13} className="animate-spin" /> Ofreciendo…</>
                    : <>Ofrecer la plaza a la primera</>}
                </Button>
              </section>
            )}

            {avisables.length > 0 && (
              <section>
                <h3 className="mb-2 text-[12px] font-semibold text-foreground">Podrían encajar</h3>
                <p className="mb-2.5 text-[11px] text-muted-foreground">
                  Todas tienen bono o plan en vigor para esta clase y ya han venido antes.
                </p>
                <ul className="flex flex-col gap-1.5">
                  {avisables.map(c => {
                    const socia = socioById.get(c.socioId);
                    const marcada = seleccion.has(c.socioId);
                    const wa = enlaceWhatsApp(socia?.telefono, mensajeWhatsApp);
                    return (
                      <li key={c.socioId} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-[var(--brand-medio)]"
                          checked={marcada}
                          onChange={() => alternar(c.socioId)}
                          aria-label={`Seleccionar a ${socia?.nombre ?? 'esta clienta'}`}
                        />
                        <ProfileAvatar
                          size="sm"
                          nombre={socia?.nombre ?? '?'}
                          apellidos={socia?.apellidos}
                          avatarId={socia?.avatar}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {socia ? `${socia.nombre} ${socia.apellidos}` : 'Clienta'}
                          </p>
                          <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                            {c.motivos.map(m => <span key={m}>{TEXTO_MOTIVO_CANDIDATA[m]}</span>)}
                          </p>
                        </div>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Escribir a ${socia?.nombre ?? 'esta clienta'} por WhatsApp`}
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {(avisables.length > 0 || resultado) && (
        <div className="border-t border-border px-5 py-3">
          {resultado && (
            <p
              role="status"
              className="mb-2.5 rounded-lg px-3 py-2 text-[12px]"
              style={resultado.mal
                ? { background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))', color: 'var(--destructive)' }
                : { background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              {resultado.texto}
            </p>
          )}
          {rol === 'PROPIETARIO' ? (
            <>
              <Button
                className="w-full"
                onClick={() => void avisar()}
                disabled={seleccionadas.length === 0 || enviando !== null}
              >
                {enviando === 'avisar'
                  ? <><Loader2 size={14} className="animate-spin" /> Avisando…</>
                  : <><Send size={14} /> Avisar a {seleccionadas.length || 'las'} seleccionada{seleccionadas.length === 1 ? '' : 's'}</>}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Se envía por WhatsApp. No se avisa a quien no ha dado consentimiento de marketing
                ni a quien ya recibió un aviso de esta clase en las últimas 24 h.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              El aviso automático por WhatsApp solo lo puede lanzar la propietaria. Puedes escribir
              a cada una desde el icono de WhatsApp de su fila.
            </p>
          )}
        </div>
      )}
    </DashboardDrawer>
  );
}
