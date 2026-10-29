import type { Block, Day, Interest, Pace, Place, TripParams } from '../types';
import { PLACE_BY_ID, placesForCity } from '../data/places';
import { fromMin, haversineKm, periodOf, toMin, travelEstimate } from './geo';

/** Local deterministic planner. Powers the offline mock model and the repair fallback. */

const PER_DAY: Record<Pace, number> = { relaxed: 2, balanced: 3, packed: 4 };
const ANCH: Record<Pace, { start: number; lunch: number; afternoon: number; evening: number; dinner: number; buffer: number }> = {
  relaxed: { start: 600, lunch: 810, afternoon: 960, evening: 1050, dinner: 1170, buffer: 20 },
  balanced: { start: 570, lunch: 780, afternoon: 900, evening: 1050, dinner: 1170, buffer: 10 },
  packed: { start: 540, lunch: 765, afternoon: 870, evening: 1020, dinner: 1140, buffer: 5 },
};
const ORDER: Record<string, number> = { morning: 0, any: 1, afternoon: 2, evening: 3 };

interface Item {
  place: Place;
  meal?: 'lunch' | 'dinner';
  note?: string;
}

export function blockFromPlace(place: Place, start: number, travelers: number, meal?: 'lunch' | 'dinner', note?: string): Block {
  const end = start + place.durationMin;
  return {
    id: '',
    period: periodOf(start),
    kind: meal ? 'meal' : 'activity',
    meal,
    placeId: place.id,
    title: meal ? `${meal === 'lunch' ? 'Lunch' : 'Dinner'}: ${place.name}` : place.name,
    start: fromMin(start),
    end: fromMin(end),
    note: note ?? (meal ? `${place.cuisine ?? 'Local food'}. Venue-level choice to confirm on the day.` : place.blurb),
    costINR: place.costINR * travelers,
  };
}

export function reindex(days: Day[]): Day[] {
  return days.map((d) => ({
    ...d,
    blocks: d.blocks.map((b, i) => ({ ...b, id: `d${d.day}-${i + 1}` })),
  }));
}

function scheduleDay(items: Item[], pace: Pace, travelers: number, safety: boolean, anchorsOverride?: Partial<(typeof ANCH)['balanced']>): Block[] {
  let list = items;
  // Safety-aware: evenings finish by 21:30. Drop trailing activities until the day fits.
  for (let guard = 0; guard < 6; guard++) {
    const blocks = scheduleDayRaw(list, pace, travelers, safety, anchorsOverride);
    const lastEnd = blocks.length ? toMin(blocks[blocks.length - 1].end) : 0;
    const maxEnd = blocks.reduce((m, b) => Math.max(m, toMin(b.end)), 0);
    if (!safety || Math.max(lastEnd, maxEnd) <= 21 * 60 + 30) return blocks;
    const idx = [...list.keys()].reverse().find((i) => !list[i].meal);
    if (idx === undefined || list.filter((x) => !x.meal).length <= 1) return blocks;
    list = list.filter((_, i) => i !== idx);
  }
  return scheduleDayRaw(list, pace, travelers, safety, anchorsOverride);
}

function scheduleDayRaw(items: Item[], pace: Pace, travelers: number, safety: boolean, anchorsOverride?: Partial<(typeof ANCH)['balanced']>): Block[] {
  const a = { ...ANCH[pace], ...anchorsOverride, ...(safety ? { evening: 990, dinner: 1080 } : {}) };
  const blocks: Block[] = [];
  let prev: Place | undefined;
  let prevEnd = 0;
  let afterLunch = false;
  items.forEach((it, idx) => {
    let desired: number;
    if (it.meal === 'lunch') desired = a.lunch;
    else if (it.meal === 'dinner') desired = a.dinner;
    else if (it.place.best === 'evening') desired = a.evening;
    else if (idx === 0) desired = a.start;
    else if (afterLunch) desired = a.afternoon;
    else desired = 0;
    let start = desired;
    if (prev) {
      const t = travelEstimate(haversineKm(prev, it.place)).minutes;
      start = Math.max(desired, prevEnd + t + a.buffer);
    }
    if (it.meal === 'lunch') afterLunch = true;
    const b = blockFromPlace(it.place, start, travelers, it.meal, it.note);
    blocks.push(b);
    prev = it.place;
    prevEnd = toMin(b.end);
  });
  return blocks;
}

