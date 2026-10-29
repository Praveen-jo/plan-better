import type { Block, Day, Interest, TripParams } from '../types';
import { PLACE_BY_ID, detectCity } from '../data/places';
import { fromMin, periodOf, toMin } from '../lib/geo';
import { reindex } from '../lib/planner';
import { validateItinerary } from '../lib/validate';
import { useStore } from '../store';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const blockSchema = {
  type: 'object',
  properties: {
    placeId: { type: 'string', description: 'ID from the catalogue. Omit only for destinations outside the catalogue.' },
    title: { type: 'string', description: 'Required when placeId is omitted (then the block is flagged unverified).' },
    kind: { type: 'string', enum: ['activity', 'meal'] },
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
    start: { type: 'string', description: '24h HH:MM' },
    end: { type: 'string', description: '24h HH:MM' },
    note: { type: 'string', description: 'One short sentence of practical detail.' },
  },
  required: ['kind', 'start', 'end'],
};

export const TOOLS: ToolDef[] = [
  {
    name: 'update_trip',
    description:
      'Record trip details learned from the user, or defaults you chose. List in "assumed" every field you filled with a default rather than the user stating it.',
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        days: { type: 'integer', minimum: 1, maximum: 7 },
        budgetINR: { type: 'integer', description: 'Total trip budget in INR' },
        travelers: { type: 'integer', minimum: 1 },
        soloTraveler: { type: 'boolean' },
        pace: { type: 'string', enum: ['relaxed', 'balanced', 'packed'] },
        interests: { type: 'array', items: { type: 'string', enum: ['culture', 'adventure', 'nature', 'food', 'relax', 'spiritual', 'shopping', 'nightlife'] } },
        dietary: { type: 'string', enum: ['none', 'vegetarian', 'vegan'] },
        notes: { type: 'string' },
        assumed: { type: 'array', items: { type: 'string' }, description: 'Field names you defaulted, e.g. ["startDate","budgetINR"]' },
      },
    },
  },
  {
    name: 'set_itinerary',
    description: 'Create or fully replace the whole itinerary. Runs feasibility checks; if rejected, fix the listed problems and call again.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: { day: { type: 'integer' }, theme: { type: 'string' }, blocks: { type: 'array', items: blockSchema } },
            required: ['day', 'theme', 'blocks'],
          },
        },
      },
      required: ['days'],
    },
  },
  {
    name: 'update_day',
    description: 'Replace all blocks of ONE day (use for refinements such as relaxing a day or swapping a meal). Keep unchanged blocks as they are.',
    input_schema: {
      type: 'object',
      properties: { day: { type: 'integer' }, theme: { type: 'string' }, blocks: { type: 'array', items: blockSchema } },
      required: ['day', 'blocks'],
    },
  },
  {
    name: 'add_rain_alternative',
    description: 'Attach an indoor alternative to an existing outdoor block.',
    input_schema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'Block id such as d2-3 from the current itinerary' },
        placeId: { type: 'string' },
        title: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['blockId', 'reason'],
    },
  },
  {
    name: 'suggest_followups',
    description: 'Offer 2 to 4 short quick-reply chips the user might tap next.',
    input_schema: { type: 'object', properties: { chips: { type: 'array', items: { type: 'string' }, maxItems: 4 } }, required: ['chips'] },
  },
];

export interface ToolContext {
  /** number of rejected set_itinerary or update_day attempts in this user turn */
  repairAttempts: number;
  onStage: (s: string) => void;
}

function normalizeBlocks(raw: any[], travelers: number): Block[] {
  const blocks: Block[] = (raw ?? []).map((r, i) => {
    const place = r.placeId ? PLACE_BY_ID[r.placeId] : undefined;
    const start = typeof r.start === 'string' && /^\d{1,2}:\d{2}$/.test(r.start) ? r.start : '09:00';
    const end = typeof r.end === 'string' && /^\d{1,2}:\d{2}$/.test(r.end) ? r.end : fromMin(toMin(start) + (place?.durationMin ?? 60));
    const s = fromMin(toMin(start));
    const e = fromMin(toMin(end));
    const isMeal = r.kind === 'meal' || place?.kind === 'dining';
    const meal: Block['meal'] | undefined = isMeal ? (r.meal ?? (toMin(s) < 11 * 60 ? 'breakfast' : toMin(s) < 16 * 60 ? 'lunch' : 'dinner')) : undefined;
    const label = meal ? `${meal[0].toUpperCase()}${meal.slice(1)}: ` : '';
    return {
      id: `x-${i}`,
      period: periodOf(toMin(s)),
      kind: isMeal ? 'meal' : 'activity',
      meal,
      placeId: place ? place.id : r.placeId, // unknown id is kept so validation can reject it
      title: place ? `${label}${place.name}` : String(r.title ?? r.placeId ?? 'Untitled stop'),
      start: s,
      end: e,
      note: r.note ?? place?.blurb,
      costINR: place ? place.costINR * travelers : undefined,
      unverified: place ? false : !r.placeId,
    } as Block;
  });
  blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
  return blocks;
}

function summariseViolations(v: { severity: string; message: string }[]) {
  return v.map((x) => `- [${x.severity}] ${x.message}`).join('\n');
}

