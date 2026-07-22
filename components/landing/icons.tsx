export function Icon({ path, size = 18 }: { path: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

export const IconCheck = (s?: number) => <Icon size={s} path={<path d="M20 6 9 17l-5-5" />} />;
export const IconAlert = (s?: number) => (
  <Icon
    size={s}
    path={
      <>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1={12} y1={9} x2={12} y2={13} />
        <line x1={12} y1={17} x2="12.01" y2={17} />
      </>
    }
  />
);
export const IconUsers = (s?: number) => (
  <Icon
    size={s}
    path={
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx={9} cy={7} r={4} />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    }
  />
);
export const IconCalendar = (s?: number) => (
  <Icon
    size={s}
    path={
      <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width={18} height={18} x={3} y={4} rx={2} />
        <path d="M3 10h18" />
      </>
    }
  />
);
export const IconInvoice = (s?: number) => (
  <Icon size={s} path={<><rect width={20} height={14} x={2} y={5} rx={2} /><line x1={2} x2={22} y1={10} y2={10} /></>} />
);
