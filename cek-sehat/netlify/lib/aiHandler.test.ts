import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { describe, expect, it, vi } from 'vitest';
import { MakananSchema, type MakananResult } from '../../src/lib/ai/schemas';
import { MODEL } from '../../src/lib/ai/food';
import { HttpError, handleAi } from './aiHandler';

const result: MakananResult = {
  makanan: [{ nama: 'Nasi', porsi: '1 piring' }],
  per_porsi: { kalori: 300, karbohidrat_g: 60, gula_g: 1, serat_g: 1, protein_g: 5, lemak_g: 1, lemak_jenuh_g: 0, natrium_mg: 5, kolesterol_mg: 0 },
  zat_gizi: [{ nama: 'Zat besi', jumlah: 0.5, satuan: 'mg', tingkat: 'rendah' }],
  tersembunyi: [],
  asin: false,
  baik_untuk: ['Sumber energi'],
  perlu_dibatasi: [],
  keyakinan: 'tinggi',
  saran: 'Tambahkan lauk dan sayur.',
};

function fake(parsed: unknown, stop = 'end_turn') {
  const parse = vi.fn().mockResolvedValue({ stop_reason: stop, parsed_output: parsed, content: [] });
  return { client: { beta: { messages: { parse } } } as never, parse };
}
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('server foto makanan', () => {
  it('mengirim foto + kondisi, memakai model, fallback, dan format terstruktur', async () => {
    const { client, parse } = fake(result);
    const out = await handleAi({ task: 'makanan', foto: FOTO, kondisi: ['Diabetes'] }, client);
    expect(out).toEqual(result);
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe(MODEL);
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.system).toMatch(/vitamin dan mineral/);
    expect(req.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRg==' } });
    expect(req.messages[0].content[1].text).toMatch(/Kondisi pengguna: Diabetes/);
  });

  it('foto rusak, tanpa foto, atau permintaan lain → 400', async () => {
    const { client } = fake(result);
    await expect(handleAi({ task: 'makanan', foto: 'bukan-foto' }, client)).rejects.toMatchObject({ status: 400 });
    await expect(handleAi({ task: 'makanan' }, client)).rejects.toMatchObject({ status: 400 });
    await expect(handleAi({ task: 'lain' }, client)).rejects.toMatchObject({ status: 400 });
    await expect(handleAi(null, client)).rejects.toMatchObject({ status: 400 });
  });

  it('ditolak model → 422; jawaban terpotong → 502', async () => {
    await expect(handleAi({ task: 'makanan', foto: FOTO }, fake(null, 'refusal').client)).rejects.toBeInstanceOf(HttpError);
    await expect(handleAi({ task: 'makanan', foto: FOTO }, fake(null, 'max_tokens').client)).rejects.toMatchObject({ status: 502 });
  });

  it('skema bisa diubah ke JSON schema', () => {
    const f = betaZodOutputFormat(MakananSchema) as unknown as { type: string };
    expect(f.type).toBe('json_schema');
  });
});
