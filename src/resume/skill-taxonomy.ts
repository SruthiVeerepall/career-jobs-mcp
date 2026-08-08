/**
 * Skill / role taxonomy used to turn an arbitrary resume into a searchable profile.
 *
 * The weights mirror CLAUDE.md rule #6 (CORE 10 / HIGH 7 / MID 5 / LOW 3) so that a
 * resume matching Sruthi's profile reproduces the previously hard-coded scoring exactly.
 * Nothing here is candidate-specific — the profile builder keeps only the entries the
 * resume actually evidences.
 */

export type SkillTier = 'core' | 'high' | 'mid' | 'low';

export const TIER_WEIGHT: Record<SkillTier, number> = { core: 10, high: 7, mid: 5, low: 3 };

/**
 * Role families. A job title is assigned to exactly ONE family (most specific wins),
 * and a title whose family the resume does not claim is excluded.
 */
export type RoleFamily =
  | 'backend'
  | 'frontend'
  | 'fullstack'
  | 'mobile'
  | 'data-science'
  | 'data-engineering'
  | 'devops'
  | 'qa'
  | 'security'
  | 'embedded'
  | 'generic-swe';

export interface SkillDef {
  /** Canonical display name. */
  name: string;
  tier: SkillTier;
  /** Families this skill is evidence for. */
  families: RoleFamily[];
  /** Extra surface forms. Matched case-insensitively on word boundaries. */
  aliases?: string[];
  /**
   * Match the canonical name case-sensitively. Only for names that are also common English
   * words — `\bgo\b` matches "go live", "go to", and every other prose use of the verb, so
   * Go must be detected as "Go"/"Golang" rather than by a case-insensitive word match.
   */
  strictCase?: boolean;
}

/**
 * Tier assignment is by how strongly the skill identifies a role, not by how hard it is:
 * a language/primary framework (`core`) says more about which jobs fit than a build tool
 * (`low`) does.
 */
