'use client';
import Link from 'next/link';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';
import { BaldosaIcono } from '@/components/student/ui/BaldosaIcono';

export interface FilaPerfil {
  label: string;
  href?: string;
  onClick?: () => void;
  valor?: string;
  destructivo?: boolean;
  /**
   * Icono en baldosa a la izquierda (P15: Perfil, Ayuda). Opcional: las filas
   * sin icono se pintan exactamente como antes, así que ninguna pantalla cambia
   * hasta que decide ponérselo.
   */
  icono?: NombreIcono;
}

// `titulo` opcional: dentro de una hoja que ya tiene su propio encabezado, un
// rótulo encima de la lista es un segundo título diciendo lo mismo.
export function ProfileSection({ titulo, items }: { titulo?: string; items: FilaPerfil[] }) {
  return (
    <section>
      {titulo && <p className="t-label" style={{ margin: '0 0 7px' }}>{titulo}</p>}
      <div className="card" style={{ overflow: 'hidden' }}>
        {items.map((it, i) => {
          const conIcono = !!it.icono;
          const st: React.CSSProperties = {
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            // Con baldosa la fila mide 52 px (la baldosa es de 32) y el texto pasa
            // a cuerpo: es la fila de Ajustes del iPhone que aprobó el fundador.
            padding: conIcono ? '10px 15px' : '13px 15px', minHeight: conIcono ? 52 : 48,
            border: 'none', borderBottom: i < items.length - 1 ? '1px solid var(--muted)' : 'none', background: 'none',
            fontSize: conIcono ? 'var(--t-body)' : 'var(--t-small)', fontWeight: conIcono ? 600 : 700,
            color: it.destructivo ? 'var(--destructive)' : 'var(--foreground)', textAlign: 'left',
          };
          const inner = (
            <>
              {/* Con un valor al lado, el que cede es el VALOR (se recorta con «…»), nunca el rótulo: un email largo
                  partía «Datos personales» en dos líneas y el propio email por su guion. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: it.valor ? 0 : 1 }}>
                {it.icono && <BaldosaIcono nombre={it.icono} />}
                <span style={it.valor ? { whiteSpace: 'nowrap' } : undefined}>{it.label}</span>
              </span>
              <span style={{ color: 'var(--subtle-foreground)', fontSize: 'var(--t-small)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {it.valor && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{it.valor}</span>}
                <Icono nombre="chevron-derecha" tamano={conIcono ? 16 : 18} style={{ flexShrink: 0 }} />
              </span>
            </>
          );
          return it.href ? <Link key={it.label} href={it.href} style={st}>{inner}</Link> : <button key={it.label} type="button" onClick={it.onClick} style={st}>{inner}</button>;
        })}
      </div>
    </section>
  );
}
