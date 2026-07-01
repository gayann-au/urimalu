import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { ErrorBoundary } from "./ErrorBoundary";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <div className="min-h-screen w-full bg-paper flex flex-col">
          <ErrorBoundary>
            <AppRoutes/>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
    </Providers>
  );
}