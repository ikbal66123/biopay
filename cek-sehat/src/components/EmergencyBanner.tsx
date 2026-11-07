import { IconPhone } from './Icons';

export default function EmergencyBanner() {
  return (
    <div className="sticky top-0 z-30 bg-red-600 text-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">
        <IconPhone width={16} height={16} />
        <span>Darurat? Telepon</span>
        <a href="tel:119" className="rounded bg-white/20 px-2 py-0.5 underline-offset-2 hover:underline">119</a>
        <span>/</span>
        <a href="tel:112" className="rounded bg-white/20 px-2 py-0.5 underline-offset-2 hover:underline">112</a>
      </div>
    </div>
  );
}
