/** Re-mounts on every navigation, so each page gently fades/slides in (switched off for reduced motion). */
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
