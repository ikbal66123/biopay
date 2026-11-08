import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { describe, expect, it, vi } from 'vitest';
import { KeluhanSchema, MakananSchema, ObatSchema, stripPercentClaims, type KeluhanResult } from '../../src/lib/ai/schemas';
import { HttpError, MODEL, handleAi, type AiClient } from './aiHandler';

const keluhan: KeluhanResult = {
  darurat: false,
  alasan_darurat: '',
  ringkasan: 'Demam dan pusing sejak 2 hari.',
  kemungkinan: [
    { kondisi: 'Infeksi virus (flu)', tingkat: 'Kemungkinan besar', alasan: 'Demam dan pusing tanpa tanda bahaya (85%).' },
    { kondisi: 'DBD', tingkat: 'Mungkin', alasan: 'Musim hujan, demam 2 hari.' },
  ],
  penanganan_awal: ['Minum banyak air'],
  ke_dokter_jika: ['Demam 3 hari'],
  pertanyaan_lanjutan: ['Ada bintik merah?', 'Mimisan?', 'Muntah?', 'Pertanyaan keempat'],
  catatan_obat: 'Hindari ibuprofen.',
  saran_layanan: 'rawat di rumah',
};

function fakeClient(parsed: unknown, stop = 'end_turn') {
  const parse = vi.fn().mockResolvedValue({ stop_reason: stop, parsed_output: parsed, content: [] });
  const create = vi.fn().mockResolvedValue({ stop_reason: stop, content: [{ type: 'text', text: 'Kemungkinan 90% flu. Istirahat ya.' }] });
  return { client: { beta: { messages: { parse, create } } } as unknown as AiClient, parse, create };
}

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('server AI', () => {
  it('cek keluhan: model, fallback, format terstruktur, dan data pengguna terkirim', async () => {
    const { client, parse } = fakeClient(keluhan);
    const out = (await handleAi(
      { task: 'keluhan', keluhan: 'pusing dan panas', konteks: { usia: 70, kondisi: ['hipertensi'], data_terbaru: ['Suhu 38,5 °C'] } },
      client,
    )) as KeluhanResult;
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe(MODEL);
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.system).toMatch(/Jangan pernah memberi angka persen/);
    const text = req.messages[0].content.at(-1).text;
    expect(text).toMatch(/Usia: 70/);
    expect(text).toMatch(/Suhu 38,5/);
    // sanitized
    expect(out.kemungkinan[0].alasan).not.toMatch(/%/);
    expect(out.pertanyaan_lanjutan).toHaveLength(3);
  });

  it('jika darurat, saran layanan dipaksa "segera ke IGD"', async () => {
    const { client } = fakeClient({ ...keluhan, darurat: true, alasan_darurat: 'Nyeri dada' });
    const out = (await handleAi({ task: 'keluhan', keluhan: 'dada sakit', konteks: {} }, client)) as KeluhanResult;
    expect(out.saran_layanan).toBe('segera ke IGD');
  });

  it('foto ikut terkirim sebagai gambar', async () => {
    const { client, parse } = fakeClient(keluhan);
    await handleAi({ task: 'keluhan', keluhan: 'ruam merah', konteks: {}, foto: FOTO }, client);
    expect(parse.mock.calls[0][0].messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRg==' },
    });
  });

  it('foto rusak → 400', async () => {
    const { client } = fakeClient(keluhan);
    await expect(handleAi({ task: 'makanan', foto: 'bukan-foto', konteks: {} }, client)).rejects.toMatchObject({ status: 400 });
  });

  it('ditolak model → 422 dengan pesan ramah', async () => {
    const { client } = fakeClient(null, 'refusal');
    await expect(handleAi({ task: 'keluhan', keluhan: 'x', konteks: {} }, client)).rejects.toBeInstanceOf(HttpError);
  });

  it('keluhan kosong / tugas tidak dikenal → 400', async () => {
    const { client } = fakeClient(keluhan);
    await expect(handleAi({ task: 'keluhan', keluhan: '  ', konteks: {} }, client)).rejects.toMatchObject({ status: 400 });
    await expect(handleAi({ task: 'hack' }, client)).rejects.toMatchObject({ status: 400 });
    await expect(handleAi(null, client)).rejects.toMatchObject({ status: 400 });
  });

  it('chat: pesan terakhir harus dari pengguna; persen dihapus dari jawaban', async () => {
    const { client, create } = fakeClient(null);
    await expect(handleAi({ task: 'chat', konteks: {}, ringkasan: '', pesan: [] }, client)).rejects.toMatchObject({ status: 400 });
    const out = (await handleAi(
      { task: 'chat', konteks: {}, ringkasan: 'Demam 2 hari', pesan: [{ role: 'user', text: 'Kalau besok masih panas?' }] },
      client,
    )) as { balasan: string };
    expect(out.balasan).toBe('Kemungkinan flu. Istirahat ya.');
    const req = create.mock.calls[0][0];
    expect(req.messages[0].role).toBe('user');
    expect(req.messages.at(-1)).toEqual({ role: 'user', content: 'Kalau besok masih panas?' });
  });
});

describe('format jawaban terstruktur', () => {
  it.each([
    ['keluhan', KeluhanSchema],
    ['makanan', MakananSchema],
    ['obat', ObatSchema],
  ])('skema %s bisa diubah ke JSON schema', (_n, schema) => {
    const f = betaZodOutputFormat(schema) as unknown as { type: string; schema: { type: string } };
    expect(f.type).toBe('json_schema');
    expect(f.schema.type).toBe('object');
  });
});

describe('penghapus klaim persen', () => {
  it.each([
    ['98% DBD', 'DBD'],
    ['Kemungkinan DBD (sekitar 54 %).', 'Kemungkinan DBD.'],
    ['Peluang 12,5% flu', 'Peluang flu'],
    ['Tanpa angka', 'Tanpa angka'],
  ])('"%s" → "%s"', (a, b) => {
    expect(stripPercentClaims(a)).toBe(b);
  });
});
