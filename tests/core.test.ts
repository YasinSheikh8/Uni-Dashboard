import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs, parseIcsDate } from "../src/lib/timetable/ics";
import { formatTime, londonDateKey, londonDayRange, londonWallToUtc, weekStartKey } from "../src/lib/time";
import { classifyResource, parseSectionName, sanitizeHtml } from "../src/lib/classify";
import { renderMarkdown } from "../src/lib/markdown";
import { rankWork } from "../src/lib/priorities";
import { encodeParams } from "../src/lib/moodle/client";
import { splitCourseName } from "../src/lib/data/moodle-source";
import type { Assessment } from "../src/lib/data/model";

test("London wall time handles GMT and BST", () => {
  assert.equal(new Date(londonWallToUtc(2026, 1, 15, 9)).toISOString(), "2026-01-15T09:00:00.000Z");
  assert.equal(new Date(londonWallToUtc(2026, 7, 15, 9)).toISOString(), "2026-07-15T08:00:00.000Z");
  // Day of the October clock change is 25 hours long.
  const { start, end } = londonDayRange("2026-10-25");
  assert.equal((end - start) / 3_600_000, 25);
  assert.equal(formatTime(Date.parse("2026-07-01T17:00:00Z")), "18:00");
  assert.equal(londonDateKey(Date.parse("2026-06-30T23:30:00Z")), "2026-07-01");
  assert.equal(weekStartKey("2026-11-26"), "2026-11-23");
});

test("ICS: TZID, UTC, all-day, recurrence with exdate, cancelled", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:a", "SUMMARY:EC107 Lecture", "DTSTART;TZID=Europe/London:20261124T100000", "DTEND;TZID=Europe/London:20261124T110000", "LOCATION:OC0.03\\, Oculus", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b", "SUMMARY:Seminar", "DTSTART:20260701T090000Z", "DURATION:PT1H", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c", "SUMMARY:Reading week", "DTSTART;VALUE=DATE:20261109", "END:VEVENT",
    "BEGIN:VEVENT", "UID:d", "SUMMARY:Weekly class", "DTSTART;TZID=Europe/London:20261019T140000", "DTEND;TZID=Europe/London:20261019T150000", "RRULE:FREQ=WEEKLY;COUNT=4", "EXDATE;TZID=Europe/London:20261026T140000", "END:VEVENT",
    "BEGIN:VEVENT", "UID:e", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261124T120000Z", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const ev = parseIcs(ics);
  const lec = ev.find((e) => e.uid === "a")!;
  assert.equal(new Date(lec.start).toISOString(), "2026-11-24T10:00:00.000Z");
  assert.equal(lec.location, "OC0.03, Oculus");
  assert.equal(ev.find((e) => e.uid === "b")!.end! - ev.find((e) => e.uid === "b")!.start, 3_600_000);
  assert.equal(ev.find((e) => e.uid === "c")!.allDay, true);
  const weekly = ev.filter((e) => e.summary === "Weekly class").map((e) => new Date(e.start).toISOString());
  // 19 Oct is BST (13:00Z); 26 Oct excluded; Nov dates are GMT (14:00Z). COUNT includes the excluded one.
  assert.deepEqual(weekly, ["2026-10-19T13:00:00.000Z", "2026-11-02T14:00:00.000Z", "2026-11-09T14:00:00.000Z"]);
  assert.ok(!ev.some((e) => e.summary === "Gone"));
  assert.equal(parseIcsDate("garbage"), null);
});

test("section names and resource kinds", () => {
  assert.deepEqual(parseSectionName("Term 1, Week 3 - Liberty, Order"), { week: 3, term: 1, topic: "Liberty, Order" });
  assert.equal(parseSectionName("Term 1 - Unit 2: Technology and Incentives").topic, "Unit 2: Technology and Incentives");
  assert.equal(classifyResource("resource", "Unit 1 lecture slides", ["application/pdf"]), "slides");
  assert.equal(classifyResource("lti", "Week 6: Live Lecture Video (53 mins)", []), "recording");
  assert.equal(classifyResource("lti", "Turnitin", []), "tool");
  assert.equal(classifyResource("url", "Alexander Karalis Isaac - Book a Slot", []), "link");
  assert.equal(classifyResource("resource", "Unit 1 homework", ["application/pdf"]), "exercise");
});

