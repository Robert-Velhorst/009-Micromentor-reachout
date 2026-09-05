const PAGE_SIZE = 25;

export function mentorPageWindow(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.min(pageCount, Math.max(1, Math.floor(requestedPage)))
    : 1;
  const start = (page - 1) * PAGE_SIZE;
  return { page, pageCount, start, end: Math.min(total, start + PAGE_SIZE) };
}
