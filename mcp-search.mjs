import { scrapeCompany } from './dist/scrapers/orchestrator.js';

const workingCompanies = [
  'Stripe', 'Airbnb', 'Discord', 'Databricks', 'Instacart',
  'Robinhood', 'Twilio', 'Anthropic', 'Block', 'Affirm', 'SoFi',
  'Netflix', 'Plaid', 'Figma', 'Snowflake', 'Pinterest', 'GitLab',
  'Reddit', 'OpenAI', 'Coinbase', 'Brex', 'Mixpanel', 'Linear',
  'PostHog', 'Ramp', 'Cloudflare', 'Datadog', 'New Relic', 'PagerDuty',
  'Postman', 'Fivetran', 'Amplitude', 'Scale AI', 'Duolingo'
];

let allJobs = [];

async function searchAllCompanies() {
  for (const company of workingCompanies) {
    for (const title of ['Java', 'Full Stack']) {
      try {
        const result = await scrapeCompany(company, {
          title,
          location: 'USA',
          postedSince: 'today'
        });
        if (result.jobs && result.jobs.length > 0) {
          const jobs = result.jobs.map(j => ({ ...j, companyName: company }));
          allJobs = allJobs.concat(jobs);
          console.error(`✅ ${company} [${title}]: ${result.jobs.length}`);
        }
      } catch (e) {}
    }
  }
  console.log(JSON.stringify(allJobs, null, 2));
}

searchAllCompanies().then(() => process.exit(0)).catch(e => {
  console.error(e.message);
  process.exit(1);
});
