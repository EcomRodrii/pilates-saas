'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';

function dismissKey(studioId: string) {
  return `ps_onboarding_dismissed_${studioId}`;
}

export function OnboardingChecklist() {
  const { studio, planesTarifa, salas, instructores, tiposClase, sesiones, socios } = useStudio();
  const [dismissed, setDismissed] = useState(true); // arranca oculto hasta leer localStorage (evita parpadeo)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (studio?.id) setDismissed(localStorage.getItem(dismissKey(studio.id)) === '1');
  }, [studio?.id]);

  if (!mounted || !studio) return null;

  const steps = [
    { label: 'Crea tu primer plan o tarifa', done: planesTarifa.length > 0, href: '/configuracion?tab=planes' },
    { label: 'Añade una sala', done: salas.length > 0, href: '/configuracion?tab=salas' },
    { label: 'Añade a tu equipo (instructoras)', done: instructores.length > 0, href: '/equipo' },
    { label: 'Crea un tipo de clase y programa un horario', done: tiposClase.length > 0 && sesiones.length > 0, href: '/calendario' },
    { label: 'Da de alta tu primera socia', done: socios.length > 0, href: '/socios?nuevo=1' },
  ];

  const pendientes = steps.filter(s => !s.done).length;
  if (pendientes === 0 || dismissed) return null;

  function handleDismiss() {
    if (studio) localStorage.setItem(dismissKey(studio.id), '1');
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-[#E7E7E0] bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#F0F0EA]">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-[#FFF2F7] text-[#B57A8E]">
            <Rocket size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#1A1A1A]">Primeros pasos con tu estudio</p>
            <p className="text-[11px] text-[#8E8E86]">{steps.length - pendientes} de {steps.length} completados</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="shrink-0 p-1 rounded-lg hover:bg-[#F5F5F1] transition-colors" title="Ocultar">
          <X size={14} className="text-[#A8A89F]" />
        </button>
      </div>
      <div className="divide-y divide-[#F5F5F1]">
        {steps.map(step => (
          <Link
            key={step.label}
            href={step.href}
            className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#FAFAF7] transition-colors"
          >
            {step.done
              ? <CheckCircle2 size={16} className="text-[#B57A8E] shrink-0" />
              : <Circle size={16} className="text-[#D4D4CC] shrink-0" />}
            <span className={`text-[13px] ${step.done ? 'text-[#A8A89F] line-through' : 'text-[#3A3A34] font-medium'}`}>
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
