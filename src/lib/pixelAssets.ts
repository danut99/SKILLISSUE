import { CAR_SKINS } from '../config';

export const pixelArtUrl = (file: string) => `${import.meta.env.BASE_URL}art/pixellab/${file}`;

// Trim transparent padding so the visible sprite fills the existing car hitbox.
const CAR_CROPS: Record<string, [number, number, number, number, boolean]> = {
  pink: [10, 7, 27, 66, true],
  taxi: [8, 3, 32, 69, true],
  cop: [6, 5, 36, 66, true],
  lime: [6, 8, 36, 64, true],
  void: [8, 7, 32, 64, false],
};
const cars = new Map<string, HTMLImageElement>();

export function carSprite(skin: string) {
  let image = cars.get(skin);
  if (!image) {
    image = new Image();
    image.src = pixelArtUrl(`car-top-${skin}.png`);
    cars.set(skin, image);
  }
  return { image, crop: CAR_CROPS[skin] ?? CAR_CROPS.pink };
}

export function preloadPixelCars() {
  for (const skin of CAR_SKINS) carSprite(skin.id);
}
