// Shared filter/scoring logic for Sruthi Veerepalli's resume-match search.
// Rules per CLAUDE.md rules #2 (experience level), #3 (location), #4 (clearance), #6 (resume match).

// Senior / >5yr title patterns — EXCLUDE
// "Vice President" / "SVP" spelled out: only "VP" was caught, so bank titles like
// "Process Engineering (Java) - Vice President" slipped through rule #2.
export const OVER_5YR = /\bvice president\b|\bsvp\b|\bprincipal\b|\bstaff\b|\blead\b|\barchitect\b|\bdirector\b|\bvp\b|\bhead of\b|\bmanager\b|\bexecutive\b|\bdistinguished\b|\bfellow\b/i;

// Security clearance — EXCLUDE
export const CLEARANCE = /security clearance|secret clearance|top secret|ts\/sci|dod clearance|clearance required|us citizen|u\.s\. citizen|citizenship required|must be a citizen|active clearance|public trust/i;

// US location detection
const CA_PROVINCES = new Set(['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU']);
const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);
// "(?<!New )Mexico": "Albuquerque, New Mexico" is a US state, not the country.
// The non-US cities are the ones that would otherwise pass through a "CA-"/"IN-" Workday
// prefix or a bare-city match below.
export const NON_US = /\b(Canada|Ontario|Quebec|British Columbia|Alberta|UK|United Kingdom|Ireland|India|Germany|France|Australia|Singapore|Poland|Netherlands|(?<!New )Mexico|Israel|Japan|Korea|China|Brazil|Spain|Italy|Denmark|Norway|Sweden|Switzerland|Toronto|Vancouver|Montreal|Bangalore|Bengaluru|Hyderabad|Pune|Chennai|Mumbai|Gurugram|Gurgaon|Noida|Dublin|Paris|Berlin|Munich|Amsterdam|Tokyo|Seoul|Tel Aviv|Shanghai|Beijing|Taipei|Hong Kong|Manila|Penang|Warsaw|Krakow|Budapest|Prague|Lisbon|Barcelona|Madrid|Zurich|Stockholm|São Paulo|Sao Paulo|Buenos Aires)\b/i;

// Georgia is left out on purpose: it is also a country.
const US_STATE_NAMES = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i;

// Bare city names, as Ashby and many Greenhouse boards write them ("San Francisco",
// "New York City", "NYC"). Only cities that are unambiguously American.
const US_CITIES = /\b(San Francisco|SF Bay Area|Bay Area|NYC|Brooklyn|Manhattan|Los Angeles|San Diego|San Jose|Sunnyvale|Mountain View|Palo Alto|Menlo Park|Redwood City|Santa Clara|Cupertino|Oakland|Irvine|Seattle|Bellevue|Redmond|Chicago|Boston|Austin|Dallas|Houston|San Antonio|Denver|Boulder|Atlanta|Miami|Pittsburgh|Philadelphia|Phoenix|Salt Lake City|Minneapolis|Detroit|Nashville|Raleigh|Charlotte|Columbus|Cleveland|Baltimore|Arlington|St\.? Louis|Kansas City|Indianapolis|Washington,? D\.?C\.?)\b/i;

export function isUSJob(locations: string[] | undefined): boolean {
  if (!locations || locations.length === 0) return true;
  return locations.some((loc) => {
    if (!loc) return true;
    if (NON_US.test(loc)) return false;
    if (/\bUSA?\b|\bU\.S\.(A\.)?|\bUnited States\b/i.test(loc)) return true;
    const m = loc.match(/,\s*([A-Z]{2})(?:\s*,|\s*$)/);
    if (m) {
      if (CA_PROVINCES.has(m[1])) return false;
      if (US_STATES.has(m[1])) return true;
    }
    // Workday "TX-Dallas" / "NY-New York": state code, hyphen, then a capitalised city.
    // The lowercase second letter keeps "IN-KA-BENGALURU" (an India site code) out.
    const w = loc.match(/^([A-Z]{2})\s*-\s*[A-Z][a-z]/);
    if (w && US_STATES.has(w[1])) return true;
    if (US_STATE_NAMES.test(loc) || US_CITIES.test(loc)) return true;
    if (/\bRemote\b/i.test(loc)) return true;
    return false;
  });
}

// Resume skill scoring weights — per CLAUDE.md rule #6 (score >= 5 = 60% match)
export const RESUME_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bjava\b/i, weight: 10 },
  { pattern: /\bspring boot\b/i, weight: 10 },
  { pattern: /\bspring\b/i, weight: 7 },
  { pattern: /\bmicroservices?\b/i, weight: 7 },
  { pattern: /\bfull.?stack\b/i, weight: 7 },
  { pattern: /\bangular\b/i, weight: 5 },
  { pattern: /\breact\b/i, weight: 5 },
  { pattern: /\baws\b/i, weight: 5 },
  { pattern: /\bkafka\b/i, weight: 5 },
  { pattern: /\bhibernate\b/i, weight: 5 },
  { pattern: /\bjpa\b/i, weight: 5 },
  { pattern: /\brest(ful)?\b/i, weight: 5 },
  { pattern: /\bcloud\b/i, weight: 5 },
  { pattern: /\bdocker\b/i, weight: 3 },
  { pattern: /\bkubernetes\b/i, weight: 3 },
  { pattern: /\bci\/cd\b/i, weight: 3 },
  { pattern: /\bjenkins\b/i, weight: 3 },
  { pattern: /\bsplunk\b/i, weight: 3 },
  { pattern: /\bpostgresql\b/i, weight: 3 },
  { pattern: /\bmongodb\b/i, weight: 3 },
  { pattern: /\bnode\.?js\b/i, weight: 3 },
  { pattern: /\btypescript\b/i, weight: 3 },
  { pattern: /\bj2ee\b/i, weight: 3 },
  { pattern: /\bjavascript\b/i, weight: 3 },
];

export const TARGET_ROLES = /\b(java|full.?stack|fullstack|software engineer|software developer|backend|back.end|application developer)\b/i;
export const EXCLUDE_ROLES = /\b(data scientist|machine learning|ml engineer|devops engineer|qa engineer|test engineer|security engineer|network engineer|database administrator|dba|data engineer|ui developer|ux designer|product manager|scrum master|business analyst|data analyst)\b/i;
export const RESUME_MATCH_THRESHOLD = 5;

/**
 * "Spring" the season, not the framework: "2027 Spring Logistics Co-op" scored as a Java
 * Spring role. Removed before any skill scoring.
 */
export function stripSeasonalTerms(title: string): string {
  return title.replace(/\b(?:20\d\d\s+spring|spring\s+(?:20\d\d|co-?op|intern\w*|semester|term|season(?:al)?))\b/gi, ' ');
}

export function resumeScore(title: string): number {
  let score = 0;
  const t = stripSeasonalTerms(title);
  for (const { pattern, weight } of RESUME_WEIGHTS) {
    if (pattern.test(t)) score += weight;
  }
  return score;
}

export function matchesProfile(title: string): boolean {
  if (EXCLUDE_ROLES.test(title)) return false;
  const score = resumeScore(title);
  if (score >= RESUME_MATCH_THRESHOLD) return true;
  if (score === 0 && TARGET_ROLES.test(title)) return true;
  return false;
}
