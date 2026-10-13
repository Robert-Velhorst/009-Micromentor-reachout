import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useTranslation } from "../lib/locale";

type Resolution = "uncertain" | "confirmed_sent" | "failed";

export function UncertainDeliveryControl({ resolving = false, disabled = false, paused = false, privacyMode, context, revision, onSubmit, onRefresh }: {
  resolving?: boolean;
  disabled?: boolean;
  paused?: boolean;
  privacyMode: boolean;
  context?: string | null;
  revision: unknown;
  onSubmit: (resolution: Resolution, note: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState<"" | "confirmed_sent" | "failed">("");
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  useEffect(() => { setNeedsRefresh(false); }, [revision]);
  useEffect(() => { if (privacyMode) setRevealed(false); }, [privacyMode]);
  const blocked = disabled || pending || needsRefresh || !note.trim() ||
    (resolving ? !checked || !resolution || (paused && resolution === "confirmed_sent") : paused);
  const submit = async () => {
    if (blocked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await onSubmit(resolving ? resolution as "confirmed_sent" | "failed" : "uncertain", note.trim());
      setNote("");
      setChecked(false);
      setResolution("");
    } catch (err) {
      setNeedsRefresh(true);
      setError(err instanceof Error ? err.message : "");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const visible = !privacyMode || revealed;
  return <div lang={locale} className="space-y-3 border-t pt-3">
    {context ? <div className="text-sm"><span className="font-medium">{t("delivery.context")}</span>{visible ? <p className="break-words whitespace-pre-wrap">{context}</p> : null}</div> : null}
    {!resolving ? <p className="text-xs text-muted-foreground">{t("delivery.recordHint")}</p> : null}
    {resolving ? <label className="grid gap-1 text-sm">
      <span>{t("delivery.result")}</span>
      <select value={resolution} disabled={pending} onChange={event => setResolution(event.target.value as typeof resolution)} className="h-9 rounded-md border bg-background px-2">
        <option value="">{t("delivery.choose")}</option>
        <option value="confirmed_sent" disabled={paused}>{t("delivery.sent")}</option>
        <option value="failed">{t("delivery.failed")}</option>
      </select>
    </label> : null}
    <div className="flex items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-sm">
        <span>{t(resolving ? "delivery.note" : "delivery.recordNote")}</span>
        <Input type={visible ? "text" : "password"} value={note} disabled={pending} onChange={event => setNote(event.target.value)} autoComplete="off" />
      </label>
      {privacyMode ? <Button type="button" size="icon" variant="outline" aria-label={t(revealed ? "sensitive.hide" : "sensitive.reveal")} title={t(revealed ? "sensitive.hide" : "sensitive.reveal")} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</Button> : null}
    </div>
    {resolving ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} disabled={pending} onChange={event => setChecked(event.target.checked)} className="mt-1"/><span>{t("delivery.checked")}</span></label> : null}
    {needsRefresh ? <div role="alert" className="text-sm text-red-700"><p>{t("delivery.failedSave")}</p>{error ? <p lang="en" className="break-words">{error}</p> : null}<Button type="button" variant="outline" onClick={() => void onRefresh()}><RefreshCcw className="h-4 w-4"/>{t("delivery.refresh")}</Button></div> : null}
    <Button type="button" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal" disabled={blocked} onClick={() => void submit()}>{resolving ? <Check className="h-4 w-4"/> : <AlertTriangle className="h-4 w-4"/>}{t(pending ? "delivery.saving" : resolving ? "delivery.resolve" : "delivery.record")}</Button>
  </div>;
}
