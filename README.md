# plan better.: conversational trip planner (frontend demo)

Team 2, Challenge 1 "Plan Better". A frontend-only React + TypeScript app with real AI chat, voice, a structured itinerary, chat-driven refinement and export. Reusable components for the real codebase.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (voice needs localhost or HTTPS)
```

Use **Chrome or Edge** for voice input. Set browser zoom to 125% for the stage demo.

## AI modes (Settings, the gear icon)

- **Demo mode (offline):** a scripted stand-in that speaks the same protocol as the real model, so every feature works with no key and no network. Good fallback if Wi-Fi or the API fails on stage.
- **Live AI:** pick a provider in Settings > AI. The model name and base URL are always editable.

| Provider | Key needed | Default model | Notes |
|---|---|---|---|
| Google Gemini (free tier) | yes, free | `gemini-2.5-flash` | Default live option. Uses Gemini's OpenAI-compatible endpoint. |
| Groq (free tier) | yes, free | `llama-3.3-70b-versatile` | OpenAI-compatible. |
| Ollama (local) | no | `llama3.1` | `http://localhost:11434/v1`. Run `ollama pull llama3.1`; the browser may need `OLLAMA_ORIGINS=*`. |
| Anthropic | yes, paid | `claude-sonnet-5-5` | The original adapter (`src/ai/claude.ts`). |
| Custom | usually | you choose | Any OpenAI-compatible chat completions API with streaming and tools. |

### Free setup (Gemini, about 2 minutes)

1. Create a free key at https://aistudio.google.com/apikey.
2. `npm run dev`, open http://localhost:5173, click the gear, then Settings > AI.
3. Choose **Live AI**, provider **Google Gemini (free tier)**, paste the key.
4. Chat. If you see a rate-limit message, wait a minute or switch back to Demo mode.

The key is kept in this browser (localStorage) only and is sent straight to the provider. **Do not deploy publicly with a key.** Free tiers may use prompts to improve their models, so do not enter personal details. Small free models can be weak at tool calling; if one replies without updating the trip you will see a note suggesting another model or Demo mode. Model availability changes, so check the provider's docs if a model name stops working.

The OpenAI-compatible adapter is `src/ai/openaiCompat.ts`; presets live in `src/ai/providers.ts`.

## Tests

```bash
npm test                          # adapter (mock streaming) + the full demo script in Demo mode
GEMINI_API_KEY=... npm test       # also runs one real Gemini round trip
```

## Screens

Landing, Profile (name, avatar, travel style, budget, diet, interests: used as defaults for every new trip and in the AI prompt; stored in this browser; download or clear your data), planner (chat + itinerary), full-screen voice chat, Explore, My Trips, day map (Leaflet + OpenStreetMap tiles), Edit Day (drag to reorder) and Save and export. Photos are fetched from Wikipedia's free image API for the prototype only; licences vary, do not ship them.

## Demo script (3 minutes)

1. New chat. Type or say: "Weekend in Rishikesh, two of us, around 25k, not too rushed, I like food and a bit of adventure."
2. Point at the assumed chips, the route-checked badge and the travel minutes between stops.
3. "Make day 2 more relaxed."
4. "Swap dinner for vegetarian fine dining."
5. "Add an indoor alternative for rain."
6. Save and export: PDF, JSON, .ics.

Other things to show: Settings (themes Sunrise, Blush, Honey, dark mode, density, text size, cards or timeline), "Travelling as" with safety-aware planning, hands-free voice conversation, undo and redo, saved trips.

## How it works

```
Chat (type or voice) -> orchestrator (src/ai/orchestrator.ts)
   -> model streams text + tool calls (update_trip, set_itinerary, update_day, add_rain_alternative, suggest_followups)
   -> validators (src/lib/validate.ts): overlaps, travel time between stops, pacing, meals, budget, safety hours
   -> REJECTED results go back to the model to repair (max 2 tries), otherwise the itinerary is applied
   -> store (src/store.ts) -> itinerary view, undo history, exports
```

- The itinerary is one JSON document; the chat only edits it through tools.
- Venues come from a curated dataset (`src/data/places.ts`, 3 cities). The model must use catalogue IDs. Anything else is shown as "unverified suggestion". Dining entries are neighbourhood-level, never specific restaurants.
- Coordinates and costs in the dataset are approximate sample data: verify before using for real.
- Disclaimers about hours, tickets and bookings are on screen and in every export.

## Customising

- Colours and themes: CSS variables at the top of `src/styles.css`.
- Add a city: add places to `src/data/places.ts` and the city to `CITIES` and `detectCity`.
- Swap the model provider: implement the `Adapter` interface in `src/ai/adapter.ts` (see `src/ai/openaiCompat.ts`).

## Moving into the real codebase

Take `src/components/*`, `src/ai/*`, `src/voice/*`, `src/lib/*`, `src/data/*` and `src/styles.css`. Replace the browser-side model call with your backend endpoint and keep the tool schemas and validators as they are. The chat panel and trip panel are self-contained, so mounting them inside the Adventra app is a layout change, not a rewrite.

## Known limits

- Voice input uses the browser's speech recognition: Chrome and Edge only, needs internet and microphone permission.
- PDF export uses the browser print dialog ("Save as PDF").
- Demo mode understands a fixed set of requests (relax a day, vegetarian swap, rain alternative, add or remove a stop, change days or budget).
