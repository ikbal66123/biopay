export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-400">{subtitle}</p>}
    </header>
  );
}
