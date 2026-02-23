import "./OverlayBackdrop.css";

interface OverlayBackdropProps {
  onClick: () => void;
}

export function OverlayBackdrop({ onClick }: OverlayBackdropProps) {
  return <div className="overlay-backdrop" onClick={onClick} />;
}
