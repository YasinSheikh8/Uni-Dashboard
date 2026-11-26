import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-8 h-8 w-72" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Skeleton className="h-56 lg:col-span-3" />
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-44 lg:col-span-3" />
        <Skeleton className="h-44 lg:col-span-2" />
      </div>
      <span className="sr-only" role="status">Loading your data from Moodle…</span>
    </div>
  );
}
