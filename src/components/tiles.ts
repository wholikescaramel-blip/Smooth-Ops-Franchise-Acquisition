import type { GeoProjection } from 'd3-geo';

/**
 * Street tiles for the built-in map. They are standard Web Mercator tiles, which is exactly what d3's geoMercator draws,
 * so the same projection that places pins also places the tiles. No key, no login, no account.
 * Tiles: the OpenStreetMap standard layer (tile.openstreetmap.org). It needs no key. Its usage policy asks for light, attributed use,
 * which fits a demo; for heavy production traffic use a hosted tile provider instead.
 */
export const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
export const ATTRIBUTION = '© OpenStreetMap contributors';

export interface Tile {
  key: string;
  url: string;
  x: number;
  y: number;
  size: number;
}

/** The tiles that cover the visible box [bx0,by0]-[bx1,by1] (in SVG units) for this projection. */
export function tilesFor(proj: GeoProjection, box: [number, number, number, number]): Tile[] {
  const s = proj.scale();
  const world = 2 * Math.PI * s; // width of the whole world in SVG units
  const z = Math.max(3, Math.min(17, Math.round(Math.log2(world / 256))));
  const n = 2 ** z;
  const size = world / n;
  const origin = proj([-180, 85.0511287798]);
  if (!origin) return [];
  const [ox, oy] = origin;
  const x0 = Math.max(0, Math.floor((box[0] - ox) / size));
  const x1 = Math.min(n - 1, Math.floor((box[2] - ox) / size));
  const y0 = Math.max(0, Math.floor((box[1] - oy) / size));
  const y1 = Math.min(n - 1, Math.floor((box[3] - oy) / size));
  const out: Tile[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (out.length >= 140) return out;
      out.push({ key: `${z}/${x}/${y}`, url: TILE_URL(z, x, y), x: ox + x * size, y: oy + y * size, size });
    }
  }
  return out;
}