function nearestDining(city: Place['city'], from: { lat: number; lng: number }, veg: boolean, used: Set<string>, fine = false): Place | undefined {
  let pool = placesForCity(city).filter((p) => p.kind === 'dining');
  if (veg) pool = pool.filter((p) => p.veg);
  if (!pool.length) return undefined;
  const scored = pool.map((p) => ({
    p,
    s: haversineKm(from, p) + (used.has(p.id) ? 6 : 0) - (fine ? p.costINR / 300 : 0),
  }));
  scored.sort((x, y) => x.s - y.s);
  return scored[0].p;
}

function themeFor(places: Place[]): string {
  const count: Partial<Record<Interest, number>> = {};
  places.forEach((p) => p.tags.forEach((t) => (count[t] = (count[t] ?? 0) + 1)));
  const top = (Object.entries(count).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? 'culture') as Interest;
  const map: Record<Interest, string> = {
    culture: 'Heritage and culture',
    adventure: 'Adventure day',
    nature: 'Nature and views',
    food: 'Food trail',
    relax: 'Slow and scenic',
    spiritual: 'Spiritual and calm',
    shopping: 'Markets and finds',
    nightlife: 'Evening buzz',
  };
  return map[top];
}

export function planItinerary(trip: TripParams, safety: boolean): Day[] {
  const city = trip.cityId;
  if (!city) return [];
  const acts = placesForCity(city).filter((p) => p.kind === 'activity');
  const used = new Set<string>();
  const usedDining = new Set<string>();
  const veg = trip.dietary !== 'none';
  const perDay = PER_DAY[trip.pace];
  const interests = trip.interests;
  const score = (p: Place) => 1 + p.tags.filter((t) => interests.includes(t)).length * 3;
  const days: Day[] = [];

  for (let d = 1; d <= trip.days; d++) {
    const remaining = acts.filter((p) => !used.has(p.id));
    if (!remaining.length) break;
    // seed with the best scoring unused place, then add the nearest good neighbours
    const seed = [...remaining].sort((a, b) => score(b) - score(a))[0];
    const chosen: Place[] = [seed];
    used.add(seed.id);
    while (chosen.length < perDay) {
      const pool = acts.filter((p) => !used.has(p.id));
      if (!pool.length) break;
      const cen = { lat: chosen.reduce((s, p) => s + p.lat, 0) / chosen.length, lng: chosen.reduce((s, p) => s + p.lng, 0) / chosen.length };
      const next = [...pool].sort((a, b) => haversineKm(cen, a) - score(a) * 1.5 - (haversineKm(cen, b) - score(b) * 1.5))[0];
      if (haversineKm(cen, next) > 45) break;
      chosen.push(next);
      used.add(next.id);
    }
    chosen.sort((a, b) => ORDER[a.best] - ORDER[b.best]);
    const before = chosen.filter((p) => p.best === 'morning' || p.best === 'any').slice(0, 2);
    const after = chosen.filter((p) => !before.includes(p));
    const lastBefore = before[before.length - 1] ?? after[0] ?? chosen[0];
    const lunchPlace = nearestDining(city, lastBefore, veg, usedDining)!;
    usedDining.add(lunchPlace.id);
    const lastAfter = after[after.length - 1] ?? lastBefore;
    const dinnerPlace = nearestDining(city, lastAfter, veg, usedDining, interests.includes('food'))!;
    usedDining.add(dinnerPlace.id);
    const items: Item[] = [
      ...before.map((p) => ({ place: p })),
      { place: lunchPlace, meal: 'lunch' as const },
      ...after.map((p) => ({ place: p })),
      { place: dinnerPlace, meal: 'dinner' as const },
    ];
    days.push({ day: d, theme: themeFor(chosen), blocks: scheduleDay(items, trip.pace, trip.travelers, safety) });
  }
  return reindex(days);
}

