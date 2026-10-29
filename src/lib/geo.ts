import type { HopInfo, Block } from '../types';
import { PLACE_BY_ID } from '../data/places';

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough road estimate: straight-line x detour factor, urban or highway speed. */
export function travelEstimate(km: number): { km: number; minutes: number } {
  const road = km * 1.35;
  const speed = road <= 20 ? 24 : 38; // km/h
  const minutes = Math.max(5, Math.round((road / speed) * 60 + 5));
  return { km: Math.round(road * 10) / 10, minutes };
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const periodOf = (min: number): 'morning' | 'afternoon' | 'evening' =>
  min < 12 * 60 ? 'morning' : min < 17 * 60 ? 'afternoon' : 'evening';

export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

export function hopBetween(a: Block, b: Block): HopInfo | null {
  const pa = a.placeId ? PLACE_BY_ID[a.placeId] : undefined;
  const pb = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
  if (!pa || !pb) return null;
  const est = travelEstimate(haversineKm(pa, pb));
  const gap = toMin(b.start) - toMin(a.end);
  const status: HopInfo['status'] = est.minutes > gap + 5 ? 'tight' : est.minutes > 60 ? 'long' : 'ok';
  return { km: est.km, minutes: est.minutes, status };
}
