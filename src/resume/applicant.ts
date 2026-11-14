import { extractName } from './build-profile.js';

// Résumé text -> the facts an application form asks for: contact details, every job held,
// and education. Pure text work (no I/O), so it is unit-tested directly.
//
// Résumés lay a job header out in many ways; the two seen in practice are
//   "Vanguard / Full Stack Developer Mar 2026 - Present"     (company / title  dates)
//   "Java Full Stack Developer | Fidelity | Mar 2023 - Present" (title | company | dates)
// so the side holding the job title is found by its wording, not by its position.

export interface YearMonth {
  year: number;
  /** 1-12; undefined when the résumé gives a year only. */
  month?: number;
}

export interface ApplicantJob {
  company: string;
  title: string;
  location?: string;
  start?: YearMonth;
  end?: YearMonth;
  current: boolean;
}

export interface ApplicantEducation {
  school: string;
  /** The degree as written, e.g. "Master of Computer Science". */
  degree?: string;
  /** Normalised level: Bachelor's / Master's / Doctorate / Associate's / MBA / High School. */
  degreeLevel?: string;
  /** Field of study, e.g. "Computer Science". */
  discipline?: string;
  start?: YearMonth;
  end?: YearMonth;
}

export interface Applicant {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  /** Digits as written, e.g. "+1 (555) 014-2233" -> "555-014-2233" for US numbers. */
  phone?: string;
  city?: string;
  state?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  experience: ApplicantJob[];
  education: ApplicantEducation[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const POINT = `(?:${MONTH_RE}\\s*,?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const OPEN_END = '(?:present|current|now|today|ongoing|till date|to date)';
/** "Mar 2023 - Present", "08/2022 – 12/2023", "2018 - 2020", "August 2022 to December 2023". */
const RANGE = new RegExp(`(${POINT})\\s*(?:-|–|—|to|until)\\s*(${POINT}|${OPEN_END})`, 'i');

const TITLE_WORDS = /\b(developer|engineer|programmer|analyst|architect|consultant|intern|manager|lead|scientist|administrator|designer|specialist|associate|director|tester|sdet|devops|admin|officer|technician|coordinator|head|president|founder|trainee)\b/i;

const SECTION = {
  experience: /^(?:professional |work |relevant |employment |career )?(?:experience|employment(?: history)?|work history)\s*:?$/i,
  education: /^(?:education(?:al)?(?: background| qualifications?)?|academics?|academic background)\s*:?$/i,
};
/** Any other heading ends the section being read. */
const OTHER_HEADING = /^(?:summary|profile|objective|(?:technical |core )?skills|technologies|tools|projects?|certifications?|awards|publications|achievements|languages|interests|references|volunteer(?:ing)?|activities|courses|training|contact)\b[^.]{0,30}:?$/i;

export function parsePoint(raw: string): YearMonth | undefined {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { year: +m[2], month: Math.min(12, Math.max(1, +m[1])) };
  m = s.match(/^([a-z]+)\.?\s*,?\s*(\d{4})$/);
  if (m) {
    const i = MONTHS.indexOf(m[1].slice(0, 3));
    return { year: +m[2], month: i >= 0 ? i + 1 : undefined };
  }
  m = s.match(/^(\d{4})$/);
  if (m) return { year: +m[1] };
  return undefined;
}

function parseRange(line: string) {
  const m = line.match(RANGE);
  if (!m) return null;
  const open = new RegExp(`^${OPEN_END}$`, 'i').test(m[2].trim());
  return {
    start: parsePoint(m[1]),
    end: open ? undefined : parsePoint(m[2]),
    current: open,
    before: line.slice(0, m.index).trim(),
    after: line.slice((m.index ?? 0) + m[0].length).trim(),
  };
}

const clean = (s: string) => s.replace(/^[\s|,/–—-]+|[\s|,/–—-]+$/g, '').replace(/\s{2,}/g, ' ').trim();

/** "Wright State University, OH" -> "Wright State University". */
function stripTrailingPlace(s: string): string {
  return clean(s.replace(/,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)(?:,\s*(?:USA|US|United States))?\s*$/, ''));
}

/** Split a résumé into the lines of each section we care about. */
function sections(text: string): { experience: string[]; education: string[] } {
  const out = { experience: [] as string[], education: [] as string[] };
  let cur: keyof typeof out | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length <= 45) {
      if (SECTION.experience.test(line)) { cur = 'experience'; continue; }
      if (SECTION.education.test(line)) { cur = 'education'; continue; }
      if (OTHER_HEADING.test(line)) { cur = null; continue; }
    }
    if (cur) out[cur].push(line);
  }
  return out;
}

/** Split a job header into company and title, whichever order it was written in. */
export function splitCompanyTitle(header: string): { company: string; title: string } | null {
  const parts = header.split(/\s+(?:\/|\||–|—|-|@|at)\s+|\s*\|\s*|,\s+/).map(clean).filter(Boolean);
  if (parts.length < 2) return null;
  const ti = parts.findIndex((p) => TITLE_WORDS.test(p));
  if (ti === -1) return { company: parts[0], title: parts[1] };
  const title = parts[ti];
  const company = parts.find((p, i) => i !== ti && !/^[A-Z]{2}$/.test(p) && !TITLE_WORDS.test(p)) ?? parts[ti === 0 ? 1 : 0];
  return { company, title };
}

function parseExperience(lines: string[]): ApplicantJob[] {
  const jobs: ApplicantJob[] = [];
  lines.forEach((line, i) => {
    if (line.length > 160 || /^[•\-*▪●◦]/.test(line)) return;
    const r = parseRange(line);
    if (!r) return;
    // Header on the date line, or (when the line is only dates) on the line above.
    let header = clean(`${r.before} ${r.after}`);
    if (!header && i > 0) header = lines[i - 1];
    const ct = splitCompanyTitle(header);
    if (!ct) return;
    const job: ApplicantJob = { ...ct, start: r.start, end: r.end, current: r.current };
    const loc = lines.slice(i + 1, i + 3).map((l) => l.match(/^location\s*:\s*(.+)$/i)?.[1]).find(Boolean);
    if (loc) job.location = loc.trim();
    jobs.push(job);
  });
  return jobs;
}

const DEGREE_LEVELS: [RegExp, string][] = [
  [/\b(?:m\.?b\.?a|master of business administration)\b/i, 'MBA'],
  [/\b(?:ph\.?\s?d|doctor(?:ate)?)\b/i, 'Doctorate'],
  [/\b(?:master'?s?|m\.?s\.?c?|m\.?tech|m\.?e|m\.?eng|m\.?a|mca)\b/i, "Master's"],
  [/\b(?:bachelor'?s?|b\.?s\.?c?|b\.?tech|b\.?e|b\.?eng|b\.?a|bca|undergraduate)\b/i, "Bachelor's"],
  [/\b(?:associate'?s?|a\.?a\.?s?)\b/i, "Associate's"],
  [/\bhigh school|diploma\b/i, 'High School'],
];
const DEGREE_LINE = /\b(?:master|bachelor|associate|doctor|ph\.?\s?d|m\.?b\.?a|b\.?tech|m\.?tech|b\.?s\.?c?|m\.?s\.?c?|b\.?e|m\.?e|b\.?a|m\.?a|mca|bca|diploma)\b/i;
const SCHOOL_LINE = /\b(?:university|college|institute|school|academy|polytechnic|iit|nit)\b/i;

function degreeParts(text: string): Pick<ApplicantEducation, 'degree' | 'degreeLevel' | 'discipline'> {
  const degree = clean(text);
  const degreeLevel = DEGREE_LEVELS.find(([re]) => re.test(degree))?.[1];
  // "Master of Science in Computer Science" -> "Computer Science"; "Master of Computer Science" -> same;
  // "MS Computer Science" -> "Computer Science".
  let discipline = degree.match(/\b(?:in|major(?:ing)? in)\s+(.+)$/i)?.[1]
    ?? degree.match(/\bof\s+(?!science\b|arts\b|engineering\b|technology\b)(.+)$/i)?.[1]
    ?? degree.match(/^(?:[A-Z]\.?){2,4}\.?\s+(?:in\s+)?(.+)$/)?.[1];
  if (discipline) discipline = clean(discipline.replace(/\(.*?\)|gpa.*$/i, ''));
  return { degree, degreeLevel, discipline: discipline || undefined };
}

function parseEducation(lines: string[]): ApplicantEducation[] {
  const out: ApplicantEducation[] = [];
  lines.forEach((line, i) => {
    if (line.length > 160 || /^relevant|^courses?|^coursework|^gpa/i.test(line)) return;
    const r = parseRange(line) ?? (() => {
      const y = line.match(/(?:graduat\w*\s*:?\s*)?(\b\d{4})\s*$/);
      return y ? { start: undefined, end: parsePoint(y[1]), current: false, before: line.slice(0, y.index).trim(), after: '' } : null;
    })();
    if (!r) return;
    const parts = clean(`${r.before} ${r.after}`).split(/\s*\|\s*|\s+[–—-]\s+|,\s+/).map(clean)
      .filter((p) => p && !/^[A-Z]{2}$/.test(p) && !/^(?:USA?|United States|India)$/i.test(p)); // drop "OH", "USA"
    let school = parts.find((p) => SCHOOL_LINE.test(p));
    let degreeText = parts.find((p) => p !== school && DEGREE_LINE.test(p));
    if (!school && parts.length) school = parts.find((p) => p !== degreeText);
    // The degree often sits on the next line ("Master of Computer Science"), or the school does.
    for (const near of [lines[i + 1], lines[i - 1]]) {
      if (!near || parseRange(near)) continue;
      if (!degreeText && DEGREE_LINE.test(near) && !SCHOOL_LINE.test(near)) degreeText = near;
      else if (!school && SCHOOL_LINE.test(near)) school = near;
    }
    if (!school) return;
    out.push({ school: stripTrailingPlace(school), ...(degreeText ? degreeParts(degreeText) : {}), start: r.start, end: r.end });
  });
  return out;
}

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

export function buildApplicant(text: string): Applicant {
  const head = text.split('\n').slice(0, 10).join('\n');
  const fullName = extractName(text);
  const [firstName, ...rest] = (fullName ?? '').split(/\s+/).filter(Boolean);

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  let phone: string | undefined;
  const ph = head.match(/(\+?\d{1,3}[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/);
  if (ph) {
    const d = ph[0].replace(/\D/g, '');
    phone = d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
      : d.length === 11 && d[0] === '1' ? `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`
        : ph[0].trim();
  }

  let city: string | undefined, state: string | undefined;
  for (const m of head.matchAll(/([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+){0,2}),\s*([A-Z]{2})\b/g)) {
    if (US_STATES.has(m[2])) { city = m[1]; state = m[2]; break; }
  }

  const url = (re: RegExp) => {
    const m = text.match(re);
    return m ? (m[0].startsWith('http') ? m[0] : `https://${m[0]}`).replace(/[).,;]+$/, '') : undefined;
  };
  const linkedin = url(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i);
  // A repo link still identifies the profile: github.com/<user>/<repo> -> github.com/<user>.
  const gh = text.match(/(?:https?:\/\/)?github\.com\/([A-Za-z0-9-]+)/i);
  const github = gh ? `https://github.com/${gh[1]}` : undefined;

  const sec = sections(text);
  return {
    firstName,
    lastName: rest.join(' ') || undefined,
    fullName,
    email,
    phone,
    city,
    state,
    linkedin,
    github,
    experience: parseExperience(sec.experience),
    education: parseEducation(sec.education),
  };
}
