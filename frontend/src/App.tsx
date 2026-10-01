import { Suspense, lazy } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import HomePage from "@/pages/HomePage";
import DiscoverPage from "@/pages/DiscoverPage";
import NotFound from "@/pages/NotFound";

const RoutePage = lazy(() => import("@/pages/RoutePage"));
const StressPage = lazy(() => import("@/pages/StressPage"));
const PlacePage = lazy(() => import("@/pages/PlacePage"));

function Fallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="skeleton h-3 w-40" />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <Suspense fallback={<Fallback />}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname.split("/").slice(0, 3).join("/")}>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover/:jobId" element={<DiscoverPage />} />
          <Route path="/route/:id" element={<RoutePage />} />
          <Route path="/route/:id/stress-test" element={<StressPage />} />
          <Route path="/place/:id" element={<PlacePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
