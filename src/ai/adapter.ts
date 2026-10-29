import type { Settings } from '../types';
import type { ApiMessage } from '../store';
import type { ToolDef } from './tools';

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any };

export interface StreamArgs {
  system: string;
  messages: ApiMessage[];
  tools: ToolDef[];
  settings: Settings;
  signal?: AbortSignal;
}

export interface Adapter {
  stream(args: StreamArgs): AsyncGenerator<StreamEvent>;
}
