import Link from 'next/link';
import { Icono } from '@/components/student/ui/Icono';
import { Skeleton } from '@/components/student/ui/States';
import type { CifraSocia, SinCifras } from '@/lib/student/tarjeta-socia';

// La tarjeta de alumna de Perfil (P14, 5-oct-2026): hasta tres cifras que valen la pena —las clases a las que ha venido,
// lo que le queda de su bono o cuota, sus recuperaciones, sus créditos si hay hueco— y nunca un cero. Sin ninguna, UNA
// frase que dice la verdad. Qué cifra y qué frase lo decide `cifrasDeLaSocia` (lib/student/tarjeta-socia.ts, con tests).
//
// ⚠️ Con error, sin conexión o sin saber quién es (payload incompleto) no pinta NADA: un «0 clases» o un «Aún no has venido
// a ninguna clase» por un fallo de lectura es justo lo que esta tarjeta no puede decir.
export function TarjetaSocia({ cargando, cifras, sinCifras }: {
  cargando: boolean;
  cifras: CifraSocia[];
  sinCifras: SinCifras | null;
}) {
  if (cargando) return <div data-testid="tarjeta-socia-cargando"><Skeleton h={72} r={16} /></div>;
  if (cifras.length > 0) {
    return (
      <section className="card" data-testid="tarjeta-socia" aria-label="Lo tuyo en el estudio" style={{ display: 'flex', overflow: 'hidden' }}>
        {cifras.map((c, i) => {
          const contenido = (
            <>
              <span className="t-title t-num" style={{ display: 'block' }}>{c.valor}</span>
              <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{c.texto}</span>
            </>
          );
          const st: React.CSSProperties = {
            flex: 1, minWidth: 0, minHeight: 44, padding: '12px 14px', textAlign: 'center',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none', color: 'inherit',
          };
          return c.destino
            ? <Link key={c.etiqueta} href={c.destino} aria-label={c.etiqueta} className="tap" style={st}>{contenido}</Link>
            : <div key={c.etiqueta} style={st}>{contenido}</div>;
        })}
      </section>
    );
  }
  if (!sinCifras) return null;
  return (
    <section className="card" data-testid="tarjeta-socia" aria-label="Lo tuyo en el estudio">
      <Link href={sinCifras.destino} className="row tap" style={{ ['--gap' as string]: '10px', minHeight: 52, padding: '12px 15px', color: 'inherit' }}>
        <span className="stack" style={{ ['--gap' as string]: '2px', minWidth: 0, flex: 1 }}>
          <span className="t-body" style={{ fontWeight: 700 }}>{sinCifras.texto}</span>
          {sinCifras.tipo === 'primera' && <span className="t-meta" style={{ color: 'var(--accent)', fontWeight: 800 }}>{sinCifras.accion}</span>}
        </span>
        <Icono nombre="chevron-derecha" tamano={18} stroke="var(--subtle-foreground)" className="no-shrink" />
      </Link>
    </section>
  );
}