export const SKILLS: SkillDef[] = [
  // ---- languages / primary frameworks (core) ----
  { name: 'Java', tier: 'core', families: ['backend'], aliases: ['java 8', 'java 11', 'java 17', 'core java'] },
  { name: 'Spring Boot', tier: 'core', families: ['backend'], aliases: ['springboot'] },
  { name: 'C#', tier: 'core', families: ['backend'], aliases: ['c sharp', 'csharp'] },
  { name: '.NET', tier: 'core', families: ['backend'], aliases: ['dotnet', 'asp.net', '.net core'] },
  { name: 'Python', tier: 'core', families: ['backend', 'data-science', 'data-engineering'] },
  { name: 'Go', tier: 'core', families: ['backend'], aliases: ['golang'], strictCase: true },
  { name: 'Ruby on Rails', tier: 'core', families: ['backend'], aliases: ['rails'] },
  { name: 'PHP', tier: 'core', families: ['backend'], aliases: ['laravel'] },
  { name: 'Rust', tier: 'core', families: ['backend', 'embedded'] },
  { name: 'Scala', tier: 'core', families: ['backend', 'data-engineering'] },
  { name: 'Kotlin', tier: 'core', families: ['backend', 'mobile'] },
  { name: 'C++', tier: 'core', families: ['embedded', 'backend'], aliases: ['cpp'] },
  { name: 'Swift', tier: 'core', families: ['mobile'] },

  // ---- frameworks / architecture (high) ----
  { name: 'Spring', tier: 'high', families: ['backend'], aliases: ['spring mvc', 'spring cloud', 'spring batch', 'spring security', 'spring framework'] },
  { name: 'Microservices', tier: 'high', families: ['backend'], aliases: ['microservice'] },
  { name: 'Full Stack', tier: 'high', families: ['fullstack'], aliases: ['full-stack', 'fullstack', 'full stack'] },
  { name: 'Django', tier: 'high', families: ['backend'] },
  { name: 'Flask', tier: 'high', families: ['backend'] },
  { name: 'FastAPI', tier: 'high', families: ['backend'] },
  { name: 'Express', tier: 'high', families: ['backend'], aliases: ['express.js', 'expressjs'] },
  { name: 'GraphQL', tier: 'high', families: ['backend'] },

  // ---- frontend (mid) ----
  { name: 'Angular', tier: 'mid', families: ['frontend'], aliases: ['angularjs'] },
  { name: 'React', tier: 'mid', families: ['frontend'], aliases: ['react.js', 'reactjs'] },
  { name: 'Vue', tier: 'mid', families: ['frontend'], aliases: ['vue.js', 'vuejs'] },
  { name: 'Svelte', tier: 'mid', families: ['frontend'] },
  { name: 'Next.js', tier: 'mid', families: ['frontend'], aliases: ['nextjs'] },

  // ---- cloud / messaging / persistence (mid) ----
  { name: 'AWS', tier: 'mid', families: ['backend', 'devops'], aliases: ['amazon web services'] },
  { name: 'Azure', tier: 'mid', families: ['backend', 'devops'] },
  { name: 'GCP', tier: 'mid', families: ['backend', 'devops'], aliases: ['google cloud'] },
  { name: 'Cloud', tier: 'mid', families: ['backend', 'devops'] },
  { name: 'Kafka', tier: 'mid', families: ['backend', 'data-engineering'], aliases: ['apache kafka'] },
  { name: 'Hibernate', tier: 'mid', families: ['backend'] },
  { name: 'JPA', tier: 'mid', families: ['backend'] },
  { name: 'REST', tier: 'mid', families: ['backend'], aliases: ['restful', 'rest api'] },
  { name: 'RabbitMQ', tier: 'mid', families: ['backend'] },

  // ---- tooling / platform (low) ----
  { name: 'Docker', tier: 'low', families: ['devops', 'backend'] },
  { name: 'Kubernetes', tier: 'low', families: ['devops'], aliases: ['k8s', 'eks', 'aks'] },
  { name: 'Terraform', tier: 'low', families: ['devops'] },
  { name: 'Jenkins', tier: 'low', families: ['devops'] },
  { name: 'CI/CD', tier: 'low', families: ['devops'], aliases: ['ci cd', 'continuous integration'] },
  { name: 'GitHub Actions', tier: 'low', families: ['devops'] },
  { name: 'Ansible', tier: 'low', families: ['devops'] },
  { name: 'Prometheus', tier: 'low', families: ['devops'] },
  { name: 'Splunk', tier: 'low', families: ['devops', 'backend'] },
  { name: 'TypeScript', tier: 'low', families: ['frontend', 'backend'] },
  { name: 'JavaScript', tier: 'low', families: ['frontend'] },
  { name: 'Node.js', tier: 'low', families: ['backend'], aliases: ['nodejs', 'node js'] },
  { name: 'HTML', tier: 'low', families: ['frontend'], aliases: ['html5'] },
  { name: 'CSS', tier: 'low', families: ['frontend'], aliases: ['css3', 'sass', 'scss'] },
  { name: 'PostgreSQL', tier: 'low', families: ['backend'], aliases: ['postgres'] },
  { name: 'MySQL', tier: 'low', families: ['backend'] },
  { name: 'MongoDB', tier: 'low', families: ['backend'] },
  { name: 'Oracle', tier: 'low', families: ['backend'] },
  { name: 'DynamoDB', tier: 'low', families: ['backend'] },
  { name: 'Redis', tier: 'low', families: ['backend'] },
  { name: 'J2EE', tier: 'low', families: ['backend'], aliases: ['jakarta ee', 'java ee'] },
  { name: 'JUnit', tier: 'low', families: ['backend', 'qa'] },
  { name: 'Selenium', tier: 'low', families: ['qa'] },
  { name: 'Playwright', tier: 'low', families: ['qa', 'frontend'] },
  { name: 'Cypress', tier: 'low', families: ['qa'] },

  // ---- specialist families (kept so a specialist resume claims them) ----
  { name: 'Machine Learning', tier: 'core', families: ['data-science'], aliases: ['deep learning'] },
  { name: 'TensorFlow', tier: 'high', families: ['data-science'] },
  { name: 'PyTorch', tier: 'high', families: ['data-science'] },
  { name: 'scikit-learn', tier: 'high', families: ['data-science'], aliases: ['sklearn'] },
  { name: 'Pandas', tier: 'mid', families: ['data-science', 'data-engineering'] },
  { name: 'NLP', tier: 'mid', families: ['data-science'], aliases: ['natural language processing'] },
  { name: 'Spark', tier: 'core', families: ['data-engineering'], aliases: ['apache spark', 'pyspark'] },
  { name: 'Airflow', tier: 'high', families: ['data-engineering'] },
  { name: 'Snowflake', tier: 'high', families: ['data-engineering'] },
  { name: 'dbt', tier: 'high', families: ['data-engineering'] },
  { name: 'ETL', tier: 'mid', families: ['data-engineering'] },
  { name: 'Android', tier: 'core', families: ['mobile'] },
  { name: 'iOS', tier: 'core', families: ['mobile'] },
  { name: 'React Native', tier: 'high', families: ['mobile'] },
  { name: 'Flutter', tier: 'core', families: ['mobile'] },
  { name: 'Penetration Testing', tier: 'core', families: ['security'], aliases: ['pentesting'] },
  { name: 'SIEM', tier: 'high', families: ['security'] },
  { name: 'Embedded C', tier: 'core', families: ['embedded'], aliases: ['firmware', 'rtos'] },
];

