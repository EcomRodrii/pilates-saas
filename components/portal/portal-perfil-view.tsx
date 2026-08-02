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

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { subirFotoPerfil, eliminarFotoPerfil, validarFotoPerfil } from '@/lib/portal-storage';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { BottomSheet, Input, Button } from '@/components/portal/ui';
import { bonoActivo } from '@/lib/bonos-portal';
import { display, micro, sans, texto, radio, transicion, dur, EASE } from '@/lib/portal-design';
import type { PortalSession } from '@/lib/portal-auth';
import type { Socio } from '@/lib/types';

const DIAS_CORTO = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
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
  session, socioOverride, escribible = true, navegar, onLogout,
}: {
  session: PortalSession | null;
  socioOverride?: Socio;
  escribible?: boolean;
  navegar: (ruta: string) => void;
  onLogout: () => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { studio, socios, updateSocio, suscripciones, planesTarifa, tiposClase, plazasFijas } = useStudio();
  const { t, noche, toggle } = useModo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socio = socioOverride ?? socios.find(s => s.id === session?.socioId);
  const socioId = session?.socioId ?? null;

  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, socioId),
    [suscripciones, planesTarifa, tiposClase, socioId],
  );
  const plaza = useMemo(() => {
    const p = plazasFijas.find(x => x.socioId === socioId && x.estado === 'ACTIVA');
    return p ? DIAS_CORTO[p.diaSemana] ?? null : null;
  }, [plazasFijas, socioId]);

  const [hoja, setHoja] = useState<null | 'datos' | 'avatar'>(null);
  const [form, setForm] = useState({
    nombre: socio?.nombre ?? '',
    apellidos: socio?.apellidos ?? '',
    email: socio?.email ?? '',
    telefono: socio?.telefono ?? '',
    fechaNacimiento: socio?.fechaNacimiento ?? '',
    direccion: socio?.direccion ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  if (!socio || !session) return null;

  // Antes esto llamaba a `updateSocio` SIN esperarlo y ponía «Guardado» pasara
  // lo que pasara — el mismo patrón que hizo que una reserva rechazada se
  // anunciara como hecha (#500). Ahora se espera y se dice la verdad.
  async function guardarDatos(e?: React.FormEvent) {
    e?.preventDefault();
    if (!socio || guardando) return;
    if (!escribible) { setAviso('Vista previa: esto no se guarda de verdad.'); setHoja(null); return; }
    setGuardando(true);
    setAviso(null);
    const r = await updateSocio(socio.id, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim() || null,
      fechaNacimiento: form.fechaNacimiento || null,
      direccion: form.direccion.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    setHoja(null);
    setAviso('Datos guardados.');
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !socio) return;
    if (!escribible) { setAviso('Vista previa: esto no se guarda de verdad.'); setHoja(null); return; }
    const invalido = validarFotoPerfil(file);
    if (invalido) { setAviso(invalido); return; }
    setAviso(null);
    setSubiendoFoto(true);
    const result = await subirFotoPerfil(socio.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso(result.error); return; }
    void updateSocio(socio.id, { fotoUrl: result.url });
    setHoja(null);
  }

  async function quitarFoto() {
    if (!socio) return;
    if (!escribible) { setAviso('Vista previa: esto no se guarda de verdad.'); setHoja(null); return; }
    setSubiendoFoto(true);
    const result = await eliminarFotoPerfil(socio.id);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso(result.error); return; }
    void updateSocio(socio.id, { fotoUrl: null });
    setHoja(null);
  }

  function elegirAvatar(id: string | null) {
    if (!escribible) { setAviso('Vista previa: esto no se guarda de verdad.'); setHoja(null); return; }
    void updateSocio(socio!.id, { avatar: id });
    setHoja(null);
  }

  const chip = (texto1: string, fuerte: boolean) => (
    <span
      key={texto1}
      style={{
        ...micro(8.5, 0.2, 600),
        color: fuerte ? t.ink : t.muted,
        background: fuerte ? (noche ? t.surface2 : '#EEF0EA') : t.surface,
        border: `1px solid ${fuerte ? (noche ? t.line : 'rgba(44,53,44,.14)') : t.line}`,
        borderRadius: 999, padding: '9px 14px', whiteSpace: 'nowrap',
      }}
    >
      {texto1}
    </span>
  );

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

        {(plaza || bono) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {plaza && chip(`Plaza fija · ${plaza}`, true)}
            {bono && chip(`${bono.nombre} activo`, false)}
          </div>
        )}

        {aviso && (
          <p role="status" style={{
            fontFamily: sans, fontSize: 12.5, color: t.ink, background: t.surface2,
            borderRadius: 14, padding: '11px 14px', marginTop: 20,
          }}>
            {aviso}
          </p>
        )}

        {/* ── Filas ────────────────────────────────────────────────────────── */}
        <div style={{ height: 34 }} />
        {fila('Mis datos', null, () => setHoja('datos'))}
        {fila(
          'Métodos de pago',
          socio.metodoPagoPreferido === 'SEPA' && socio.sepaMandateId ? 'Domiciliado' : null,
          () => navegar(`/portal/${slug}/compras`),
        )}
        {fila('Avisos', null, () => navegar(`/portal/${slug}/preferencias`))}
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
          <Input placeholder="Nombre" autoComplete="given-name" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          <Input placeholder="Apellidos" autoComplete="family-name" value={form.apellidos}
            onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
          <Input placeholder="Email" type="email" autoComplete="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input placeholder="+34 600 000 000" type="tel" autoComplete="tel" inputMode="tel" value={form.telefono}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          <Input placeholder="Fecha de nacimiento" type="date" value={form.fechaNacimiento}
            onChange={e => setForm(f => ({ ...f, fechaNacimiento: e.target.value }))} />
          <Input placeholder="Calle, número, ciudad" autoComplete="street-address" value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          <Button type="submit" disabled={guardando} style={{ width: '100%', marginTop: 6 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
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
    </div>
  );
}
