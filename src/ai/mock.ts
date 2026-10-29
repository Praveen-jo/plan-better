import type { Adapter, StreamArgs, StreamEvent } from './adapter';
import type { Block, Day, Interest, Pace, Place, TripParams } from '../types';
import { CITIES, PLACES, detectCity } from '../data/places';
import { addPlace, addRainAlternatives, planItinerary, relaxDay, removePlace, swapMeal } from '../lib/planner';
import { useStore } from '../store';

/**
 * Offline stand-in for the LLM. It speaks the same protocol (streamed text + tool calls)
 * as the Claude adapter, so the whole UI, validators and exports are exercised identically.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const INTEREST_WORDS: [RegExp, Interest][] = [
  [/\bfood|foodie|eat|seafood|cuisine|street food\b/, 'food'],
  [/\badventure|adrenaline|raft|trek|thrill\b/, 'adventure'],
  [/\bculture|cultural|history|historic|heritage|fort|palace|museum\b/, 'culture'],
  [/\bnature|scenic|waterfall|hills?|views?\b/, 'nature'],
  [/\bbeach(es)?|relax|chill|unwind|spa|yoga\b/, 'relax'],
  [/\bspiritual|temple|ghat|aarti|peace\b/, 'spiritual'],
  [/\bshopping|market|bazaar|bazar\b/, 'shopping'],
  [/\bnightlife|party|music|clubs?\b/, 'nightlife'],
];

interface Parsed {
  cityId?: ReturnType<typeof detectCity>;
  days?: number;
  budget?: number;
  travelers?: number;
  solo?: boolean;
  pace?: Pace;
  interests: Interest[];
  veg?: boolean;
  dayNo?: number;
}

function parse(text: string): Parsed {
  const t = text.toLowerCase();
  const p: Parsed = { interests: [] };
  p.cityId = detectCity(t);
  let m: RegExpMatchArray | null;
  if ((m = t.match(/(\d+)\s*[- ]?\s*(days?|nights?)/))) p.days = Math.min(5, Number(m[1]) + (m[2].startsWith('night') ? 1 : 0));
  else if ((m = t.match(/\b(one|two|three|four|five)\s*[- ]?\s*(days?|nights?)/))) p.days = Math.min(5, WORD_NUM[m[1]] + (m[2].startsWith('night') ? 1 : 0));
  else if (/weekend/.test(t)) p.days = 2;
  else if (/\ba week\b|week-?long/.test(t)) p.days = 5;
  if ((m = t.match(/(?:₹|rs\.?\s*|inr\s*)\s*([\d,]+(?:\.\d+)?)\s*(k|l|lakh|lac)?/))) {
    let v = Number(m[1].replace(/,/g, ''));
    if (m[2] === 'k') v *= 1000;
    else if (m[2]) v *= 100000;
    p.budget = v;
  } else if ((m = t.match(/\b(\d+(?:\.\d+)?)\s*(k|lakh|lac)\b/))) {
    p.budget = Number(m[1]) * (m[2] === 'k' ? 1000 : 100000);
  } else if ((m = t.match(/budget[^\d]{0,12}(\d[\d,]*)/))) {
    p.budget = Number(m[1].replace(/,/g, ''));
  }
  if (/\bsolo\b|by myself|\balone\b|\bjust me\b|\bon my own\b/.test(t)) {
    p.travelers = 1;
    p.solo = true;
  } else if (/two of us|\bcouple\b|my (wife|husband|partner|girlfriend|boyfriend)|\bhoneymoon\b/.test(t)) p.travelers = 2;
  else if ((m = t.match(/(\d+)\s*(people|persons|travell?ers|adults|of us)/))) p.travelers = Number(m[1]);
  else if ((m = t.match(/\b(two|three|four|five|six)\s*(people|of us|friends|adults)/))) p.travelers = WORD_NUM[m[1]];
  else if (/\bfamily\b/.test(t)) p.travelers = 4;
  if (/not too rushed|\brelaxed\b|\bslow\b|laid.?back|\beasy\b|\bleisurely\b|\bchill\b/.test(t) && !/more relaxed|make .* relax/.test(t)) p.pace = 'relaxed';
  else if (/\bpacked\b|\bbusy\b|see everything|action.?packed|\bfast\b/.test(t)) p.pace = 'packed';
  for (const [re, tag] of INTEREST_WORDS) if (re.test(t)) p.interests.push(tag);
  if (/vegetarian|\bveg\b|\bvegan\b|pure veg/.test(t)) p.veg = true;
  if ((m = t.match(/day\s*(\d)/))) p.dayNo = Number(m[1]);
  else if (/\bfirst day\b/.test(t)) p.dayNo = 1;
  else if (/\bsecond day\b/.test(t)) p.dayNo = 2;
  else if (/\bthird day\b/.test(t)) p.dayNo = 3;
  return p;
}

const STOP = new Set(['the', 'fort', 'beach', 'of', 'and', 'old', 'goa', 'walk', 'trip', 'visit', 'visit', 'temple', 'river', 'a', 'in', 'at']);
function matchPlace(text: string, city?: string): Place | undefined {
  const t = text.toLowerCase();
  const pool = PLACES.filter((p) => p.kind === 'activity' && (!city || p.city === city));
  return pool.find((p) => {
    const tokens = p.name.toLowerCase().replace(/[(),]/g, '').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
    return tokens.some((tok) => t.includes(tok));
  });
}

const toInput = (b: Block) => ({ placeId: b.placeId, title: b.title, kind: b.kind, meal: b.meal, start: b.start, end: b.end, note: b.note });
const dayInput = (d: Day) => ({ day: d.day, theme: d.theme, blocks: d.blocks.map(toInput) });

interface Plan {
  pre: string;
  tools: { name: string; input: any }[];
  closing: string;
}

let askedOnce = false;
let pendingClosing = '';
export const resetMock = () => {
  askedOnce = false;
  pendingClosing = '';
};

function inr(n: number) {
  return `INR ${n.toLocaleString('en-IN')}`;
}

function makePlan(text: string): Plan {
  const st = useStore.getState();
  const trip: TripParams = st.trip;
  const safety = st.settings.safetyAware;
  const p = parse(text);
  const hasPlan = st.itinerary.length > 0;
  const lower = text.toLowerCase();

  // ---------- refinement of an existing plan ----------
  if (hasPlan) {
    const newCity = p.cityId && p.cityId !== trip.cityId;
    const newDays = p.days && p.days !== trip.days;
    if (newCity || newDays || (p.budget && !/swap|dinner|lunch/.test(lower)) || p.pace === 'packed') {
      const merged: TripParams = {
        ...trip,
        cityId: p.cityId ?? trip.cityId,
        destination: p.cityId ? CITIES.find((c) => c.id === p.cityId)!.name : trip.destination,
        days: p.days ?? trip.days,
        budgetINR: p.budget ?? trip.budgetINR,
        pace: p.pace ?? trip.pace,
        interests: p.interests.length ? p.interests : trip.interests,
      };
      const replanned = planItinerary(merged, safety);
      const short = replanned.length < merged.days;
      if (short) merged.days = replanned.length;
      return {
        pre: 'Sure, let me re-plan with those changes.',
        tools: [
          { name: 'update_trip', input: { destination: merged.destination, days: merged.days, budgetINR: merged.budgetINR, pace: merged.pace, interests: merged.interests } },
          { name: 'set_itinerary', input: { days: replanned.map(dayInput) } },
        ],
        closing: `Updated: ${merged.days} days in ${merged.destination}, ${merged.pace} pace. Routes and timings are re-checked.${short ? ' I only have enough verified places for that many days in this demo.' : ''} Want to adjust anything specific?`,
      };
    }

    const dayNo = p.dayNo ?? (st.activeDay || 1);
    const dayLabel = p.dayNo ?? undefined;

    if (/\bundo\b|revert|go back/.test(lower)) {
      return { pre: '', tools: [], closing: '__UNDO__' };
    }

    if (/\b(remove|skip|drop|delete|without)\b/.test(lower)) {
      const place = matchPlace(text, trip.cityId);
      if (place) {
        const r = removePlace(st.itinerary, place.id, trip, safety);
        const target = r.days.find((d) => d.blocks.length && st.itinerary.find((o) => o.day === d.day && o.blocks.some((b) => b.placeId === place.id)));
        if (target) return { pre: 'Okay, taking that out.', tools: [{ name: 'update_day', input: dayInput(target) }], closing: r.summary };
      }
    }

    if (/\b(add|include|also|visit|want to see)\b/.test(lower) && !/rain|indoor|alternative/.test(lower)) {
      const place = matchPlace(text, trip.cityId);
      if (place) {
        const r = addPlace(st.itinerary, dayNo, place, trip, safety);
        const target = r.days.find((d) => d.day === dayNo)!;
        return { pre: `Good pick. Adding ${place.name}.`, tools: [{ name: 'update_day', input: dayInput(target) }], closing: r.summary };
      }
    }

    if (/rain|indoor|monsoon|weather/.test(lower)) {
      const r = addRainAlternatives(st.itinerary, dayLabel, trip);
      const touched = r.days.filter((d, i) => d.blocks.some((b, j) => b.alternative?.title !== st.itinerary[i].blocks[j]?.alternative?.title));
      const tools = touched.flatMap((d) =>
        d.blocks.map((b, j) => ({ b, j })).filter(({ b, j }) => b.alternative && b.alternative.title !== st.itinerary[d.day - 1].blocks[j]?.alternative?.title).map(({ b }) => ({
          name: 'add_rain_alternative',
          input: { blockId: b.id, placeId: b.alternative!.placeId, title: b.alternative!.title, reason: b.alternative!.reason },
        })),
      );
      return { pre: 'Good idea to have a plan B.', tools, closing: r.summary };
    }

    if (/(vegetarian|vegan|\bveg\b)/.test(lower) && /(dinner|lunch|meal|restaurant|dining)/.test(lower)) {
      const meal: 'lunch' | 'dinner' = /lunch/.test(lower) && !/dinner/.test(lower) ? 'lunch' : 'dinner';
      const fine = /fine|fancy|premium|upscale|luxury|special/.test(lower);
      const targets = p.dayNo ? [p.dayNo] : st.itinerary.map((d) => d.day);
      let working = st.itinerary;
      const tools: Plan['tools'] = [{ name: 'update_trip', input: { dietary: 'vegetarian' } }];
      const bits: string[] = [];
      for (const d of targets) {
        const r = swapMeal(working, d, meal, { veg: true, fine }, trip);
        working = r.days;
        bits.push(r.summary);
        tools.push({ name: 'update_day', input: dayInput(working.find((x) => x.day === d)!) });
      }
      return { pre: 'Done in a moment.', tools, closing: bits.join(' ') };
    }

    if (/relax|slow|less (busy|rushed|packed)|lighter|calm|easy|breathing/.test(lower)) {
      const r = relaxDay(st.itinerary, dayNo, trip, safety);
      return { pre: `Giving day ${dayNo} more breathing room.`, tools: [{ name: 'update_day', input: dayInput(r.days.find((d) => d.day === dayNo)!) }], closing: r.summary };
    }

    return {
      pre: '',
      tools: [],
      closing:
        'In demo mode I understand things like: make day 2 more relaxed, swap dinner for vegetarian fine dining, add an indoor alternative for rain, add Amber Fort to day 2, remove a stop, or change the days or budget. Switch to Claude in Settings for fully open conversation.',
    };
  }

  // ---------- intake ----------
  const cityId = p.cityId ?? trip.cityId;
  const gathered: Record<string, unknown> = {};
  if (p.cityId) gathered.destination = CITIES.find((c) => c.id === p.cityId)!.name;
  if (p.days) gathered.days = p.days;
  if (p.budget) gathered.budgetINR = p.budget;
  if (p.travelers) gathered.travelers = p.travelers;
  if (p.solo) gathered.soloTraveler = true;
  if (p.pace) gathered.pace = p.pace;
  if (p.interests.length) gathered.interests = p.interests;
  if (p.veg) gathered.dietary = 'vegetarian';

  if (!cityId) {
    const tools = Object.keys(gathered).length ? [{ name: 'update_trip', input: gathered }] : [];
    const mentionedOther = /\b(paris|london|manali|kerala|delhi|mumbai|goa|ooty|udaipur|kashmir|bali|dubai)\b/.exec(lower);
    return {
      pre: '',
      tools: [...tools, { name: 'suggest_followups', input: { chips: CITIES.map((c) => `Plan ${c.name}`) } }],
      closing: mentionedOther && mentionedOther[1] !== 'goa'
        ? `I can only verify places for Goa, Jaipur and Rishikesh in this demo, so I would rather not guess about ${mentionedOther[1]}. Want to try one of those?`
        : 'Happy to plan this. Where would you like to go? I can verify places for Goa, Jaipur and Rishikesh.',
    };
  }

  const knowsShape = Boolean(p.days || p.budget || trip.days !== 3);
  if (!knowsShape && !askedOnce) {
    askedOnce = true;
    return {
      pre: '',
      tools: [{ name: 'update_trip', input: gathered }, { name: 'suggest_followups', input: { chips: ['A weekend, around 20k', '3 days, 30k, relaxed', '4 days, no budget limit'] } }],
      closing: `${CITIES.find((c) => c.id === cityId)!.name} is a great pick. How many days do you have, and roughly what budget? If you are not sure, I will start with a balanced 3-day plan.`,
    };
  }

  const merged: TripParams = {
    ...trip,
    cityId,
    destination: CITIES.find((c) => c.id === cityId)!.name,
    days: p.days ?? trip.days,
    budgetINR: p.budget ?? trip.budgetINR,
    travelers: p.travelers ?? trip.travelers,
    soloTraveler: p.solo ?? trip.soloTraveler,
    pace: p.pace ?? trip.pace,
    interests: p.interests.length ? p.interests : trip.interests,
    dietary: p.veg ? 'vegetarian' : trip.dietary,
  };
  const assumed: string[] = ['startDate'];
  if (!p.days) assumed.push('days');
  if (!p.budget) assumed.push('budgetINR');
  if (!p.travelers) assumed.push('travelers');
  if (!p.pace) assumed.push('pace');
  if (!merged.interests.length) assumed.push('interests');
  const plan = planItinerary(merged, safety);
  const shortBy = plan.length < merged.days;
  if (shortBy) merged.days = plan.length;
  const cityName = merged.destination;
  const assumedText = Array.from(new Set(assumed))
    .map((a) => ({ startDate: 'dates (next Saturday)', days: `${merged.days} days`, budgetINR: `budget ${inr(merged.budgetINR)}`, travelers: `${merged.travelers} travelers`, pace: `${merged.pace} pace`, interests: 'general interests' } as Record<string, string>)[a])
    .filter(Boolean)
    .join(', ');
  const safetyText = safety ? ' Safety-aware mode is on, so evenings finish by 9:30 PM and I favoured busy areas.' : '';
  return {
    pre: `Lovely, putting together ${merged.days} day${merged.days > 1 ? 's' : ''} in ${cityName}.`,
    tools: [
      { name: 'update_trip', input: { ...gathered, destination: cityName, days: merged.days, budgetINR: merged.budgetINR, travelers: merged.travelers, pace: merged.pace, interests: merged.interests, assumed: Array.from(new Set(assumed)) } },
      { name: 'set_itinerary', input: { days: plan.map(dayInput) } },
      { name: 'suggest_followups', input: { chips: ['Make day 2 more relaxed', 'Swap dinner for vegetarian fine dining', 'Add an indoor alternative for rain', 'Add a stop on day 1'] } },
    ],
    closing: `Your plan is ready, with travel times between stops checked. I assumed ${assumedText}; change any of these in the trip details or just tell me.${safetyText}${shortBy ? ` I only have enough verified places for ${merged.days} days in this demo.` : ''} Please confirm opening hours and ticket availability independently before you go.`,
  };
}

async function* typeOut(text: string): AsyncGenerator<StreamEvent> {
  const parts = text.split(/(\s+)/);
  let buf = '';
  for (const part of parts) {
    buf += part;
    if (buf.length >= 6) {
      yield { type: 'text', text: buf };
      buf = '';
      await sleep(18);
    }
  }
  if (buf) yield { type: 'text', text: buf };
}

export const mockAdapter: Adapter = {
  async *stream({ messages }: StreamArgs): AsyncGenerator<StreamEvent> {
    const last = messages[messages.length - 1];
    const isFollowUp = Array.isArray(last.content) && last.content.some((c) => c.type === 'tool_result');
    if (isFollowUp) {
      await sleep(250);
      const rejected = Array.isArray(last.content) && last.content.some((c) => c.type === 'tool_result' && c.content.startsWith('REJECTED'));
      if (rejected) {
        yield* typeOut('I could not find a plan that passes the route and timing checks with those settings. Try fewer days, a more relaxed pace, or turning off safety-aware mode, and I will plan again.');
        pendingClosing = '';
        return;
      }
      if (pendingClosing === '__UNDO__') {
        useStore.getState().undo();
        pendingClosing = 'Undone. I restored the previous version of your itinerary.';
      }
      yield* typeOut(pendingClosing);
      pendingClosing = '';
      return;
    }
    const userText = typeof last.content === 'string' ? last.content : '';
    await sleep(450);
    const plan = makePlan(userText);
    if (plan.pre) yield* typeOut(plan.pre + ' ');
    await sleep(350);
    let n = 0;
    for (const t of plan.tools) yield { type: 'tool_use', id: `mock_${Date.now()}_${n++}`, name: t.name, input: t.input };
    if (!plan.tools.length) {
      if (plan.closing === '__UNDO__') {
        useStore.getState().undo();
        yield* typeOut('Undone. I restored the previous version of your itinerary.');
      } else yield* typeOut(plan.closing);
      return;
    }
    pendingClosing = plan.closing;
  },
};
