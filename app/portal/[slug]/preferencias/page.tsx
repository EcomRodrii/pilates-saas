'use client';

import { useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { DIAS_SEMANA, FRANJAS, NIVELES, DURACIONES, disponibilidadVacia } from '@/lib/portal-preferencias';
import type { Disponibilidad, NivelSocio } from '@/lib/types';
import { Check } from 'lucide-react';

export default function PreferenciasPage() {
  const { session } = usePortalAuth();
  const { instructores, tiposClase, preferenciasSocio, upsertPreferenciasSocio } = useStudio();
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

  return (
    <div className="bg-white min-h-full">
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, var(--portal-brand) 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Preferencias</h1>
        <p className="text-white/50 text-[13px] mt-0.5">Cuéntanos cómo te gusta entrenar</p>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-5">
        {guardado && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#171717] text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg">
            <Check size={13} />Guardado
          </div>
        )}

        {/* Disponibilidad */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-1">Mi disponibilidad</p>
          <p className="text-[12px] text-[#A8A89E] mb-4">Marca cuándo puedes entrenar — nos ayuda a recomendarte mejores horarios.</p>
          <div className="space-y-1">
            <div className="grid grid-cols-4 gap-2 mb-1 px-1">
              <span />
              {FRANJAS.map(f => (
                <span key={f.id} className="text-[10px] font-bold text-[#A8A89E] uppercase text-center">{f.label}</span>
              ))}
            </div>
            {DIAS_SEMANA.map(dia => (
              <div key={dia.id} className="grid grid-cols-4 gap-2 items-center py-1.5 border-t border-[#F1F1EC] first:border-0">
                <span className="text-[13px] font-semibold text-[#171717]">{dia.label}</span>
                {FRANJAS.map(franja => {
                  const activo = disponibilidad[dia.id]?.[franja.id] ?? false;
                  return (
                    <button
                      key={franja.id}
                      onClick={() => toggleFranja(dia.id, franja.id)}
                      className="mx-auto w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                      style={{ backgroundColor: activo ? 'var(--portal-brand)' : '#F5F5F1' }}
                      aria-label={`${dia.label} ${franja.label}`}
                    >
                      {activo && <Check size={15} className="text-[#171717]" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Instructor favorito */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Instructor favorito</p>
          <div className="flex flex-wrap gap-2">
            {instructoresActivos.map(i => {
              const selected = prefs?.instructorFavoritoId === i.id;
              return (
                <button
                  key={i.id}
                  onClick={() => setCampo('instructorFavoritoId', selected ? null : i.id)}
                  className="px-3.5 py-2 rounded-2xl text-[13px] font-semibold transition-all"
                  style={{ backgroundColor: selected ? '#171717' : '#F1F1EC', color: selected ? 'white' : '#3A3A34' }}
                >
                  {i.nombre}
                </button>
              );
            })}
            {instructoresActivos.length === 0 && (
              <p className="text-[13px] text-[#A8A89E]">Aún no hay instructoras dadas de alta.</p>
            )}
          </div>
        </div>

        {/* Tipo de clase favorita */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Tipo de clase favorita</p>
          <div className="flex flex-wrap gap-2">
            {tiposClase.map(t => {
              const selected = prefs?.tipoClaseFavorita === t.nombre;
              return (
                <button
                  key={t.id}
                  onClick={() => setCampo('tipoClaseFavorita', selected ? null : t.nombre)}
                  className="px-3.5 py-2 rounded-2xl text-[13px] font-semibold transition-all"
                  style={{ backgroundColor: selected ? t.color : '#F1F1EC', color: selected ? 'white' : '#3A3A34' }}
                >
                  {t.nombre}
                </button>
              );
            })}
            {tiposClase.length === 0 && (
              <p className="text-[13px] text-[#A8A89E]">Aún no hay tipos de clase configurados.</p>
            )}
          </div>
        </div>

        {/* Duración preferida */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Duración preferida</p>
          <div className="flex gap-2">
            {DURACIONES.map(min => {
              const selected = prefs?.duracionPreferida === min;
              return (
                <button
                  key={min}
                  onClick={() => setCampo('duracionPreferida', selected ? null : min)}
                  className="flex-1 py-2.5 rounded-2xl text-[13px] font-bold transition-all"
                  style={{ backgroundColor: selected ? '#171717' : '#F1F1EC', color: selected ? 'white' : '#3A3A34' }}
                >
                  {min} min
                </button>
              );
            })}
          </div>
        </div>

        {/* Nivel */}
        <div className="bg-white rounded-3xl border border-black/[0.06] p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Nivel</p>
          <div className="flex gap-2">
            {NIVELES.map(n => {
              const selected = prefs?.nivel === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setCampo('nivel', selected ? null : (n.id as NivelSocio))}
                  className="flex-1 py-2.5 rounded-2xl text-[13px] font-bold transition-all"
                  style={{ backgroundColor: selected ? '#171717' : '#F1F1EC', color: selected ? 'white' : '#3A3A34' }}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