/**
 * Job-title → family. Evaluated in array order, so specialist families must come BEFORE
 * `generic-swe`: "Machine Learning Engineer" contains "engineer" and would otherwise be
 * read as a generic software role and let through.
 */
export interface FamilyDef {
  family: RoleFamily;
  label: string;
  titlePattern: RegExp;
}

export const FAMILY_TITLE_RULES: FamilyDef[] = [
  { family: 'data-science', label: 'Data Science / ML', titlePattern: /\b(data scientist|machine learning|ml engineer|ai engineer|deep learning|research scientist|nlp engineer|computer vision)\b/i },
  { family: 'data-engineering', label: 'Data Engineering', titlePattern: /\b(data engineer|analytics engineer|etl developer|bi developer|data warehouse|big data)\b/i },
  { family: 'devops', label: 'DevOps / SRE / Platform', titlePattern: /\b(devops|sre|site reliability|platform engineer|infrastructure engineer|cloud engineer|systems engineer|release engineer)\b/i },
  { family: 'qa', label: 'QA / Test', titlePattern: /\b(qa|quality assurance|test engineer|sdet|automation engineer|testing engineer)\b/i },
  { family: 'security', label: 'Security', titlePattern: /\b(security engineer|security analyst|appsec|infosec|penetration tester|cyber)\b/i },
  { family: 'mobile', label: 'Mobile', titlePattern: /\b(ios|android|mobile|react native|flutter) (developer|engineer)\b/i },
  { family: 'embedded', label: 'Embedded / Firmware', titlePattern: /\b(embedded|firmware|hardware) (developer|engineer)\b/i },
  { family: 'fullstack', label: 'Full Stack', titlePattern: /\bfull.?stack\b/i },
  { family: 'frontend', label: 'Frontend', titlePattern: /\b(front.?end|ui developer|ui engineer|web developer|javascript developer|angular developer|react developer)\b/i },
  { family: 'backend', label: 'Backend', titlePattern: /\b(back.?end|java|python|golang|go|\.net|c#|node\.?js|ruby|php|scala|kotlin|api|server.side|middleware|j2ee) (developer|engineer|programmer)\b|\b(java|python|\.net|backend|back.end) (software )?(developer|engineer)\b/i },
  { family: 'generic-swe', label: 'General Software Engineering', titlePattern: /\b(software (engineer|developer|development engineer)|application (developer|engineer)|programmer|sde|swe|computer scientist|member of technical staff)\b/i },
];

/** Roles that are never a fit regardless of family — not engineering-IC positions. */
export const NON_ENGINEERING_TITLE = /\b(product manager|project manager|program manager|scrum master|business analyst|data analyst|technical writer|ux designer|ui designer|graphic designer|recruiter|sales|account executive|marketing|customer success|support (engineer|specialist)|solutions? (architect|consultant)|pre.?sales)\b/i;

/**
 * Seniority ladder. `rank` is what the level filter compares — a title above the
 * candidate's ceiling asks for more experience than the resume shows, and a title far
 * below it is a downgrade the candidate would not be shortlisted for.
 */
export interface SeniorityRung {
  rank: number;
  level: string;
  pattern: RegExp;
}

export const SENIORITY_RUNGS: SeniorityRung[] = [
  { rank: 0, level: 'Intern', pattern: /\b(intern|internship|co.?op|trainee|apprentice)\b/i },
  { rank: 1, level: 'Entry', pattern: /\b(entry.?level|junior|jr\.?|associate|graduate|new grad|campus)\b/i },
  { rank: 3, level: 'Senior', pattern: /\b(senior|sr\.?|snr)\b/i },
  { rank: 4, level: 'Lead', pattern: /\b(lead|staff)\b/i },
  { rank: 5, level: 'Principal', pattern: /\b(principal|architect|distinguished|fellow)\b/i },
  { rank: 6, level: 'Manager', pattern: /\b(manager|head of|supervisor)\b/i },
  { rank: 7, level: 'Director', pattern: /\b(director)\b/i },
  { rank: 8, level: 'Executive', pattern: /\b(vp|vice president|svp|chief|cto|executive)\b/i },
];

/** Rung used when a title carries no seniority marker at all. */
export const DEFAULT_RUNG = 2; // "Mid"

/**
 * Highest rung a candidate with `years` of experience is a credible applicant for.
 * 5 years → 3 (Senior), which is exactly the ceiling CLAUDE.md rule #2 states.
 * Capped at Principal: this tool targets IC roles, and a management ceiling is raised
 * only when the resume itself shows a management title.
 */
export function ceilingForYears(years: number | undefined): number {
  if (years === undefined) return 3;
  if (years < 1) return 1;
  if (years < 3) return 2;
  if (years < 8) return 3;
  if (years < 12) return 4;
  return 5;
}

/** Highest seniority rung named by a title, or DEFAULT_RUNG when unmarked. */
export function titleRank(title: string): number {
  let rank = -1;
  for (const rung of SENIORITY_RUNGS) {
    if (rung.pattern.test(title)) rank = Math.max(rank, rung.rank);
  }
  return rank === -1 ? DEFAULT_RUNG : rank;
}

export function levelLabel(rank: number): string {
  if (rank === DEFAULT_RUNG) return 'Mid';
  const rung = SENIORITY_RUNGS.find((r) => r.rank === rank);
  return rung ? rung.level : 'Mid';
}

/** Family a job title belongs to, or null when the title names no known family. */
export function familyOfTitle(title: string): RoleFamily | null {
  for (const rule of FAMILY_TITLE_RULES) {
    if (rule.titlePattern.test(title)) return rule.family;
  }
  return null;
}

/** Word-boundary matcher for a skill name or alias, safe for `.`/`+`/`#` in names. */
export function skillPattern(term: string, strictCase = false): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b fails next to `+`/`#` (non-word chars), so guard with a non-word lookaround there.
  const lead = /^\w/.test(term) ? '\\b' : '(?<![\\w])';
  const tail = /\w$/.test(term) ? '\\b' : '(?![\\w])';
  return new RegExp(`${lead}${escaped}${tail}`, strictCase ? '' : 'i');
}

/** Every surface form of a skill: canonical name first, then aliases. */
export function skillTerms(skill: SkillDef): string[] {
  return [skill.name, ...(skill.aliases ?? [])];
}
