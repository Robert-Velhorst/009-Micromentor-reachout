import { useTranslation } from "@/lib/locale";
import type { MessageKey } from "@/lib/messages";

export type WorkspaceNoticeValue = { message: MessageKey; details?: string };

export function WorkspaceNotice({ notice }: { notice: WorkspaceNoticeValue | null }) {
  const { t, locale } = useTranslation();
  if (!notice) return null;
  return (
    <div role="status" lang={locale} className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
      {t(notice.message)}
      {notice.details ? <span lang="en"> {notice.details}</span> : null}
    </div>
  );
}
