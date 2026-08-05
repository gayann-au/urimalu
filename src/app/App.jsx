import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { ErrorBoundary } from "./ErrorBoundary";
import InstallBanner from "../components/InstallBanner";

export default function App() {
  return (
    <Providers>
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
    </Providers>
  );
}