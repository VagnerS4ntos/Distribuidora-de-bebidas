export default function DashboardLoading() {
  return (
    <div className="page-loading" role="status" aria-label="Carregando módulo">
      <div className="loading-heading">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-copy" />
      </div>
      <div className="loading-cards">
        <span className="skeleton skeleton-card" />
        <span className="skeleton skeleton-card" />
        <span className="skeleton skeleton-card" />
      </div>
      <span className="skeleton skeleton-panel" />
    </div>
  );
}
