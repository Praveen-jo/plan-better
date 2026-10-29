import type { Day, TripParams, Violation, Pace } from '../types';
import { PLACE_BY_ID } from '../data/places';
import { toMin, hopBetween } from './geo';

export const MAX_ACTIVITIES: Record<Pace, number> = { relaxed: 3, balanced: 4, packed: 5 };

export function itineraryCost(days: Day[]) {
  return days.reduce((s, d) => s + d.blocks.reduce((t, b) => t + (b.costINR ?? 0), 0), 0);
}

/** Deterministic feasibility checks. Errors make the orchestrator ask the model to repair. */
export function validateItinerary(days: Day[], trip: TripParams, safetyAware: boolean): Violation[] {
  const out: Violation[] = [];

  if (days.length !== trip.days) {
    out.push({ severity: 'warn', message: `Itinerary has ${days.length} day(s) but the trip is ${trip.days} day(s).` });
  }

  for (const d of days) {
    const blocks = d.blocks;
    const acts = blocks.filter((b) => b.kind === 'activity').length;
    if (acts > MAX_ACTIVITIES[trip.pace]) {
      out.push({ severity: 'error', day: d.day, message: `Day ${d.day} has ${acts} activities; a ${trip.pace} pace allows at most ${MAX_ACTIVITIES[trip.pace]}.` });
    }
    if (!blocks.some((b) => b.meal === 'lunch')) out.push({ severity: 'warn', day: d.day, message: `Day ${d.day} has no lunch block.` });
    if (!blocks.some((b) => b.meal === 'dinner')) out.push({ severity: 'warn', day: d.day, message: `Day ${d.day} has no dinner block.` });

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.placeId && !PLACE_BY_ID[b.placeId]) {
        out.push({ severity: 'error', day: d.day, blockId: b.id, message: `Unknown placeId "${b.placeId}" on day ${d.day}. Only use IDs from the catalogue.` });
      }
      if (b.unverified) {
        out.push({ severity: 'warn', day: d.day, blockId: b.id, message: `"${b.title}" is not in the verified catalogue.` });
      }
      if (toMin(b.end) <= toMin(b.start)) {
        out.push({ severity: 'error', day: d.day, blockId: b.id, message: `"${b.title}" ends before it starts.` });
      }
      if (safetyAware) {
        if (toMin(b.end) > 21 * 60 + 30) {
          out.push({ severity: 'error', day: d.day, blockId: b.id, message: `Safety-aware plan: "${b.title}" ends after 9:30 PM. Finish evenings earlier.` });
        }
        const p = b.placeId ? PLACE_BY_ID[b.placeId] : undefined;
        if (p && !p.eveningBusy && toMin(b.start) >= 18 * 60) {
          out.push({ severity: 'warn', day: d.day, blockId: b.id, message: `"${b.title}" is in a quieter area in the evening.` });
        }
      }
      if (i > 0) {
        const prev = blocks[i - 1];
        if (toMin(b.start) < toMin(prev.end)) {
          out.push({ severity: 'error', day: d.day, blockId: b.id, message: `"${b.title}" starts before "${prev.title}" ends.` });
        } else {
          const hop = hopBetween(prev, b);
          if (hop?.status === 'tight') {
            out.push({ severity: 'error', day: d.day, blockId: b.id, message: `Not enough time to get from "${prev.title}" to "${b.title}": about ${hop.minutes} min needed.` });
          } else if (hop?.status === 'long') {
            out.push({ severity: 'warn', day: d.day, blockId: b.id, message: `Long hop (${hop.minutes} min) from "${prev.title}" to "${b.title}".` });
          }
        }
      }
    }
  }

  const spend = itineraryCost(days);
  if (trip.budgetINR > 0 && spend > trip.budgetINR) {
    out.push({ severity: 'warn', message: `Estimated meals and activities (INR ${spend}) exceed the budget (INR ${trip.budgetINR}).` });
  }
  return out;
}
