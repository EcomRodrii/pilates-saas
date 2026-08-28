import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 12px' }}>Caducidad</h2>
      <p>
        Un bono de sesiones caduca en la fecha que le pusiste al crearlo o asignarlo, se hayan gastado o no todas
        sus sesiones. Una vez caducado, sus sesiones restantes ya no cuentan para reservar.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Congelar un plan</h2>
      <p>
        Si una alumna se va de viaje o está de baja, puedes congelar su plan por un periodo concreto: mientras está
        congelado no cuenta como tiempo consumido, y su fecha de fin se empuja automáticamente los mismos días que
        estuvo congelado. Al descongelarlo, retoma exactamente donde lo dejó.
      </p>

      <AyudaResultado>
        Congelar no es lo mismo que cancelar: un plan congelado sigue siendo suyo y vuelve a activarse solo — no
        hace falta volver a venderle nada. Si una alumna dice que su bono no aparece,{' '}
        <Link href="/ayuda/problemas/un-bono-no-aparece" style={{ color: 'inherit', textDecoration: 'underline' }}>mira aquí primero</Link>.
      </AyudaResultado>
    </>
  );
}
