import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { ErrorBoundary } from "./ErrorBoundary";
import InstallBanner from "../components/InstallBanner";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <div className="min-h-screen w-full bg-paper flex flex-col">
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