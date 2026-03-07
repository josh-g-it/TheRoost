import { forwardRef, type ButtonHTMLAttributes } from "react";
import "./Button.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    children,
    className = "",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`btn btn--${variant} btn--${size} ${loading ? "btn--loading" : ""} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn__spinner" />}
      <span className={loading ? "btn__content--hidden" : ""}>{children}</span>
    </button>
  );
});
