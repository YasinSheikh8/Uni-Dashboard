import { FlaskConical } from "lucide-react";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Sample item" };

export default function DemoItem() {
  return (
    <>
      <PageHeader title="This is a sample item" />
      <EmptyState icon={<FlaskConical size={28} />} title="Nothing to open in demo mode">
        In live mode, this link takes you to the real page on Moodle. Connect your Moodle account to see your own materials.
      </EmptyState>
      <div className="mt-4 flex justify-center"><ButtonLink href="/settings">How to connect Moodle</ButtonLink></div>
    </>
  );
}
