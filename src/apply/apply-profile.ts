import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StandardAnswers } from './standard-answers.js';

// Optional answers a résumé cannot supply: a LinkedIn URL, and the yes/no questions boards
// ask (work authorization, sponsorship, "how did you hear about us"). Lives in
// apply-profile.json at the project root (git-ignored, personal); apply-profile.example.json
// shows the shape. Resolved from this file, not the cwd, because the Claude desktop app
// starts the MCP server in C:\Windows\System32.

export interface ApplyAnswer {
  /** Case-insensitive text that the form's question label contains. */
  question: string;
  /** The answer: typed into a text box, or the dropdown option to pick. */
  answer: string;
}

export interface ApplyProfile {
  /** Résumé used by jobquest:// links (set by install-auto-apply.mjs). Links never carry a path. */
  resumePath?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  phone?: string;
  city?: string;
  state?: string;
  answers?: ApplyAnswer[];
  /** Work authorization, sponsorship, pronouns, EEO: given once via `node auto-apply.mjs --setup`. */
  standard?: StandardAnswers;
}

export const APPLY_PROFILE_PATH = process.env.APPLY_PROFILE_PATH
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'apply-profile.json');

export function loadApplyProfile(file = APPLY_PROFILE_PATH): ApplyProfile {
  if (!existsSync(file)) return {};
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as ApplyProfile;
    p.answers = (p.answers ?? []).filter((a) => a && typeof a.question === 'string' && typeof a.answer === 'string' && a.question.trim());
    return p;
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`);
  }
}
