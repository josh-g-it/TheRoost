import "./Header.css";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__left">
        <h2 className="header__title">{title}</h2>
        {subtitle && <span className="header__subtitle">{subtitle}</span>}
      </div>
      {actions && <div className="header__actions">{actions}</div>}
    </header>
  );
}
