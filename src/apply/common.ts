import type { ElementHandle, Page } from 'puppeteer';

// Shared by every auto-apply filler (Greenhouse, Ashby, Lever).

export interface FillReport {
  filled: { field: string; value: string }[];
  /** Fields we had a value for but the form would not take (no matching dropdown option…). */
  failed: { field: string; value: string; reason: string }[];
  /** Required fields still empty after filling: the candidate must answer these. */
  needsYou: string[];
  resumeUploaded: boolean;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Ashby and Lever fillers tag each question block with data-jq-entry="<index>" and then act
// inside one block at a time.

/** A text-like input (not a type-ahead, file, radio or checkbox). */
export const TEXT_BOX = 'input[type=text]:not([role=combobox]), input[type=tel], input[type=email], input[type=url], input[type=number], input:not([type]), textarea';

/** First element in question block `i` matching any of the comma-separated selectors. */
export async function entryHandle(page: Page, i: number, sel: string): Promise<ElementHandle | null> {
  // Scope EVERY alternative: `[entry] a, b` would match `b` anywhere on the page (this once
  // typed the phone number into the Email box).
  return page.$(sel.split(',').map((s) => `[data-jq-entry="${i}"] ${s.trim()}`).join(', '));
}

/** Replace the value of the first `sel` box in block `i` by typing (React-safe). */
export async function typeInEntry(page: Page, i: number, sel: string, value: string): Promise<boolean> {
  const el = await entryHandle(page, i, sel);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(value, { delay: 8 });
  return true;
}
