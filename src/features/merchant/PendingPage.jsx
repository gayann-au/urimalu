import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { CheckIcon } from "../../components/icons/Sprite";
import { useAuth, useLogout } from "../auth/useAuth";
import SignupMerchant from "../auth/SignupMerchant";
import { pendingMsLeft, formatDuration } from "../../lib/constants";
import { qk } from "../../lib/queryClient";
import { supabase } from "../../lib/supabase";

export default function PendingPage() {
  const { t } = useTranslation();
  const { profile, refetchProfile } = useAuth();
  const nav = useNavigate();
  const logout = useLogout();
  const qc = useQueryClient();
  const [, setTick] = useState(0);
  const [resubmitMode, setResubmitMode] = useState(false);
  const [autoApproving, setAutoApproving] = useState(false);
  const [autoApproveError, setAutoApproveError] = useState(false);
  const autoApproveFired = useRef(false);

  useEffect(() => {
    const minute = setInterval(() => setTick(t => t + 1), 60_000);
    const poll = setInterval(() => {
      refetchProfile();
      qc.invalidateQueries({ queryKey: qk.users });
    }, 10_000);
    return () => { clearInterval(minute); clearInterval(poll); };
  }, [refetchProfile, qc]);

  useEffect(() => {
    if (profile && profile.status === "APPROVED") {
      nav("/merchant/dashboard", { replace: true, state: { welcome: true } });
    }
  }, [profile, nav]);

  const runAutoApprove = async () => {
    setAutoApproving(true);
    setAutoApproveError(false);
    try {
      const { data, error } = await supabase.rpc("auto_approve_self");
      if (error || !data?.approved) {
        setAutoApproveError(true);
      } else {
        refetchProfile();
        qc.invalidateQueries({ queryKey: qk.users });
      }
    } catch {
      setAutoApproveError(true);
    } finally {
      setAutoApproving(false);
    }
  };

  // No dep array: the countdown only crosses zero via the minute tick, which
  // re-renders without changing `profile`. The ref keeps the automatic call
  // to a single attempt; retries go through the banner button.
  useEffect(() => {
    if (autoApproveFired.current) return;
    if (!profile || profile.status !== "PENDING") return;
    if (pendingMsLeft(profile) > 0) return;
    autoApproveFired.current = true;
    runAutoApprove();
  });

  if (!profile) return null;

  if (resubmitMode) {
    return (
      <SignupMerchant
        resubmitMode
        prefill={profile}
        onAfterResubmit={() => {
          setResubmitMode(false);
          refetchProfile();
          qc.invalidateQueries({ queryKey: qk.users });
        }}
      />
    );
  }

  const status = profile.status;
  const wasRejectedAndResubmittable = (status === "PENDING" || status === "REJECTED") && profile.rejection_reason;

  const ms = pendingMsLeft(profile);

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header/>
      <main className="w-full max-w-md px-5 py-8 flex-1 flex flex-col items-center text-center">
        {wasRejectedAndResubmittable && (
          <div className="w-full max-w-sm mb-6 rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-4 text-left">
            <div className="text-xs uppercase tracking-wider font-bold text-amber-800 mb-1">{t("pending.rejectionTitle")}</div>
            <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{profile.rejection_reason}</p>
            <Button variant="amber" className="mt-3 w-full" onClick={() => setResubmitMode(true)}>
              {t("pending.fixResubmit")}
            </Button>
          </div>
        )}

        <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
          <CheckIcon/>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">{t("pending.title")}</h2>
        <p className="text-base text-gray-600 mt-2 max-w-sm">{t("pending.sub")}</p>

        <div className="mt-6 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 text-left w-full max-w-sm">
          <div className="font-bold text-gray-900">{profile.business_name}</div>
          <div className="text-sm text-gray-600">{profile.town}, {profile.district}</div>
        </div>

        {status !== "REJECTED" && (
          <div className="mt-4 rounded-2xl bg-amber-50 border-2 border-amber-200 px-5 py-4 w-full max-w-sm">
            <div className="text-xs uppercase tracking-wide font-bold text-amber-700">{t("pending.autoApprove")}</div>
            <div className="text-3xl font-extrabold text-amber-900 mt-1 tabular-nums">{formatDuration(ms)}</div>
          </div>
        )}

        {status !== "REJECTED" && autoApproveError && (
          <div className="mt-4 rounded-2xl bg-red-50 border-2 border-red-300 px-4 py-4 w-full max-w-sm text-left">
            <p className="text-sm text-red-900">{t("pending.autoApproveError", "Automatic approval failed. Please try again.")}</p>
            <Button variant="danger" className="mt-3 w-full" loading={autoApproving} onClick={runAutoApprove}>
              {t("pending.autoApproveRetry", "Retry approval")}
            </Button>
          </div>
        )}

        {status !== "REJECTED" && (
          <div className="mt-4 rounded-2xl bg-coorg-50 border border-coorg-200 px-4 py-3 w-full max-w-sm text-left">
            <div className="text-xs uppercase tracking-wider font-bold text-coorg-800 mb-2">{t("pending.prepareTitle")}</div>
            <ul className="text-sm text-coorg-900 space-y-1">
              <li>- {t("pending.prepare1")}</li>
              <li>- {t("pending.prepare2")}</li>
              <li>- {t("pending.prepare3")}</li>
              <li>- {t("pending.prepare4")}</li>
            </ul>
          </div>
        )}

        <button
          onClick={() => logout.mutate()}
          className="mt-6 text-sm text-gray-400 underline">
          {t("nav.logout")}
        </button>
      </main>
    </div>
  );
}