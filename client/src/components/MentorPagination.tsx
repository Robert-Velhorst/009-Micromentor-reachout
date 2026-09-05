import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { mentorPageWindow } from "@/lib/mentorPagination";

export function MentorPagination({ range, total, onChange }: {
  range: ReturnType<typeof mentorPageWindow>;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Mentor pages" className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
      <span role="status" className="text-sm tabular-nums text-muted-foreground">
        {total ? range.start + 1 : 0}-{range.end} of {total.toLocaleString()} mentors
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous mentor page" title="Previous mentor page" disabled={range.page === 1} onClick={() => onChange(range.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <select aria-label="Mentor page" className="h-8 w-28 rounded-md border bg-background px-2 text-sm tabular-nums" value={range.page} disabled={range.pageCount === 1} onChange={(event) => onChange(Number(event.target.value))}>
          {Array.from({ length: range.pageCount }, (_, index) => (
            <option key={index + 1} value={index + 1}>{index + 1} / {range.pageCount}</option>
          ))}
        </select>
        <Button variant="outline" size="icon-sm" aria-label="Next mentor page" title="Next mentor page" disabled={range.page === range.pageCount} onClick={() => onChange(range.page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
