import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { ErrorBoundary } from "./ErrorBoundary";
import InstallBanner from "../components/InstallBanner";
import { InstallPromptProvider } from "../components/InstallPromptProvider";

export default function App() {
  return (
    <Providers>
      {/* Above the router on purpose. beforeinstallprompt fires once per page
          load, early, and often before the first route has settled. Mounted
          inside the router this would miss it on any navigation that remounts,
          and the strip, the inline card and the moment asks would all be left
          with a button that does nothing. Up here it is mounted once for the
          life of the page and every consumer reads the same captured event. */}
      <InstallPromptProvider>
      <BrowserRouter>
        {/* The bottom padding is the room the install strip needs. InstallBanner
            is fixed to the bottom edge, so it takes up no space in the flow and
            would otherwise sit on top of whatever ends the page: the last row
            of a list, a form's submit button, the footer. It measures itself
            into --uri-install-h and clears that back to 0px whenever it is not
            showing, so on every page without a strip this padding is nothing.
            The 0px fallback covers the first paint, before the strip has
            mounted and set the property at all. */}
        <div className="min-h-screen w-full bg-paper flex flex-col pb-[var(--uri-install-h,0px)]">
          <div className="flex-1 flex flex-col">
            <ErrorBoundary>
              <AppRoutes/>
            </ErrorBoundary>
          </div>
          <InstallBanner/>
        </div>
      </BrowserRouter>
      </InstallPromptProvider>
    </Providers>
  );
}