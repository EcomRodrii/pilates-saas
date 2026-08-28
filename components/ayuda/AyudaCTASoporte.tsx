import { LifeBuoy } from 'lucide-react';
import { ACC } from '@/components/landing/theme';

export function AyudaCTASoporte({ titulo = '¿No encuentras lo que buscas?', texto = 'Escríbenos y te respondemos nosotros, no un bot.' }: {
  titulo?: string; texto?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between',
      background: '#0F0F0F', color: '#E8E8E4', borderRadius: 20, padding: '22px 26px', margin: '32px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,.08)', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <LifeBuoy size={18} />
        </span>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14.5, margin: 0 }}>{titulo}</p>
          <p style={{ fontSize: 13, color: '#A6A69E', margin: '2px 0 0' }}>{texto}</p>
        </div>
      </div>
      <a
        href="mailto:soporte@tentare.app"
        className="hover:brightness-110"
        style={{ flex: 'none', fontSize: 13.5, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 10, padding: '11px 18px', whiteSpace: 'nowrap' }}
      >
        Contactar con soporte
      </a>
    </div>
  );
}
