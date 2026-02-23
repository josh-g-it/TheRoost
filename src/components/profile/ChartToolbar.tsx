import "./ChartToolbar.css";

interface ChartToolbarSelectProps {
  label: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string) => void;
}

export function ChartToolbarSelect({
  label,
  value,
  options,
  onChange,
}: ChartToolbarSelectProps) {
  return (
    <div className="chart-toolbar-select">
      <span className="chart-toolbar-select__label">{label}</span>
      <select
        className="chart-toolbar-select__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
