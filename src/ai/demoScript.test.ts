// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { sendUserMessage, resetConversation } from './orchestrator';
import { buildICS } from '../lib/export';

/** The 3-minute stage script, run end to end in Demo mode. */
describe('demo script (Demo mode)', () => {
  it('plans, refines three times and exports', async () => {
    resetConversation();
    useStore.getState().setSettings({ aiMode: 'mock', speakReplies: false });

    await sendUserMessage('Weekend in Jaipur, two of us, around 25k, not too rushed, I like food and culture');
    let s = useStore.getState();
    expect(s.itinerary.length).toBeGreaterThan(0);
    expect(s.violations.filter((v) => v.severity === 'error')).toHaveLength(0);
    const day2Before = JSON.stringify(s.itinerary[1]);

    await sendUserMessage('Make day 2 more relaxed');
    s = useStore.getState();
    expect(JSON.stringify(s.itinerary[1])).not.toBe(day2Before);
    expect(s.itinerary[1].theme).toMatch(/relaxed/);

    await sendUserMessage('Swap dinner for vegetarian fine dining');
    s = useStore.getState();
    expect(s.itinerary.flatMap((d) => d.blocks).some((b) => b.changed)).toBe(true);

    await sendUserMessage('Add an indoor alternative for rain');
    s = useStore.getState();
    expect(s.itinerary.flatMap((d) => d.blocks).some((b) => b.alternative)).toBe(true);
    expect(s.messages.some((m) => m.error)).toBe(false);

    const ics = buildICS(s.trip, s.itinerary);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
  }, 60000);
});
