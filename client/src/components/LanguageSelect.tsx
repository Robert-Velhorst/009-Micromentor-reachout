import { useRef, useState } from "react";
import { useTranslation } from "@/lib/locale";
import type { Locale } from "@/lib/messages";

export function LanguageSelect({ onChange, disabled }: { onChange: (locale: Locale) => Promise<void>; disabled: boolean }) {
  const { locale, t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const change = async (next: string) => {
    if (disabled || pending.current || next === locale || (next !== "en" && next !== "nl")) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onChange(next);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t py-2 text-sm">
      <label htmlFor="maro-language">{t("language.label")}</label>
      <select id="maro-language" aria-label={t("language.label")} value={locale} disabled={disabled || saving} aria-busy={saving} onChange={(event) => void change(event.target.value)} className="h-8 w-32 rounded-md border bg-background px-2">
        <option value="en" lang="en">English</option>
        <option value="nl" lang="nl">Nederlands</option>
      </select>
      {saving ? <span role="status">{t("language.saving")}</span> : null}
      {failed ? <p role="alert" className="w-full text-right text-destructive">{t("language.failed")}</p> : null}
    </div>
  );
}
