import { describe, expect, it } from 'vitest';
import { looksLikeApiKey } from './client';

describe('API key', () => {
  it('mengenali format kunci Anthropic', () => {
    expect(looksLikeApiKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz_0123')).toBe(true);
    expect(looksLikeApiKey('  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ')).toBe(true);
    expect(looksLikeApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
  });
});
