'use client';

// Maqueta de referencia — la app del prototipo tal cual, a tamaño iPhone.
// Visítala en /portal-prototipo y compárala pantalla a pantalla con el portal real.
import dynamic from 'next/dynamic';

const StudioApp = dynamic(() => import('@/components/prototipo/StudioApp'), { ssr: false });

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#EBEAE2', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 26 }}>
      <div style={{ width: 390, height: 844, borderRadius: 42, overflow: 'hidden', position: 'relative', background: '#FAF9F5', boxShadow: '0 40px 90px -30px rgba(15,15,15,.45)' }}>
        <StudioApp />
      </div>
    </div>
  );
}
