// LIHYA icon names drawn with the Care & Us sprite (public/icons/sprite.svg); the few
// the sprite has no match for come from lucide-react. Directional icons mirror in RTL.
import { Calendar, Copy, Delete, Dot, Filter, Grid3x3, Hand, Link, Mail, Pencil, Star, WifiOff } from 'lucide-react';
import { cx, isMirroredIcon } from './kit.js';

const SPRITE = `${import.meta.env?.BASE_URL || '/'}icons/sprite.svg`;

// name -> [sprite id, extra transform class, extra already handles RTL]
const SPRITE_MAP = {
  camera: ['camera'],
  face: ['face'],
  profile: ['face'],
  beard: ['face'],
  mustache: ['face'],
  logo: ['face'],
  scissors: ['scissors'],
  razor: ['scissors'],
  guard: ['comb'],
  ruler: ['ruler'],
  timeline: ['timeline'],
  compare: ['compare'],
  share: ['share'],
  print: ['print'],
  report: ['print'],
  whatsapp: ['whatsapp'],
  lock: ['lock'],
  cloud: ['cloud'],
  globe: ['globe'],
  settings: ['settings'],
  user: ['user'],
  users: ['users'],
  plus: ['plus'],
  minus: ['minus'],
  undo: ['undo'],
  check: ['check'],
  close: ['close'],
  'chevron-right': ['chevron'],
  'chevron-left': ['chevron', 'ltr:-scale-x-100', true],
  'chevron-down': ['chevron', 'rotate-90'],
  'chevron-up': ['chevron', '-rotate-90'],
  'arrow-left': ['back'],
  'arrow-right': ['back', 'ltr:-scale-x-100', true],
  home: ['home'],
  dashboard: ['chart'],
  catalog: ['grid'],
  box: ['tag'],
  download: ['download'],
  upload: ['upload'],
  search: ['search'],
  eye: ['eye'],
  warning: ['alert'],
  info: ['info'],
  sun: ['sun'],
  moon: ['moon'],
  logout: ['logout'],
  qr: ['qr'],
  flash: ['flash'],
  mirror: ['flip'],
  palette: ['swatch'],
  drop: ['drop'],
  clock: ['clock'],
  trash: ['trash'],
  phone: ['phone'],
  refresh: ['refresh'],
  grid: ['grid'],
  list: ['list'],
  bulb: ['lamp'],
};

const LUCIDE = {
  mail: Mail,
  calendar: Calendar,
  edit: Pencil,
  copy: Copy,
  link: Link,
  'wifi-off': WifiOff,
  keypad: Grid3x3,
  hand: Hand,
  'star-line': Star,
  dot: Dot,
  backspace: Delete,
  filter: Filter,
};

/**
 * Line icon, 24 px grid, 1.5 px stroke. Decorative (aria-hidden) unless `title` is given.
 */
export default function Icon({ name, size = 24, className, title, mirror, ...rest }) {
  const flip = mirror ?? isMirroredIcon(name);
  const labelled = Boolean(title);
  const Lucide = LUCIDE[name];
  if (Lucide) {
    return (
      <Lucide
        size={size}
        strokeWidth={1.5}
        aria-hidden={labelled ? undefined : true}
        role={labelled ? 'img' : undefined}
        aria-label={labelled ? title : undefined}
        focusable="false"
        className={cx('inline-block shrink-0', flip && 'rtl:-scale-x-100', className)}
        {...rest}
      />
    );
  }
  const [id, extra, ownFlip] = SPRITE_MAP[name] || ['info'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      className={cx('inline-block shrink-0', extra, flip && !ownFlip && 'rtl:-scale-x-100', className)}
      {...rest}
    >
      {labelled ? <title>{title}</title> : null}
      <use href={`${SPRITE}#i-${id}`} />
    </svg>
  );
}