// ---------- refinement operations used by the mock model ----------

function itemsOf(day: Day): Item[] {
  return day.blocks
    .map((b) => (b.placeId && PLACE_BY_ID[b.placeId] ? ({ place: PLACE_BY_ID[b.placeId], meal: b.meal as 'lunch' | 'dinner' | undefined } as Item) : undefined))
    .filter(Boolean) as Item[];
}

export function relaxDay(days: Day[], dayNo: number, trip: TripParams, safety: boolean): { days: Day[]; summary: string } {
  const day = days.find((d) => d.day === dayNo);
  if (!day) return { days, summary: `There is no day ${dayNo} yet.` };
  let items = itemsOf(day);
  const actIdx = items.map((it, i) => (it.meal ? -1 : i)).filter((i) => i >= 0);
  let removed: string | undefined;
  if (actIdx.length > 2) {
    // drop the activity furthest from the rest
    const worst = actIdx
      .map((i) => ({ i, d: actIdx.reduce((s, j) => s + haversineKm(items[i].place, items[j].place), 0) }))
      .sort((a, b) => b.d - a.d)[0].i;
    removed = items[worst].place.name;
    items = items.filter((_, i) => i !== worst);
  }
  const blocks = scheduleDay(items, 'relaxed', trip.travelers, safety, { start: 630, lunch: 840, afternoon: 990, buffer: 30 });
  const newDays = days.map((d) => (d.day === dayNo ? { ...d, theme: `${d.theme} (relaxed)`, blocks } : d));
  return {
    days: reindex(newDays),
    summary: `Day ${dayNo} is now more relaxed: later start, longer gaps between stops${removed ? `, and I dropped ${removed}` : ''}.`,
  };
}

export function swapMeal(days: Day[], dayNo: number, meal: 'lunch' | 'dinner', opts: { veg?: boolean; fine?: boolean }, trip: TripParams): { days: Day[]; summary: string } {
  const day = days.find((d) => d.day === dayNo);
  const block = day?.blocks.find((b) => b.meal === meal);
  const city = trip.cityId;
  if (!day || !block || !city) return { days, summary: `I could not find ${meal} on day ${dayNo}.` };
  const prevPlace = block.placeId ? PLACE_BY_ID[block.placeId] : undefined;
  let pool = placesForCity(city).filter((p) => p.kind === 'dining' && p.id !== block.placeId);
  if (opts.veg) pool = pool.filter((p) => p.veg);
  if (!pool.length) return { days, summary: 'I have no other dining area that fits.' };
  const anchor = prevPlace ?? pool[0];
  const pick = [...pool].sort((a, b) => {
    const sa = haversineKm(anchor, a) - (opts.fine ? a.costINR / 150 : 0);
    const sb = haversineKm(anchor, b) - (opts.fine ? b.costINR / 150 : 0);
    return sa - sb;
  })[0];
  const newBlock = blockFromPlace(pick, toMin(block.start), trip.travelers, meal);
  const newDays = days.map((d) =>
    d.day === dayNo ? { ...d, blocks: d.blocks.map((b) => (b === block ? { ...newBlock, start: block.start, end: fromMin(toMin(block.start) + pick.durationMin) } : b)) } : d,
  );
  return {
    days: reindex(newDays),
    summary: `Day ${dayNo} ${meal} is now ${pick.name} (${pick.cuisine ?? 'local food'}${opts.veg ? ', vegetarian-friendly' : ''}).`,
  };
}

