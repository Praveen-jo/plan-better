export type CityId = 'goa' | 'jaipur' | 'rishikesh';
export type Period = 'morning' | 'afternoon' | 'evening';
export type Pace = 'relaxed' | 'balanced' | 'packed';
export type Interest =
  | 'culture'
  | 'adventure'
  | 'nature'
  | 'food'
  | 'relax'
  | 'spiritual'
  | 'shopping'
  | 'nightlife';

export interface Place {
  id: string;
  city: CityId;
  name: string;
  kind: 'activity' | 'dining';
  tags: Interest[];
  lat: number;
  lng: number;
  durationMin: number;
  /** approximate cost per person in INR (entry or a typical meal) */
  costINR: number;
  indoor: boolean;
  veg: boolean;
  best: Period | 'any';
  /** is the surrounding area typically busy in the evening */
  eveningBusy: boolean;
  hours: string;
  blurb: string;
  cuisine?: string;
}

export interface Block {
  id: string;
  period: Period;
  kind: 'activity' | 'meal';
  meal?: 'breakfast' | 'lunch' | 'dinner';
  placeId?: string;
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
  note?: string;
  costINR?: number;
  unverified?: boolean;
  alternative?: { placeId?: string; title: string; reason: string };
  changed?: boolean;
}

export interface Day {
  day: number;
  theme: string;
  blocks: Block[];
}

export type Profile = 'woman' | 'man' | 'nonbinary' | 'unspecified';

export interface TripParams {
  destination: string;
  cityId?: CityId;
  startDate: string; // YYYY-MM-DD
  days: number;
  budgetINR: number;
  travelers: number;
  soloTraveler: boolean;
  pace: Pace;
  interests: Interest[];
  dietary: 'none' | 'vegetarian' | 'vegan';
  notes: string;
  /** field names the assistant defaulted rather than the user stating */
  assumed: string[];
}

export interface Violation {
  severity: 'error' | 'warn';
  day?: number;
  blockId?: string;
  message: string;
}

export interface HopInfo {
  km: number;
  minutes: number;
  status: 'ok' | 'long' | 'tight';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  voice?: boolean;
  chips?: string[];
  error?: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  homeCity: string;
  avatarTone: 'sun' | 'rose' | 'sage' | 'coral' | 'sky';
  dietary: 'none' | 'vegetarian' | 'vegan';
  pace: Pace;
  interests: Interest[];
  /** typical spend per person per day, INR */
  budgetPerDay: number;
  travelers: number;
  joined: string;
}

export type Provider = 'gemini' | 'groq' | 'ollama' | 'anthropic' | 'custom';

export interface Settings {
  theme: 'sunrise' | 'blush' | 'honey';
  mode: 'light' | 'dark';
  density: 'comfortable' | 'compact';
  textSize: 'sm' | 'md' | 'lg';
  view: 'cards' | 'timeline';
  aiMode: 'mock' | 'claude';
  provider: Provider;
  baseUrl: string;
  /** keys remembered per provider so switching presets does not leak one provider's key to another */
  keys: Record<string, string>;
  apiKey: string;
  model: string;
  speakReplies: boolean;
  voiceLang: string;
  voiceName: string;
  voiceRate: number;
  handsFree: boolean;
  profile: Profile;
  safetyAware: boolean;
  me: UserProfile;
}

export interface SavedTrip {
  id: string;
  savedAt: string;
  trip: TripParams;
  itinerary: Day[];
}
