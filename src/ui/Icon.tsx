const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M7 7l10 10M17 7 7 17',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  chevron: 'M10 7l5 5-5 5',
  down: 'M7 10l5 5 5-5',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2',
  barcode: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8',
  journal: 'M6 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM8.5 8h6M8.5 12h6M8.5 16h3.5',
  weight:
    'M6 3.5h12a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5zM7.5 10.5a6 6 0 0 1 9 0M12 10.5l1.6-2.2',
  stats: 'M4 20h16M7 16.5v-5M12 16.5V6.5M17 16.5v-8',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M9 7V4.5h6V7',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  flash: 'M13 3L5 14h6l-1 7 8-11h-6z',
  check: 'M5 12.5l4.5 4.5L19 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  calendar: 'M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5z',
  breakfast: 'M12 3v2.5M5.2 7.2l1.6 1.6M18.8 7.2l-1.6 1.6M3 15.5h18M7 15.5a5 5 0 0 1 10 0M7 19.5h10',
  lunch:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  dinner: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  snack:
    'M12 7.5c-1.6-1-4-1.2-5.5.4C4.6 9.9 5 13.4 6.6 16.3 7.8 18.6 9.4 20.5 11 20.5c.6 0 .7-.3 1-.3s.4.3 1 .3c1.6 0 3.2-1.9 4.4-4.2 1.6-2.9 2-6.4.1-8.4-1.5-1.6-3.9-1.4-5.5-.4zM12 7.5c0-2 1-3.5 3-4',
  flame: 'M12 3c.8 3.4 5 5.4 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-5 .3 1.4.9 2.4 2 3 0-3-.6-5.4.6-8z',
  target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.5v1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.4-3.3 4.2-5 7.5-5s6.1 1.7 7.5 5',
  export: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13',
  import: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13',
  trendDown: 'M4 7l6 6 4-4 6 6M20 10v5h-5',
  trendUp: 'M4 17l6-6 4 4 6-6M20 14V9h-5',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 8v.01',
  leaf: 'M5 19c0-8 5-13 14-14-.5 9-5.5 14-13 14zM5 19l7-7',
  drop: 'M12 3.5c3 3.6 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.9 6-10.5z',
  glass: 'M6 4h12l-1.5 15a1.5 1.5 0 0 1-1.5 1.4H9a1.5 1.5 0 0 1-1.5-1.4z',
  pot: 'M4 10h16M5 10v6a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-6M9.5 6.5c0-1 1-1.5 1-2.5M13.5 6.5c0-1 1-1.5 1-2.5M2.5 10H4M20 10h1.5',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  camera:
    'M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  ruler: 'M3 16.5 16.5 3 21 7.5 7.5 21zM7 12.5l1.5 1.5M10 9.5l2 2M13 6.5l1.5 1.5',
  compare: 'M12 3v18M4 6h5v12H4zM15 6h5v12h-5z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 24,
  filled = false,
  stroke = 1.9,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  stroke?: number;
}) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
