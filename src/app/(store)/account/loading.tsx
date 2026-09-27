export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-8 w-40" />
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}
    </div>
  );
}
