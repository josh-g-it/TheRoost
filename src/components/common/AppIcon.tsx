import { useSettingsStore } from "../../store/settingsSlice";
import { getIcon } from "../../utils/icons";
import type { IconName } from "../../utils/icons";

interface AppIconProps {
  name: IconName;
  size?: number | string;
  className?: string;
}

export function AppIcon({ name, size = "1em", className }: AppIconProps) {
  const iconSet = useSettingsStore((s) => s.settings?.iconSet ?? "classic");
  const IconComponent = getIcon(name, iconSet);
  return <IconComponent size={size} className={className} />;
}
