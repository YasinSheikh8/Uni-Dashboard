/**
 * Official Warwick services. These are plain links — nothing here is synced
 * into the app. Each URL was checked on 26 Nov 2026 (it either loaded or
 * redirected to Warwick sign-in). Re-check occasionally: university sites move.
 */
export interface QuickLink {
  title: string;
  description: string;
  url: string;
  category: "Learning" | "Admin & records" | "Support" | "Campus" | "Communication";
  keywords?: string;
  needsSignIn?: boolean;
}

export const QUICK_LINKS: QuickLink[] = [
  { title: "Moodle", description: "Module pages, materials, quizzes and Moodle assignments.", url: "https://moodle.warwick.ac.uk/", category: "Learning", keywords: "vle courses lectures", needsSignIn: true },
  { title: "Tabula", description: "Coursework submission, feedback, attendance, personal tutor and your timetable.", url: "https://tabula.warwick.ac.uk/", category: "Learning", keywords: "coursework submit timetable attendance tutor", needsSignIn: true },
  { title: "Tabula coursework", description: "Assignments submitted through Tabula rather than Moodle.", url: "https://tabula.warwick.ac.uk/coursework", category: "Learning", keywords: "submit essay deadline feedback", needsSignIn: true },
  { title: "Tabula profile & timetable", description: "Your student profile; the timetable and its calendar subscription link live here.", url: "https://tabula.warwick.ac.uk/profiles", category: "Learning", keywords: "timetable ical calendar subscribe lectures seminars", needsSignIn: true },
  { title: "My Warwick", description: "University alerts, news, timetable and activity in one place.", url: "https://my.warwick.ac.uk/", category: "Communication", keywords: "app alerts notifications", needsSignIn: true },
  { title: "Library", description: "Library search, opening hours, study spaces and subject support.", url: "https://warwick.ac.uk/services/library/", category: "Learning", keywords: "books journals reading study space" },
  { title: "Modules, marks & assessment", description: "Exam timetables, assessment rules and results information.", url: "https://warwick.ac.uk/services/academicoffice/examinations/", category: "Admin & records", keywords: "exams results marks resits timetable" },
  { title: "Student records", description: "Enrolment, registration, certificates, letters and personal details.", url: "https://warwick.ac.uk/services/academicoffice/studentrecords/", category: "Admin & records", keywords: "enrolment status letter transcript" },
  { title: "Student finance", description: "Fees, funding, bursaries and payments.", url: "https://warwick.ac.uk/services/academicoffice/studentfinance/", category: "Admin & records", keywords: "fees money bursary payment" },
  { title: "Warwick email", description: "How to get to your Warwick email (Microsoft 365) on any device.", url: "https://warwick.ac.uk/services/idg/learning-resources/knowledge/how-to-access-your-email/", category: "Communication", keywords: "outlook mail office 365" },
  { title: "IT services & support", description: "Help with accounts, Wi-Fi, software and devices.", url: "https://warwick.ac.uk/services/idg/services-support/", category: "Support", keywords: "it help desk password wifi software" },
  { title: "Wellbeing & Student Support", description: "Wellbeing, disability, mental health and counselling support.", url: "https://warwick.ac.uk/services/wss/", category: "Support", keywords: "mental health counselling disability wellbeing" },
  { title: "Self-help resources", description: "Wellbeing guides and resources you can use any time.", url: "https://warwick.ac.uk/services/wss/topics/", category: "Support", keywords: "stress anxiety sleep" },
  { title: "Student Careers", description: "Careers advice, jobs, internships and appointments.", url: "https://warwick.ac.uk/services/careers/", category: "Support", keywords: "jobs internships cv" },
  { title: "Campus maps", description: "Find buildings, rooms and facilities on campus.", url: "https://warwick.ac.uk/about/visiting/maps/", category: "Campus", keywords: "map building room directions" },
  { title: "Transport & travel", description: "Buses, cycling, parking and getting to campus.", url: "https://warwick.ac.uk/services/estates/transport/", category: "Campus", keywords: "bus parking cycle travel" },
  { title: "Warwick SU", description: "Students' Union: societies, advice and events.", url: "https://www.warwicksu.com/", category: "Campus", keywords: "union societies sports events advice" },
];