function applyAndValidate(next: Day[], ctx: ToolContext, label: string): string {
  const st = useStore.getState();
  const final = reindex(next);
  const violations = validateItinerary(final, st.trip, st.settings.safetyAware);
  const errors = violations.filter((v) => v.severity === 'error');
  ctx.onStage('Checking routes and timings');
  if (errors.length && ctx.repairAttempts < 2) {
    ctx.repairAttempts += 1;
    return `REJECTED (attempt ${ctx.repairAttempts} of 2). Nothing was changed. Fix these and call ${label} again:\n${summariseViolations(errors)}`;
  }
  st.setItinerary(final);
  st.setViolations(violations);
  const warns = violations.filter((v) => v.severity === 'warn');
  const lefts = errors.length ? `Applied with ${errors.length} unresolved issue(s):\n${summariseViolations(errors)}\n` : 'Applied. All feasibility checks passed.\n';
  return lefts + (warns.length ? `Warnings:\n${summariseViolations(warns)}` : '');
}

export function executeTool(name: string, input: any, ctx: ToolContext): { content: string; isError?: boolean } {
  const st = useStore.getState();
  try {
    switch (name) {
      case 'update_trip': {
        const p: Partial<TripParams> = {};
        if (typeof input.destination === 'string') {
          p.destination = input.destination;
          p.cityId = detectCity(input.destination);
        }
        if (typeof input.startDate === 'string') p.startDate = input.startDate;
        if (Number.isFinite(input.days)) p.days = Math.max(1, Math.min(7, Math.round(input.days)));
        if (Number.isFinite(input.budgetINR)) p.budgetINR = Math.round(input.budgetINR);
        if (Number.isFinite(input.travelers)) p.travelers = Math.max(1, Math.round(input.travelers));
        if (typeof input.soloTraveler === 'boolean') p.soloTraveler = input.soloTraveler;
        if (['relaxed', 'balanced', 'packed'].includes(input.pace)) p.pace = input.pace;
        if (Array.isArray(input.interests)) p.interests = input.interests as Interest[];
        if (['none', 'vegetarian', 'vegan'].includes(input.dietary)) p.dietary = input.dietary;
        if (typeof input.notes === 'string') p.notes = input.notes;
        const stated = Object.keys(p).filter((k) => k !== 'cityId');
        const prevAssumed = st.trip.assumed.filter((a) => !stated.includes(a) || (input.assumed ?? []).includes(a));
        p.assumed = Array.from(new Set([...(input.assumed ?? []), ...prevAssumed]));
        st.setTrip(p);
        const cityNote = p.destination && !p.cityId ? ' Note: this destination is outside the verified catalogue (Goa, Jaipur, Rishikesh); any suggestions must be flagged unverified.' : '';
        return { content: `Trip updated.${cityNote}` };
      }
      case 'set_itinerary': {
        ctx.onStage('Planning your days');
        const days: Day[] = (input.days ?? []).map((d: any, i: number) => ({
          day: d.day ?? i + 1,
          theme: d.theme ?? `Day ${i + 1}`,
          blocks: normalizeBlocks(d.blocks, st.trip.travelers),
        }));
        if (!days.length) return { content: 'No days provided.', isError: true };
        return { content: applyAndValidate(days, ctx, 'set_itinerary') };
      }
      case 'update_day': {
        ctx.onStage('Updating the day');
        const dayNo = input.day;
        const cur = st.itinerary;
        if (!cur.some((d) => d.day === dayNo)) return { content: `Day ${dayNo} does not exist yet. Use set_itinerary first.`, isError: true };
        const next = cur.map((d) =>
          d.day === dayNo ? { ...d, theme: input.theme ?? d.theme, blocks: normalizeBlocks(input.blocks, st.trip.travelers) } : d,
        );
        return { content: applyAndValidate(next, ctx, 'update_day') };
      }
      case 'add_rain_alternative': {
        const match = /^d(\d+)-(\d+)$/.exec(String(input.blockId));
        if (!match) return { content: 'Unknown blockId.', isError: true };
        const [dayNo, idx] = [Number(match[1]), Number(match[2])];
        let found = false;
        const next = st.itinerary.map((d) =>
          d.day !== dayNo
            ? d
            : {
                ...d,
                blocks: d.blocks.map((b, i) => {
                  if (i + 1 !== idx) return b;
                  found = true;
                  const p = input.placeId ? PLACE_BY_ID[input.placeId] : undefined;
                  return { ...b, alternative: { placeId: p?.id, title: p?.name ?? input.title ?? 'Indoor option', reason: input.reason } };
                }),
              },
        );
        if (!found) return { content: 'Block not found.', isError: true };
        st.setItinerary(next);
        return { content: 'Alternative attached.' };
      }
      case 'suggest_followups': {
        const msgs = st.messages;
        const last = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (last) st.patchMessage(last.id, { chips: (input.chips ?? []).slice(0, 4) });
        else
          st.addMessage({ id: `m${Date.now()}`, role: 'assistant', text: '', chips: (input.chips ?? []).slice(0, 4) });
        return { content: 'Chips shown.' };
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (e: any) {
    return { content: `Tool error: ${e?.message ?? e}`, isError: true };
  }
}
