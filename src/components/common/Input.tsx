import { forwardRef, type InputHTMLAttributes } from "react";
import "./Input.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, className = "", id, ...props },
  ref,
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={`input-group ${error ? "input-group--error" : ""} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input-group__label">
          {label}
        </label>
      )}
      <div className="input-group__wrapper">
        {icon && <span className="input-group__icon">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`input-group__input ${icon ? "input-group__input--with-icon" : ""}`}
          {...props}
        />
      </div>
      {error && <span className="input-group__error">{error}</span>}
    </div>
  );
});
