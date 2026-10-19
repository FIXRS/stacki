import { record, string } from '../../shared/validation';

export interface ChatImage {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}
export interface ChatContext {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
export interface ChatInput {
  readonly images: readonly ChatImage[];
  readonly history: readonly ChatContext[];
}
export interface ModelConfiguration {
  readonly models: readonly string[];
  readonly defaultModel: string;
}
export function modelConfiguration(model?: string, models?: string): ModelConfiguration {
  const values = [
    ...new Set(
      [model, ...(models ?? '').split(',')]
        .filter(Boolean)
        .map((value) => string(value, 160).trim())
        .filter(Boolean),
    ),
  ];
  if (values.length > 30) {
    throw new Error('Configure at most 30 AI models');
  }
  return { models: values, defaultModel: model?.trim() ?? '' };
}
export function parseModels(value: unknown): ModelConfiguration {
  const input = record(value);
  if (!Array.isArray(input['models']) || input['models'].length > 30) {
    throw new Error('Invalid model configuration');
  }
  return {
    models: input['models'].map((model) => string(model, 160)),
    defaultModel: string(input['defaultModel'], 160),
  };
}
export function parseImages(value: unknown): readonly ChatImage[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error('Attach up to four images');
  }
  return value.map((value) => {
    const image = record(value);
    const url = string(image['url'], 180_000);
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) {
      throw new Error('Invalid image attachment');
    }
    return { id: string(image['id'], 100), name: string(image['name'], 200), url };
  });
}
export function parseChatInput(value: unknown): ChatInput {
  const input = record(value);
  const history = input['history'] ?? [];
  if (!Array.isArray(history) || history.length > 12 || JSON.stringify(history).length > 80_000) {
    throw new Error('Conversation context is too large');
  }
  return {
    images: parseImages(input['images']),
    history: history.map((value) => {
      const message = record(value);
      const role = message['role'];
      if (role !== 'user' && role !== 'assistant') {
        throw new Error('Invalid message role');
      }
      return { role, content: string(message['content'], 12_000) };
    }),
  };
}
