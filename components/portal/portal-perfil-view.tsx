'use client';

// PERFIL — vista de presentación, desacoplada de la sesión real (Fase 4 del
// Theme Builder: vista previa completa de la app de socias, generaliza el
// patrón ya validado en #610 para Home/Clases/Bonos).
//
// A diferencia de esas tres pantallas (que solo necesitan un socioId de
// sesión para filtrar el catálogo REAL del estudio), Perfil pinta campos
// propios de la ficha de socia (nombre, foto, alta) que no existen para un
// socioId ficticio — `socios.find(...)` da `undefined` en preview. Por eso
// acepta `socioOverride`: el wrapper de preview inyecta una ficha de muestra
// completa (lib/theme/preview-sesion-muestra.ts → SOCIO_MUESTRA) en vez de
// depender del catálogo.
//
// `escribible = false` (solo en preview): guardar datos, subir/quitar foto y
// elegir avatar NO llaman a updateSocio()/Storage de verdad — un socioId
// ficticio rompería cualquier FK real si se dejara pasar (mismo motivo que
// ya documenta PortalClasesView para reservar/cancelar).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { subirFotoPerfil, eliminarFotoPerfil, validarFotoPerfil } from '@/lib/portal-storage';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { BottomSheet, Input, Button, Card, Toast, type AvisoToast } from '@/components/portal/ui';
import { bonoActivo } from '@/lib/bonos-portal';
import { useMensajesSinLeer } from '@/lib/use-mensajes-sin-leer.ts';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { display, micro, sans, texto, radio, transicion, dur, EASE } from '@/lib/portal-design';
import type { PortalSession } from '@/lib/portal-auth';
import type { Socio } from '@/lib/types';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «Socia desde marzo de 2024» — la antigüedad, no la fecha exacta. */
function desdeCuando(fechaAlta: string | null | undefined): string | null {
  if (!fechaAlta) return null;
  const [a, m] = fechaAlta.slice(0, 10).split('-').map(Number);
  if (!a || !m) return null;
  return `Socia desde ${MESES[m - 1]} de ${a}`;
}

