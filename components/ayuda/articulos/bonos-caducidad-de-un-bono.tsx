import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 12px' }}>Caducidad</h2>
      <p>
        Un bono de sesiones caduca a los días que marcaste en su Caducidad al crearlo en Paquetes, contados desde
        que lo compra, se hayan gastado o no todas sus sesiones. Si lo dejaste vacío, no caduca. Una vez caducado, sus sesiones restantes ya no cuentan para reservar.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Pausar un plan</h2>
      <p>
        Si una alumna se va de viaje o está de baja, en su ficha pulsas «Pausar»: desde hoy deja de contar como
        tiempo consumido. Cuando vuelve, pulsas «Reanudar» y su fecha de fin se empuja automáticamente los mismos
        días que estuvo en pausa, así que retoma exactamente donde lo dejó.
      </p>

      <AyudaResultado>
        Pausar no es lo mismo que cancelar: un plan en pausa sigue siendo suyo y vuelve en cuanto pulsas
        «Reanudar» — no hace falta volver a venderle nada. Si una alumna dice que su bono no aparece,{' '}
        <Link href="/ayuda/problemas/un-bono-no-aparece" style={{ color: 'inherit', textDecoration: 'underline' }}>mira aquí primero</Link>.
      </AyudaResultado>
    </>
  );
}
