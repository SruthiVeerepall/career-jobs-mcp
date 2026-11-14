import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';

// One headless Chrome for every browser-driven scraper (iCIMS, custom, Tesla).
//
// Each of those modules used to keep its own `sharedBrowser` and nothing closed them, so a
// CLI run that scraped any of them printed its results and then never exited — the open
// browser held the event loop — and scripts that force-exited left orphaned Chrome
// processes behind. One instance, one `closeSharedBrowser()` that every entry point calls.

let sharedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser?.connected) return sharedBrowser;
  // Concurrent scrapers must not each launch a Chrome while the first one is starting.
  launching ??= puppeteer
    .launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    })
    .then((b) => {
      sharedBrowser = b;
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

// A second, VISIBLE Chrome for auto-apply: the filled application has to stay on screen for
// the candidate to review and submit, which the headless scraping browser cannot do. It
// keeps a persistent profile under data/ so a Greenhouse sign-in or cookie banner answered
// once stays answered. Resolved from this file's location, not the cwd: the Claude desktop
// app starts the MCP server in C:\Windows\System32.
const APPLY_PROFILE_DIR = process.env.APPLY_CHROME_PROFILE
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'apply-chrome-profile');

let visibleBrowser: Browser | null = null;
let launchingVisible: Promise<Browser> | null = null;

function launchVisible(userDataDir: string) {
  return puppeteer.launch({
    headless: process.env.APPLY_HEADLESS === 'true', // tests only; a hidden form is useless
    defaultViewport: null,
    userDataDir,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
}

export async function getVisibleBrowser(): Promise<Browser> {
  if (visibleBrowser?.connected) return visibleBrowser;
  launchingVisible ??= launchVisible(APPLY_PROFILE_DIR)
    // One profile can be open in one Chrome only. A second jobquest:// click (a separate
    // process) or the MCP server may already hold it; use a throwaway profile then.
    .catch(async (err) => {
      if (!/already running|lock|in use/i.test(String(err?.message))) throw err;
      const { mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      return launchVisible(await mkdtemp(path.join(tmpdir(), 'jobquest-chrome-')));
    })
    .then((b) => {
      visibleBrowser = b;
      // The candidate closing the window is the normal end of a session, not an error.
      b.on('disconnected', () => { if (visibleBrowser === b) visibleBrowser = null; });
      return b;
    })
    .finally(() => {
      launchingVisible = null;
    });
  return launchingVisible;
}

async function closeOne(b: Browser | null): Promise<void> {
  if (!b) return;
  try {
    await b.close();
  } catch {
    // Already gone; kill the process so it cannot linger.
    b.process()?.kill('SIGKILL');
  }
}

/** Close the shared (and any visible auto-apply) browser. Safe to call when none was launched. */
export async function closeSharedBrowser(): Promise<void> {
  const b = sharedBrowser ?? (launching ? await launching.catch(() => null) : null);
  const v = visibleBrowser ?? (launchingVisible ? await launchingVisible.catch(() => null) : null);
  sharedBrowser = null;
  visibleBrowser = null;
  await Promise.all([closeOne(b), closeOne(v)]);
}
