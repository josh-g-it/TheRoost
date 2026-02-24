import { useEffect } from "react";
import { useRouteError, useNavigate, useLocation } from "react-router-dom";
import { Button } from "./Button";
import { AppIcon } from "./AppIcon";
import { logger } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import "./RouteErrorFallback.css";

/** Map route paths to human-readable page names. */
const ROUTE_NAMES: Record<string, string> = {
  "/library": "Library",
  "/activity": "Activity",
  "/profile": "Profile",
  "/notes": "Notes",
  "/settings": "Settings",
  "/debug": "Debug",
};

export function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();

  const pageName = ROUTE_NAMES[location.pathname] ?? "This page";
  const errorMessage = getErrorMessage(error);

  useEffect(() => {
    logger.error("RouteErrorFallback", "routing", `${pageName} crashed`, {
      path: location.pathname,
      message: errorMessage,
      stack: error instanceof Error ? error.stack?.slice(0, 1000) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Log once on mount — values are stable at crash time

  const handleRetry = () => {
    navigate(location.pathname, { replace: true });
  };

  const handleGoToLibrary = () => {
    navigate("/library");
  };

  return (
    <div className="route-error">
      <div className="route-error__card">
        <div className="route-error__icon">
          <AppIcon name="close" size={32} />
        </div>
        <h2 className="route-error__title">{pageName} encountered an error</h2>
        <p className="route-error__message">
          Something went wrong while rendering this page. You can try again or navigate to
          a different page.
        </p>
        {errorMessage && <pre className="route-error__details">{errorMessage}</pre>}
        <div className="route-error__actions">
          <Button variant="secondary" onClick={handleRetry}>
            Try Again
          </Button>
          <Button onClick={handleGoToLibrary}>Go to Library</Button>
        </div>
      </div>
    </div>
  );
}