export function PortalPerfilView({
  session, socioOverride, escribible = true, navegar, onLogout, actualizarEmail,
}: {
  session: PortalSession | null;
  socioOverride?: Socio;
  escribible?: boolean;
  navegar: (ruta: string) => void;
  onLogout: () => void;
  // Opcional: la preview de temas (app/portal-preview) monta esta vista SIN
  // PortalAuthProvider (comentario de ese layout), así que no puede llamarse
  // usePortalAuth() aquí dentro — mismo motivo por el que `session`/`navegar`/
  // `onLogout` ya llegan como props en vez de por hook. La página real
  // (app/portal/[slug]/perfil/page.tsx) la pasa desde usePortalAuth().
  actualizarEmail?: (nuevoEmail: string) => Promise<{ ok: true; pendiente: boolean } | { error: string }>;
}) {
  const { slug } = useParams<{ slug: string }>();
  const {
    studio, socios, updateSocio, suscripciones, planesTarifa, tiposClase, reservas, sesiones, favoritos,
    // Gap — racha/reto/logros EN LÍNEA en Perfil, verificado contra
    // capturas reales de Claude Design: antes esta pantalla solo enlazaba a
    // /progreso ("Mis compañeras" ya cubre lo social; esto es lo personal).
    // Mismos motores que ya usa app/portal/[slug]/progreso/page.tsx — se
    // repite el pintado, condensado, no la lógica.
    rachaSocio, achievementDefinitions, achievementProgress, evaluarLogrosSocio,
    challengeDefinitions, challengeProgress, evaluarRetosSocio,
  } = useStudio();
  const { t, noche, toggle } = useModo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socio = socioOverride ?? socios.find(s => s.id === session?.socioId);
  const socioId = session?.socioId ?? null;

  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, socioId),
    [suscripciones, planesTarifa, tiposClase, socioId],
  );
  // "Clases este mes" — verificado contra capturas reales: es el mes en
  // curso, no el histórico ("Clases asistidas" de antes). Se cruza contra
  // `sesiones` porque `reservas` no lleva su propia fecha.
  const ahoraStats = useMemo(() => new Date(), []);
  const clasesEsteMes = useMemo(() => {
    if (!socioId) return 0;
    const inicioMes = new Date(ahoraStats.getFullYear(), ahoraStats.getMonth(), 1);
    return reservas.filter(r => {
      if (r.socioId !== socioId || r.estado !== 'ASISTIDA') return false;
      const sesion = sesiones.find(s => s.id === r.sesionId);
      return sesion ? new Date(sesion.inicio) >= inicioMes : false;
    }).length;
  }, [reservas, sesiones, socioId, ahoraStats]);
  const favoritosSocia = useMemo(
    () => favoritos.filter(f => f.socioId === socioId),
    [favoritos, socioId],
  );
  // Badge de Mensajes sin leer (Community & Messaging OS) — datos reales, sin
  // Realtime (se recalcula al volver a entrar en Perfil, no en vivo).
  const mensajesSinLeer = useMensajesSinLeer(studio?.id ?? null);

  // ── Racha / reto / logros — resumen en línea (verificado en vivo contra
  // el diseño real) ──────────────────────────────────────────────────────
  // Estable durante la vida de la pantalla, mismo criterio que `progreso/page.tsx`.
  const ahora = useMemo(() => new Date(), []);
  useEffect(() => {
    if (!socioId) return;
    evaluarLogrosSocio(socioId);
    evaluarRetosSocio(socioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId]);
  const racha = useMemo(() => (socioId ? rachaSocio(socioId) : null), [socioId, reservas, sesiones]); // eslint-disable-line react-hooks/exhaustive-deps
  const misReservasTodas = useMemo(() => reservas.filter(r => r.socioId === socioId), [reservas, socioId]);
  const hayLogros = achievementDefinitions.some(a => a.activo);
  // Top 4 para el grid 2x2 de Perfil — mismo orden que `LogrosTab`
  // (app/portal/[slug]/progreso/page.tsx): conseguidos primero, luego por
  // cercanía a completarse. Esta pantalla no reimplementa esa lógica de cero,
  // solo la acota a 4 con "Ver todo" llevando a la versión completa.
  const logrosTop4 = useMemo(() => {
    if (!hayLogros || !socioId) return [];
    return achievementDefinitions
      .filter(a => a.activo)
      .map(def => ({ def, progreso: achievementProgress.find(p => p.socioId === socioId && p.achievementId === def.id) ?? null }))
      .sort((a, b) => {
        const aDone = a.progreso?.completado ? 1 : 0;
        const bDone = b.progreso?.completado ? 1 : 0;
        if (aDone !== bDone) return bDone - aDone;
        return (a.progreso?.progresoActual ?? 0) / a.def.umbral < (b.progreso?.progresoActual ?? 0) / b.def.umbral ? 1 : -1;
      })
      .slice(0, 4);
  }, [hayLogros, socioId, achievementDefinitions, achievementProgress]);
  // Solo el reto ACTIVO más relevante (el primero), no la lista entera: es un
  // resumen, no una reimplementación de /progreso.
  const retoDestacado = useMemo(() => {
    if (!socioId || !socio) return null;
    const activo = challengeDefinitions.find(c => c.activo && new Date(c.fechaFin) >= ahora);
    if (!activo) return null;
    const progreso = challengeProgress.find(p => p.socioId === socioId && p.challengeId === activo.id);
    const valor = progreso?.completado ? progreso.progresoActual : calcularProgresoReto(activo, misReservasTodas, sesiones, socio, socios, ahora);
    return { def: activo, valor, completado: progreso?.completado ?? false };
  }, [socioId, socio, socios, challengeDefinitions, challengeProgress, misReservasTodas, sesiones, ahora]);

  const [hoja, setHoja] = useState<null | 'datos' | 'avatar' | 'email'>(null);
  const [form, setForm] = useState({
    nombre: socio?.nombre ?? '',
    apellidos: socio?.apellidos ?? '',
    telefono: socio?.telefono ?? '',
    fechaNacimiento: socio?.fechaNacimiento ?? '',
    direccion: socio?.direccion ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // Cambio de email de ACCESO — flujo propio, no un campo dentro de "Mis
  // datos". Antes "Mis datos" escribía `socios.email` sin verificar nada: el
  // mismo campo que `fetchPublicStudioData` compara contra el email del JWT
  // como prueba de identidad — un typo ahí bloqueaba a la socia de sus
  // propios datos en silencio (ver memoria del repo sobre socia.dev). Mismo
  // patrón ya usado en PortalAjustesView/actualizarEmail (lib/portal-auth.tsx).
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ error: boolean; texto: string } | null>(null);

  if (!socio || !session) return null;

  // Antes esto llamaba a `updateSocio` SIN esperarlo y ponía «Guardado» pasara
  // lo que pasara — el mismo patrón que hizo que una reserva rechazada se
  // anunciara como hecha (#500). Ahora se espera y se dice la verdad.
  async function guardarDatos(e?: React.FormEvent) {
    e?.preventDefault();
    if (!socio || guardando) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); setHoja(null); return; }
    setGuardando(true);
    setAviso(null);
    // Gemelo de portal-ajustes-view.tsx: SIN `email`. El servidor lo rechaza
    // antes de escribir nada, así que enviarlo hacía perder también nombre,
    // apellidos, teléfono, fecha de nacimiento y dirección.
    const r = await updateSocio(socio.id, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      telefono: form.telefono.trim() || null,
      fechaNacimiento: form.fechaNacimiento || null,
      direccion: form.direccion.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
    setHoja(null);
    setAviso({ texto: 'Datos guardados.', error: false });
  }

  async function cambiarEmail(e?: React.FormEvent) {
    e?.preventDefault();
    if (!nuevoEmail.trim() || cambiandoEmail) return;
    if (!escribible || !actualizarEmail) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); setHoja(null); return; }
    setCambiandoEmail(true);
    setEmailMsg(null);
    const r = await actualizarEmail(nuevoEmail.trim());
    setCambiandoEmail(false);
    if ('error' in r) { setEmailMsg({ error: true, texto: r.error }); return; }
    setEmailMsg({
      error: false,
      // Enlace, no código: es lo que de verdad manda Supabase por defecto al
      // cambiar el email — decir "código" sería prometer algo que este
      // proyecto no envía.
      texto: r.pendiente
        ? 'Te hemos mandado un enlace de confirmación al email nuevo. El cambio se aplica cuando lo abras.'
        : 'Email actualizado.',
    });
    setNuevoEmail('');
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !socio) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); setHoja(null); return; }
    const invalido = validarFotoPerfil(file);
    if (invalido) { setAviso({ texto: invalido, error: true }); return; }
    setAviso(null);
    setSubiendoFoto(true);
    const result = await subirFotoPerfil(socio.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso({ texto: result.error, error: true }); return; }
    void updateSocio(socio.id, { fotoUrl: result.url });
    setHoja(null);
  }

  async function quitarFoto() {
    if (!socio) return;
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); setHoja(null); return; }
    setSubiendoFoto(true);
    const result = await eliminarFotoPerfil(socio.id);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso({ texto: result.error, error: true }); return; }
    void updateSocio(socio.id, { fotoUrl: null });
    setHoja(null);
  }

  function elegirAvatar(id: string | null) {
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); setHoja(null); return; }
    void updateSocio(socio!.id, { avatar: id });
    setHoja(null);
  }

  // Tres tarjetas SIEMPRE visibles (verificado contra capturas reales de
  // Claude Design) — a diferencia de la versión anterior, que solo pintaba
  // las que tenían dato ("Clases asistidas" histórico, bono, plaza fija) y
  // podía desaparecer entera si la socia no tenía bono activo. El diseño
  // real pinta clases-de-ESTE-MES (no el histórico), sesiones de bono y
  // favoritos, con 0 como valor legítimo — no como ausencia de tarjeta.
  const stats: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'clases este mes', valor: String(clasesEsteMes) },
    { etiqueta: 'sesiones de bono', valor: bono && !bono.esMensual ? String(bono.totalRestantes ?? 0) : '0' },
    { etiqueta: 'favoritos', valor: String(favoritosSocia.length) },
  ];

  const fila = (
    titulo: string,
    valor: string | null,
    onClick: (() => void) | null,
    ultima = false,
    interruptor?: boolean,
  ) => {
    const contenido = (
      <>
        <span style={{ ...display(23), color: t.ink }}>{titulo}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {valor && <span style={{ fontFamily: sans, fontSize: 11.5, color: t.muted }}>{valor}</span>}
          {/* Sin destino no hay flecha: prometería un sitio al que no se va.
              Vale igual para el interruptor, que no lleva a ninguna parte —
              cambia algo aquí mismo, y lo que hay que ver es su estado. */}
          {onClick && !interruptor && <span style={{ fontFamily: sans, fontSize: 13, color: t.heroAccent }}>→</span>}
        </span>
      </>
    );
    const estilo: React.CSSProperties = {
      height: 66, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, background: 'none', border: 'none', textAlign: 'left',
      borderTop: `1px solid ${t.line}`,
      borderBottom: ultima ? `1px solid ${t.line}` : undefined,
      transition: `padding-left ${dur.control}ms ${EASE}`,
    };
    return onClick
      ? (
        <button
          key={titulo}
          type="button"
          onClick={onClick}
          role={interruptor ? 'switch' : undefined}
          aria-checked={interruptor ? noche : undefined}
          style={{ ...estilo, cursor: 'pointer' }}
        >
          {contenido}
        </button>
      )
      : <div key={titulo} style={estilo}>{contenido}</div>;
  };

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 24px 24px' }}>
        {/* ── Identidad ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setHoja('avatar')}
          aria-label="Cambiar tu foto"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
        >
          <ProfileAvatar
            avatarId={socio.avatar}
            fotoUrl={socio.fotoUrl}
            nombre={socio.nombre}
            apellidos={socio.apellidos}
            size="xl"
          />
        </button>
        <h1 style={{ ...display(34), color: t.ink, marginTop: 18 }}>
          {socio.nombre} {socio.apellidos}
        </h1>
        {desdeCuando(socio.fechaAlta) && (
          <p style={{ ...display(17, true), color: t.muted, marginTop: 8 }}>{desdeCuando(socio.fechaAlta)}</p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {stats.map(s => (
            <Card key={s.etiqueta} style={{ flex: 1, minWidth: 0, padding: '14px 14px 12px' }}>
              <div style={{ ...display(24), color: t.ink }}>{s.valor}</div>
              <div style={{ ...micro(8, 0.2, 600), color: t.muted, marginTop: 6, lineHeight: 1.3 }}>{s.etiqueta}</div>
            </Card>
          ))}
        </div>

        {/* ── Tus favoritos ────────────────────────────────────────────────────
            Verificado contra capturas reales de Claude Design: sección propia,
            SIEMPRE presente (con estado vacío), no escondida hasta que haya
            datos — a diferencia de "Tu actividad"/Logros de más abajo, que sí
            desaparecen si el estudio no tiene nada configurado (ahí no hay
            gesto que la socia pueda hacer para que aparezcan; aquí sí: tocar
            el ♡ de un tipo de clase). Mismo dato que ya usa
            portal-clases-view.tsx (`favoritos`/`toggleFavorito`), solo
            resumido — no se reimplementa el toggle aquí. */}
        <div style={{ marginTop: 28 }}>
          <h2 style={{ ...micro(9.5, 0.28), color: t.micro }}>Tus favoritos</h2>
          {favoritosSocia.length === 0 ? (
            <p style={{ ...texto.nota, color: t.muted, marginTop: 10 }}>
              Aún no tienes — toca el ♡ de una clase y aparecerá aquí.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {favoritosSocia.map(f => {
                const tc = tiposClase.find(x => x.id === f.tipoClaseId);
                if (!tc) return null;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: tc.color, flexShrink: 0 }} />
                    <span style={{ ...texto.metaFuerte, color: t.ink }}>{tc.nombre}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Tu actividad: racha/reto EN LÍNEA ────────────────────────────────
            Verificado contra capturas reales de Claude Design (antes "Tu
            progreso"). Mismos motores que la pantalla de progreso completa
            (rachaSocio, los motores de logros y de retos) — condensado a un
            resumen, con "Ver todo" a la pantalla completa (barras de 12
            semanas, clase favorita, recompensas). Nada se pinta si el estudio
            no tiene nada de esto configurado: mismo criterio "solo lo que hay
            de verdad" que ya usa esa pantalla. */}
        {(racha && racha.semanas > 0) || retoDestacado ? (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={{ ...micro(9.5, 0.28), color: t.micro }}>Tu actividad</h2>
              <button
                type="button"
                onClick={() => navegar(`/portal/${slug}/progreso`)}
                style={{ ...micro(9.5, 0.18, 600), color: t.heroAccent, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Ver todo →
              </button>
            </div>
            <div style={{
              marginTop: 12, borderRadius: radio.card, background: t.surface, boxShadow: '0 16px 36px -28px rgba(34,42,30,.5)',
              padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {racha && racha.semanas > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...texto.metaFuerte, color: t.ink }}>🔥 Racha actual</span>
                  <span style={{ ...micro(9, 0.1, 700), color: racha.enRiesgo ? '#B0453A' : t.muted }}>
                    {racha.enRiesgo && racha.diasParaPerder != null
                      ? `quedan ${racha.diasParaPerder} ${racha.diasParaPerder === 1 ? 'día' : 'días'}`
                      /* "· mejor: N" del diseño exige un máximo histórico que el
                         motor no calcula (RachaInfo solo da `esMejor: boolean`,
                         ver streak-engine.ts) — se muestra "tu mejor racha" SOLO
                         cuando es cierto, nunca un número inventado. */
                      : `${racha.semanas} ${racha.semanas === 1 ? 'semana' : 'semanas'}${racha.esMejor ? ' · tu mejor racha' : ''}`}
                  </span>
                </div>
              )}
              {retoDestacado && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{retoDestacado.def.icono}</span>
                    <span style={{ ...texto.metaFuerte, color: t.ink }}>{retoDestacado.def.nombre}</span>
                    <span style={{ ...micro(9, 0, 600), color: t.muted, marginLeft: 'auto' }}>
                      {Math.min(retoDestacado.valor, retoDestacado.def.objetivo)}/{retoDestacado.def.objetivo}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: t.line, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.round((retoDestacado.valor / retoDestacado.def.objetivo) * 100))}%`,
                      height: '100%', background: retoDestacado.completado ? '#3E9B6C' : 'var(--portal-brand)', borderRadius: 999,
                    }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Logros ────────────────────────────────────────────────────────────
            Verificado contra capturas reales: grid 2x2 en Perfil (no solo el
            resumen "N de M desbloqueados" de antes). Mismo patrón visual que
            `LogrosTab` en app/portal/[slug]/progreso/page.tsx — top 4, no
            reimplementa esa pantalla completa. */}
        {hayLogros && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ ...micro(9.5, 0.28), color: t.micro }}>Logros</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              {logrosTop4.map(({ def, progreso }) => {
                const completado = progreso?.completado ?? false;
                const actual = progreso?.progresoActual ?? 0;
                return (
                  <div
                    key={def.id}
                    style={{
                      background: t.surface, borderRadius: radio.card, padding: 14,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
                      boxShadow: '0 14px 32px -26px rgba(34,42,30,.5)',
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                      backgroundColor: completado ? 'color-mix(in srgb, var(--portal-brand) 12%, transparent)' : t.surface2,
                      filter: completado ? 'none' : 'grayscale(0.6)',
                    }}>
                      {def.icono}
                    </div>
                    <p style={{ ...texto.metaFuerte, color: t.ink, lineHeight: 1.15 }}>{def.nombre}</p>
                    {!completado && (
                      <p style={{ ...micro(8, 0, 600), color: t.muted }}>{actual}/{def.umbral}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Promoción cruzada a Tentare Network ──────────────────────────────
            Verificado contra capturas reales — vive fuera de Ajustes/Cuenta a
            propósito, como su propia tarjeta. Sin enlace real: Network es una
            app aparte (App 2 de 2), no una ruta de este portal — mismo motivo
            por el que el logo colapsado y /login se quedan con la marca
            paraguas (ver tentare-os.md, "Arquitectura de marca"). */}
        <div style={{
          marginTop: 24, borderRadius: radio.card, background: 'color-mix(in srgb, var(--portal-brand) 10%, transparent)',
          padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          {/* El logo NUNCA es una imagen/emoji suelto — siempre el componente
              en línea (ver tentare-os.md, "El logotipo"). */}
          <LogoTentare formato="isotipo" tinta="color" alto={20} decorativo />
          <div>
            <p style={{ ...texto.metaFuerte, color: t.ink }}>¿Quieres probar otros estudios?</p>
            <p style={{ ...texto.nota, color: t.muted, marginTop: 4 }}>
              Descárgate Tentare Network — el marketplace de estudios e instructoras.
            </p>
          </div>
        </div>

        {/* ── Filas ────────────────────────────────────────────────────────── */}
        <div style={{ height: 34 }} />
        {/* Community & Messaging OS (P1): único punto de entrada a /mensajes
            y /comunidad desde este portal — a propósito NO se añaden como
            pestañas nuevas del menú inferior (NAV_SEG_IDS es un catálogo
            cerrado que se persiste en la config del tema de cada estudio;
            añadir una pestaña ahí es un cambio de esquema, no de esta
            pantalla). */}
        {fila('Mensajes', mensajesSinLeer > 0 ? String(mensajesSinLeer) : null, () => navegar(`/portal/${slug}/mensajes`))}
        {fila('Comunidad', null, () => navegar(`/portal/${slug}/comunidad`))}
        {fila('Documentos', null, () => navegar(`/portal/${slug}/documentos`))}
        {fila('Mis compañeras', null, () => navegar(`/portal/${slug}/companeras`))}
        {fila('Mis datos', null, () => setHoja('datos'))}
        {fila('Cambiar email', socio.email || null, () => setHoja('email'))}
        {fila(
          'Métodos de pago',
          socio.metodoPagoPreferido === 'SEPA' && socio.sepaMandateId ? 'Domiciliado' : null,
          () => navegar(`/portal/${slug}/compras`),
        )}
        {/* "Notificaciones", no "Avisos" — verificado contra capturas reales. */}
        {fila('Notificaciones', null, () => navegar(`/portal/${slug}/preferencias`))}
        {/* Pantalla unificada (Ajustes): Mis datos + Usuario (@handle) +
            Contraseña + Avisos + resumen de la tarjeta, en un solo sitio.
            Las filas de arriba se quedan tal cual — esta es una vía
            adicional, no las sustituye. */}
        {fila('Ajustes', null, () => navegar(`/portal/${slug}/ajustes`))}
        {fila('Aspecto', noche ? 'Noche' : 'Día', toggle, false, true)}
        {fila(
          'El estudio',
          [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ') || null,
          null,
          true,
        )}

        <button
          type="button"
          onClick={onLogout}
          style={{
            height: 54, width: '100%', marginTop: 26, borderRadius: radio.botonAlto - 6,
            border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
            background: 'none', color: t.muted, ...texto.boton, fontSize: 13.5, cursor: 'pointer',
            transition: transicion(['background', 'color'], dur.color),
          }}
        >
          Cerrar sesión
        </button>

        {/* Marca blanca: el pie es del estudio, no nuestro. */}
        <div style={{ ...micro(9, 0.34), color: t.micro, textAlign: 'center', marginTop: 40 }}>
          {studio?.nombre ?? ''}
        </div>
      </div>

      {/* ── Hoja: mis datos ────────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'datos'} onClose={() => setHoja(null)}>
        <h2 style={{ ...display(26), color: t.ink, marginBottom: 18 }}>Mis datos</h2>
        <form onSubmit={guardarDatos} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cada campo con su ROTULO visible: el placeholder se va al escribir
              y dejaba una columna de cajas sin saber cuál era cuál. */}
          <Input label="Nombre" placeholder="Nombre" autoComplete="given-name" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          <Input label="Apellidos" placeholder="Apellidos" autoComplete="family-name" value={form.apellidos}
            onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
          <Input label="Teléfono" placeholder="+34 600 000 000" type="tel" autoComplete="tel" inputMode="tel" value={form.telefono}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          <Input label="Fecha de nacimiento" type="date" value={form.fechaNacimiento}
            onChange={e => setForm(f => ({ ...f, fechaNacimiento: e.target.value }))} />
          <Input label="Dirección" placeholder="Calle, número, ciudad" autoComplete="street-address" value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          <Button type="submit" disabled={guardando} style={{ width: '100%', marginTop: 6 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </BottomSheet>

      {/* ── Hoja: cambiar email ───────────────────────────────────────────────
          Flujo propio, no un campo dentro de "Mis datos". Cambia el email de
          ACCESO (auth.updateUser), no `socios.email` directamente — ver
          comentario de `actualizarEmail` en lib/portal-auth.tsx. */}
      <BottomSheet open={hoja === 'email'} onClose={() => { setHoja(null); setEmailMsg(null); setNuevoEmail(''); }}>
        <h2 style={{ ...display(26), color: t.ink, marginBottom: 18 }}>Cambiar email</h2>
        <p style={{ ...texto.pie, color: t.muted, marginBottom: 18 }}>
          Ahora: {socio.email || 'sin email'}. Te mandamos un enlace al nuevo para confirmarlo.
        </p>
        <form onSubmit={cambiarEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nuevo email" placeholder="tu@email.com" type="email" autoComplete="email" value={nuevoEmail}
            onChange={e => { setNuevoEmail(e.target.value); setEmailMsg(null); }} />
          {emailMsg && (
            <p role={emailMsg.error ? 'alert' : undefined} style={{ ...texto.nota, color: emailMsg.error ? '#B0453A' : t.muted }}>
              {emailMsg.texto}
            </p>
          )}
          <Button type="submit" disabled={cambiandoEmail || !nuevoEmail.trim()} style={{ width: '100%', marginTop: 6 }}>
            {cambiandoEmail ? 'Enviando…' : 'Enviarme el enlace'}
          </Button>
        </form>
      </BottomSheet>

      {/* ── Hoja: foto ─────────────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'avatar'} onClose={() => setHoja(null)}>
        <h2 style={{ ...display(26), color: t.ink, marginBottom: 18 }}>Tu foto</h2>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={subirFoto} style={{ display: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button onClick={() => fileInputRef.current?.click()} disabled={subiendoFoto} style={{ width: '100%' }}>
            {subiendoFoto ? 'Subiendo…' : 'Subir una foto'}
          </Button>
          {socio.fotoUrl && (
            <Button variant="secondary" onClick={quitarFoto} disabled={subiendoFoto} style={{ width: '100%' }}>
              Quitar la foto
            </Button>
          )}
          <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 14 }}>O elige un avatar</div>
          <AvatarPicker value={socio.avatar ?? null} onChange={elegirAvatar} />
        </div>
      </BottomSheet>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
