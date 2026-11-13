import { pixelArtUrl } from '../lib/pixelAssets';

type ExistingIconName = 'draw' | 'cut' | 'brake' | 'settings' | 'sound-on' | 'sound-off' | 'trophy' | 'calendar';

const FILES: Record<ExistingIconName, string> = {
  draw: 'icon-draw-shapes.png',
  cut: 'icon-cut-shapes.png',
  brake: 'icon-brake.png',
  settings: 'icon-settings.png',
  'sound-on': 'icon-sound-on.png',
  'sound-off': 'icon-sound-off.png',
  trophy: 'icon-trophy.png',
  calendar: 'icon-calendar.png',
};

const MENU_ICONS = {
  'crown-gold': { color: '#ffd23f', path: 'M2 5h3v3h3V5h2V2h4v3h2v3h3V5h3v5h-2v7H4v-7H2z M4 19h16v3H4z', detail: 'M7 12h3v3H7z M14 12h3v3h-3z' },
  'crown-silver': { color: '#c9d8eb', path: 'M2 5h3v3h3V5h2V2h4v3h2v3h3V5h3v5h-2v7H4v-7H2z M4 19h16v3H4z', detail: 'M7 12h3v3H7z M14 12h3v3h-3z' },
  'crown-bronze': { color: '#d99260', path: 'M2 5h3v3h3V5h2V2h4v3h2v3h3V5h3v5h-2v7H4v-7H2z M4 19h16v3H4z', detail: 'M7 12h3v3H7z M14 12h3v3h-3z' },
  profile: { color: '#4de3ff', path: 'M8 2h8v2h2v8h-2v2H8v-2H6V4h2z M4 16h16v2h2v6H2v-6h2z' },
  faq: { color: '#ffd23f', path: 'M6 2h12v2h2v8h-2v2h-4v4h-4v-8h6V6H8v2H4V4h2z M10 20h4v4h-4z' },
  privacy: { color: '#5dff9d', path: 'M8 2h8v2h2v6h4v14H2V10h4V4h2z M10 4v2H8v4h8V6h-2V4z', detail: 'M10 14h4v4h-1v3h-2v-3h-1z' },
  archive: { color: '#ffd23f', path: 'M2 2h20v6H2z M4 10h16v14H4z', detail: 'M8 13h8v3H8z' },
  practice: { color: '#4de3ff', path: 'M4 4h16v4h4v12h-4v4H4v-4H0V8h4z', detail: 'M5 10h2v2h2v2H7v2H5v-2H3v-2h2z M16 10h3v3h-3z M19 15h3v3h-3z' },
  friends: { color: '#ff5d8f', path: 'M4 3h6v8H4z M14 3h6v8h-6z M2 13h10v11H0v-9h2z M14 13h8v2h2v9H14z' },
  battle: { color: '#ff5d8f', path: 'M2 0h4v4h4v4h4v4h4v4h4v4h-4v4h-4v-4h-4v-4H6v-4H2z M18 0h4v12h-4v4h-4v4h-4v4H6v-4H2v-4h4v-4h4V8h4V4h4z' },
  social: { color: '#ff5d8f', path: 'M12 0h4v4h4v2h4v4h-6v10h-2v4H6v-2H2V12h2v-2h6v4H6v6h6z' },
  feedback: { color: '#4de3ff', path: 'M2 2h20v2h2v14h-2v2H10l-6 4v-4H2v-2H0V4h2z', detail: 'M4 7h16v2H4z M4 12h12v2H4z' },
};
export type PixelIconName = ExistingIconName | keyof typeof MENU_ICONS;

/** Decorative when a visible label supplies meaning. */
export function PixelIcon({ name, size = 24 }: { name: PixelIconName; size?: number }) {
  if (name in MENU_ICONS) {
    const icon = MENU_ICONS[name as keyof typeof MENU_ICONS];
    return <svg className="pixel-icon" width={size} height={size} viewBox={name.startsWith('crown-') ? '2 2 20 20' : '-4 -4 32 32'} aria-hidden="true" shapeRendering="crispEdges">
      <path fill={icon.color} d={icon.path} />
      {'detail' in icon && <path fill="#101d33" d={icon.detail} />}
    </svg>;
  }
  return <img className="pixel-icon" src={pixelArtUrl(FILES[name as ExistingIconName])} width={size} height={size} alt="" aria-hidden="true" />;
}
