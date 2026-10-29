// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useStore, emptyTrip, defaultSettings } from '../store';
import { buildSystemPrompt } from './prompt';
import { resetConversation } from './orchestrator';

describe('profile preferences', () => {
  it('seed new trips and the AI prompt', () => {
    const me = { ...defaultSettings.me, name: 'Asha Rao', homeCity: 'Pune', pace: 'relaxed' as const, dietary: 'vegetarian' as const, interests: ['food' as const, 'culture' as const], budgetPerDay: 5000, travelers: 1 };
    useStore.getState().setSettings({ me });

    const t = emptyTrip(me);
    expect(t).toMatchObject({ pace: 'relaxed', dietary: 'vegetarian', travelers: 1, soloTraveler: true, interests: ['food', 'culture'] });
    expect(t.budgetINR).toBe(15000);

    resetConversation();
    expect(useStore.getState().trip).toMatchObject({ pace: 'relaxed', dietary: 'vegetarian', travelers: 1 });

    const prompt = buildSystemPrompt(useStore.getState().settings, useStore.getState().trip, []);
    expect(prompt).toContain('Asha Rao');
    expect(prompt).toContain('Pune');
    expect(prompt).toContain('vegetarian');
  });

  it('keeps old saved settings working (no me block)', () => {
    expect(defaultSettings.me.name).toBe('');
  });
});
