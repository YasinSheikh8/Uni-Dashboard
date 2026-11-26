import { QUICK_LINKS } from "@/config/links";
import { LinksBrowser } from "@/components/links-browser";
import { Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Warwick links" };

export default function LinksPage() {
  return (
    <>
      <PageHeader title="Warwick links" subtitle="Official University of Warwick services. These open the real sites in a new tab — they aren't connected to this app." />
      <div className="mb-5">
        <Notice>Services marked with a lock need your Warwick sign-in. Links were checked in November 2026.</Notice>
      </div>
      <LinksBrowser links={QUICK_LINKS} />
    </>
  );
}
