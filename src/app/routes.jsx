import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";

const FeedPage        = lazy(() => import("../features/feed/FeedPage"));
const LoginPage       = lazy(() => import("../features/auth/LoginPage"));
const SignupFarmer    = lazy(() => import("../features/auth/SignupFarmer"));
const SignupMerchant  = lazy(() => import("../features/auth/SignupMerchant"));
const PendingPage     = lazy(() => import("../features/merchant/PendingPage"));
const DashboardPage   = lazy(() => import("../features/merchant/DashboardPage"));
const HistoryPage     = lazy(() => import("../features/merchant/HistoryPage"));
const ProfilePage     = lazy(() => import("../features/merchant/ProfilePage"));
const AdminPage       = lazy(() => import("../features/admin/AdminPage"));
const LandingPage     = lazy(() => import("../features/landing/LandingPage"));

function PageLoader() {
  return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading…</div>;
}

function GuestOnly({ children }) {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile) return children;
  if (profile.role === "ADMIN") return <Navigate to="/admin" replace/>;
  if (profile.role === "MERCHANT") {
    const s = profile.status;
    return <Navigate to={s === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending"} replace/>;
  }
  return <Navigate to="/feed" replace/>;
}

function MerchantPendingGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "MERCHANT") return <Navigate to="/login" replace/>;
  if (profile.status === "APPROVED") return <Navigate to="/merchant/dashboard" replace/>;
  return <PendingPage/>;
}

function MerchantDashboardGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "MERCHANT") return <Navigate to="/login" replace/>;
  if (profile.status !== "APPROVED") return <Navigate to="/merchant/pending" replace/>;
  return <DashboardPage/>;
}

function MerchantHistoryGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "MERCHANT") return <Navigate to="/login" replace/>;
  if (profile.status !== "APPROVED") return <Navigate to="/merchant/pending" replace/>;
  return <HistoryPage/>;
}

// Any logged-in user (farmer, merchant, admin) can view a public merchant
// profile. Logged-out users are redirected to login.
function ProfileGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile) return <Navigate to="/login" replace/>;
  return <ProfilePage/>;
}

function AdminOnly({ children }) {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "ADMIN") return <Navigate to="/login" replace/>;
  return children;
}

// Merchants should never see the farmer feed. Bounce them to their dashboard.
// Farmers, admins, and logged-out users fall through to FeedPage.
function FeedGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (profile?.role === "MERCHANT") return <Navigate to="/merchant/dashboard" replace/>;
  return <FeedPage/>;
}

// Public marketing landing page lives at "/". Logged-in users skip it and go
// to the feed; FeedGuard then sends merchants on to their dashboard, so every
// signed-in role lands somewhere useful instead of the marketing page.
function HomeRoute() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (profile) return <Navigate to="/feed" replace/>;
  return <LandingPage/>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader/>}>
      <Routes>
        <Route path="/"     element={<HomeRoute/>}/>
        <Route path="/feed" element={<FeedGuard/>}/>
        <Route path="/login"             element={<GuestOnly><LoginPage/></GuestOnly>}/>
        <Route path="/signup/farmer"     element={<GuestOnly><SignupFarmer/></GuestOnly>}/>
        <Route path="/signup/merchant"   element={<GuestOnly><SignupMerchant/></GuestOnly>}/>
        <Route path="/merchant/pending"   element={<MerchantPendingGuard/>}/>
        <Route path="/merchant/dashboard" element={<MerchantDashboardGuard/>}/>
        <Route path="/merchant/history"   element={<MerchantHistoryGuard/>}/>
        <Route path="/merchant/:id"       element={<ProfileGuard/>}/>
        <Route path="/admin"              element={<AdminOnly><AdminPage/></AdminOnly>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Suspense>
  );
}