'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { ExportarDatosEstudio } from '@/components/billing/exportar-datos-estudio';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { authHeader } from '@/lib/api-client';

// Datos y seguridad: llévate una copia de tus datos y decide cómo se tratan.
//
// Una sola forma de llevártelos (decisión del fundador, 15-sep): «Exportar mis
// datos», un CSV por tabla hecho en el servidor. La exportación rápida «Exportar
// a Excel» (tres CSV hechos en el navegador con lo cargado en el panel) se
// retiró: dos botones para lo mismo obligaban a adivinar cuál era el bueno. Su
// ancla vieja, `#integracion-excel`, lleva aquí (lib/configuracion/destino.ts).
//
// Aquí vivía también una lista de «copias de seguridad» que prometía una copia
// diaria automática que ningún proceso programado hace, y un «Restaurar» que no
// estaba disponible. Se quitó: una pantalla de seguridad que promete lo que no
// hay es peor que no tenerla.
//
// «Redactar con IA» (2-oct-2026, contrato de encargo): lo que la IA redacta
// sola, sin pulsar un botón. Se guarda en el servidor y el interruptor solo se
// mueve cuando el servidor lo confirma (FilaInterruptor).
export function SeccionDatos({ showToast }: { showToast: (m: string) => void }) {
  const [redaccionIA, setRedaccionIA] = useState<boolean | null>(null);
  const [dobleFactor, setDobleFactor] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const cabecera = await authHeader();
      const [ia, df] = await Promise.all([
        fetch('/api/estudio/redaccion-ia', { headers: cabecera }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/estudio/doble-factor', { headers: cabecera }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]) as [{ activo?: boolean } | null, { exigir?: boolean } | null];
      if (!vivo) return;
      if (typeof ia?.activo === 'boolean') setRedaccionIA(ia.activo);
      if (typeof df?.exigir === 'boolean') setDobleFactor(df.exigir);
    })();
    return () => { vivo = false; };
  }, []);

  async function cambiarDobleFactor(v: boolean): Promise<string | null> {
    const res = await fetch('/api/estudio/doble-factor', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ exigir: v }),
    });
    const data = await res.json().catch(() => ({})) as { exigir?: boolean; error?: string };
    if (!res.ok || typeof data.exigir !== 'boolean') return data.error ?? 'No se ha podido guardar';
    setDobleFactor(data.exigir);
    showToast(data.exigir
      ? 'Todo el equipo tendrá que activarla la próxima vez que entre al panel'
      : 'Ya no se exige: cada persona decide en «Mi perfil»');
    return null;
  }

  async function cambiarRedaccionIA(v: boolean): Promise<string | null> {
    const res = await fetch('/api/estudio/redaccion-ia', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ activo: v }),
    });
    const data = await res.json().catch(() => ({})) as { activo?: boolean; error?: string };
    if (!res.ok || typeof data.activo !== 'boolean') return data.error ?? 'No se ha podido guardar';
    setRedaccionIA(data.activo);
    showToast(data.activo
      ? 'La IA vuelve a redactar tus sugerencias y automatizaciones'
      : 'Apagado: ya no se envía nada de tus alumnas a la IA sin que pulses un botón');
    return null;
  }

  return (
    <>
      <TarjetaAjuste id="exportar">
        <ExportarDatosEstudio sinCabecera />
      </TarjetaAjuste>
      <GrupoFilas titulo="Acceso al panel">
        <FilaInterruptor id="doble-factor-equipo" icono={ShieldCheck} on={dobleFactor} onCambiar={cambiarDobleFactor} />
      </GrupoFilas>
      <GrupoFilas titulo="Inteligencia artificial">
        <FilaInterruptor id="redaccion-ia" icono={Sparkles} on={redaccionIA} onCambiar={cambiarRedaccionIA} />
      </GrupoFilas>
    </>
  );
}