export function addRainAlternatives(days: Day[], dayNo: number | undefined, trip: TripParams): { days: Day[]; summary: string } {
  const city = trip.cityId;
  if (!city) return { days, summary: 'Pick a destination first.' };
  const indoor = placesForCity(city).filter((p) => p.kind === 'activity' && p.indoor);
  let count = 0;
  const newDays = days.map((d) => {
    if (dayNo && d.day !== dayNo) return d;
    return {
      ...d,
      blocks: d.blocks.map((b) => {
        const p = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
        if (!p || b.kind !== 'activity' || p.indoor) return b;
        const alt = [...indoor].sort((x, y) => haversineKm(p, x) - haversineKm(p, y))[0];
        if (!alt) return b;
        count++;
        return { ...b, changed: true, alternative: { placeId: alt.id, title: alt.name, reason: `If it rains: ${alt.name} (indoor, about ${travelEstimate(haversineKm(p, alt)).minutes} min away).` } };
      }),
    };
  });
  return {
    days: newDays,
    summary: count ? `Added indoor rain alternatives to ${count} outdoor stop${count > 1 ? 's' : ''}${dayNo ? ` on day ${dayNo}` : ''}.` : 'Everything on that day is already indoors.',
  };
}

export function addPlace(days: Day[], dayNo: number, place: Place, trip: TripParams, safety: boolean): { days: Day[]; summary: string } {
  const day = days.find((d) => d.day === dayNo);
  if (!day) return { days, summary: `There is no day ${dayNo}.` };
  const meals = itemsOf(day).filter((i) => i.meal);
  const acts = itemsOf(day).filter((i) => !i.meal);
  if (acts.some((a) => a.place.id === place.id)) return { days, summary: `${place.name} is already on day ${dayNo}.` };
  acts.push({ place });
  acts.sort((a, b) => ORDER[a.place.best] - ORDER[b.place.best]);
  const lunch = meals.find((m) => m.meal === 'lunch');
  const dinner = meals.find((m) => m.meal === 'dinner');
  const before = acts.filter((a) => a.place.best === 'morning' || a.place.best === 'any').slice(0, 2);
  const after = acts.filter((a) => !before.includes(a));
  const items: Item[] = [...before, ...(lunch ? [lunch] : []), ...after, ...(dinner ? [dinner] : [])];
  const newDays = days.map((d) => (d.day === dayNo ? { ...d, blocks: scheduleDay(items, trip.pace, trip.travelers, safety) } : d));
  return { days: reindex(newDays), summary: `Added ${place.name} to day ${dayNo} and re-timed the day.` };
}

export function removePlace(days: Day[], placeId: string, trip: TripParams, safety: boolean): { days: Day[]; summary: string } {
  const day = days.find((d) => d.blocks.some((b) => b.placeId === placeId));
  if (!day) return { days, summary: 'That stop is not in the itinerary.' };
  const place = PLACE_BY_ID[placeId];
  const items = itemsOf(day).filter((i) => i.place.id !== placeId);
  const newDays = days.map((d) => (d.day === day.day ? { ...d, blocks: scheduleDay(items, trip.pace, trip.travelers, safety) } : d));
  return { days: reindex(newDays), summary: `Removed ${place?.name ?? 'that stop'} from day ${day.day} and re-timed the day.` };
}

/** Flag blocks that are new or moved compared with the previous itinerary. */
export function markChanged(oldDays: Day[], newDays: Day[]): Day[] {
  const sig = (b: Block) => `${b.placeId ?? b.title}|${b.start}|${b.alternative?.title ?? ''}`;
  return newDays.map((d) => {
    const old = oldDays.find((o) => o.day === d.day);
    const oldSigs = new Set((old?.blocks ?? []).map(sig));
    return { ...d, blocks: d.blocks.map((b) => ({ ...b, changed: oldDays.length ? !oldSigs.has(sig(b)) : false })) };
  });
}
