'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { DIAS_SEMANA, FRANJAS, NIVELES, DURACIONES, disponibilidadVacia } from '@/lib/portal-preferencias';
import type { Disponibilidad, NivelSocio } from '@/lib/types';
import { useModo } from '@/lib/portal-modo';
import { Check } from 'lucide-react';
import { Card, Pill } from '@/components/portal/ui';

export default function PreferenciasPage() {
  const { session } = usePortalAuth();
  const { instructores, tiposClase, preferenciasSocio, upsertPreferenciasSocio } = useStudio();
  const { t } = useModo();
  const socioId = session?.socioId;
  const prefs = preferenciasSocio.find(p => p.socioId === socioId);
  const disponibilidad: Disponibilidad = prefs?.disponibilidad && Object.keys(prefs.disponibilidad).length > 0
    ? prefs.disponibilidad
    : disponibilidadVacia();

  const [guardado, setGuardado] = useState(false);

  if (!socioId) return null;
  const sid: string = socioId;

  function flashGuardado() {
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1500);
  }

  function toggleFranja(dia: keyof Disponibilidad, franja: 'manana' | 'tarde' | 'noche') {
    const nueva: Disponibilidad = {
      ...disponibilidad,
      [dia]: { ...disponibilidad[dia], [franja]: !disponibilidad[dia][franja] },
    };
    upsertPreferenciasSocio(sid, { disponibilidad: nueva });
    flashGuardado();
  }

  function setCampo<K extends 'instructorFavoritoId' | 'tipoClaseFavorita' | 'duracionPreferida' | 'nivel'>(
    key: K,
    value: K extends 'duracionPreferida' ? number | null : string | null
  ) {
    upsertPreferenciasSocio(sid, { [key]: value } as never);
    flashGuardado();
  }

  const instructoresActivos = instructores.filter(i => i.activo);
  const microLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.muted };

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Preferencias</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Cuéntanos cómo te gusta entrenar</p>
      </div>

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {guardado && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: t.ink, color: t.bg, fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={13} />Guardado
          </div>
        )}

        {/* Disponibilidad */}
        <Card style={{ padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 4 }}>Mi disponibilidad</p>
          <p style={{ fontSize: 12, color: t.muted, marginBottom: 16 }}>Marca cuándo puedes entrenar — nos ayuda a recomendarte mejores horarios.</p>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 4, padding: '0 4px' }}>
              <span />
              {FRANJAS.map(f => (
                <span key={f.id} style={{ fontSize: 10, fontWeight: 800, color: t.muted, textTransform: 'uppercase', textAlign: 'center' }}>{f.label}</span>
              ))}
            </div>
            {DIAS_SEMANA.map((dia, i) => (
              <div key={dia.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: i === 0 ? 'none' : `1px solid ${t.line}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{dia.label}</span>
                {FRANJAS.map(franja => {
                  const activo = disponibilidad[dia.id]?.[franja.id] ?? false;
                  return (
                    <button
                      key={franja.id}
                      onClick={() => toggleFranja(dia.id, franja.id)}
                      style={{ margin: '0 auto', width: 36, height: 36, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', backgroundColor: activo ? 'var(--portal-brand)' : t.surface2 }}
                      aria-label={`${dia.label} ${franja.label}`}
                    >
                      {activo && <Check size={15} style={{ color: 'var(--portal-brand-foreground)' }} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* Instructor favorito */}
        <Card style={{ padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 12 }}>Instructor favorito</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {instructoresActivos.map(i => {
              const selected = prefs?.instructorFavoritoId === i.id;
              return (
                <Pill key={i.id} active={selected} onClick={() => setCampo('instructorFavoritoId', selected ? null : i.id)}>
                  {i.nombre}
                </Pill>
              );
            })}
            {instructoresActivos.length === 0 && (
              <p style={{ fontSize: 13, color: t.muted }}>Aún no hay instructoras dadas de alta.</p>
            )}
          </div>
        </Card>

        {/* Tipo de clase favorita */}
        <Card style={{ padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 12 }}>Tipo de clase favorita</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tiposClase.map(tc => {
              const selected = prefs?.tipoClaseFavorita === tc.nombre;
              return (
                <Pill
                  key={tc.id}
                  active={selected}
                  onClick={() => setCampo('tipoClaseFavorita', selected ? null : tc.nombre)}
                  style={selected ? { background: tc.color, borderColor: tc.color, color: '#fff' } : undefined}
                >
                  {tc.nombre}
                </Pill>
              );
            })}
            {tiposClase.length === 0 && (
              <p style={{ fontSize: 13, color: t.muted }}>Aún no hay tipos de clase configurados.</p>
            )}
          </div>
        </Card>

        {/* Duración preferida */}
        <Card style={{ padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 12 }}>Duración preferida</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {DURACIONES.map(min => {
              const selected = prefs?.duracionPreferida === min;
              return (
                <Pill key={min} active={selected} onClick={() => setCampo('duracionPreferida', selected ? null : min)} style={{ flex: 1, justifyContent: 'center' }}>
                  {min} min
                </Pill>
              );
            })}
          </div>
        </Card>

        {/* Nivel */}
        <Card style={{ padding: 20 }}>
          <p style={{ ...microLabel, marginBottom: 12 }}>Nivel</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {NIVELES.map(n => {
              const selected = prefs?.nivel === n.id;
              return (
                <Pill key={n.id} active={selected} onClick={() => setCampo('nivel', selected ? null : (n.id as NivelSocio))} style={{ flex: 1, justifyContent: 'center' }}>
                  {n.label}
                </Pill>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
