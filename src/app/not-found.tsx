import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <EmptyState title="Not found">That page or item doesn&apos;t exist, or Moodle no longer lists it for you.</EmptyState>
      <div className="mt-4 flex justify-center"><ButtonLink href="/">Go home</ButtonLink></div>
    </>
  );
}
