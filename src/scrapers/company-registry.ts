import type { CompanyConfig } from '../types.js';
import { BaseScraper } from './base-scraper.js';
import { GreenhouseScraper } from './platforms/greenhouse.js';
import { LeverScraper } from './platforms/lever.js';
import { AshbyScraper } from './platforms/ashby.js';
import { SmartRecruitersScraper } from './platforms/smartrecruiters.js';
import { WorkdayScraper } from './platforms/workday.js';
import { CustomPuppeteerScraper } from './platforms/custom-puppeteer.js';
import { logger } from '../utils/logger.js';

const PRECONFIGURED: CompanyConfig[] = [
  // ── Greenhouse boards ────────────────────────────────────────────────
  { name: 'Stripe', slug: 'stripe', careerUrl: 'https://stripe.com/jobs', platform: 'greenhouse', platformIdentifier: 'stripe' },
  { name: 'Airbnb', slug: 'airbnb', careerUrl: 'https://careers.airbnb.com', platform: 'greenhouse', platformIdentifier: 'airbnb' },
  { name: 'Coinbase', slug: 'coinbase', careerUrl: 'https://www.coinbase.com/careers', platform: 'greenhouse', platformIdentifier: 'coinbase' },
  { name: 'Discord', slug: 'discord', careerUrl: 'https://discord.com/jobs', platform: 'greenhouse', platformIdentifier: 'discord' },
  { name: 'GitLab', slug: 'gitlab', careerUrl: 'https://about.gitlab.com/jobs', platform: 'greenhouse', platformIdentifier: 'gitlab' },
  { name: 'Reddit', slug: 'reddit', careerUrl: 'https://www.redditinc.com/careers', platform: 'greenhouse', platformIdentifier: 'reddit' },
  { name: 'Twilio', slug: 'twilio', careerUrl: 'https://www.twilio.com/company/jobs', platform: 'greenhouse', platformIdentifier: 'twilio' },
  { name: 'Pinterest', slug: 'pinterest', careerUrl: 'https://www.pinterestcareers.com', platform: 'greenhouse', platformIdentifier: 'pinterest' },
  { name: 'DoorDash', slug: 'doordash', careerUrl: 'https://careers.doordash.com', platform: 'greenhouse', platformIdentifier: 'doordash' },
  { name: 'Instacart', slug: 'instacart', careerUrl: 'https://instacart.careers', platform: 'greenhouse', platformIdentifier: 'instacart' },
  { name: 'Anthropic', slug: 'anthropic', careerUrl: 'https://www.anthropic.com/careers', platform: 'greenhouse', platformIdentifier: 'anthropic' },
  { name: 'OpenAI', slug: 'openai', careerUrl: 'https://openai.com/careers', platform: 'greenhouse', platformIdentifier: 'openai' },
  { name: 'Robinhood', slug: 'robinhood', careerUrl: 'https://careers.robinhood.com', platform: 'greenhouse', platformIdentifier: 'robinhood' },
  { name: 'Plaid', slug: 'plaid', careerUrl: 'https://plaid.com/careers', platform: 'greenhouse', platformIdentifier: 'plaid' },
  { name: 'Figma', slug: 'figma', careerUrl: 'https://www.figma.com/careers', platform: 'greenhouse', platformIdentifier: 'figma' },
  { name: 'Snowflake', slug: 'snowflake', careerUrl: 'https://careers.snowflake.com', platform: 'greenhouse', platformIdentifier: 'snowflake' },
  { name: 'Databricks', slug: 'databricks', careerUrl: 'https://www.databricks.com/company/careers', platform: 'greenhouse', platformIdentifier: 'databricks' },

  // ── Lever boards ─────────────────────────────────────────────────────
  { name: 'Netflix', slug: 'netflix', careerUrl: 'https://jobs.netflix.com', platform: 'lever', platformIdentifier: 'netflix' },
  { name: 'Quora', slug: 'quora', careerUrl: 'https://www.quora.com/careers', platform: 'lever', platformIdentifier: 'quora' },
  { name: 'Brex', slug: 'brex', careerUrl: 'https://www.brex.com/careers', platform: 'lever', platformIdentifier: 'brex' },
  { name: 'Mixpanel', slug: 'mixpanel', careerUrl: 'https://mixpanel.com/jobs', platform: 'lever', platformIdentifier: 'mixpanel' },

  // ── Ashby boards ─────────────────────────────────────────────────────
  { name: 'Linear', slug: 'linear', careerUrl: 'https://linear.app/careers', platform: 'ashby', platformIdentifier: 'linear' },
  { name: 'PostHog', slug: 'posthog', careerUrl: 'https://posthog.com/careers', platform: 'ashby', platformIdentifier: 'posthog' },
  { name: 'Replicate', slug: 'replicate', careerUrl: 'https://replicate.com/careers', platform: 'ashby', platformIdentifier: 'replicate' },
  { name: 'Ramp', slug: 'ramp', careerUrl: 'https://ramp.com/careers', platform: 'ashby', platformIdentifier: 'ramp' },

  // ── SmartRecruiters boards ───────────────────────────────────────────
  { name: 'Visa', slug: 'visa', careerUrl: 'https://corporate.visa.com/en/jobs', platform: 'smartrecruiters', platformIdentifier: 'Visa' },
  { name: 'Bosch', slug: 'bosch', careerUrl: 'https://www.bosch.com/careers', platform: 'smartrecruiters', platformIdentifier: 'BoschGroup' },

  // ── Workday boards ───────────────────────────────────────────────────
  { name: 'Salesforce', slug: 'salesforce', careerUrl: 'https://careers.salesforce.com', platform: 'workday', platformIdentifier: 'salesforce|wd1|External_Career_Site' },
  { name: 'Adobe', slug: 'adobe', careerUrl: 'https://careers.adobe.com', platform: 'workday', platformIdentifier: 'adobe|wd5|external_experienced' },
  { name: 'JPMorgan Chase', slug: 'jpmorgan', careerUrl: 'https://careers.jpmorganchase.com', platform: 'workday', platformIdentifier: 'jpmc|wd1|jpmc' },
  { name: 'Citi', slug: 'citi', careerUrl: 'https://jobs.citi.com', platform: 'workday', platformIdentifier: 'citi|wd5|2' },
  { name: 'Goldman Sachs', slug: 'goldman-sachs', careerUrl: 'https://www.goldmansachs.com/careers', platform: 'workday', platformIdentifier: 'goldman|wd1|GS_EXT_CAREERS' },
  { name: 'Vanguard', slug: 'vanguard', careerUrl: 'https://www.vanguardjobs.com', platform: 'workday', platformIdentifier: 'vanguard|wd5|vanguard_careers' },
  { name: 'NVIDIA', slug: 'nvidia', careerUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers', platform: 'workday', platformIdentifier: 'nvidia|wd5|NVIDIAExternalCareerSite' },


  // ── Auto-discovered (verified via ATS API) ─────────────────────────────
  // ── Greenhouse ─────────────────────────────
  { name: "Pure Storage", slug: 'pure-storage', careerUrl: "https://www.purestorage.com/company/careers.html", platform: 'greenhouse', platformIdentifier: "purestorage" },
  { name: "Cloudflare", slug: 'cloudflare', careerUrl: "https://www.cloudflare.com/careers", platform: 'greenhouse', platformIdentifier: "cloudflare" },
  { name: "Fastly", slug: 'fastly', careerUrl: "https://www.fastly.com/about/careers", platform: 'greenhouse', platformIdentifier: "fastly" },
  { name: "Zscaler", slug: 'zscaler', careerUrl: "https://www.zscaler.com/careers", platform: 'greenhouse', platformIdentifier: "zscaler" },
  { name: "Tenable", slug: 'tenable', careerUrl: "https://careers.tenable.com", platform: 'greenhouse', platformIdentifier: "tenableinc" },
  { name: "BeyondTrust", slug: 'beyondtrust', careerUrl: "https://www.beyondtrust.com/careers", platform: 'greenhouse', platformIdentifier: "beyondtrust" },
  { name: "Okta", slug: 'okta', careerUrl: "https://www.okta.com/company/careers", platform: 'greenhouse', platformIdentifier: "okta" },
  { name: "Ping Identity", slug: 'ping-identity', careerUrl: "https://www.pingidentity.com/en/company/careers.html", platform: 'greenhouse', platformIdentifier: "pingidentity" },
  { name: "Recorded Future", slug: 'recorded-future', careerUrl: "https://www.recordedfuture.com/careers", platform: 'greenhouse', platformIdentifier: "recordedfuture" },
  { name: "Exabeam", slug: 'exabeam', careerUrl: "https://www.exabeam.com/company/careers", platform: 'greenhouse', platformIdentifier: "exabeam" },
  { name: "JetBrains", slug: 'jetbrains', careerUrl: "https://www.jetbrains.com/careers", platform: 'greenhouse', platformIdentifier: "jetbrains" },
  { name: "New Relic", slug: 'new-relic', careerUrl: "https://newrelic.com/about/careers", platform: 'greenhouse', platformIdentifier: "newrelic" },
  { name: "Datadog", slug: 'datadog', careerUrl: "https://careers.datadoghq.com", platform: 'greenhouse', platformIdentifier: "datadog" },
  { name: "Elastic", slug: 'elastic', careerUrl: "https://www.elastic.co/about/careers", platform: 'greenhouse', platformIdentifier: "elastic" },
  { name: "PagerDuty", slug: 'pagerduty', careerUrl: "https://www.pagerduty.com/careers", platform: 'greenhouse', platformIdentifier: "pagerduty" },
  { name: "CircleCI", slug: 'circleci', careerUrl: "https://circleci.com/careers", platform: 'greenhouse', platformIdentifier: "circleci" },
  { name: "Postman", slug: 'postman', careerUrl: "https://www.postman.com/careers", platform: 'greenhouse', platformIdentifier: "postman" },
  { name: "Fivetran", slug: 'fivetran', careerUrl: "https://www.fivetran.com/careers", platform: 'greenhouse', platformIdentifier: "fivetran" },
  { name: "dbt Labs", slug: 'dbt-labs', careerUrl: "https://www.getdbt.com/dbt-labs/open-roles", platform: 'greenhouse', platformIdentifier: "dbtlabsinc" },
  { name: "SAS Institute", slug: 'sas-institute', careerUrl: "https://www.sas.com/en_us/careers.html", platform: 'greenhouse', platformIdentifier: "sas" },
  { name: "Sisense", slug: 'sisense', careerUrl: "https://www.sisense.com/careers", platform: 'greenhouse', platformIdentifier: "sisense" },
  { name: "Grafana Labs", slug: 'grafana-labs', careerUrl: "https://grafana.com/about/careers", platform: 'greenhouse', platformIdentifier: "grafanalabs" },
  { name: "Amplitude", slug: 'amplitude', careerUrl: "https://amplitude.com/careers", platform: 'greenhouse', platformIdentifier: "amplitude" },
  { name: "Scale AI", slug: 'scale-ai', careerUrl: "https://scale.com/careers", platform: 'greenhouse', platformIdentifier: "scaleai" },
  { name: "C3.ai", slug: 'c3-ai', careerUrl: "https://c3.ai/careers", platform: 'greenhouse', platformIdentifier: "c3ascend" },
  { name: "AssemblyAI", slug: 'assemblyai', careerUrl: "https://www.assemblyai.com/careers", platform: 'greenhouse', platformIdentifier: "assemblyai" },
  { name: "X Corp", slug: 'x-corp', careerUrl: "https://careers.x.com", platform: 'greenhouse', platformIdentifier: "xai" },
  { name: "LinkedIn", slug: 'linkedin', careerUrl: "https://careers.linkedin.com", platform: 'greenhouse', platformIdentifier: "linkedin" },
  { name: "Duolingo", slug: 'duolingo', careerUrl: "https://careers.duolingo.com", platform: 'greenhouse', platformIdentifier: "duolingo" },
  { name: "Poshmark", slug: 'poshmark', careerUrl: "https://poshmark.com/careers", platform: 'greenhouse', platformIdentifier: "poshmark" },
  { name: "StockX", slug: 'stockx', careerUrl: "https://stockx.com/careers", platform: 'greenhouse', platformIdentifier: "stockx" },
  { name: "Take-Two Interactive", slug: 'take-two-interactive', careerUrl: "https://www.take2games.com/careers", platform: 'greenhouse', platformIdentifier: "taketwo" },
  { name: "Epic Games", slug: 'epic-games', careerUrl: "https://www.epicgames.com/site/en-US/careers", platform: 'greenhouse', platformIdentifier: "epicgames" },
  { name: "Riot Games", slug: 'riot-games', careerUrl: "https://www.riotgames.com/en/work-with-us", platform: 'greenhouse', platformIdentifier: "riotgames" },
  { name: "Roblox", slug: 'roblox', careerUrl: "https://corp.roblox.com/careers", platform: 'greenhouse', platformIdentifier: "roblox" },
  { name: "Ubiquiti", slug: 'ubiquiti', careerUrl: "https://www.ui.com/careers", platform: 'greenhouse', platformIdentifier: "ubiquiti" },
  { name: "Oscar Health", slug: 'oscar-health', careerUrl: "https://www.hioscar.com/careers", platform: 'greenhouse', platformIdentifier: "oscar" },
  { name: "Clover Health", slug: 'clover-health', careerUrl: "https://www.cloverhealth.com/en/careers", platform: 'greenhouse', platformIdentifier: "cloverhealth" },
  { name: "Doximity", slug: 'doximity', careerUrl: "https://work.doximity.com", platform: 'greenhouse', platformIdentifier: "doximity" },
  { name: "Inovalon", slug: 'inovalon', careerUrl: "https://www.inovalon.com/careers", platform: 'greenhouse', platformIdentifier: "inovalon" },
  { name: "Natera", slug: 'natera', careerUrl: "https://www.natera.com/careers", platform: 'greenhouse', platformIdentifier: "natera" },
  { name: "Block", slug: 'block', careerUrl: "https://block.xyz/careers", platform: 'greenhouse', platformIdentifier: "block" },
  { name: "Affirm", slug: 'affirm', careerUrl: "https://www.affirm.com/careers", platform: 'greenhouse', platformIdentifier: "affirm" },
  { name: "Chime", slug: 'chime', careerUrl: "https://www.chime.com/careers", platform: 'greenhouse', platformIdentifier: "chime" },
  { name: "SoFi", slug: 'sofi', careerUrl: "https://www.sofi.com/careers", platform: 'greenhouse', platformIdentifier: "sofi" },
  { name: "Marqeta", slug: 'marqeta', careerUrl: "https://www.marqeta.com/company/careers", platform: 'greenhouse', platformIdentifier: "marqeta" },
  { name: "Betterment", slug: 'betterment', careerUrl: "https://www.betterment.com/careers", platform: 'greenhouse', platformIdentifier: "betterment" },
  { name: "Opendoor", slug: 'opendoor', careerUrl: "https://www.opendoor.com/w/jobs", platform: 'greenhouse', platformIdentifier: "opendoor" },
  { name: "CoStar Group", slug: 'costar-group', careerUrl: "https://careers.costargroup.com", platform: 'greenhouse', platformIdentifier: "costar" },
  { name: "Flexport", slug: 'flexport', careerUrl: "https://www.flexport.com/careers", platform: 'greenhouse', platformIdentifier: "flexport" },
  { name: "project44", slug: 'project44', careerUrl: "https://www.project44.com/careers", platform: 'greenhouse', platformIdentifier: "project44" },
  { name: "FourKites", slug: 'fourkites', careerUrl: "https://www.fourkites.com/careers", platform: 'greenhouse', platformIdentifier: "fourkites" },
  { name: "Coursera", slug: 'coursera', careerUrl: "https://careers.coursera.org", platform: 'greenhouse', platformIdentifier: "coursera" },
  { name: "Udemy", slug: 'udemy', careerUrl: "https://about.udemy.com/careers", platform: 'greenhouse', platformIdentifier: "udemy" },
  { name: "Udacity", slug: 'udacity', careerUrl: "https://www.udacity.com/careers", platform: 'greenhouse', platformIdentifier: "udacity" },
  { name: "DataCamp", slug: 'datacamp', careerUrl: "https://www.datacamp.com/jobs", platform: 'greenhouse', platformIdentifier: "datacamp" },
  { name: "Greenhouse", slug: 'greenhouse', careerUrl: "https://www.greenhouse.com/careers", platform: 'greenhouse', platformIdentifier: "greenhouse" },
  { name: "Gusto", slug: 'gusto', careerUrl: "https://gusto.com/about/careers", platform: 'greenhouse', platformIdentifier: "gusto" },
  { name: "Justworks", slug: 'justworks', careerUrl: "https://www.justworks.com/careers", platform: 'greenhouse', platformIdentifier: "justworks" },
  { name: "Root Insurance", slug: 'root-insurance', careerUrl: "https://www.joinroot.com/careers", platform: 'greenhouse', platformIdentifier: "root" },
  { name: "Hippo Insurance", slug: 'hippo-insurance', careerUrl: "https://www.hippo.com/careers", platform: 'greenhouse', platformIdentifier: "hippo70" },
  { name: "Ethos Life", slug: 'ethos-life', careerUrl: "https://www.ethoslife.com/careers", platform: 'greenhouse', platformIdentifier: "ethoslife" },
  { name: "Embroker", slug: 'embroker', careerUrl: "https://www.embroker.com/careers", platform: 'greenhouse', platformIdentifier: "embroker" },
  { name: "Coalition Inc.", slug: 'coalition-inc', careerUrl: "https://www.coalitioninc.com/careers", platform: 'greenhouse', platformIdentifier: "coalition" },
  { name: "At-Bay", slug: 'at-bay', careerUrl: "https://www.at-bay.com/careers", platform: 'greenhouse', platformIdentifier: "atbay" },
  { name: "New York Life", slug: 'new-york-life', careerUrl: "https://careers.newyorklife.com", platform: 'greenhouse', platformIdentifier: "new" },
  { name: "SpaceX", slug: 'spacex', careerUrl: "https://www.spacex.com/careers", platform: 'greenhouse', platformIdentifier: "spacex" },
  { name: "Rocket Lab", slug: 'rocket-lab', careerUrl: "https://www.rocketlabusa.com/careers", platform: 'greenhouse', platformIdentifier: "rocketlab" },
  { name: "Planet Labs", slug: 'planet-labs', careerUrl: "https://www.planet.com/company/careers", platform: 'greenhouse', platformIdentifier: "planetlabs" },
  { name: "General Dynamics", slug: 'general-dynamics', careerUrl: "https://www.gd.com/careers", platform: 'greenhouse', platformIdentifier: "general" },
  { name: "Accela", slug: 'accela', careerUrl: "https://www.accela.com/company/careers", platform: 'greenhouse', platformIdentifier: "accela" },
  { name: "Esri", slug: 'esri', careerUrl: "https://www.esri.com/en-us/about/careers", platform: 'greenhouse', platformIdentifier: "esri" },
  { name: "Webflow", slug: 'webflow', careerUrl: "https://webflow.com/careers", platform: 'greenhouse', platformIdentifier: "webflow" },
  { name: "Squarespace", slug: 'squarespace', careerUrl: "https://careers.squarespace.com", platform: 'greenhouse', platformIdentifier: "squarespace" },
  { name: "Lucidchart", slug: 'lucidchart', careerUrl: "https://www.lucid.co/careers", platform: 'greenhouse', platformIdentifier: "lucidsoftware" },
  { name: "Everlaw", slug: 'everlaw', careerUrl: "https://www.everlaw.com/careers", platform: 'greenhouse', platformIdentifier: "everlaw" },
  { name: "Sage Intacct", slug: 'sage-intacct', careerUrl: "https://www.sage.com/en-us/company/careers", platform: 'greenhouse', platformIdentifier: "sage" },
  { name: "Bill.com", slug: 'bill-com', careerUrl: "https://www.bill.com/careers", platform: 'greenhouse', platformIdentifier: "billcom" },
  { name: "Upstart", slug: 'upstart', careerUrl: "https://www.upstart.com/careers", platform: 'greenhouse', platformIdentifier: "upstart" },
  { name: "Lyft", slug: 'lyft', careerUrl: "https://www.lyft.com/careers", platform: 'greenhouse', platformIdentifier: "lyft" },
  { name: "Waymo", slug: 'waymo', careerUrl: "https://waymo.com/careers", platform: 'greenhouse', platformIdentifier: "waymo" },
  { name: "Aurora Innovation", slug: 'aurora-innovation', careerUrl: "https://aurora.tech/jobs", platform: 'greenhouse', platformIdentifier: "aurorainnovation" },
  { name: "Nuro", slug: 'nuro', careerUrl: "https://www.nuro.ai/careers", platform: 'greenhouse', platformIdentifier: "nuro" },
  { name: "Peloton", slug: 'peloton', careerUrl: "https://careers.onepeloton.com", platform: 'greenhouse', platformIdentifier: "peloton" },
  { name: "Modern Health", slug: 'modern-health', careerUrl: "https://www.modernhealth.com/careers", platform: 'greenhouse', platformIdentifier: "modernhealth" },
  { name: "Talkspace", slug: 'talkspace', careerUrl: "https://www.talkspace.com/careers", platform: 'greenhouse', platformIdentifier: "talkspacetherapist" },
  { name: "BetterHelp", slug: 'betterhelp', careerUrl: "https://www.betterhelp.com/careers", platform: 'greenhouse', platformIdentifier: "betterhelpcom" },
  { name: "Cerebral", slug: 'cerebral', careerUrl: "https://cerebral.com/careers", platform: 'greenhouse', platformIdentifier: "cerebral" },
  // ── Lever ──────────────────────────────────
  { name: "Palantir Technologies", slug: 'palantir-technologies', careerUrl: "https://www.palantir.com/careers", platform: 'lever', platformIdentifier: "palantir" },
  { name: "Veeva Systems", slug: 'veeva-systems', careerUrl: "https://careers.veeva.com", platform: 'lever', platformIdentifier: "veeva" },
  { name: "Atlassian", slug: 'atlassian', careerUrl: "https://www.atlassian.com/company/careers", platform: 'lever', platformIdentifier: "atlassian" },
  { name: "Spotify", slug: 'spotify', careerUrl: "https://www.lifeatspotify.com", platform: 'lever', platformIdentifier: "spotify" },
  { name: "Wealthfront", slug: 'wealthfront', careerUrl: "https://www.wealthfront.com/careers", platform: 'lever', platformIdentifier: "wealthfront" },
  { name: "Buildium", slug: 'buildium', careerUrl: "https://www.buildium.com/about/careers", platform: 'lever', platformIdentifier: "buildium" },
  { name: "Blue Yonder", slug: 'blue-yonder', careerUrl: "https://blueyonder.com/about/careers", platform: 'lever', platformIdentifier: "blue" },
  { name: "Coupa Software", slug: 'coupa-software', careerUrl: "https://www.coupa.com/company/careers", platform: 'lever', platformIdentifier: "coupa" },
  { name: "TriNet", slug: 'trinet', careerUrl: "https://www.trinet.com/about-us/careers", platform: 'lever', platformIdentifier: "trinet" },
  { name: "MetLife", slug: 'metlife', careerUrl: "https://jobs.metlife.com", platform: 'lever', platformIdentifier: "metlife" },
  { name: "Blue Origin", slug: 'blue-origin', careerUrl: "https://www.blueorigin.com/careers", platform: 'lever', platformIdentifier: "blueorigin" },
  { name: "Zoox", slug: 'zoox', careerUrl: "https://zoox.com/careers", platform: 'lever', platformIdentifier: "zoox" },
  { name: "Lyra Health", slug: 'lyra-health', careerUrl: "https://www.lyrahealth.com/careers", platform: 'lever', platformIdentifier: "lyrahealth" },
  // ── Ashby ──────────────────────────────────
  { name: "Nutanix", slug: 'nutanix', careerUrl: "https://www.nutanix.com/careers", platform: 'ashby', platformIdentifier: "nutanix" },
  { name: "Wiz", slug: 'wiz', careerUrl: "https://www.wiz.io/careers", platform: 'ashby', platformIdentifier: "wiz" },
  { name: "Applied Materials", slug: 'applied-materials', careerUrl: "https://careers.appliedmaterials.com", platform: 'ashby', platformIdentifier: "applied" },
  { name: "Docker", slug: 'docker', careerUrl: "https://www.docker.com/careers", platform: 'ashby', platformIdentifier: "docker" },
  { name: "Airbyte", slug: 'airbyte', careerUrl: "https://airbyte.com/careers", platform: 'ashby', platformIdentifier: "airbyte" },
  { name: "FullStory", slug: 'fullstory', careerUrl: "https://www.fullstory.com/careers", platform: 'ashby', platformIdentifier: "fullstory" },
  { name: "Deepgram", slug: 'deepgram', careerUrl: "https://deepgram.com/company/careers", platform: 'ashby', platformIdentifier: "Deepgram" },
  { name: "Pinecone", slug: 'pinecone', careerUrl: "https://www.pinecone.io/careers", platform: 'ashby', platformIdentifier: "pinecone" },
  { name: "Bumble", slug: 'bumble', careerUrl: "https://team.bumble.com", platform: 'ashby', platformIdentifier: "bumble" },
  { name: "Lumen Technologies", slug: 'lumen-technologies', careerUrl: "https://jobs.lumen.com", platform: 'ashby', platformIdentifier: "lumen" },
  { name: "Acorns", slug: 'acorns', careerUrl: "https://www.acorns.com/careers", platform: 'ashby', platformIdentifier: "acorns" },
  { name: "Instructure", slug: 'instructure', careerUrl: "https://www.instructure.com/careers", platform: 'ashby', platformIdentifier: "instructure" },
  { name: "Lemonade", slug: 'lemonade', careerUrl: "https://makers.lemonade.com", platform: 'ashby', platformIdentifier: "lemonade" },
  { name: "Kin Insurance", slug: 'kin-insurance', careerUrl: "https://www.kin.com/careers", platform: 'ashby', platformIdentifier: "kin" },
  { name: "Bestow", slug: 'bestow', careerUrl: "https://bestow.com/careers", platform: 'ashby', platformIdentifier: "bestow" },
  { name: "OpenGov", slug: 'opengov', careerUrl: "https://opengov.com/careers", platform: 'ashby', platformIdentifier: "opengov" },
  { name: "Ironclad", slug: 'ironclad', careerUrl: "https://ironcladapp.com/careers", platform: 'ashby', platformIdentifier: "ironcladhq" },
  { name: "Xero", slug: 'xero', careerUrl: "https://www.xero.com/us/about/careers", platform: 'ashby', platformIdentifier: "xero" },
  { name: "Expensify", slug: 'expensify', careerUrl: "https://we.are.expensify.com", platform: 'ashby', platformIdentifier: "expensify" },
  // ── Workday ────────────────────────────────
  { name: "Workday", slug: 'workday', careerUrl: "https://www.workday.com/en-us/company/careers.html", platform: 'workday', platformIdentifier: "workday|wd5|Workday" },
  { name: "Rackspace", slug: 'rackspace', careerUrl: "https://www.rackspace.com/talent", platform: 'workday', platformIdentifier: "rackspace|wd1|External" },
  { name: "Palo Alto Networks", slug: 'palo-alto-networks', careerUrl: "https://jobs.paloaltonetworks.com", platform: 'workday', platformIdentifier: "paloaltonetworks|wd5|panwexternalcareers" },
  { name: "Qualys", slug: 'qualys', careerUrl: "https://www.qualys.com/company/careers", platform: 'workday', platformIdentifier: "qualys|wd5|Careers" },
  { name: "Micron Technology", slug: 'micron-technology', careerUrl: "https://careers.micron.com", platform: 'workday', platformIdentifier: "micron|wd1|External" },
  { name: "KLA Corporation", slug: 'kla-corporation', careerUrl: "https://careers.kla.com", platform: 'workday', platformIdentifier: "kla|wd1|Search" },
  { name: "Zebra Technologies", slug: 'zebra-technologies', careerUrl: "https://careers.zebra.com", platform: 'workday', platformIdentifier: "zebra|wd501|Zebra_careers" },
  { name: "Red Hat", slug: 'red-hat', careerUrl: "https://www.redhat.com/en/jobs", platform: 'workday', platformIdentifier: "redhat|wd5|jobs" },
  { name: "Alteryx", slug: 'alteryx', careerUrl: "https://www.alteryx.com/careers", platform: 'workday', platformIdentifier: "alteryx|wd108|AlteryxCareers" },
  { name: "Epicor", slug: 'epicor', careerUrl: "https://www.epicor.com/en-us/careers", platform: 'workday', platformIdentifier: "epicorsoftware|wd5|epicorjobs" },
  { name: "PTC", slug: 'ptc', careerUrl: "https://www.ptc.com/en/careers", platform: 'workday', platformIdentifier: "ptc|wd1|PTC" },
  { name: "T-Mobile", slug: 't-mobile', careerUrl: "https://careers.t-mobile.com", platform: 'workday', platformIdentifier: "tmobile|wd1|External" },
  { name: "Juniper Networks", slug: 'juniper-networks', careerUrl: "https://careers.juniper.net", platform: 'workday', platformIdentifier: "hpe|wd5|Jobsathpe" },
  { name: "F5 Networks", slug: 'f5-networks', careerUrl: "https://www.f5.com/company/careers", platform: 'workday', platformIdentifier: "ffive|wd5|f5jobs" },
  { name: "Elevance Health", slug: 'elevance-health', careerUrl: "https://careers.elevancehealth.com", platform: 'workday', platformIdentifier: "elevancehealth|wd1|ANT" },
  { name: "Cigna", slug: 'cigna', careerUrl: "https://jobs.cigna.com", platform: 'workday', platformIdentifier: "cigna|wd5|cignacareers" },
  { name: "Blue Cross Blue Shield", slug: 'blue-cross-blue-shield', careerUrl: "https://www.bcbs.com/careers", platform: 'workday', platformIdentifier: "bcbsa|wd1|Careers" },
  { name: "Highmark Health", slug: 'highmark-health', careerUrl: "https://careers.highmarkhealth.org", platform: 'workday', platformIdentifier: "highmarkhealth|wd1|highmark" },
  { name: "UPMC Health Plan", slug: 'upmc-health-plan', careerUrl: "https://careers.upmc.com", platform: 'workday', platformIdentifier: "gohealthuc|wd12|External" },
  { name: "Devoted Health", slug: 'devoted-health', careerUrl: "https://www.devoted.com/careers", platform: 'workday', platformIdentifier: "devoted|wd1|Devoted" },
  { name: "Allscripts", slug: 'allscripts', careerUrl: "https://www.allscripts.com/careers", platform: 'workday', platformIdentifier: "veradigm|wd12|VR" },
  { name: "NextGen Healthcare", slug: 'nextgen-healthcare', careerUrl: "https://www.nextgen.com/company/careers", platform: 'workday', platformIdentifier: "nextgen|wd5|NextGen_Careers" },
  { name: "Teladoc Health", slug: 'teladoc-health', careerUrl: "https://careers.teladochealth.com", platform: 'workday', platformIdentifier: "teladoc|wd503|teladochealth_is_hiring" },
  { name: "Exact Sciences", slug: 'exact-sciences', careerUrl: "https://careers.exactsciences.com", platform: 'workday', platformIdentifier: "exactsciences|wd1|Exact_Sciences" },
  { name: "Illumina", slug: 'illumina', careerUrl: "https://www.illumina.com/company/careers.html", platform: 'workday', platformIdentifier: "illumina|wd1|illumina-careers" },
  { name: "Bank of America", slug: 'bank-of-america', careerUrl: "https://careers.bankofamerica.com", platform: 'workday', platformIdentifier: "ghr|wd1|lateral-us" },
  { name: "U.S. Bancorp", slug: 'u-s-bancorp', careerUrl: "https://careers.usbank.com", platform: 'workday', platformIdentifier: "usbank|wd1|US_Bank_Careers" },
  { name: "Capital One", slug: 'capital-one', careerUrl: "https://www.capitalonecareers.com", platform: 'workday', platformIdentifier: "capitalone|wd12|Capital_One" },
  { name: "TD Bank", slug: 'td-bank', careerUrl: "https://jobs.td.com", platform: 'workday', platformIdentifier: "td|wd3|TD_Bank_Careers" },
  { name: "FIS", slug: 'fis', careerUrl: "https://careers.fisglobal.com", platform: 'workday', platformIdentifier: "fis|wd5|SearchJobs" },
  { name: "Western Union", slug: 'western-union', careerUrl: "https://careers.westernunion.com", platform: 'workday', platformIdentifier: "westernunion|wd5|WesternUnionJobs" },
  { name: "FleetCor", slug: 'fleetcor', careerUrl: "https://www.fleetcor.com/careers", platform: 'workday', platformIdentifier: "corpay|wd103|Ext_001" },
  { name: "Nasdaq", slug: 'nasdaq', careerUrl: "https://www.nasdaq.com/about/careers", platform: 'workday', platformIdentifier: "nasdaq|wd1|Global_External_Site" },
  { name: "Zillow", slug: 'zillow', careerUrl: "https://careers.zillowgroup.com", platform: 'workday', platformIdentifier: "zillow|wd5|Zillow_Group_External" },
  { name: "MRI Software", slug: 'mri-software', careerUrl: "https://www.mrisoftware.com/careers", platform: 'workday', platformIdentifier: "mrisoftware|wd501|External_CareerSite" },
  { name: "J.B. Hunt", slug: 'j-b-hunt', careerUrl: "https://careers.jbhunt.com", platform: 'workday', platformIdentifier: "jbhunt|wd501|Careers" },
  { name: "Pluralsight", slug: 'pluralsight', careerUrl: "https://www.pluralsight.com/careers", platform: 'workday', platformIdentifier: "pluralsight|wd1|Careers" },
  { name: "DXC Technology", slug: 'dxc-technology', careerUrl: "https://careers.dxc.com", platform: 'workday', platformIdentifier: "dxctechnology|wd1|DXCJobs" },
  { name: "Leidos", slug: 'leidos', careerUrl: "https://careers.leidos.com", platform: 'workday', platformIdentifier: "leidos|wd5|External" },
  { name: "Booz Allen Hamilton", slug: 'booz-allen-hamilton', careerUrl: "https://careers.boozallen.com", platform: 'workday', platformIdentifier: "bah|wd1|BAH_Jobs" },
  { name: "Unisys", slug: 'unisys', careerUrl: "https://www.unisys.com/careers", platform: 'workday', platformIdentifier: "unisys|wd5|External" },
  { name: "Travelers", slug: 'travelers', careerUrl: "https://careers.travelers.com", platform: 'workday', platformIdentifier: "travelers|wd5|External" },
  { name: "Unum Group", slug: 'unum-group', careerUrl: "https://careers.unum.com", platform: 'workday', platformIdentifier: "unum|wd1|External" },
  { name: "Boeing", slug: 'boeing', careerUrl: "https://jobs.boeing.com", platform: 'workday', platformIdentifier: "boeing|wd1|EXTERNAL_CAREERS" },
  { name: "Thomson Reuters", slug: 'thomson-reuters', careerUrl: "https://careers.thomsonreuters.com", platform: 'workday', platformIdentifier: "thomsonreuters|wd5|External_Career_Site" },
  { name: "LexisNexis", slug: 'lexisnexis', careerUrl: "https://www.lexisnexis.com/en-us/about-us/careers.page", platform: 'workday', platformIdentifier: "relx|wd3|LexisNexisLegal" },
  { name: "Relativity", slug: 'relativity', careerUrl: "https://www.relativity.com/careers", platform: 'workday', platformIdentifier: "kcura|wd1|External_Career_Site" },
  { name: "S&P Global", slug: 's-p-global', careerUrl: "https://careers.spglobal.com", platform: 'workday', platformIdentifier: "spgi|wd5|SPGI_Careers" },


  // ── Auto-discovered (verified via ATS API) ─────────────────────────────
  // ── Greenhouse ─────────────────────────────
  { name: "Asana", slug: 'asana', careerUrl: "https://asana.com/jobs", platform: 'greenhouse', platformIdentifier: "asana" },
  { name: "Dropbox", slug: 'dropbox', careerUrl: "https://jobs.dropbox.com", platform: 'greenhouse', platformIdentifier: "dropbox" },
  { name: "MongoDB", slug: 'mongodb', careerUrl: "https://www.mongodb.com/careers", platform: 'greenhouse', platformIdentifier: "mongodb" },
  { name: "Vercel", slug: 'vercel', careerUrl: "https://vercel.com/careers", platform: 'greenhouse', platformIdentifier: "vercel" },
  { name: "Netlify", slug: 'netlify', careerUrl: "https://www.netlify.com/careers", platform: 'greenhouse', platformIdentifier: "netlify" },
  { name: "Algolia", slug: 'algolia', careerUrl: "https://www.algolia.com/careers", platform: 'greenhouse', platformIdentifier: "algolia" },
  { name: "Honeycomb", slug: 'honeycomb', careerUrl: "https://www.honeycomb.io/careers", platform: 'greenhouse', platformIdentifier: "honeycomb" },
  { name: "Cribl", slug: 'cribl', careerUrl: "https://cribl.io/about/careers", platform: 'greenhouse', platformIdentifier: "cribl" },
  { name: "Cockroach Labs", slug: 'cockroach-labs', careerUrl: "https://www.cockroachlabs.com/careers", platform: 'greenhouse', platformIdentifier: "cockroachlabs" },
  { name: "PlanetScale", slug: 'planetscale', careerUrl: "https://planetscale.com/careers", platform: 'greenhouse', platformIdentifier: "planetscale" },
  { name: "Sumo Logic", slug: 'sumo-logic', careerUrl: "https://www.sumologic.com/careers", platform: 'greenhouse', platformIdentifier: "sumologic" },
  { name: "Materialize", slug: 'materialize', careerUrl: "https://materialize.com/careers", platform: 'greenhouse', platformIdentifier: "materialize" },
  { name: "ZoomInfo", slug: 'zoominfo', careerUrl: "https://www.zoominfo.com/about/careers", platform: 'greenhouse', platformIdentifier: "zoominfo" },
  { name: "Apollo.io", slug: 'apollo-io', careerUrl: "https://www.apollo.io/careers", platform: 'greenhouse', platformIdentifier: "apolloio" },
  { name: "HubSpot", slug: 'hubspot', careerUrl: "https://www.hubspot.com/jobs", platform: 'greenhouse', platformIdentifier: "hubspot" },
  { name: "Pendo", slug: 'pendo', careerUrl: "https://www.pendo.io/careers", platform: 'greenhouse', platformIdentifier: "pendo" },
  { name: "Hex Technologies", slug: 'hex-technologies', careerUrl: "https://hex.tech/careers", platform: 'greenhouse', platformIdentifier: "hextechnologies" },
  { name: "Inflection AI", slug: 'inflection-ai', careerUrl: "https://inflection.ai/careers", platform: 'greenhouse', platformIdentifier: "inflectionai" },
  { name: "Together AI", slug: 'together-ai', careerUrl: "https://www.together.ai/careers", platform: 'greenhouse', platformIdentifier: "togetherai" },
  { name: "Fireworks AI", slug: 'fireworks-ai', careerUrl: "https://fireworks.ai/careers", platform: 'greenhouse', platformIdentifier: "fireworksai" },
  { name: "Labelbox", slug: 'labelbox', careerUrl: "https://labelbox.com/careers", platform: 'greenhouse', platformIdentifier: "labelbox" },
  { name: "Stability AI", slug: 'stability-ai', careerUrl: "https://stability.ai/careers", platform: 'greenhouse', platformIdentifier: "stabilityai" },
  { name: "Sourcegraph", slug: 'sourcegraph', careerUrl: "https://about.sourcegraph.com/jobs", platform: 'greenhouse', platformIdentifier: "sourcegraph91" },
  { name: "Tailscale", slug: 'tailscale', careerUrl: "https://tailscale.com/careers", platform: 'greenhouse', platformIdentifier: "tailscale" },
  { name: "Buildkite", slug: 'buildkite', careerUrl: "https://buildkite.com/about/jobs", platform: 'greenhouse', platformIdentifier: "buildkite" },
  { name: "Bitwarden", slug: 'bitwarden', careerUrl: "https://bitwarden.com/careers", platform: 'greenhouse', platformIdentifier: "bitwarden" },
  { name: "LastPass", slug: 'lastpass', careerUrl: "https://www.lastpass.com/about-us/careers", platform: 'greenhouse', platformIdentifier: "lastpass" },
  { name: "Veracode", slug: 'veracode', careerUrl: "https://www.veracode.com/careers", platform: 'greenhouse', platformIdentifier: "veracode" },
  { name: "Abnormal Security", slug: 'abnormal-security', careerUrl: "https://abnormalsecurity.com/careers", platform: 'greenhouse', platformIdentifier: "abnormalsecurity" },
  { name: "Censys", slug: 'censys', careerUrl: "https://censys.com/careers", platform: 'greenhouse', platformIdentifier: "censys" },
  { name: "Tines", slug: 'tines', careerUrl: "https://www.tines.com/careers", platform: 'greenhouse', platformIdentifier: "tines" },
  { name: "Pie Insurance", slug: 'pie-insurance', careerUrl: "https://pieinsurance.com/careers", platform: 'greenhouse', platformIdentifier: "pieinsurance" },
  { name: "Mercury Insurance", slug: 'mercury-insurance', careerUrl: "https://www.mercuryinsurance.com/about/careers.html", platform: 'greenhouse', platformIdentifier: "mercury" },
  { name: "Charles Schwab", slug: 'charles-schwab', careerUrl: "https://www.schwabjobs.com", platform: 'greenhouse', platformIdentifier: "charles" },
  { name: "Carta", slug: 'carta', careerUrl: "https://carta.com/careers", platform: 'greenhouse', platformIdentifier: "carta" },
  { name: "Mercury", slug: 'mercury', careerUrl: "https://mercury.com/jobs", platform: 'greenhouse', platformIdentifier: "mercury" },
  { name: "Public.com", slug: 'public-com', careerUrl: "https://public.com/careers", platform: 'greenhouse', platformIdentifier: "public" },
  { name: "Credit Karma", slug: 'credit-karma', careerUrl: "https://www.creditkarma.com/careers", platform: 'greenhouse', platformIdentifier: "creditkarma" },
  { name: "LendingTree", slug: 'lendingtree', careerUrl: "https://www.lendingtree.com/careers", platform: 'greenhouse', platformIdentifier: "lendingtree" },
  { name: "LPL Financial", slug: 'lpl-financial', careerUrl: "https://lpl.wd1.myworkdayjobs.com", platform: 'greenhouse', platformIdentifier: "lpl" },
  { name: "Robinhood Crypto", slug: 'robinhood-crypto', careerUrl: "https://careers.robinhood.com", platform: 'greenhouse', platformIdentifier: "robinhood" },
  { name: "Gemini", slug: 'gemini', careerUrl: "https://www.gemini.com/careers", platform: 'greenhouse', platformIdentifier: "gemini" },
  { name: "Fireblocks", slug: 'fireblocks', careerUrl: "https://www.fireblocks.com/careers", platform: 'greenhouse', platformIdentifier: "fireblocks" },
  // ── Lever ──────────────────────────────────
  { name: "Neon", slug: 'neon', careerUrl: "https://neon.tech/careers", platform: 'lever', platformIdentifier: "neon" },
  { name: "Sonatype", slug: 'sonatype', careerUrl: "https://www.sonatype.com/company/careers", platform: 'lever', platformIdentifier: "sonatype" },
  { name: "Outreach", slug: 'outreach', careerUrl: "https://www.outreach.io/company/careers", platform: 'lever', platformIdentifier: "outreach" },
  { name: "Secureframe", slug: 'secureframe', careerUrl: "https://secureframe.com/careers", platform: 'lever', platformIdentifier: "secureframe" },
  { name: "Greenlight", slug: 'greenlight', careerUrl: "https://greenlight.com/careers", platform: 'lever', platformIdentifier: "greenlight" },
  { name: "Anchorage Digital", slug: 'anchorage-digital', careerUrl: "https://www.anchorage.com/careers", platform: 'lever', platformIdentifier: "anchorage" },
  // ── Ashby ──────────────────────────────────
  { name: "Notion", slug: 'notion', careerUrl: "https://www.notion.com/careers", platform: 'ashby', platformIdentifier: "notion" },
  { name: "Confluent", slug: 'confluent', careerUrl: "https://www.confluent.io/careers", platform: 'ashby', platformIdentifier: "confluent" },
  { name: "Supabase", slug: 'supabase', careerUrl: "https://supabase.com/careers", platform: 'ashby', platformIdentifier: "supabase" },
  { name: "Sentry", slug: 'sentry', careerUrl: "https://sentry.io/careers", platform: 'ashby', platformIdentifier: "sentry" },
  { name: "Snyk", slug: 'snyk', careerUrl: "https://snyk.io/careers", platform: 'ashby', platformIdentifier: "snyk" },
  { name: "Perplexity", slug: 'perplexity', careerUrl: "https://www.perplexity.ai/hub/careers", platform: 'ashby', platformIdentifier: "perplexity" },
  { name: "Modal Labs", slug: 'modal-labs', careerUrl: "https://modal.com/careers", platform: 'ashby', platformIdentifier: "modal" },
  { name: "Anyscale", slug: 'anyscale', careerUrl: "https://www.anyscale.com/careers", platform: 'ashby', platformIdentifier: "anyscale" },
  { name: "Roboflow", slug: 'roboflow', careerUrl: "https://roboflow.com/careers", platform: 'ashby', platformIdentifier: "roboflow" },
  { name: "Cohere", slug: 'cohere', careerUrl: "https://cohere.com/careers", platform: 'ashby', platformIdentifier: "cohere" },
  { name: "ElevenLabs", slug: 'elevenlabs', careerUrl: "https://elevenlabs.io/careers", platform: 'ashby', platformIdentifier: "elevenlabs" },
  { name: "Character AI", slug: 'character-ai', careerUrl: "https://character.ai/careers", platform: 'ashby', platformIdentifier: "character" },
  { name: "1Password", slug: '1password', careerUrl: "https://1password.com/careers", platform: 'ashby', platformIdentifier: "1password" },
  { name: "Chronosphere", slug: 'chronosphere', careerUrl: "https://chronosphere.io/careers", platform: 'ashby', platformIdentifier: "chronospherejobs" },
  { name: "Material Security", slug: 'material-security', careerUrl: "https://material.security/careers", platform: 'ashby', platformIdentifier: "materialsecurity" },
  { name: "Sublime Security", slug: 'sublime-security', careerUrl: "https://sublimesecurity.com/careers", platform: 'ashby', platformIdentifier: "sublime-security" },
  { name: "Drata", slug: 'drata', careerUrl: "https://drata.com/careers", platform: 'ashby', platformIdentifier: "drata" },
  { name: "Vanta", slug: 'vanta', careerUrl: "https://www.vanta.com/careers", platform: 'ashby', platformIdentifier: "vanta" },
  { name: "Stytch", slug: 'stytch', careerUrl: "https://stytch.com/careers", platform: 'ashby', platformIdentifier: "stytch" },
  { name: "Clerk", slug: 'clerk', careerUrl: "https://clerk.com/careers", platform: 'ashby', platformIdentifier: "Clerk" },
  { name: "WorkOS", slug: 'workos', careerUrl: "https://workos.com/careers", platform: 'ashby', platformIdentifier: "workos" },
  { name: "Stash", slug: 'stash', careerUrl: "https://www.stash.com/careers", platform: 'ashby', platformIdentifier: "stash" },
  { name: "Kraken", slug: 'kraken', careerUrl: "https://www.kraken.com/careers", platform: 'ashby', platformIdentifier: "kraken" },
  // ── Workday ────────────────────────────────
  { name: "Zendesk", slug: 'zendesk', careerUrl: "https://jobs.zendesk.com", platform: 'workday', platformIdentifier: "zendesk|wd1|zendesk" },
  { name: "AIG", slug: 'aig', careerUrl: "https://www.aig.com/careers", platform: 'workday', platformIdentifier: "aig|wd1|aig" },
  { name: "T. Rowe Price", slug: 't-rowe-price', careerUrl: "https://www.troweprice.com/corporate/us/en/careers.html", platform: 'workday', platformIdentifier: "troweprice|wd5|TRowePrice" },
  { name: "State Street", slug: 'state-street', careerUrl: "https://careers.statestreet.com", platform: 'workday', platformIdentifier: "statestreet|wd1|Global" },
  { name: "LendingClub", slug: 'lendingclub', careerUrl: "https://www.lendingclub.com/company/careers", platform: 'workday', platformIdentifier: "lendingclub|wd1|External" },

  // ── Custom (Puppeteer) - Big tech with bespoke career sites ─────────
  {
    name: 'Apple',
    slug: 'apple',
    careerUrl: 'https://jobs.apple.com/en-us/search',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'tbody tr.table-row, li.search-results-list-item',
      jobTitleSelector: 'a.table--advanced-search__title, [class*="title"]',
      jobLocationSelector: '[class*="location"]',
      jobDepartmentSelector: '[class*="team"]',
      jobLinkSelector: 'a',
    },
  },
  {
    name: 'Google',
    slug: 'google',
    careerUrl: 'https://www.google.com/about/careers/applications/jobs/results',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'li.lLd3Je',
      jobTitleSelector: 'h3',
      jobLocationSelector: 'span.r0wTof, span.pwO9Dc',
      jobLinkSelector: 'a.WpHeLc',
    },
  },
  {
    name: 'Microsoft',
    slug: 'microsoft',
    careerUrl: 'https://jobs.careers.microsoft.com/global/en/search',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: '[role="listitem"]',
      jobTitleSelector: 'h2',
      jobLocationSelector: '[aria-label*="location"]',
      jobLinkSelector: 'a',
    },
  },
  {
    name: 'Amazon',
    slug: 'amazon',
    careerUrl: 'https://www.amazon.jobs/en/search.json?sort=recent',
    platform: 'custom',
    requiresJavaScript: false,
  },
  {
    name: 'Meta',
    slug: 'meta',
    careerUrl: 'https://www.metacareers.com/jobs',
    platform: 'custom',
    requiresJavaScript: true,
    customSelectors: {
      jobListSelector: 'a[href*="/jobs/"]',
      jobTitleSelector: 'div',
      jobLocationSelector: '[class*="location"]',
    },
  },
  {
    name: 'Tesla',
    slug: 'tesla',
    careerUrl: 'https://www.tesla.com/careers/search',
    platform: 'custom',
    requiresJavaScript: true,
  },
  {
    name: 'Uber',
    slug: 'uber',
    careerUrl: 'https://www.uber.com/global/en/careers/list',
    platform: 'custom',
    requiresJavaScript: true,
  },
  {
    name: 'Shopify',
    slug: 'shopify',
    careerUrl: 'https://www.shopify.com/careers/search',
    platform: 'custom',
    requiresJavaScript: true,
  },
];

