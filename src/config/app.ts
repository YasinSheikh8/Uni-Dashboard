/**
 * Product-level settings. Rename the product by changing APP_NAME here (or set
 * NEXT_PUBLIC_APP_NAME) — nothing else hard-codes the name.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Yasin's Dashboard";
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME || "Dashboard";
export const APP_DESCRIPTION =
  "Your lectures, materials, deadlines and timetable at the University of Warwick, in one calm place.";

/** All dates and times in the product are shown in this zone. */
export const TIMEZONE = "Europe/London";

/** Default Moodle site. Override with MOODLE_URL. */
export const DEFAULT_MOODLE_URL = "https://moodle.warwick.ac.uk";
