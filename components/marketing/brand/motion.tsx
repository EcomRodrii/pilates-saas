'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';

// Primitivas de animación de marketing sobre framer-motion. Todas respetan
// `prefers-reduced-motion`: si el usuario lo pide, no hay transform ni fade,
// el contenido aparece directamente. Regla del sistema: la animación guía la
// atención (revelar al hacer scroll, encadenar), nunca decora por decorar.

const EASE = [0.2, 0.7, 0, 1] as const;

/** Revela el contenido al entrar en viewport (una sola vez). */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// Contenedor + item para revelar un grupo con escalonado (stagger). Útil en
// el hero y en rejillas: el padre orquesta, cada hijo hereda su turno.
const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export function RevealGroup({
  children,
  className,
  style,
  inView = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  inView?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div
      className={className}
      style={style}
      variants={containerVariants}
      initial="hidden"
      {...(inView
        ? { whileInView: 'show', viewport: { once: true, margin: '0px 0px -12% 0px' } }
        : { animate: 'show' })}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
