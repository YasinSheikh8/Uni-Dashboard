import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardCheck, FileText, MessageCircle, Link2, NotebookPen, Search, Settings } from "lucide-react";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "More" };

const ITEMS = [
  { href: "/ask", label: "Ask", desc: "Chatbot for anything uni-related", Icon: MessageCircle },
  { href: "/timetable", label: "Timetable", desc: "Your lectures, seminars and Moodle dates", Icon: CalendarDays },
  { href: "/assessments", label: "Deadlines & tests", desc: "Moodle quizzes, assignments and action plans", Icon: ClipboardCheck },
  { href: "/materials", label: "Materials", desc: "Slides, readings, recordings and handouts", Icon: FileText },
  { href: "/notes", label: "Notes & study guides", desc: "Your notes and AI study guides", Icon: NotebookPen },
  { href: "/links", label: "Warwick links", desc: "Tabula, My Warwick, library, support…", Icon: Link2 },
  { href: "/search", label: "Search", desc: "Search everything", Icon: Search },
  { href: "/settings", label: "Settings", desc: "Connection, timetable feed, theme, reminders", Icon: Settings },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ href, label, desc, Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-line-strong">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted" aria-hidden><Icon size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-subtle">{desc}</span>
              </span>
              <ChevronRight size={18} className="text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
