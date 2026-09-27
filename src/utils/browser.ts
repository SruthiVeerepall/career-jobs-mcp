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

/** Close the shared browser if one was launched. Safe to call when none was. */
export async function closeSharedBrowser(): Promise<void> {
  const b = sharedBrowser ?? (launching ? await launching.catch(() => null) : null);
  sharedBrowser = null;
  if (!b) return;
  try {
    await b.close();
  } catch {
    // Already gone; kill the process so it cannot linger.
    b.process()?.kill('SIGKILL');
  }
}
