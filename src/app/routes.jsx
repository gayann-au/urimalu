import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { getEffectiveStatus } from "../lib/constants";

const FeedPage        = lazy(() => import("../features/feed/FeedPage"));
const LoginPage       = lazy(() => import("../features/auth/LoginPage"));
const SignupFarmer    = lazy(() => import("../features/auth/SignupFarmer"));
const SignupMerchant  = lazy(() => import("../features/auth/SignupMerchant"));
const PendingPage     = lazy(() => import("../features/merchant/PendingPage"));
const DashboardPage   = lazy(() => import("../features/merchant/DashboardPage"));
const ProfilePage     = lazy(() => import("../features/merchant/ProfilePage"));
const AdminPage       = lazy(() => import("../features/admin/AdminPage"));

function PageLoader() {
  return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading…</div>;
}

function GuestOnly({ children }) {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile) return children;
  if (profile.role === "ADMIN") return <Navigate to="/admin" replace/>;
  if (profile.role === "MERCHANT") {
    const s = getEffectiveStatus(profile);
    return <Navigate to={s === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending"} replace/>;
  }
  return <Navigate to="/" replace/>;
}

function MerchantPendingGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "MERCHANT") return <Navigate to="/login" replace/>;
  if (getEffectiveStatus(profile) === "APPROVED") return <Navigate to="/merchant/dashboard" replace/>;
  return <PendingPage/>;
}

function MerchantDashboardGuard() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "MERCHANT") return <Navigate to="/login" replace/>;
  if (getEffectiveStatus(profile) !== "APPROVED") return <Navigate to="/merchant/pending" replace/>;
  return <DashboardPage/>;
}

function AdminOnly({ children }) {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile || profile.role !== "ADMIN") return <Navigate to="/login" replace/>;
  return children;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader/>}>
      <Routes>
        <Route path="/" element={<FeedPage/>}/>
        <Route path="/login"             element={<GuestOnly><LoginPage/></GuestOnly>}/>
        <Route path="/signup/farmer"     element={<GuestOnly><SignupFarmer/></GuestOnly>}/>
        <Route path="/signup/merchant"   element={<GuestOnly><SignupMerchant/></GuestOnly>}/>
        <Route path="/merchant/pending"   element={<MerchantPendingGuard/>}/>
        <Route path="/merchant/dashboard" element={<MerchantDashboardGuard/>}/>
        <Route path="/merchant/:id"       element={<ProfilePage/>}/>
        <Route path="/admin"              element={<AdminOnly><AdminPage/></AdminOnly>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </Suspense>
  );
}