'use client';

// Métricas del feedback del Centro de Ayuda público (😞😐😃 al pie de cada
// artículo). Reutiliza el layout/guardia de /interno tal cual — nada de
// admin/CMS paralelo. Solo lectura: el contenido de /ayuda se edita en el
// registro de código (lib/ayuda/registro.ts), este panel es para saber QUÉ
// artículos fallan, no para editarlos.

import { useEffect, useState } from 'react';
import { Frown, Loader2, Meh, Smile, TrendingDown } from 'lucide-react';
import { SeccionVideos } from './videos';
import { SeccionBusquedas } from './busquedas';
import { fetchAyudaFeedback, type AyudaFeedbackArticulo, type AyudaFeedbackResumen, SinAcceso } from '@/lib/interno/client';

function Tarjeta({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className="text-2xl font-extrabold mt-1" style={color ? { color } : undefined}>{valor}</p>
    </div>
  );
}

function SeccionValoraciones() {
  const [resumen, setResumen] = useState<AyudaFeedbackResumen | null>(null);
  const [articulos, setArticulos] = useState<AyudaFeedbackArticulo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetchAyudaFeedback();
        if (!vivo) return;
        setResumen(r.resumen);
        setArticulos(r.articulos);
      } catch (e) {
        if (vivo) setError(e instanceof SinAcceso ? e.message : 'No se ha podido cargar el feedback.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (cargando) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando feedback…</div>;
  }
  if (error || !resumen) {
    return <p className="text-sm text-destructive">{error ?? 'Sin datos.'}</p>;
  }

  const peores = [...articulos].filter((a) => a.total >= 3).sort((a, b) => (b.malo / b.total) - (a.malo / a.total)).slice(0, 8);
  const mejores = [...articulos].filter((a) => a.total >= 3).sort((a, b) => (b.bueno / b.total) - (a.bueno / a.total)).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-muted-foreground">Lo que valoran de verdad quienes leen /ayuda — para saber qué artículo reescribir primero.{(resumen.desactualizadas ?? 0) > 0 && <> <strong className="text-foreground">{resumen.desactualizadas} aviso{resumen.desactualizadas === 1 ? '' : 's'} de «desactualizada».</strong></>}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta label="Total valoraciones" valor={String(resumen.total)} />
        <Tarjeta label="😞 No ayudó" valor={`${resumen.pctMalo}%`} color="#C2503A" />
        <Tarjeta label="😐 Más o menos" valor={`${resumen.pctRegular}%`} color="#B5652F" />
        <Tarjeta label="😃 Ayudó" valor={`${resumen.pctBueno}%`} color="#2E7D4F" />
      </div>

      {resumen.total === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">Todavía no hay ninguna valoración. En cuanto alguien pulse 😞😐😃 en /ayuda, aparecerá aquí.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-foreground mb-2"><TrendingDown size={14} /> Artículos peor valorados</h2>
            <div className="flex flex-col gap-2">
              {peores.length === 0 && <p className="text-[12.5px] text-muted-foreground">Ningún artículo tiene aún 3+ valoraciones.</p>}
              {peores.map((a) => (
                <div key={`${a.categoria}/${a.articulo}`} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{a.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">{a.total} valoraciones</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold shrink-0">
                    <span className="flex items-center gap-1 text-[#C2503A]"><Frown size={13} />{a.malo}</span>
                    <span className="flex items-center gap-1 text-[#B5652F]"><Meh size={13} />{a.regular}</span>
                    <span className="flex items-center gap-1 text-[#2E7D4F]"><Smile size={13} />{a.bueno}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-foreground mb-2"><Smile size={14} /> Artículos mejor valorados</h2>
            <div className="flex flex-col gap-2">
              {mejores.length === 0 && <p className="text-[12.5px] text-muted-foreground">Ningún artículo tiene aún 3+ valoraciones.</p>}
              {mejores.map((a) => (
                <div key={`${a.categoria}/${a.articulo}`} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{a.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">{a.total} valoraciones</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold shrink-0">
                    <span className="flex items-center gap-1 text-[#C2503A]"><Frown size={13} />{a.malo}</span>
                    <span className="flex items-center gap-1 text-[#B5652F]"><Meh size={13} />{a.regular}</span>
                    <span className="flex items-center gap-1 text-[#2E7D4F]"><Smile size={13} />{a.bueno}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type Pestana = 'valoraciones' | 'videos' | 'busquedas';
const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'valoraciones', etiqueta: 'Valoraciones' },
  { id: 'videos', etiqueta: 'Vídeos' },
  { id: 'busquedas', etiqueta: 'Sin resultado' },
];

// Ayuda y Academy: lo que se lee, lo que se graba y lo que se busca sin encontrar. El texto de las guías no se edita aquí: está en código.
export default function AyudaInternaPage() {
  const [pestana, setPestana] = useState<Pestana>('valoraciones');
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-foreground">Ayuda y Academy</h1>
      <div role="tablist" aria-label="Secciones" className="flex gap-1 border-b border-border">
        {PESTANAS.map(p => (
          <button key={p.id} role="tab" type="button" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${pestana === p.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {pestana === 'valoraciones' && <SeccionValoraciones />}
        {pestana === 'videos' && <SeccionVideos />}
        {pestana === 'busquedas' && <SeccionBusquedas />}
      </div>
    </div>
  );
}
