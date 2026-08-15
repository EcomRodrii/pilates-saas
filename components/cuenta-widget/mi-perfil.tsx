'use client';

// Fase 4 (Booking Engine — Mi Cuenta): perfil básico, compartido entre Modo
// A/B. Nombre/apellidos/email en solo lectura (identidad, no editable desde
// aquí — `actualizarSociaPublica` los excluye a propósito, ver
// docs/account-widget-diseno.md §0/§6). Solo los 5 campos que esa función SÍ
// acepta.
import { useState } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Socio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { telefonoValido } from '@/lib/csv';
import { sans, radius } from '@/lib/reservar-publico-tokens';

const inputStyle = (t: ModoTokens): React.CSSProperties => ({
  width: '100%', fontSize: 14, padding: '10px 14px', borderRadius: radius.card,
  border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontFamily: sans,
});
const labelStyle = (t: ModoTokens): React.CSSProperties => ({
  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: t.muted, display: 'block', marginBottom: 6,
});

export function MiPerfil({
  t, socio, onActualizarPerfil, onLogout,
}: {
  t: ModoTokens;
  socio: Socio;
  onActualizarPerfil: (cambios: Record<string, unknown>) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onLogout: () => void;
}) {
  const [telefono, setTelefono] = useState(socio.telefono ?? '');
  const [direccion, setDireccion] = useState(socio.direccion ?? '');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const hayCambios = telefono !== (socio.telefono ?? '') || direccion !== (socio.direccion ?? '');

  async function guardar() {
    if (guardando) return;
    if (telefono && !telefonoValido(telefono)) {
      setMensaje({ tipo: 'error', texto: 'Revisa el teléfono.' });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const r = await onActualizarPerfil({ telefono: telefono || null, direccion: direccion || null });
    setGuardando(false);
    if (r && !r.ok) { setMensaje({ tipo: 'error', texto: r.error }); return; }
    setMensaje({ tipo: 'ok', texto: 'Guardado.' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: sans }}>
      <div>
        <p style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>{socio.nombre} {socio.apellidos}</p>
        <p style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{socio.email}</p>
      </div>

      <div>
        <label style={labelStyle(t)} htmlFor="cuenta-widget-telefono">Teléfono</label>
        <input id="cuenta-widget-telefono" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} style={inputStyle(t)} />
      </div>
      <div>
        <label style={labelStyle(t)} htmlFor="cuenta-widget-direccion">Dirección</label>
        <input id="cuenta-widget-direccion" type="text" value={direccion} onChange={e => setDireccion(e.target.value)} style={inputStyle(t)} />
      </div>

      {mensaje && (
        <p style={{ fontSize: 12.5, color: mensaje.tipo === 'error' ? '#B45309' : '#047857' }}>{mensaje.texto}</p>
      )}

      <button type="button" disabled={!hayCambios || guardando} onClick={guardar} style={{
        width: '100%', height: 44, borderRadius: radius.pillBtnSm - 2, border: 'none',
        background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
        fontSize: 14, fontWeight: 700, cursor: (!hayCambios || guardando) ? 'default' : 'pointer',
        opacity: (!hayCambios || guardando) ? 0.5 : 1,
      }}>
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>

      <button type="button" onClick={onLogout} style={{
        background: 'none', border: 'none', color: t.muted, fontSize: 12.5, cursor: 'pointer',
        textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, alignSelf: 'center',
      }}>
        Cerrar sesión
      </button>
    </div>
  );
}
