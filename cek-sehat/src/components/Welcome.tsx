import { IconHeart } from './Icons';

export default function Welcome({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-700 text-white">
          <IconHeart width={32} height={32} />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Cek Sehat Mandiri</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Pahami angka kesehatan Anda dari rumah</p>
        </div>
      </div>

      <div className="card space-y-3 text-[15px] leading-relaxed">
        <p>Dengan aplikasi ini Anda bisa:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Memperkirakan detak jantung dengan kamera HP</li>
          <li>Memahami angka tekanan darah, gula darah, suhu, dan berat badan</li>
          <li>Mengetahui kapan sebaiknya ke dokter atau ke IGD</li>
          <li>Menyimpan riwayat untuk ditunjukkan ke dokter</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[15px] leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100">
        <p className="font-semibold">Penting untuk diketahui</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Aplikasi ini <b>alat bantu</b>, bukan pengganti pemeriksaan dokter.</li>
          <li>Aplikasi ini <b>tidak memberi diagnosis</b> penyakit.</li>
          <li>Hasil pengukuran kamera adalah perkiraan dan tidak seakurat alat medis.</li>
          <li>Semua data hanya disimpan di HP ini dan tidak dikirim ke mana pun.</li>
        </ul>
      </div>

      <button className="btn-primary w-full text-lg" onClick={onAccept}>
        Saya mengerti, lanjutkan
      </button>
    </div>
  );
}
