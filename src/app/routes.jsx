import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../features/auth/useAuth";

const FeedPage        = lazy(() => import("../features/feed/FeedPage"));
const LoginPage       = lazy(() => import("../features/auth/LoginPage"));
const OnboardingPage  = lazy(() => import("../features/auth/OnboardingPage"));
const SignupFarmer    = lazy(() => import("../features/auth/SignupFarmer"));
const SignupMerchant  = lazy(() => import("../features/auth/SignupMerchant"));
const PendingPage     = lazy(() => import("../features/merchant/PendingPage"));
const DashboardPage   = lazy(() => import("../features/merchant/DashboardPage"));
const HistoryPage     = lazy(() => import("../features/merchant/HistoryPage"));
const ProfilePage     = lazy(() => import("../features/merchant/ProfilePage"));
const AdminPage       = lazy(() => import("../features/admin/AdminPage"));
const LandingPage     = lazy(() => import("../features/landing/LandingPage"));
const AccountPage     = lazy(() => import("../features/account/AccountPage"));
const PrivacyPage     = lazy(() => import("../features/legal/PrivacyPage"));
const TermsPage       = lazy(() => import("../features/legal/TermsPage"));
const ForgotPasswordPage = lazy(() => import("../features/auth/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("../features/auth/ResetPasswordPage"));

function PageLoader() {
  return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading…</div>;
}

// Shown when a signed-in visitor's account could not be loaded (a failed
// request, not a missing row). Offers a retry instead of dropping the user into
// onboarding, which would wrongly treat a fetch failure as "no account yet".
function AuthErrorScreen({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center min-h-screen p-6">
      <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center max-w-sm w-full">
        <p className="text-sm font-semibold text-ink-700">{t("auth.profileLoadError")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm px-5 hover:bg-coorg-50 transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
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

// A brand new Google account has a session but no users row until it picks a
// role. Such a visitor is sent to onboarding from any other page, so a refresh
// mid-onboarding cannot drop them into the app half configured. Everyone else
// (logged out, or logged in with a profile) passes through untouched.
function RequireOnboarding({ children }) {
  const { isAuthenticated, profile, isLoading, profileLoadError, refetchAuth } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader/>;
  // A failed account fetch is not the same as "no account yet": show a retry
  // screen instead of routing an existing user back through onboarding.
  if (isAuthenticated && profileLoadError) return <AuthErrorScreen onRetry={refetchAuth}/>;
  if (isAuthenticated && !profile && location.pathname !== "/onboarding" && location.pathname !== "/reset-password") {
    return <Navigate to="/onboarding" replace/>;
  }
  return children;
}

// The onboarding screen itself. Only a signed-in account with no profile row
// belongs here: logged-out visitors go to login, already-onboarded users are
// bounced to their normal landing spot.
function OnboardingRoute() {
  const { isAuthenticated, profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!isAuthenticated) return <Navigate to="/login" replace/>;
  if (profile) return <Navigate to="/feed" replace/>;
  return <OnboardingPage/>;
}

// Self-service account page for any signed-in user with a profile. Logged-out
// visitors go to login; profile-less Google accounts are already routed to
// onboarding by RequireOnboarding before they reach here.
function AccountRoute() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageLoader/>;
  if (!profile) return <Navigate to="/login" replace/>;
  return <AccountPage/>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader/>}>
      <RequireOnboarding>
      <Routes>
        <Route path="/"     element={<HomeRoute/>}/>
        <Route path="/feed" element={<FeedGuard/>}/>
        <Route path="/login"             element={<GuestOnly><LoginPage/></GuestOnly>}/>
        <Route path="/onboarding"        element={<OnboardingRoute/>}/>
        <Route path="/account"           element={<AccountRoute/>}/>
        <Route path="/signup/farmer"     element={<GuestOnly><SignupFarmer/></GuestOnly>}/>
        <Route path="/signup/merchant"   element={<GuestOnly><SignupMerchant/></GuestOnly>}/>
        <Route path="/merchant/pending"   element={<MerchantPendingGuard/>}/>
        <Route path="/merchant/dashboard" element={<MerchantDashboardGuard/>}/>
        <Route path="/merchant/history"   element={<MerchantHistoryGuard/>}/>
        <Route path="/merchant/:id"       element={<ProfileGuard/>}/>
        <Route path="/admin"              element={<AdminOnly><AdminPage/></AdminOnly>}/>
        <Route path="/privacy"            element={<PrivacyPage/>}/>
        <Route path="/terms"              element={<TermsPage/>}/>
        <Route path="/forgot-password"    element={<GuestOnly><ForgotPasswordPage/></GuestOnly>}/>
        <Route path="/reset-password"     element={<ResetPasswordPage/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
      </RequireOnboarding>
    </Suspense>
  );
}