class CompanyRegistry {
  private companies = new Map<string, CompanyConfig>();

  constructor(initial: CompanyConfig[]) {
    for (const cfg of initial) this.companies.set(cfg.slug, cfg);
  }

  list(): CompanyConfig[] {
    return Array.from(this.companies.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(nameOrSlug: string): CompanyConfig | undefined {
    const slug = this.normalizeSlug(nameOrSlug);
    if (this.companies.has(slug)) return this.companies.get(slug);
    const lower = nameOrSlug.toLowerCase();
    for (const cfg of this.companies.values()) {
      if (cfg.name.toLowerCase() === lower) return cfg;
    }
    return undefined;
  }

  add(config: CompanyConfig): void {
    this.companies.set(config.slug, config);
    logger.info(`Registered company: ${config.name} (${config.platform})`);
  }

  createScraper(config: CompanyConfig): BaseScraper {
    switch (config.platform) {
      case 'greenhouse':
        return new GreenhouseScraper(config);
      case 'lever':
        return new LeverScraper(config);
      case 'ashby':
        return new AshbyScraper(config);
      case 'smartrecruiters':
        return new SmartRecruitersScraper(config);
      case 'workday':
        return new WorkdayScraper(config);
      case 'custom':
        return new CustomPuppeteerScraper(config);
      default:
        throw new Error(`Unsupported platform: ${config.platform}`);
    }
  }

  normalizeSlug(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const companyRegistry = new CompanyRegistry(PRECONFIGURED);
