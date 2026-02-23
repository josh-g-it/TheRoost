import "./GenreTag.css";

interface GenreTagProps {
  label: string;
  size?: "sm" | "md";
}

export function GenreTag({ label, size = "sm" }: GenreTagProps) {
  return <span className={`genre-tag genre-tag--${size}`}>{label}</span>;
}
