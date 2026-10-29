/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Optional shared Gemini key injected at build time (visible in the published bundle). */
  readonly VITE_GEMINI_KEY?: string;
}
