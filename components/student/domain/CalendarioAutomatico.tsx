'use client';

import { useState, useSyncExternalStore } from 'react';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { Interruptor } from '@/components/student/ui/Interruptor';
import { useToast } from '@/components/student/ui/Toast';
import { activarCalendario, calendarioActivo, desactivarCalendario, sincronizarCalendario } from '@/lib/student/calendario-dispositivo';
import { textoTrasActivar } from '@/lib/student/calendario-auto';

// Perfil → «Mis reservas en mi calendario». Solo en la app de iOS: en la web no
// hay calendario al que escribir (allí sigue «+ Calendario» con su .ics).
//
// No se mueve hasta que el iPhone contesta: encenderlo pide permiso, y si dice
// que no se queda apagado y lo explica. Al apagarlo se quitan los eventos que la
// app había puesto (si no, al cancelar luego nadie los quitaría).
export function CalendarioAutomatico({ slug, nombre, direccion }: { slug: string; nombre: string; direccion: string }) {
  const nativa = useAppNativa();
  const { toast } = useToast();
  // Lo guardado en el dispositivo, leído al pintar (sin efecto): `false` en el servidor.
  const guardado = useSyncExternalStore(() => () => {}, () => calendarioActivo(slug), () => false);
  const [on, setOn] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!nativa) return null;
  const valor = on ?? guardado;

  const cambiar = async (quiere: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (quiere) {
        const e = { slug, nombre, direccion };
        if (!(await activarCalendario(e))) {
          toast('Para hacerlo, permite el acceso al calendario en Ajustes › Privacidad › Calendarios.');
          return;
        }
        setOn(true);
        toast(textoTrasActivar(await sincronizarCalendario(e)));
      } else {
        await desactivarCalendario(slug);
        setOn(false);
      }
    } catch {
      // Sin conexión al leer sus reservas, o el calendario no contestó: el
      // interruptor dice lo que de verdad quedó guardado.
      toast('No hemos podido ponerlo al día. Lo intentaremos la próxima vez que abras la app.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }} data-testid="calendario-automatico">
      <Interruptor
        on={valor}
        disabled={ocupado}
        onChange={(v) => void cambiar(v)}
        label="Mis reservas en mi calendario"
        sub="Se añaden solas y se quitan si cancelas"
      />
    </div>
  );
}

