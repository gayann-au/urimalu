import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";

export function ReviewForm({ onCancel, onSubmit }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (rating < 1) return;
    setBusy(true);
    try { await onSubmit({ rating, comment: comment.trim() }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-4 mt-3 space-y-3">
      <div>
        <div className="block text-sm font-semibold text-gray-700 mb-1.5">{t("review.yourRating")}</div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(n => (
            <button type="button" key={n} onClick={() => setRating(n)} className="p-1" aria-label={`${n} star`}>
              <svg width="32" height="32" viewBox="0 0 24 24"
                fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "#cbd5e1"}
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
      <Textarea label={t("review.commentOpt")} rows={3} value={comment} onChange={e => setComment(e.target.value)}/>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" loading={busy}>{t("review.submitReview")}</Button>
      </div>
    </form>
  );
}