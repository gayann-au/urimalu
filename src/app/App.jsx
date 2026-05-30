import { BrowserRouter } from "react-router-dom";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <div className="min-h-screen w-full flex justify-center bg-gray-50">
          <div className="w-full max-w-[430px] min-h-screen bg-white shadow-sm flex flex-col">
            <AppRoutes/>
          </div>
        </div>
      </BrowserRouter>
    </Providers>
  );
}