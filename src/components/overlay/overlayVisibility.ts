import { createContext, useContext } from "react";

/** Whether the overlay window is currently shown (vs hidden). */
export const OverlayVisibilityContext = createContext(true);
export const useOverlayVisible = () => useContext(OverlayVisibilityContext);
