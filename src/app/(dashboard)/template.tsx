/**
 * Template del dashboard: a diferencia de layout.tsx (que persiste entre rutas),
 * el template se re-monta en cada navegación, por lo que su animación de entrada
 * se dispara al cambiar de página. Da una transición suave y consistente a TODAS
 * las páginas del panel sin tocar cada una. Respeta prefers-reduced-motion (el
 * guard global en globals.css neutraliza la animación).
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="transicion-ruta">{children}</div>;
}
