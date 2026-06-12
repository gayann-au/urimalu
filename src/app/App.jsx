import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <div className="min-h-screen w-full bg-white flex flex-col">
          <AppRoutes/>
        </div>
      </BrowserRouter>
    </Providers>
  );
}