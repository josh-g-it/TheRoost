import "./StatCard.css";

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  secondary?: string;
}

export function StatCard({ label, value, icon, secondary }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__top">
        {icon && <span className="stat-card__icon">{icon}</span>}
        <span className="stat-card__value">{value}</span>
      </div>
      <span className="stat-card__label">{label}</span>
      {secondary && <span className="stat-card__secondary">{secondary}</span>}
    </div>
  );
}
