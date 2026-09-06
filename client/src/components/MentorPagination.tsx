import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { mentorPageWindow } from "@/lib/mentorPagination";
import { useTranslation } from "@/lib/locale";

export function MentorPagination({ range, total, onChange }: {
  range: ReturnType<typeof mentorPageWindow>;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t, number, locale } = useTranslation();
  return (
    <nav lang={locale} aria-label={t("pagination.pages")} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
      <span role="status" className="text-sm tabular-nums text-muted-foreground">
        {number(total ? range.start + 1 : 0)}-{number(range.end)} {t("pagination.of")} {number(total)} {t("pagination.mentors")}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label={t("pagination.previous")} title={t("pagination.previous")} disabled={range.page === 1} onClick={() => onChange(range.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <select aria-label={t("pagination.page")} className="h-8 w-28 rounded-md border bg-background px-2 text-sm tabular-nums" value={range.page} disabled={range.pageCount === 1} onChange={(event) => onChange(Number(event.target.value))}>
          {Array.from({ length: range.pageCount }, (_, index) => (
            <option key={index + 1} value={index + 1}>{index + 1} / {range.pageCount}</option>
          ))}
        </select>
        <Button variant="outline" size="icon-sm" aria-label={t("pagination.next")} title={t("pagination.next")} disabled={range.page === range.pageCount} onClick={() => onChange(range.page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