test("course names", () => {
  assert.deepEqual(splitCourseName("IP121 (26/27)", "IP121:Truth and Misinformation"), { code: "IP121", title: "Truth and Misinformation" });
  assert.deepEqual(splitCourseName("RME(26/27)", "Refresher Mathematics for Economics (26/27)"), { code: "RME", title: "Refresher Mathematics for Economics" });
});

test("sanitizer strips scripts, attributes, tokens and images", () => {
  const out = sanitizeHtml(
    `<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://moodle.warwick.ac.uk/webservice/pluginfile.php/1/a.pdf?token=SECRET">file</a><img src="x"></p><iframe src="e"></iframe>`,
    "https://moodle.warwick.ac.uk",
  );
  assert.ok(!/script|onclick|javascript|SECRET|iframe|<img/i.test(out), out);
  assert.ok(out.includes('href="https://moodle.warwick.ac.uk/pluginfile.php/1/a.pdf"'));
});

test("markdown escapes HTML and only allows http(s) links", () => {
  const html = renderMarkdown("## Title\n- [ ] task [S1]\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1)) [ok](https://example.com)");
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('class="cite"'));
});

test("Moodle param encoding", () => {
  const p = encodeParams({ courseids: [1, 2], options: { userevents: true, timestart: 5 }, events: { courseids: [7] } });
  assert.equal(decodeURIComponent(p.toString()), "courseids[0]=1&courseids[1]=2&options[userevents]=1&options[timestart]=5&events[courseids][0]=7");
});

test("work ranking", () => {
  const now = Date.parse("2026-11-26T09:00:00Z");
  const base = { courseId: 1, moduleCode: "X", url: "", attachments: [], officialFacts: [], missing: [], sourceLabel: "", status: "unknown" as const, statusLabel: "" };
  const list: Assessment[] = [
    { ...base, key: "quiz-1", kind: "quiz", title: "Later", dueAt: now + 10 * 86400000, done: false },
    { ...base, key: "quiz-2", kind: "quiz", title: "Soon", dueAt: now + 5 * 3600000, done: false },
    { ...base, key: "quiz-3", kind: "quiz", title: "Done", dueAt: now + 3600000, done: true },
    { ...base, key: "quiz-4", kind: "quiz", title: "Closed quiz", dueAt: now - 3600000, done: false },
    { ...base, key: "assign-5", kind: "assignment", title: "Late essay", dueAt: now - 3600000, done: false },
    { ...base, key: "quiz-6", kind: "quiz", title: "Far future", opensAt: now + 30 * 86400000, dueAt: now + 40 * 86400000, done: false },
  ];
  const r = rankWork(list, new Map([["quiz-1", { done: 2, total: 2 }]]), now);
  assert.deepEqual(r.map((x) => x.assessment.title), ["Late essay", "Soon"]);
  assert.equal(r[1].urgency, "today");
});

import { sessionTypeFrom } from "../src/lib/timetable/source";
test("lecture/seminar from Tabula titles", () => {
  assert.equal(sessionTypeFrom("EC134 Topics in Macro and International Economics EC134L"), "lecture");
  assert.equal(sessionTypeFrom("EC107 Economics 1 EC107 & EC137 Lecture - Group A"), "lecture");
  assert.equal(sessionTypeFrom("EC107 Economics 1 EC107S {3-10}"), "seminar");
  assert.equal(sessionTypeFrom("IP121 Truth and Misinformation Group 1"), "seminar");
  assert.equal(sessionTypeFrom("Personal Tutor Meeting"), "other");
});

import { decide } from "../src/lib/ai/auto-notes";
import type { Note } from "../src/lib/store/user-data";
test("automatic notes never overwrite your own and only rerun on change", () => {
  const base: Note = { id: "1", title: "t", body: "x", tags: [], origin: "ai", createdAt: 0, updatedAt: 0, autoFingerprint: "a" };
  assert.equal(decide("a", undefined, undefined), "generate");
  assert.equal(decide("a", base, undefined), "up-to-date");
  assert.equal(decide("b", base, undefined), "generate");
  assert.equal(decide("b", { ...base, editedByUser: true }, undefined), "kept-yours");
  assert.equal(decide("b", { ...base, origin: "personal" }, undefined), "kept-yours");
  assert.equal(decide("a", undefined, { fp: "a", status: "unreadable", at: 0 }), "unreadable");
  assert.equal(decide("b", undefined, { fp: "a", status: "unreadable", at: 0 }), "generate");
});
