import { IconPhone } from './Icons';

export default function EmergencyCall({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <a href="tel:119" className="btn bg-red-600 text-white hover:bg-red-700">
        <IconPhone width={18} height={18} /> Telepon 119
      </a>
      <a href="tel:112" className="btn bg-red-600 text-white hover:bg-red-700">
        <IconPhone width={18} height={18} /> Telepon 112
      </a>
    </div>
  );
}
