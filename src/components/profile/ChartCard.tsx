import React from "react";
import "./ChartCard.css";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  isEmpty,
  emptyMessage = "No data available",
}: ChartCardProps) {
  return (
    <div className={`chart-card${className ? ` ${className}` : ""}`}>
      <div className="chart-card__header">
        <div className="chart-card__header-text">
          <h3 className="chart-card__title">{title}</h3>
          {subtitle && <p className="chart-card__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="chart-card__actions">{actions}</div>}
      </div>
      {isEmpty ? (
        <div className="chart-card__empty">{emptyMessage}</div>
      ) : (
        <div className="chart-card__content">{children}</div>
      )}
    </div>
  );
}
