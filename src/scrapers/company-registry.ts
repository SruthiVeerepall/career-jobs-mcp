import type { CompanyConfig } from '../types.js';
import { BaseScraper } from './base-scraper.js';
import { GreenhouseScraper } from './platforms/greenhouse.js';
import { LeverScraper } from './platforms/lever.js';
import { AshbyScraper } from './platforms/ashby.js';
import { SmartRecruitersScraper } from './platforms/smartrecruiters.js';
import { WorkdayScraper } from './platforms/workday.js';
import { OracleOrcScraper } from './platforms/oracle-orc.js';
import { IcimsScraper } from './platforms/icims.js';
import { IcimsJraScraper } from './platforms/icims-jra.js';
import { EightfoldScraper } from './platforms/eightfold.js';
import { RipplingScraper } from './platforms/rippling.js';
import { CustomPuppeteerScraper } from './platforms/custom-puppeteer.js';
import { AmazonScraper } from './platforms/amazon.js';
import { AppleScraper } from './platforms/apple.js';
import { TeslaScraper } from './platforms/tesla.js';
import { McKinseyScraper } from './platforms/mckinsey.js';
import { AuroraScraper } from './platforms/aurora.js';
import { LinkedInScraper } from './platforms/linkedin.js';
import { SimplyHiredScraper } from './platforms/simplyhired.js';
import { BuiltInScraper } from './platforms/builtin.js';
import { RemoteOKScraper } from './platforms/remoteok.js';
import { RemotiveScraper } from './platforms/remotive.js';
import { WeWorkRemotelyScraper } from './platforms/weworkremotely.js';
import { logger } from '../utils/logger.js';

const PRECONFIGURED: CompanyConfig[] = [
  { name: 'Stripe', slug: 'stripe', careerUrl: 'https://stripe.com/jobs', platform: 'greenhouse', platformIdentifier: 'stripe' },
{ name: 'Airbnb', slug: 'airbnb', careerUrl: 'https://careers.airbnb.com', platform: 'greenhouse', platformIdentifier: 'airbnb' },
{ name: 'Discord', slug: 'discord', careerUrl: 'https://discord.com/jobs', platform: 'greenhouse', platformIdentifier: 'discord' },
{ name: 'GitLab', slug: 'gitlab', careerUrl: 'https://about.gitlab.com/jobs', platform: 'greenhouse', platformIdentifier: 'gitlab' },
{ name: 'Reddit', slug: 'reddit', careerUrl: 'https://www.redditinc.com/careers', platform: 'greenhouse', platformIdentifier: 'reddit' },
{ name: 'Twilio', slug: 'twilio', careerUrl: 'https://www.twilio.com/company/jobs', platform: 'greenhouse', platformIdentifier: 'twilio' },
{ name: 'Pinterest', slug: 'pinterest', careerUrl: 'https://www.pinterestcareers.com', platform: 'greenhouse', platformIdentifier: 'pinterest' },
{ name: 'Instacart', slug: 'instacart', careerUrl: 'https://instacart.careers', platform: 'greenhouse', platformIdentifier: 'instacart' },
{ name: 'Anthropic', slug: 'anthropic', careerUrl: 'https://www.anthropic.com/careers', platform: 'greenhouse', platformIdentifier: 'anthropic' },
{ name: 'Robinhood', slug: 'robinhood', careerUrl: 'https://careers.robinhood.com', platform: 'greenhouse', platformIdentifier: 'robinhood' },
{ name: 'Figma', slug: 'figma', careerUrl: 'https://www.figma.com/careers', platform: 'greenhouse', platformIdentifier: 'figma' },
{ name: 'Databricks', slug: 'databricks', careerUrl: 'https://www.databricks.com/company/careers', platform: 'greenhouse', platformIdentifier: 'databricks' },
// Netflix left Lever; jobs.netflix.com now redirects to its Eightfold site.
{ name: 'Netflix', slug: 'netflix', careerUrl: 'https://explore.jobs.netflix.net/careers', platform: 'eightfold', platformIdentifier: 'explore.jobs.netflix.net|netflix.com' },
{ name: 'Linear', slug: 'linear', careerUrl: 'https://linear.app/careers', platform: 'ashby', platformIdentifier: 'linear' },
{ name: 'PostHog', slug: 'posthog', careerUrl: 'https://posthog.com/careers', platform: 'ashby', platformIdentifier: 'posthog' },
{ name: 'Ramp', slug: 'ramp', careerUrl: 'https://ramp.com/careers', platform: 'ashby', platformIdentifier: 'ramp' },
{ name: 'Visa', slug: 'visa', careerUrl: 'https://corporate.visa.com/en/jobs', platform: 'smartrecruiters', platformIdentifier: 'Visa' },
{ name: 'Bosch', slug: 'bosch', careerUrl: 'https://www.bosch.com/careers', platform: 'smartrecruiters', platformIdentifier: 'BoschGroup' },
{ name: 'Salesforce', slug: 'salesforce', careerUrl: 'https://careers.salesforce.com', platform: 'workday', platformIdentifier: 'salesforce|wd1|External_Career_Site' },
{ name: 'Adobe', slug: 'adobe', careerUrl: 'https://careers.adobe.com', platform: 'workday', platformIdentifier: 'adobe|wd5|external_experienced' },
{ name: 'JPMorgan Chase', slug: 'jpmorgan', careerUrl: 'https://careers.jpmorganchase.com', platform: 'workday', platformIdentifier: 'jpmc|wd1|jpmc' },
{ name: 'Citi', slug: 'citi', careerUrl: 'https://jobs.citi.com', platform: 'workday', platformIdentifier: 'citi|wd5|2' },
{ name: 'Goldman Sachs', slug: 'goldman-sachs', careerUrl: 'https://www.goldmansachs.com/careers', platform: 'workday', platformIdentifier: 'goldman|wd1|GS_EXT_CAREERS' },
{ name: 'NVIDIA', slug: 'nvidia', careerUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers', platform: 'workday', platformIdentifier: 'nvidia|wd5|NVIDIAExternalCareerSite' },
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
{ name: "PagerDuty", slug: 'pagerduty', careerUrl: "https://www.pagerduty.com/careers", platform: 'greenhouse', platformIdentifier: "pagerduty" },
{ name: "CircleCI", slug: 'circleci', careerUrl: "https://circleci.com/careers", platform: 'greenhouse', platformIdentifier: "circleci" },
{ name: "Postman", slug: 'postman', careerUrl: "https://www.postman.com/careers", platform: 'greenhouse', platformIdentifier: "postman" },
{ name: "Fivetran", slug: 'fivetran', careerUrl: "https://www.fivetran.com/careers", platform: 'greenhouse', platformIdentifier: "fivetran" },
// dbt Labs removed — merged with Fivetran; getdbt.com/about-us/careers now links every
// role to fivetran.com/careers/job?gh_jid=…, i.e. the `fivetran` Greenhouse board already
// in this registry. Re-adding it would double-count the same postings.
{ name: "SAS Institute", slug: 'sas-institute', careerUrl: "https://www.sas.com/en_us/careers.html", platform: 'greenhouse', platformIdentifier: "sas" },
{ name: "Sisense", slug: 'sisense', careerUrl: "https://www.sisense.com/careers", platform: 'greenhouse', platformIdentifier: "sisense" },
{ name: "Grafana Labs", slug: 'grafana-labs', careerUrl: "https://grafana.com/about/careers", platform: 'greenhouse', platformIdentifier: "grafanalabs" },
{ name: "Amplitude", slug: 'amplitude', careerUrl: "https://amplitude.com/careers", platform: 'greenhouse', platformIdentifier: "amplitude" },
{ name: "Scale AI", slug: 'scale-ai', careerUrl: "https://scale.com/careers", platform: 'greenhouse', platformIdentifier: "scaleai" },
{ name: "C3.ai", slug: 'c3-ai', careerUrl: "https://c3.ai/careers", platform: 'greenhouse', platformIdentifier: "c3ascend" },
{ name: "AssemblyAI", slug: 'assemblyai', careerUrl: "https://www.assemblyai.com/careers", platform: 'greenhouse', platformIdentifier: "assemblyai" },
{ name: "X Corp", slug: 'x-corp', careerUrl: "https://careers.x.com", platform: 'greenhouse', platformIdentifier: "xai" },
{ name: "Duolingo", slug: 'duolingo', careerUrl: "https://careers.duolingo.com", platform: 'greenhouse', platformIdentifier: "duolingo" },
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
{ name: "CoStar Group", slug: 'costar-group', careerUrl: "https://careers.costargroup.com", platform: 'greenhouse', platformIdentifier: "costar" },
{ name: "Flexport", slug: 'flexport', careerUrl: "https://www.flexport.com/careers", platform: 'greenhouse', platformIdentifier: "flexport" },
{ name: "project44", slug: 'project44', careerUrl: "https://www.project44.com/careers", platform: 'greenhouse', platformIdentifier: "project44" },
{ name: "FourKites", slug: 'fourkites', careerUrl: "https://www.fourkites.com/careers", platform: 'greenhouse', platformIdentifier: "fourkites" },
{ name: "Udemy", slug: 'udemy', careerUrl: "https://about.udemy.com/careers", platform: 'greenhouse', platformIdentifier: "udemy" },
{ name: "DataCamp", slug: 'datacamp', careerUrl: "https://www.datacamp.com/jobs", platform: 'greenhouse', platformIdentifier: "datacamp" },
{ name: "Greenhouse", slug: 'greenhouse', careerUrl: "https://www.greenhouse.com/careers", platform: 'greenhouse', platformIdentifier: "greenhouse" },
{ name: "Gusto", slug: 'gusto', careerUrl: "https://gusto.com/about/careers", platform: 'greenhouse', platformIdentifier: "gusto" },
{ name: "Justworks", slug: 'justworks', careerUrl: "https://www.justworks.com/careers", platform: 'greenhouse', platformIdentifier: "justworks" },
// Root moved off Greenhouse to the Rippling ATS.
{ name: "Root Insurance", slug: 'root-insurance', careerUrl: "https://www.joinroot.com/careers", platform: 'rippling', platformIdentifier: "joinroot" },
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
{ name: "Lucidchart", slug: 'lucidchart', careerUrl: "https://www.lucid.co/careers", platform: 'greenhouse', platformIdentifier: "lucidsoftware" },
{ name: "Everlaw", slug: 'everlaw', careerUrl: "https://www.everlaw.com/careers", platform: 'greenhouse', platformIdentifier: "everlaw" },
{ name: "Sage Intacct", slug: 'sage-intacct', careerUrl: "https://www.sage.com/en-us/company/careers", platform: 'greenhouse', platformIdentifier: "sage" },
{ name: "Bill.com", slug: 'bill-com', careerUrl: "https://www.bill.com/careers", platform: 'greenhouse', platformIdentifier: "billcom" },
{ name: "Upstart", slug: 'upstart', careerUrl: "https://www.upstart.com/careers", platform: 'greenhouse', platformIdentifier: "upstart" },
{ name: "Waymo", slug: 'waymo', careerUrl: "https://waymo.com/careers", platform: 'greenhouse', platformIdentifier: "waymo" },
// Aurora runs Ashby underneath, but its Ashby board is not public — see aurora.ts.
{ name: "Aurora Innovation", slug: 'aurora-innovation', careerUrl: "https://aurora.tech/careers", platform: 'aurora' },
{ name: "Nuro", slug: 'nuro', careerUrl: "https://www.nuro.ai/careers", platform: 'greenhouse', platformIdentifier: "nuro" },
{ name: "Peloton", slug: 'peloton', careerUrl: "https://careers.onepeloton.com", platform: 'greenhouse', platformIdentifier: "peloton" },
{ name: "Modern Health", slug: 'modern-health', careerUrl: "https://www.modernhealth.com/careers", platform: 'greenhouse', platformIdentifier: "modernhealth" },
{ name: "Talkspace", slug: 'talkspace', careerUrl: "https://www.talkspace.com/careers", platform: 'greenhouse', platformIdentifier: "talkspacetherapist" },
{ name: "BetterHelp", slug: 'betterhelp', careerUrl: "https://www.betterhelp.com/careers", platform: 'greenhouse', platformIdentifier: "betterhelpcom" },
{ name: "Cerebral", slug: 'cerebral', careerUrl: "https://cerebral.com/careers", platform: 'greenhouse', platformIdentifier: "cerebral" },
{ name: "TCS", slug: 'tcs', careerUrl: "https://www.tcs.com/careers", platform: 'greenhouse', platformIdentifier: "tcs" },
{ name: "Appian", slug: 'appian', careerUrl: "https://www.appian.com/careers", platform: 'greenhouse', platformIdentifier: "appian" },
{ name: "Wasabi", slug: 'wasabi', careerUrl: "https://wasabi.com/company/careers", platform: 'greenhouse', platformIdentifier: "wasabi" },
{ name: "Five9", slug: 'five9', careerUrl: "https://www.five9.com/about/careers", platform: 'greenhouse', platformIdentifier: "five9" },
{ name: "NICE", slug: 'nice', careerUrl: "https://www.nice.com/about/careers", platform: 'greenhouse', platformIdentifier: "nice" },
{ name: "Vonage", slug: 'vonage', careerUrl: "https://www.vonage.com/careers", platform: 'greenhouse', platformIdentifier: "vonage" },
{ name: "Monzo", slug: 'monzo', careerUrl: "https://monzo.com/careers", platform: 'greenhouse', platformIdentifier: "monzo" },
{ name: "Palantir Technologies", slug: 'palantir-technologies', careerUrl: "https://www.palantir.com/careers", platform: 'lever', platformIdentifier: "palantir" },
{ name: "Veeva Systems", slug: 'veeva-systems', careerUrl: "https://careers.veeva.com", platform: 'lever', platformIdentifier: "veeva" },
// Atlassian removed — left Lever for a self-hosted board. Its listings come from
// www.atlassian.com/gateway/api/graphql, and the documented REST endpoints
// (/endpoints/careers/listings) answer 401 "authorization header missing".
{ name: "Wealthfront", slug: 'wealthfront', careerUrl: "https://www.wealthfront.com/careers", platform: 'lever', platformIdentifier: "wealthfront" },
// Buildium removed — buildium.com/about/careers is a 404; hiring moved to parent
// RealPage on iCIMS, and both `realpage` and `buildium` return 0 jobs through IcimsScraper.
{ name: "Blue Yonder", slug: 'blue-yonder', careerUrl: "https://blueyonder.com/about/careers", platform: 'lever', platformIdentifier: "blue" },
{ name: "Coupa Software", slug: 'coupa-software', careerUrl: "https://www.coupa.com/company/careers", platform: 'lever', platformIdentifier: "coupa" },
{ name: "TriNet", slug: 'trinet', careerUrl: "https://www.trinet.com/about-us/careers", platform: 'lever', platformIdentifier: "trinet" },
{ name: "MetLife", slug: 'metlife', careerUrl: "https://jobs.metlife.com", platform: 'lever', platformIdentifier: "metlife" },
{ name: "Blue Origin", slug: 'blue-origin', careerUrl: "https://www.blueorigin.com/careers", platform: 'lever', platformIdentifier: "blueorigin" },
{ name: "Zoox", slug: 'zoox', careerUrl: "https://zoox.com/careers", platform: 'lever', platformIdentifier: "zoox" },
{ name: "Lyra Health", slug: 'lyra-health', careerUrl: "https://www.lyrahealth.com/careers", platform: 'lever', platformIdentifier: "lyrahealth" },
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
{ name: "Workday", slug: 'workday', careerUrl: "https://www.workday.com/en-us/company/careers.html", platform: 'workday', platformIdentifier: "workday|wd5|Workday" },
{ name: "Rackspace", slug: 'rackspace', careerUrl: "https://www.rackspace.com/talent", platform: 'workday', platformIdentifier: "rackspace|wd1|External" },
{ name: "Qualys", slug: 'qualys', careerUrl: "https://www.qualys.com/company/careers", platform: 'workday', platformIdentifier: "qualys|wd5|Careers" },
{ name: "Micron Technology", slug: 'micron-technology', careerUrl: "https://careers.micron.com", platform: 'workday', platformIdentifier: "micron|wd1|External" },
{ name: "KLA Corporation", slug: 'kla-corporation', careerUrl: "https://careers.kla.com", platform: 'workday', platformIdentifier: "kla|wd1|Search" },
{ name: "Zebra Technologies", slug: 'zebra-technologies', careerUrl: "https://careers.zebra.com", platform: 'workday', platformIdentifier: "zebra|wd501|Zebra_careers" },
{ name: "Red Hat", slug: 'red-hat', careerUrl: "https://www.redhat.com/en/jobs", platform: 'workday', platformIdentifier: "redhat|wd5|jobs" },
{ name: "Alteryx", slug: 'alteryx', careerUrl: "https://www.alteryx.com/careers", platform: 'workday', platformIdentifier: "alteryx|wd108|AlteryxCareers" },
{ name: "Epicor", slug: 'epicor', careerUrl: "https://www.epicor.com/en-us/careers", platform: 'workday', platformIdentifier: "epicorsoftware|wd5|epicorjobs" },
{ name: "PTC", slug: 'ptc', careerUrl: "https://www.ptc.com/en/careers", platform: 'workday', platformIdentifier: "ptc|wd1|PTC" },
{ name: "T-Mobile", slug: 't-mobile', careerUrl: "https://careers.t-mobile.com", platform: 'workday', platformIdentifier: "tmobile|wd1|External" },
{ name: "F5 Networks", slug: 'f5-networks', careerUrl: "https://www.f5.com/company/careers", platform: 'workday', platformIdentifier: "ffive|wd5|f5jobs" },
{ name: "Elevance Health", slug: 'elevance-health', careerUrl: "https://careers.elevancehealth.com", platform: 'workday', platformIdentifier: "elevancehealth|wd1|ANT" },
{ name: "Cigna", slug: 'cigna', careerUrl: "https://jobs.cigna.com", platform: 'workday', platformIdentifier: "cigna|wd5|cignacareers" },
{ name: "Blue Cross Blue Shield", slug: 'blue-cross-blue-shield', careerUrl: "https://www.bcbs.com/careers", platform: 'workday', platformIdentifier: "bcbsa|wd1|Careers" },
{ name: "Highmark Health", slug: 'highmark-health', careerUrl: "https://careers.highmarkhealth.org", platform: 'workday', platformIdentifier: "highmarkhealth|wd1|highmark" },
{ name: "UPMC Health Plan", slug: 'upmc-health-plan', careerUrl: "https://careers.upmc.com", platform: 'workday', platformIdentifier: "gohealthuc|wd12|External" },
{ name: "Intel", slug: 'intel', careerUrl: "https://www.intel.com/content/www/us/en/jobs/jobs-at-intel.html", platform: 'workday', platformIdentifier: "intel|wd1|External" },
{ name: "Devoted Health", slug: 'devoted-health', careerUrl: "https://www.devoted.com/careers", platform: 'workday', platformIdentifier: "devoted|wd1|Devoted" },
{ name: "Allscripts", slug: 'allscripts', careerUrl: "https://www.allscripts.com/careers", platform: 'workday', platformIdentifier: "veradigm|wd12|VR" },
{ name: "NextGen Healthcare", slug: 'nextgen-healthcare', careerUrl: "https://www.nextgen.com/company/careers", platform: 'workday', platformIdentifier: "nextgen|wd5|NextGen_Careers" },
{ name: "Teladoc Health", slug: 'teladoc-health', careerUrl: "https://careers.teladochealth.com", platform: 'workday', platformIdentifier: "teladoc|wd503|teladochealth_is_hiring" },
{ name: "Exact Sciences", slug: 'exact-sciences', careerUrl: "https://careers.exactsciences.com", platform: 'workday', platformIdentifier: "exactsciences|wd1|Exact_Sciences" },
{ name: "Illumina", slug: 'illumina', careerUrl: "https://www.illumina.com/company/careers.html", platform: 'workday', platformIdentifier: "illumina|wd1|illumina-careers" },
{ name: "Bank of America", slug: 'bank-of-america', careerUrl: "https://careers.bankofamerica.com", platform: 'workday', platformIdentifier: "ghr|wd1|lateral-us" },
{ name: "U.S. Bancorp", slug: 'u-s-bancorp', careerUrl: "https://careers.usbank.com", platform: 'workday', platformIdentifier: "usbank|wd1|US_Bank_Careers" },
{ name: "Capital One", slug: 'capital-one', careerUrl: "https://www.capitalonecareers.com", platform: 'workday', platformIdentifier: "capitalone|wd5|USA_Job_Board" },
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
{ name: "Materialize", slug: 'materialize', careerUrl: "https://materialize.com/careers", platform: 'ashby', platformIdentifier: "materialize" },
{ name: "ZoomInfo", slug: 'zoominfo', careerUrl: "https://www.zoominfo.com/about/careers", platform: 'greenhouse', platformIdentifier: "zoominfo" },
{ name: "Apollo.io", slug: 'apollo-io', careerUrl: "https://www.apollo.io/careers", platform: 'greenhouse', platformIdentifier: "apolloio" },
{ name: "HubSpot", slug: 'hubspot', careerUrl: "https://www.hubspot.com/jobs", platform: 'greenhouse', platformIdentifier: "hubspot" },
{ name: "Pendo", slug: 'pendo', careerUrl: "https://www.pendo.io/careers", platform: 'greenhouse', platformIdentifier: "pendo" },
{ name: "Hex Technologies", slug: 'hex-technologies', careerUrl: "https://hex.tech/careers", platform: 'greenhouse', platformIdentifier: "hextechnologies" },
{ name: "Inflection AI", slug: 'inflection-ai', careerUrl: "https://inflection.ai/careers", platform: 'greenhouse', platformIdentifier: "inflectionai" },
{ name: "Together AI", slug: 'together-ai', careerUrl: "https://www.together.ai/careers", platform: 'greenhouse', platformIdentifier: "togetherai" },
{ name: "Fireworks AI", slug: 'fireworks-ai', careerUrl: "https://fireworks.ai/careers", platform: 'ashby', platformIdentifier: "fireworks" },
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
{ name: "Carta", slug: 'carta', careerUrl: "https://carta.com/careers", platform: 'greenhouse', platformIdentifier: "carta" },
{ name: "Mercury", slug: 'mercury', careerUrl: "https://mercury.com/jobs", platform: 'greenhouse', platformIdentifier: "mercury" },
{ name: "Public.com", slug: 'public-com', careerUrl: "https://public.com/careers", platform: 'greenhouse', platformIdentifier: "public" },
{ name: "LendingTree", slug: 'lendingtree', careerUrl: "https://www.lendingtree.com/careers", platform: 'greenhouse', platformIdentifier: "lendingtree" },
{ name: "LPL Financial", slug: 'lpl-financial', careerUrl: "https://lpl.wd1.myworkdayjobs.com", platform: 'greenhouse', platformIdentifier: "lpl" },
{ name: "Robinhood Crypto", slug: 'robinhood-crypto', careerUrl: "https://careers.robinhood.com", platform: 'greenhouse', platformIdentifier: "robinhood" },
{ name: "Gemini", slug: 'gemini', careerUrl: "https://www.gemini.com/careers", platform: 'greenhouse', platformIdentifier: "gemini" },
{ name: "Fireblocks", slug: 'fireblocks', careerUrl: "https://www.fireblocks.com/careers", platform: 'greenhouse', platformIdentifier: "fireblocks" },
{ name: "Neon", slug: 'neon', careerUrl: "https://neon.tech/careers", platform: 'lever', platformIdentifier: "neon" },
{ name: "Sonatype", slug: 'sonatype', careerUrl: "https://www.sonatype.com/company/careers", platform: 'lever', platformIdentifier: "sonatype" },
{ name: "Outreach", slug: 'outreach', careerUrl: "https://www.outreach.io/company/careers", platform: 'lever', platformIdentifier: "outreach" },
{ name: "Secureframe", slug: 'secureframe', careerUrl: "https://secureframe.com/careers", platform: 'lever', platformIdentifier: "secureframe" },
{ name: "Greenlight", slug: 'greenlight', careerUrl: "https://greenlight.com/careers", platform: 'lever', platformIdentifier: "greenlight" },
{ name: "Anchorage Digital", slug: 'anchorage-digital', careerUrl: "https://www.anchorage.com/careers", platform: 'lever', platformIdentifier: "anchorage" },
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
{ name: "Zendesk", slug: 'zendesk', careerUrl: "https://jobs.zendesk.com", platform: 'workday', platformIdentifier: "zendesk|wd1|zendesk" },
{ name: "AIG", slug: 'aig', careerUrl: "https://www.aig.com/careers", platform: 'workday', platformIdentifier: "aig|wd1|aig" },
{ name: "T. Rowe Price", slug: 't-rowe-price', careerUrl: "https://www.troweprice.com/corporate/us/en/careers.html", platform: 'workday', platformIdentifier: "troweprice|wd5|TRowePrice" },
{ name: "State Street", slug: 'state-street', careerUrl: "https://careers.statestreet.com", platform: 'workday', platformIdentifier: "statestreet|wd1|Global" },
{ name: "LendingClub", slug: 'lendingclub', careerUrl: "https://www.lendingclub.com/company/careers", platform: 'workday', platformIdentifier: "lendingclub|wd1|External" },
{ name: "Smartsheet", slug: 'smartsheet', careerUrl: "https://www.smartsheet.com/careers", platform: 'greenhouse', platformIdentifier: "smartsheet" },
{ name: "Klaviyo", slug: 'klaviyo', careerUrl: "https://www.klaviyo.com/careers", platform: 'greenhouse', platformIdentifier: "klaviyo" },
{ name: "Intercom", slug: 'intercom', careerUrl: "https://www.intercom.com/careers", platform: 'greenhouse', platformIdentifier: "intercom" },
{ name: "Toast", slug: 'toast', careerUrl: "https://careers.toasttab.com", platform: 'greenhouse', platformIdentifier: "toast" },
{ name: "Calendly", slug: 'calendly', careerUrl: "https://calendly.com/jobs", platform: 'greenhouse', platformIdentifier: "calendly" },
{ name: "Tanium", slug: 'tanium', careerUrl: "https://www.tanium.com/careers", platform: 'greenhouse', platformIdentifier: "tanium" },
{ name: "Carbon Black", slug: 'carbon-black', careerUrl: "https://www.carbonblack.com/company/careers", platform: 'greenhouse', platformIdentifier: "carbon" },
{ name: "LaunchDarkly", slug: 'launchdarkly', careerUrl: "https://launchdarkly.com/careers", platform: 'greenhouse', platformIdentifier: "launchdarkly" },
{ name: "Split.io", slug: 'split-io', careerUrl: "https://www.split.io/careers", platform: 'greenhouse', platformIdentifier: "harnessinc" },
{ name: "Backblaze", slug: 'backblaze', careerUrl: "https://www.backblaze.com/company/jobs", platform: 'greenhouse', platformIdentifier: "backblaze" },
{ name: "Rubrik", slug: 'rubrik', careerUrl: "https://www.rubrik.com/company/careers", platform: 'greenhouse', platformIdentifier: "rubrik" },
{ name: "Commvault", slug: 'commvault', careerUrl: "https://www.commvault.com/careers", platform: 'greenhouse', platformIdentifier: "commvault" },
{ name: "Lincoln Financial", slug: 'lincoln-financial', careerUrl: "https://www.lfg.com/public/aboutus/careers", platform: 'greenhouse', platformIdentifier: "lincoln" },
{ name: "Adyen", slug: 'adyen', careerUrl: "https://careers.adyen.com", platform: 'greenhouse', platformIdentifier: "adyen" },
{ name: "Hudson River Trading", slug: 'hudson-river-trading', careerUrl: "https://www.hudsonrivertrading.com/careers", platform: 'greenhouse', platformIdentifier: "hrttalentcommunity" },
{ name: "IMC Trading", slug: 'imc-trading', careerUrl: "https://www.imc.com/us/careers", platform: 'greenhouse', platformIdentifier: "imc" },
{ name: "Optiver", slug: 'optiver', careerUrl: "https://optiver.com/careers", platform: 'greenhouse', platformIdentifier: "optiver" },
{ name: "AQR Capital Management", slug: 'aqr-capital-management', careerUrl: "https://www.aqr.com/About-Us/Careers", platform: 'greenhouse', platformIdentifier: "aqr" },
{ name: "Point72", slug: 'point72', careerUrl: "https://careers.point72.com", platform: 'greenhouse', platformIdentifier: "point72" },
{ name: "Freshworks", slug: 'freshworks', careerUrl: "https://www.freshworks.com/company/careers", platform: 'lever', platformIdentifier: "freshworks" },
{ name: "Sysdig", slug: 'sysdig', careerUrl: "https://sysdig.com/careers", platform: 'lever', platformIdentifier: "sysdig" },
{ name: "ClickUp", slug: 'clickup', careerUrl: "https://clickup.com/careers", platform: 'ashby', platformIdentifier: "clickup" },
{ name: "Loom", slug: 'loom', careerUrl: "https://www.loom.com/careers", platform: 'ashby', platformIdentifier: "loom" },
{ name: "Zapier", slug: 'zapier', careerUrl: "https://zapier.com/jobs", platform: 'ashby', platformIdentifier: "zapier" },
{ name: "Illumio", slug: 'illumio', careerUrl: "https://www.illumio.com/company/careers", platform: 'ashby', platformIdentifier: "illumio" },
{ name: "Replit", slug: 'replit', careerUrl: "https://replit.com/careers", platform: 'ashby', platformIdentifier: "replit" },
{ name: "Render", slug: 'render', careerUrl: "https://render.com/jobs", platform: 'ashby', platformIdentifier: "render" },
{ name: "Railway", slug: 'railway', careerUrl: "https://railway.com/careers", platform: 'ashby', platformIdentifier: "railway" },
{ name: "ServiceTitan", slug: 'servicetitan', careerUrl: "https://www.servicetitan.com/careers", platform: 'workday', platformIdentifier: "servicetitan|wd1|ServiceTitan" },
{ name: "CrowdStrike", slug: 'crowdstrike', careerUrl: "https://www.crowdstrike.com/careers", platform: 'workday', platformIdentifier: "crowdstrike|wd5|crowdstrikecareers" },
{ name: "Forcepoint", slug: 'forcepoint', careerUrl: "https://www.forcepoint.com/company/careers", platform: 'workday', platformIdentifier: "forcepoint|wd1|external-careers" },
{ name: "Proofpoint", slug: 'proofpoint', careerUrl: "https://www.proofpoint.com/us/company/careers", platform: 'workday', platformIdentifier: "proofpoint|wd5|proofpointcareers" },
{ name: "KeyBank", slug: 'keybank', careerUrl: "https://careers.key.com", platform: 'workday', platformIdentifier: "keybank|wd5|External_Career_Site" },
{ name: "Invesco", slug: 'invesco', careerUrl: "https://careers.invesco.com", platform: 'workday', platformIdentifier: "invesco|wd1|IVZ" },
{ name: "The Hartford", slug: 'the-hartford', careerUrl: "https://www.thehartford.com/careers", platform: 'workday', platformIdentifier: "thehartford|wd5|Careers_External" },
{ name: "USAA", slug: 'usaa', careerUrl: "https://www.usaajobs.com", platform: 'workday', platformIdentifier: "usaa|wd1|USAAJOBSWD" },
{ name: "Allstate", slug: 'allstate', careerUrl: "https://www.allstate.jobs", platform: 'workday', platformIdentifier: "allstate|wd5|allstate_careers" },
{ name: "Mastercard", slug: 'mastercard', careerUrl: "https://careers.mastercard.com", platform: 'workday', platformIdentifier: "mastercard|wd1|CorporateCareers" },
{ name: "Broadridge", slug: 'broadridge', careerUrl: "https://www.broadridge.com/careers", platform: 'workday', platformIdentifier: "broadridge|wd5|Careers" },
{ name: "BlackRock", slug: 'blackrock', careerUrl: "https://careers.blackrock.com", platform: 'workday', platformIdentifier: "blackrock|wd1|BlackRock_Professional" },
{ name: "PayPal", slug: 'paypal', careerUrl: "https://careers.pypl.com", platform: 'workday', platformIdentifier: "paypal|wd1|jobs" },
{ name: "Wells Fargo", slug: 'wells-fargo', careerUrl: "https://www.wellsfargojobs.com", platform: 'workday', platformIdentifier: "wf|wd1|WellsFargoJobs" },
{ name: "Cybereason", slug: 'cybereason', careerUrl: "https://www.cybereason.com/careers", platform: 'greenhouse', platformIdentifier: "cybereason" },
{ name: "ExtraHop", slug: 'extrahop', careerUrl: "https://www.extrahop.com/company/careers", platform: 'greenhouse', platformIdentifier: "extrahopnetworks" },
{ name: "Netskope", slug: 'netskope', careerUrl: "https://www.netskope.com/company/careers", platform: 'greenhouse', platformIdentifier: "netskope" },
{ name: "Onapsis", slug: 'onapsis', careerUrl: "https://onapsis.com/careers", platform: 'greenhouse', platformIdentifier: "onapsis" },
{ name: "BigID", slug: 'bigid', careerUrl: "https://bigid.com/careers", platform: 'greenhouse', platformIdentifier: "bigid" },
{ name: "Universal Health Services", slug: 'universal-health-services', careerUrl: "https://uhscareers.com", platform: 'greenhouse', platformIdentifier: "universal" },
{ name: "ICON plc", slug: 'icon-plc', careerUrl: "https://careers.iconplc.com", platform: 'greenhouse', platformIdentifier: "icon" },
{ name: "Charles River Laboratories", slug: 'charles-river-laboratories', careerUrl: "https://jobs.criver.com", platform: 'greenhouse', platformIdentifier: "charles" },
{ name: "Anaplan", slug: 'anaplan', careerUrl: "https://www.anaplan.com/company/careers", platform: 'greenhouse', platformIdentifier: "anaplan" },
{ name: "Sigma Computing", slug: 'sigma-computing', careerUrl: "https://www.sigmacomputing.com/careers", platform: 'greenhouse', platformIdentifier: "sigmacomputing" },
{ name: "xAI", slug: 'xai', careerUrl: "https://x.ai/careers", platform: 'greenhouse', platformIdentifier: "xai" },
{ name: "Comet", slug: 'comet', careerUrl: "https://www.comet.com/site/careers", platform: 'greenhouse', platformIdentifier: "comet" },
{ name: "RunPod", slug: 'runpod', careerUrl: "https://www.runpod.io/careers", platform: 'ashby', platformIdentifier: "runpod" },
{ name: "CoreWeave", slug: 'coreweave', careerUrl: "https://www.coreweave.com/careers", platform: 'greenhouse', platformIdentifier: "coreweave" },
{ name: "Tenstorrent", slug: 'tenstorrent', careerUrl: "https://tenstorrent.com/careers", platform: 'greenhouse', platformIdentifier: "tenstorrent" },
{ name: "Stitch Fix", slug: 'stitch-fix', careerUrl: "https://www.stitchfix.com/careers", platform: 'greenhouse', platformIdentifier: "stitchfix" },
{ name: "Faire", slug: 'faire', careerUrl: "https://www.faire.com/careers", platform: 'greenhouse', platformIdentifier: "faire" },
{ name: "Mercari", slug: 'mercari', careerUrl: "https://careers.mercari.com", platform: 'greenhouse', platformIdentifier: "mercari" },
{ name: "OfferUp", slug: 'offerup', careerUrl: "https://about.offerup.com/careers", platform: 'greenhouse', platformIdentifier: "offerup" },
{ name: "Sony Interactive", slug: 'sony-interactive', careerUrl: "https://www.playstation.com/careers", platform: 'greenhouse', platformIdentifier: "naughtydog" },
{ name: "Niantic", slug: 'niantic', careerUrl: "https://nianticlabs.com/careers", platform: 'greenhouse', platformIdentifier: "scopely" },
{ name: "Toast Tax", slug: 'toast-tax', careerUrl: "https://careers.toasttab.com", platform: 'greenhouse', platformIdentifier: "toast" },
{ name: "TaxBit", slug: 'taxbit', careerUrl: "https://www.taxbit.com/careers", platform: 'greenhouse', platformIdentifier: "taxbit" },
{ name: "Khan Academy", slug: 'khan-academy', careerUrl: "https://www.khanacademy.org/careers", platform: 'greenhouse', platformIdentifier: "khanacademy" },
{ name: "MasterClass", slug: 'masterclass', careerUrl: "https://www.masterclass.com/jobs", platform: 'greenhouse', platformIdentifier: "masterclass" },
{ name: "Outschool", slug: 'outschool', careerUrl: "https://outschool.com/careers", platform: 'greenhouse', platformIdentifier: "outschool" },
{ name: "HackerRank", slug: 'hackerrank', careerUrl: "https://www.hackerrank.com/careers", platform: 'greenhouse', platformIdentifier: "hackerrank" },
{ name: "ThoughtWorks", slug: 'thoughtworks', careerUrl: "https://www.thoughtworks.com/careers", platform: 'greenhouse', platformIdentifier: "thoughtworks" },
{ name: "Remote", slug: 'remote', careerUrl: "https://remote.com/careers", platform: 'greenhouse', platformIdentifier: "remote" },
{ name: "Astranis", slug: 'astranis', careerUrl: "https://www.astranis.com/careers", platform: 'greenhouse', platformIdentifier: "astranis" },
{ name: "Relativity Space", slug: 'relativity-space', careerUrl: "https://relativityspace.com/careers", platform: 'greenhouse', platformIdentifier: "relativity" },
{ name: "Vast Space", slug: 'vast-space', careerUrl: "https://www.vastspace.com/careers", platform: 'greenhouse', platformIdentifier: "vast" },
{ name: "Anduril", slug: 'anduril', careerUrl: "https://www.anduril.com/careers", platform: 'greenhouse', platformIdentifier: "andurilindustries" },
{ name: "Cerebras", slug: 'cerebras', careerUrl: "https://cerebras.ai/careers", platform: 'ashby', platformIdentifier: "cerebras" },
{ name: "SambaNova", slug: 'sambanova', careerUrl: "https://sambanova.ai/careers", platform: 'greenhouse', platformIdentifier: "sambanovasystems" },
{ name: "MyCase", slug: 'mycase', careerUrl: "https://www.mycase.com/careers", platform: 'greenhouse', platformIdentifier: "mycase" },
{ name: "NetDocuments", slug: 'netdocuments', careerUrl: "https://www.netdocuments.com/careers", platform: 'greenhouse', platformIdentifier: "netdocuments" },
{ name: "Lucid Motors", slug: 'lucid-motors', careerUrl: "https://www.lucidmotors.com/careers", platform: 'greenhouse', platformIdentifier: "lucidmotors" },
{ name: "Oura", slug: 'oura', careerUrl: "https://ouraring.com/careers", platform: 'greenhouse', platformIdentifier: "oura" },
{ name: "Headspace", slug: 'headspace', careerUrl: "https://www.headspace.com/careers", platform: 'greenhouse', platformIdentifier: "hs" },
{ name: "Calm", slug: 'calm', careerUrl: "https://www.calm.com/careers", platform: 'greenhouse', platformIdentifier: "calm" },
{ name: "Metabase", slug: 'metabase', careerUrl: "https://www.metabase.com/jobs", platform: 'lever', platformIdentifier: "metabase" },
{ name: "Mistral AI", slug: 'mistral-ai', careerUrl: "https://mistral.ai/careers", platform: 'lever', platformIdentifier: "mistral" },
{ name: "Extreme Networks", slug: 'extreme-networks', careerUrl: "https://www.extremenetworks.com/about-extreme-networks/careers", platform: 'lever', platformIdentifier: "extremenetworks" },
{ name: "Houzz", slug: 'houzz', careerUrl: "https://www.houzz.com/jobs", platform: 'lever', platformIdentifier: "houzz" },
{ name: "Cornerstone OnDemand", slug: 'cornerstone-ondemand', careerUrl: "https://www.cornerstoneondemand.com/careers", platform: 'lever', platformIdentifier: "cornerstone" },
{ name: "Shield AI", slug: 'shield-ai', careerUrl: "https://shield.ai/careers", platform: 'lever', platformIdentifier: "shieldai" },
{ name: "Whoop", slug: 'whoop', careerUrl: "https://www.whoop.com/careers", platform: 'lever', platformIdentifier: "whoop" },
{ name: "Ro", slug: 'ro', careerUrl: "https://ro.co/careers", platform: 'lever', platformIdentifier: "ro" },
{ name: "Menlo Security", slug: 'menlo-security', careerUrl: "https://www.menlosecurity.com/careers", platform: 'ashby', platformIdentifier: "menlosecurity" },
{ name: "Cube", slug: 'cube', careerUrl: "https://cube.dev/careers", platform: 'ashby', platformIdentifier: "cube" },
{ name: "Mosaic", slug: 'mosaic', careerUrl: "https://www.mosaicml.com/careers", platform: 'ashby', platformIdentifier: "mosaic" },
{ name: "Lambda", slug: 'lambda', careerUrl: "https://lambdalabs.com/about/careers", platform: 'ashby', platformIdentifier: "lambda" },
{ name: "Strava", slug: 'strava', careerUrl: "https://www.strava.com/careers", platform: 'ashby', platformIdentifier: "strava" },
{ name: "Frontier Communications", slug: 'frontier-communications', careerUrl: "https://careers.frontier.com", platform: 'ashby', platformIdentifier: "frontier" },
{ name: "Anrok", slug: 'anrok', careerUrl: "https://www.anrok.com/careers", platform: 'ashby', platformIdentifier: "anrok" },
{ name: "Deel", slug: 'deel', careerUrl: "https://www.deel.com/careers", platform: 'ashby', platformIdentifier: "deel" },
// Newfront removed — its Ashby board 404s under every org-name variant, and the careers
// page's Next.js payload contains no job array to fall back on.
{ name: "Skydio", slug: 'skydio', careerUrl: "https://www.skydio.com/careers", platform: 'ashby', platformIdentifier: "skydio" },
{ name: "Hadrian", slug: 'hadrian', careerUrl: "https://www.hadrian.co/careers", platform: 'ashby', platformIdentifier: "hadrian-automation" },
{ name: "Mural", slug: 'mural', careerUrl: "https://www.mural.co/careers", platform: 'ashby', platformIdentifier: "mural" },
{ name: "Eight Sleep", slug: 'eight-sleep', careerUrl: "https://www.eightsleep.com/careers", platform: 'ashby', platformIdentifier: "eightsleep" },
{ name: "Optiv", slug: 'optiv', careerUrl: "https://www.optiv.com/careers", platform: 'workday', platformIdentifier: "optiv|wd5|Optiv_Careers" },
{ name: "IQVIA", slug: 'iqvia', careerUrl: "https://jobs.iqvia.com", platform: 'workday', platformIdentifier: "iqvia|wd1|IQVIA" },
{ name: "Target", slug: 'target', careerUrl: "https://corporate.target.com/careers", platform: 'workday', platformIdentifier: "target|wd5|targetcareers" },
{ name: "Nordstrom", slug: 'nordstrom', careerUrl: "https://careers.nordstrom.com", platform: 'workday', platformIdentifier: "nordstrom|wd501|nordstrom_careers" },
{ name: "Nike", slug: 'nike', careerUrl: "https://jobs.nike.com", platform: 'workday', platformIdentifier: "nike|wd1|nke" },
{ name: "Comcast", slug: 'comcast', careerUrl: "https://jobs.comcast.com", platform: 'workday', platformIdentifier: "comcast|wd5|Comcast_Careers" },
{ name: "Samsung", slug: 'samsung', careerUrl: "https://www.samsung.com/us/careers", platform: 'workday', platformIdentifier: "sec|wd3|Samsung_Careers" },
{ name: "Centene", slug: 'centene', careerUrl: "https://jobs.centene.com", platform: 'workday', platformIdentifier: "centene|wd5|centene_external" },
{ name: "Barclays", slug: 'barclays', careerUrl: "https://search.jobs.barclays", platform: 'workday', platformIdentifier: "barclays|wd3|External_Career_Site_Barclays" },
{ name: "Empower", slug: 'empower', careerUrl: "https://www.empower.com/careers", platform: 'workday', platformIdentifier: "empower|wd12|empower" },
{ name: "Pacific Life", slug: 'pacific-life', careerUrl: "https://www.pacificlife.com/careers", platform: 'workday', platformIdentifier: "pacificlife|wd1|PacificLifeCareers" },
{ name: "Guardian Life", slug: 'guardian-life', careerUrl: "https://www.guardianlife.com/careers", platform: 'workday', platformIdentifier: "guardianlife|wd5|Guardian-Life-Careers" },
{ name: "Axiom Space", slug: 'axiom-space', careerUrl: "https://axiomspace.com/careers", platform: 'workday', platformIdentifier: "axiomspace|wd5|External_Career_Site" },
{ name: "CVS Health", slug: 'cvs-health', careerUrl: "https://jobs.cvshealth.com", platform: 'workday', platformIdentifier: "cvshealth|wd1|CVS_Health_Careers" },
{ name: "Etsy", slug: 'etsy', careerUrl: "https://careers.etsy.com", platform: 'workday', platformIdentifier: "etsy|wd5|Etsy_Careers" },
{ name: "Walmart", slug: 'walmart', careerUrl: "https://careers.walmart.com", platform: 'workday', platformIdentifier: "walmart|wd1|WalmartExternalCareers" },
{ name: "Humana", slug: 'humana', careerUrl: "https://careers.humana.com", platform: 'workday', platformIdentifier: "humana|wd5|Humana_External_Career_Site" },
{ name: "John Hancock", slug: 'john-hancock', careerUrl: "https://www.johnhancock.com/about-us/careers", platform: 'workday', platformIdentifier: "manulife|wd3|MFCJH_Jobs" },
{ name: "Oracle", slug: 'oracle', careerUrl: "https://careers.oracle.com", platform: 'oracle-orc', platformIdentifier: "eeho.fa.us2.oraclecloud.com|CX_45001" },
{ name: "State Farm", slug: 'state-farm', careerUrl: "https://jobs.statefarm.com/main/jobs", platform: 'icims-jra', platformIdentifier: "jobs.statefarm.com" },
{ name: "Liberty Mutual", slug: 'liberty-mutual', careerUrl: "https://www.libertymutualgroup.com/careers", platform: 'icims', platformIdentifier: "libertymutual" },
{ name: "Northwestern Mutual", slug: 'northwestern-mutual', careerUrl: "https://careers.northwesternmutual.com", platform: 'icims', platformIdentifier: "northwesternmutual" },
{ name: "AXA", slug: 'axa', careerUrl: "https://www.axa.com/en/careers", platform: 'icims', platformIdentifier: "axa" },
{ name: "KnowBe4", slug: 'knowbe4', careerUrl: "https://www.knowbe4.com/careers", platform: 'greenhouse', platformIdentifier: "knowbe4" },
{ name: "Druva", slug: 'druva', careerUrl: "https://www.druva.com/about-us/careers", platform: 'greenhouse', platformIdentifier: "druva" },
{ name: "Dragos", slug: 'dragos', careerUrl: "https://www.dragos.com/careers", platform: 'greenhouse', platformIdentifier: "dragos" },
{ name: "Nozomi Networks", slug: 'nozomi-networks', careerUrl: "https://www.nozominetworks.com/careers", platform: 'greenhouse', platformIdentifier: "nozominetworks" },
{ name: "Bugcrowd", slug: 'bugcrowd', careerUrl: "https://www.bugcrowd.com/about/careers", platform: 'greenhouse', platformIdentifier: "bugcrowd" },
{ name: "Synack", slug: 'synack', careerUrl: "https://www.synack.com/careers", platform: 'greenhouse', platformIdentifier: "synacksrt" },
{ name: "Omada Health", slug: 'omada-health', careerUrl: "https://www.omadahealth.com/careers", platform: 'greenhouse', platformIdentifier: "omadahealth" },
{ name: "Descript", slug: 'descript', careerUrl: "https://www.descript.com/careers", platform: 'greenhouse', platformIdentifier: "descript" },
{ name: "Speechify", slug: 'speechify', careerUrl: "https://speechify.com/careers", platform: 'greenhouse', platformIdentifier: "speechify" },
{ name: "Sage", slug: 'sage', careerUrl: "https://www.sage.com/en-us/company/careers", platform: 'greenhouse', platformIdentifier: "sage" },
{ name: "Brooklinen", slug: 'brooklinen', careerUrl: "https://brooklinen.com/pages/careers", platform: 'ashby', platformIdentifier: "brooklinen" },
{ name: "Recharge", slug: 'recharge', careerUrl: "https://rechargepayments.com/careers", platform: 'ashby', platformIdentifier: "recharge" },
{ name: "Bright Health", slug: 'bright-health', careerUrl: "https://www.brighthealthgroup.com/careers", platform: 'greenhouse', platformIdentifier: "neuehealth" },
{ name: "Forter", slug: 'forter', careerUrl: "https://www.forter.com/careers", platform: 'greenhouse', platformIdentifier: "forter" },
{ name: "Riskified", slug: 'riskified', careerUrl: "https://www.riskified.com/careers", platform: 'greenhouse', platformIdentifier: "riskified" },
{ name: "Sezzle", slug: 'sezzle', careerUrl: "https://sezzle.com/careers", platform: 'greenhouse', platformIdentifier: "sezzle" },
{ name: "EquityZen", slug: 'equityzen', careerUrl: "https://equityzen.com/careers", platform: 'greenhouse', platformIdentifier: "equityzen" },
{ name: "Forge Global", slug: 'forge-global', careerUrl: "https://forgeglobal.com/careers", platform: 'greenhouse', platformIdentifier: "forgeglobal" },
{ name: "Roofstock", slug: 'roofstock', careerUrl: "https://www.roofstock.com/careers", platform: 'greenhouse', platformIdentifier: "roofstock" },
{ name: "Pacaso", slug: 'pacaso', careerUrl: "https://www.pacaso.com/careers", platform: 'greenhouse', platformIdentifier: "pacaso" },
{ name: "Crowdstreet", slug: 'crowdstreet', careerUrl: "https://www.crowdstreet.com/careers", platform: 'greenhouse', platformIdentifier: "crowdstreet" },
{ name: "Knock", slug: 'knock', careerUrl: "https://knockcrm.com/careers", platform: 'greenhouse', platformIdentifier: "knock" },
{ name: "D2L", slug: 'd2l', careerUrl: "https://www.d2l.com/careers", platform: 'greenhouse', platformIdentifier: "d2l" },
{ name: "Newsela", slug: 'newsela', careerUrl: "https://newsela.com/careers", platform: 'greenhouse', platformIdentifier: "newsela" },
{ name: "Course Hero", slug: 'course-hero', careerUrl: "https://www.coursehero.com/jobs", platform: 'greenhouse', platformIdentifier: "coursehero" },
{ name: "GoStudent", slug: 'gostudent', careerUrl: "https://www.gostudent.org/en/careers", platform: 'greenhouse', platformIdentifier: "gostudent" },
{ name: "Lattice", slug: 'lattice', careerUrl: "https://lattice.com/careers", platform: 'greenhouse', platformIdentifier: "lattice" },
{ name: "Culture Amp", slug: 'culture-amp', careerUrl: "https://www.cultureamp.com/careers", platform: 'greenhouse', platformIdentifier: "cultureamp" },
{ name: "Built In", slug: 'built-in', careerUrl: "https://builtin.com/careers", platform: 'greenhouse', platformIdentifier: "builtin" },
// Glassdoor removed — the `glassdoor` Greenhouse board 404s and the careers page sits
// behind the same Cloudflare bot-wall that keeps glassdoor.com out of the board sources.
{ name: "Indeed", slug: 'indeed', careerUrl: "https://www.indeed.com/careers", platform: 'greenhouse', platformIdentifier: "indeed" },
{ name: "Branch", slug: 'branch', careerUrl: "https://www.ourbranch.com/careers", platform: 'greenhouse', platformIdentifier: "branch" },
{ name: "Ladder", slug: 'ladder', careerUrl: "https://www.ladderlife.com/careers", platform: 'greenhouse', platformIdentifier: "ladder33" },
{ name: "Haven Life", slug: 'haven-life', careerUrl: "https://havenlife.com/careers", platform: 'greenhouse', platformIdentifier: "haven" },
{ name: "Helsing", slug: 'helsing', careerUrl: "https://www.helsing.ai/careers", platform: 'greenhouse', platformIdentifier: "helsing" },
{ name: "Rebellion Defense", slug: 'rebellion-defense', careerUrl: "https://www.rebelliondefense.com/careers", platform: 'greenhouse', platformIdentifier: "rebelliondefense" },
{ name: "Epirus", slug: 'epirus', careerUrl: "https://www.epirusinc.com/careers", platform: 'greenhouse', platformIdentifier: "epirus" },
{ name: "PandaDoc", slug: 'pandadoc', careerUrl: "https://www.pandadoc.com/careers", platform: 'greenhouse', platformIdentifier: "pandadoc" },
{ name: "Jumio", slug: 'jumio', careerUrl: "https://www.jumio.com/careers", platform: 'greenhouse', platformIdentifier: "jumio" },
{ name: "ComplyAdvantage", slug: 'complyadvantage', careerUrl: "https://complyadvantage.com/careers", platform: 'greenhouse', platformIdentifier: "complyadvantage" },
{ name: "Wayve", slug: 'wayve', careerUrl: "https://wayve.ai/careers", platform: 'greenhouse', platformIdentifier: "wayve" },
{ name: "Kodiak", slug: 'kodiak', careerUrl: "https://kodiak.ai/careers", platform: 'greenhouse', platformIdentifier: "kodiak" },
{ name: "Bird", slug: 'bird', careerUrl: "https://www.bird.co/careers", platform: 'greenhouse', platformIdentifier: "bird" },
{ name: "Archer Aviation", slug: 'archer-aviation', careerUrl: "https://www.archer.com/careers", platform: 'greenhouse', platformIdentifier: "archer" },
{ name: "Uber Freight", slug: 'uber-freight', careerUrl: "https://www.uberfreight.com/careers", platform: 'greenhouse', platformIdentifier: "uberfreight" },
{ name: "ClassPass", slug: 'classpass', careerUrl: "https://classpass.com/careers", platform: 'greenhouse', platformIdentifier: "classpass" },
{ name: "Mindbody", slug: 'mindbody', careerUrl: "https://company.mindbodyonline.com/careers", platform: 'greenhouse', platformIdentifier: "mindbody" },
{ name: "Future Fitness", slug: 'future-fitness', careerUrl: "https://future.co/careers", platform: 'greenhouse', platformIdentifier: "future" },
{ name: "MyFitnessPal", slug: 'myfitnesspal', careerUrl: "https://www.myfitnesspal.com/careers", platform: 'greenhouse', platformIdentifier: "myfitnesspal" },
{ name: "GOAT", slug: 'goat', careerUrl: "https://www.goat.com/jobs", platform: 'greenhouse', platformIdentifier: "goatgroup" },
{ name: "ZipRecruiter", slug: 'ziprecruiter', careerUrl: "https://www.ziprecruiter.com/careers", platform: 'greenhouse', platformIdentifier: "ziprecruiter" },
{ name: "Sword Health", slug: 'sword-health', careerUrl: "https://swordhealth.com/careers", platform: 'lever', platformIdentifier: "swordhealth" },
{ name: "AllTrails", slug: 'alltrails', careerUrl: "https://www.alltrails.com/careers", platform: 'lever', platformIdentifier: "alltrails" },
{ name: "Animoca Brands", slug: 'animoca-brands', careerUrl: "https://www.animocabrands.com/careers", platform: 'lever', platformIdentifier: "animocabrands" },
{ name: "AngelList", slug: 'angellist', careerUrl: "https://angellist.com/jobs", platform: 'lever', platformIdentifier: "angellist" },
{ name: "Fundrise", slug: 'fundrise', careerUrl: "https://fundrise.com/careers", platform: 'lever', platformIdentifier: "fundrise" },
{ name: "Entrata", slug: 'entrata', careerUrl: "https://www.entrata.com/careers", platform: 'lever', platformIdentifier: "entrata" },
{ name: "15Five", slug: '15five', careerUrl: "https://www.15five.com/careers", platform: 'lever', platformIdentifier: "15five" },
{ name: "Docebo", slug: 'docebo', careerUrl: "https://www.docebo.com/about/careers", platform: 'lever', platformIdentifier: "docebo" },
{ name: "360Learning", slug: '360learning', careerUrl: "https://360learning.com/careers", platform: 'lever', platformIdentifier: "360learning" },
{ name: "Filevine", slug: 'filevine', careerUrl: "https://www.filevine.com/careers", platform: 'lever', platformIdentifier: "filevine" },
{ name: "Beta Technologies", slug: 'beta-technologies', careerUrl: "https://www.beta.team/careers", platform: 'lever', platformIdentifier: "beta" },
{ name: "HackerOne", slug: 'hackerone', careerUrl: "https://www.hackerone.com/careers", platform: 'ashby', platformIdentifier: "hackerone" },
{ name: "Color Health", slug: 'color-health', careerUrl: "https://www.color.com/careers", platform: 'ashby', platformIdentifier: "color-health" },
{ name: "Hinge Health", slug: 'hinge-health', careerUrl: "https://www.hingehealth.com/careers", platform: 'ashby', platformIdentifier: "hinge-health" },
{ name: "Front", slug: 'front', careerUrl: "https://front.com/careers", platform: 'ashby', platformIdentifier: "frontcareers" },
{ name: "Help Scout", slug: 'help-scout', careerUrl: "https://www.helpscout.com/careers", platform: 'ashby', platformIdentifier: "helpscout" },
{ name: "Lightdash", slug: 'lightdash', careerUrl: "https://www.lightdash.com/careers", platform: 'ashby', platformIdentifier: "lightdash" },
{ name: "Runway", slug: 'runway', careerUrl: "https://runwayml.com/careers", platform: 'ashby', platformIdentifier: "runway" },
{ name: "Writer", slug: 'writer', careerUrl: "https://writer.com/careers", platform: 'ashby', platformIdentifier: "writer" },
{ name: "Vellum", slug: 'vellum', careerUrl: "https://www.vellum.ai/careers", platform: 'ashby', platformIdentifier: "vellum" },
{ name: "Weaviate", slug: 'weaviate', careerUrl: "https://weaviate.io/company/careers", platform: 'ashby', platformIdentifier: "weaviate" },
{ name: "LangChain", slug: 'langchain', careerUrl: "https://www.langchain.com/careers", platform: 'ashby', platformIdentifier: "langchain" },
{ name: "Gorgias", slug: 'gorgias', careerUrl: "https://www.gorgias.com/careers", platform: 'ashby', platformIdentifier: "gorgias" },
{ name: "Modern Treasury", slug: 'modern-treasury', careerUrl: "https://www.moderntreasury.com/careers", platform: 'ashby', platformIdentifier: "moderntreasury" },
{ name: "Bolt", slug: 'bolt', careerUrl: "https://www.bolt.com/careers", platform: 'ashby', platformIdentifier: "bolt" },
{ name: "Pleo", slug: 'pleo', careerUrl: "https://www.pleo.io/en/careers", platform: 'ashby', platformIdentifier: "pleo" },
{ name: "Zip", slug: 'zip', careerUrl: "https://zip.co/us/careers", platform: 'ashby', platformIdentifier: "zip" },
{ name: "Cadre", slug: 'cadre', careerUrl: "https://cadre.com/careers", platform: 'ashby', platformIdentifier: "cadre" },
{ name: "Top Hat", slug: 'top-hat', careerUrl: "https://tophat.com/careers", platform: 'ashby', platformIdentifier: "top-hat" },
{ name: "Sierra Space", slug: 'sierra-space', careerUrl: "https://sierraspace.com/careers", platform: 'ashby', platformIdentifier: "sierra" },
{ name: "Quantum Systems", slug: 'quantum-systems', careerUrl: "https://www.quantum-systems.com/careers", platform: 'ashby', platformIdentifier: "quantum" },
{ name: "Anima", slug: 'anima', careerUrl: "https://www.animaapp.com/careers", platform: 'ashby', platformIdentifier: "anima" },
{ name: "Juro", slug: 'juro', careerUrl: "https://juro.com/careers", platform: 'ashby', platformIdentifier: "juro" },
{ name: "Sift", slug: 'sift', careerUrl: "https://sift.com/careers", platform: 'ashby', platformIdentifier: "sift" },
{ name: "Sardine", slug: 'sardine', careerUrl: "https://www.sardine.ai/careers", platform: 'ashby', platformIdentifier: "sardine" },
{ name: "Persona", slug: 'persona', careerUrl: "https://withpersona.com/careers", platform: 'ashby', platformIdentifier: "persona" },
{ name: "Trulioo", slug: 'trulioo', careerUrl: "https://www.trulioo.com/careers", platform: 'ashby', platformIdentifier: "trulioo" },
{ name: "Socure", slug: 'socure', careerUrl: "https://www.socure.com/careers", platform: 'ashby', platformIdentifier: "socure" },
{ name: "Capsule", slug: 'capsule', careerUrl: "https://www.capsule.com/careers", platform: 'ashby', platformIdentifier: "capsule" },
{ name: "JFrog", slug: 'jfrog', careerUrl: "https://jfrog.com/careers", platform: 'greenhouse', platformIdentifier: "jfrog" },
{ name: "McAfee", slug: 'mcafee', careerUrl: "https://www.mcafee.com/careers", platform: 'workday', platformIdentifier: "mcafee|wd1|External" },
{ name: "Qorvo", slug: 'qorvo', careerUrl: "https://www.qorvo.com/careers", platform: 'workday', platformIdentifier: "qorvo|wd5|External" },
{ name: "Microchip Technology", slug: 'microchip', careerUrl: "https://www.microchip.com/careers", platform: 'workday', platformIdentifier: "mchp|wd1|External" },
{ name: "Texas Instruments", slug: 'ti', careerUrl: "https://www.ti.com/careers", platform: 'workday', platformIdentifier: "ti|wd1|TI" },
{ name: "Supercell", slug: 'supercell', careerUrl: "https://supercell.com/careers", platform: 'ashby', platformIdentifier: "supercell" },
{ name: "Bandwidth", slug: 'bandwidth', careerUrl: "https://www.bandwidth.com/careers", platform: 'greenhouse', platformIdentifier: "bandwidth" },
{ name: "Equifax", slug: 'equifax', careerUrl: "https://careers.equifax.com", platform: 'workday', platformIdentifier: "eq|wd1|External" },
{ name: "Experian", slug: 'experian', careerUrl: "https://www.experian.com/careers", platform: 'workday', platformIdentifier: "experian|wd1|External" },
{ name: "Hopper", slug: 'hopper', careerUrl: "https://www.hopper.com/careers", platform: 'ashby', platformIdentifier: "hopper" },
// Interactive Brokers removed — `ibkr` is not a Greenhouse board, and both plausible
// Workday tenants (ibkr, interactivebrokers) answer 422 even after the CSRF prefetch,
// meaning the tenant does not exist. Its careers site is bespoke PHP with no JSON feed.
{ name: "Maersk Line", slug: 'maersk', careerUrl: "https://careers.maersk.com", platform: 'workday', platformIdentifier: "maersk|wd1|External" },
{ name: "McKinsey", slug: 'mckinsey', careerUrl: "https://www.mckinsey.com/careers/search-jobs", platform: 'mckinsey' },
{ name: "Microsoft", slug: 'microsoft', careerUrl: "https://careers.microsoft.com", platform: 'workday', platformIdentifier: "microsoft|wd1|Microsoft" },
{ name: "Apple", slug: 'apple-careers', careerUrl: "https://jobs.apple.com/en-us/search", platform: 'apple' },
{ name: "Google", slug: 'google-careers', careerUrl: "https://careers.google.com", platform: 'workday', platformIdentifier: "google|wd1|External" },
{ name: "Amazon", slug: 'amazon-careers', careerUrl: "https://www.amazon.jobs", platform: 'amazon' },
{ name: "Tesla", slug: 'tesla-careers', careerUrl: "https://www.tesla.com/careers/search", platform: 'tesla' },
{ name: "Fortinet", slug: 'fortinet-careers', careerUrl: "https://career.fortinet.com", platform: 'workday', platformIdentifier: "fortinet|wd5|Fortinet" },
{ name: "Splunk", slug: 'splunk-careers', careerUrl: "https://www.splunk.com/en_us/careers", platform: 'workday', platformIdentifier: "splunk|wd1|External" },
{ name: "Canva", slug: 'canva-careers', careerUrl: "https://canva.com/careers", platform: 'workday', platformIdentifier: "canva|wd5|External" },
{ name: "eBay", slug: 'ebay-careers', careerUrl: "https://www.ebay.com/careers", platform: 'workday', platformIdentifier: "ebay|wd1|ebaycareers" },
{ name: "Disney", slug: 'disney-careers', careerUrl: "https://jobs.disneycareers.com", platform: 'workday', platformIdentifier: "disney|wd1|External" },
{ name: "HBO Max", slug: 'hbomax-careers', careerUrl: "https://warnermedia.com/careers", platform: 'workday', platformIdentifier: "warnermedia|wd1|External" },
{ name: "Medium", slug: 'medium-careers', careerUrl: "https://www.medium.com/careers", platform: 'greenhouse', platformIdentifier: "medium" },
{ name: "Substack", slug: 'substack-careers', careerUrl: "https://substack.com/careers", platform: 'ashby', platformIdentifier: "substack" },
{ name: "Kickstarter", slug: 'kickstarter-careers', careerUrl: "https://www.kickstarter.com/jobs", platform: 'greenhouse', platformIdentifier: "kickstarter" },
{ name: "Uber", slug: 'uber-careers', careerUrl: "https://www.uber.com/us/en/careers/", platform: 'smartrecruiters', platformIdentifier: 'Uber' },
{ name: "Robinhood", slug: 'robinhood-careers', careerUrl: "https://careers.robinhood.com", platform: 'greenhouse', platformIdentifier: "robinhood" },
{ name: "Thinkific", slug: 'thinkific-careers', careerUrl: "https://www.thinkific.com/careers", platform: 'greenhouse', platformIdentifier: "thinkific" },
{ name: "Trend Micro", slug: 'trend-micro', careerUrl: "https://www.trendmicro.com/en_us/about/careers.html", platform: 'workday', platformIdentifier: "trendmicro|wd3|External" },
{ name: "Cleveland Clinic", slug: 'cleveland-clinic', careerUrl: "https://jobs.clevelandclinic.org", platform: 'workday', platformIdentifier: "ccf|wd1|ClevelandClinicCareers" },
{ name: "AdventHealth", slug: 'adventhealth', careerUrl: "https://jobs.adventhealth.com", platform: 'workday', platformIdentifier: "adventhealth|wd12|AH_External_Career_Site" },
{ name: "Intermountain Healthcare", slug: 'intermountain-healthcare', careerUrl: "https://intermountainhealthcare.org/careers", platform: 'workday', platformIdentifier: "imh|wd108|IntermountainCareers" },
{ name: "23andMe", slug: '23andme', careerUrl: "https://www.23andme.com/careers", platform: 'workday', platformIdentifier: "23andme|wd5|23" },
// Gainsight removed — its Workday tenant answers 403 to every request, browser UA and
// CSRF prefetch included, and gainsight.com/careers serves a Cloudflare challenge.
{ name: "Lloyds", slug: 'lloyds', careerUrl: "https://www.lloydsbankinggroup.com/careers", platform: 'workday', platformIdentifier: "lbg|wd3|lbg_Careers" },
{ name: "AeroVironment", slug: 'aerovironment', careerUrl: "https://www.avinc.com/careers", platform: 'workday', platformIdentifier: "avav|wd1|AVAV" },
{ name: "Vertex", slug: 'vertex', careerUrl: "https://www.vertexinc.com/careers", platform: 'workday', platformIdentifier: "vertexinc|wd1|VertexInc" },
{ name: "Citrix", slug: 'citrix', careerUrl: "https://www.citrix.com/careers", platform: 'workday', platformIdentifier: "citrix|wd1|External" },
{ name: "Scaler Academy", slug: 'scaler', careerUrl: "https://www.scaler.com/careers", platform: 'ashby', platformIdentifier: "scaler" },
{ name: "AppDynamics", slug: 'appdynamics', careerUrl: "https://www.appdynamics.com/careers", platform: 'workday', platformIdentifier: "appdynamics|wd1|External" },
{ name: "LogicMonitor", slug: 'logicmonitor', careerUrl: "https://www.logicmonitor.com/careers", platform: 'greenhouse', platformIdentifier: "logicmonitor" },
{ name: "Box", slug: 'box', careerUrl: "https://www.box.com/careers", platform: 'workday', platformIdentifier: "box|wd1|External" },
{ name: "ProtonDrive", slug: 'protondrive', careerUrl: "https://proton.me/careers", platform: 'greenhouse', platformIdentifier: "proton" },
{ name: "Juniper Networks", slug: 'juniper', careerUrl: "https://www.juniper.net/careers", platform: 'workday', platformIdentifier: "juniper|wd1|External" },
{ name: "Arista Networks", slug: 'arista', careerUrl: "https://www.arista.com/careers", platform: 'workday', platformIdentifier: "arista|wd1|External" },
{ name: "Mellanox", slug: 'mellanox', careerUrl: "https://www.mellanox.com/careers", platform: 'workday', platformIdentifier: "mellanox|wd1|External" },
{ name: "AMD", slug: 'amd', careerUrl: "https://www.amd.com/careers", platform: 'workday', platformIdentifier: "amd|wd5|AMD" },
{ name: "Qualcomm", slug: 'qualcomm', careerUrl: "https://www.qualcomm.com/careers", platform: 'workday', platformIdentifier: "qcom|wd1|External" },
{ name: "Kingston", slug: 'kingston', careerUrl: "https://www.kingston.com/careers", platform: 'greenhouse', platformIdentifier: "kingston" },
{ name: 'Twitch', slug: 'twitch', careerUrl: 'https://www.twitch.tv/careers', platform: 'greenhouse', platformIdentifier: 'twitch' },
{ name: 'Datadog', slug: 'datadog', careerUrl: 'https://www.datadoghq.com/careers', platform: 'greenhouse', platformIdentifier: 'datadog' },
{ name: 'Lyft', slug: 'lyft', careerUrl: 'https://www.lyft.com/careers', platform: 'greenhouse', platformIdentifier: 'lyft' },
{ name: 'Shein', slug: 'shein', careerUrl: 'https://www.shein.com/careers', platform: 'greenhouse', platformIdentifier: 'shein' },
{ name: 'Coursera', slug: 'coursera', careerUrl: 'https://www.coursera.org/careers', platform: 'greenhouse', platformIdentifier: 'coursera' },
{ name: 'Rocket Lawyer', slug: 'rocket-lawyer', careerUrl: 'https://www.rocketlawyer.com/careers', platform: 'greenhouse', platformIdentifier: 'rocketlawyer' },
{ name: 'Airtable', slug: 'airtable', careerUrl: 'https://airtable.com/careers', platform: 'greenhouse', platformIdentifier: 'airtable' },
{ name: 'Webflow', slug: 'webflow', careerUrl: 'https://webflow.com/careers', platform: 'greenhouse', platformIdentifier: 'webflow' },
{ name: 'Typeform', slug: 'typeform', careerUrl: 'https://careers.typeform.com', platform: 'greenhouse', platformIdentifier: 'typeform' },
{ name: 'DeepMind', slug: 'deepmind', careerUrl: 'https://www.deepmind.com/careers', platform: 'greenhouse', platformIdentifier: 'deepmind' },
{ name: 'Nextdoor', slug: 'nextdoor', careerUrl: 'https://www.nextdoor.com/careers', platform: 'greenhouse', platformIdentifier: 'nextdoor' },
{ name: 'Krafton', slug: 'krafton', careerUrl: 'https://www.krafton.com/careers', platform: 'greenhouse', platformIdentifier: 'krafton' },
{ name: 'Scopely', slug: 'scopely', careerUrl: 'https://www.scopely.com/careers', platform: 'greenhouse', platformIdentifier: 'scopely' },
{ name: 'One Medical', slug: 'one-medical', careerUrl: 'https://www.onemedical.com/careers', platform: 'greenhouse', platformIdentifier: 'onemedical' },
{ name: 'Parsley Health', slug: 'parsley-health', careerUrl: 'https://www.parsleyhealth.com/careers', platform: 'greenhouse', platformIdentifier: 'parsleyhealth' },
{ name: 'N26', slug: 'n26', careerUrl: 'https://n26.com/careers', platform: 'greenhouse', platformIdentifier: 'n26' },
{ name: 'Public.com', slug: 'public', careerUrl: 'https://www.public.com/careers', platform: 'greenhouse', platformIdentifier: 'public' },
{ name: 'Code.org', slug: 'code-org', careerUrl: 'https://code.org/careers', platform: 'greenhouse', platformIdentifier: 'codeorg' },
{ name: 'Insurify', slug: 'insurify', careerUrl: 'https://www.insurify.com/careers', platform: 'greenhouse', platformIdentifier: 'insurify' },
{ name: 'Reinsurance Group of America', slug: 'rga', careerUrl: 'https://www.rgare.com/careers', platform: 'greenhouse', platformIdentifier: 'rga' },
{ name: 'Varda Space', slug: 'varda-space', careerUrl: 'https://www.vardaspace.com/careers', platform: 'greenhouse', platformIdentifier: 'vardaspace' },
{ name: 'Squarespace', slug: 'squarespace', careerUrl: 'https://www.squarespace.com/careers', platform: 'greenhouse', platformIdentifier: 'squarespace' },
{ name: 'Unbounce', slug: 'unbounce', careerUrl: 'https://unbounce.com/careers', platform: 'greenhouse', platformIdentifier: 'unbounce' },
{ name: 'DISCO', slug: 'disco', careerUrl: 'https://www.disco.com/careers', platform: 'greenhouse', platformIdentifier: 'disco' },
{ name: 'Zwift', slug: 'zwift', careerUrl: 'https://www.zwift.com/careers', platform: 'greenhouse', platformIdentifier: 'zwift' },
  { name: 'Disney', slug: 'disney', careerUrl: 'https://www.disneycareeers.com', platform: 'greenhouse', platformIdentifier: 'disney' },
  { name: 'Crash Plan', slug: 'crash-plan', careerUrl: 'https://www.crashplan.com/careers', platform: 'greenhouse', platformIdentifier: 'crashplan' },
  { name: 'Constant Contact', slug: 'constant-contact', careerUrl: 'https://www.constantcontact.com/careers', platform: 'greenhouse', platformIdentifier: 'constantcontact' },
  { name: 'NICE Systems', slug: 'nice-systems', careerUrl: 'https://www.nice.com/careers', platform: 'greenhouse', platformIdentifier: 'nice' },
  { name: 'Elastic', slug: 'elastic', careerUrl: 'https://www.elastic.co/careers', platform: 'greenhouse', platformIdentifier: 'elastic' },
  { name: 'Apache Superset', slug: 'apache-superset', careerUrl: 'https://superset.apache.org/careers', platform: 'greenhouse', platformIdentifier: 'superset' },
  { name: 'OKX', slug: 'okx', careerUrl: 'https://www.okx.com/careers', platform: 'greenhouse', platformIdentifier: 'okx' },
  { name: 'Fieldwire', slug: 'fieldwire', careerUrl: 'https://www.fieldwire.com/careers', platform: 'greenhouse', platformIdentifier: 'fieldwire' },
  { name: 'Skillsoft', slug: 'skillsoft', careerUrl: 'https://www.skillsoft.com/careers', platform: 'greenhouse', platformIdentifier: 'skillsoft' },
  { name: 'Udacity', slug: 'udacity', careerUrl: 'https://www.udacity.com/careers', platform: 'greenhouse', platformIdentifier: 'udacity' },
  { name: 'Mighty Networks', slug: 'mighty-networks', careerUrl: 'https://www.mightynetworks.com/careers', platform: 'greenhouse', platformIdentifier: 'mightynetworks' },
  { name: 'Circle', slug: 'circle', careerUrl: 'https://www.circle.so/careers', platform: 'greenhouse', platformIdentifier: 'circleso' },
  { name: 'Workato', slug: 'workato', careerUrl: 'https://www.workato.com/careers', platform: 'greenhouse', platformIdentifier: 'workato' },
  { name: 'Brandwatch', slug: 'brandwatch', careerUrl: 'https://www.brandwatch.com/careers', platform: 'greenhouse', platformIdentifier: 'brandwatch' },
  { name: 'Via', slug: 'via', careerUrl: 'https://www.viaride.com/careers', platform: 'greenhouse', platformIdentifier: 'via' },

  // ── Newly Added Companies ────────────────────────────
  // aws slug removed — Amazon's Workday doesn't use amazon|wd1|aws; amazon.jobs is custom-platform only
  // azure slug removed — Microsoft Azure is not a separate Workday tenant; use microsoft slug instead
  { name: 'Intel', slug: 'intel-corp', careerUrl: 'https://www.intel.com/careers', platform: 'workday', platformIdentifier: 'intel|wd5|external' },
  { name: 'AMD', slug: 'amd-corp', careerUrl: 'https://www.amd.com/en/careers', platform: 'workday', platformIdentifier: 'amd|wd5|external' },
  { name: 'Qualcomm', slug: 'qualcomm-corp', careerUrl: 'https://www.qualcomm.com/careers', platform: 'workday', platformIdentifier: 'qualcomm|wd5|external' },

  // ── Major Tech Companies ──────────────────────────────
  { name: 'LinkedIn', slug: 'linkedin', careerUrl: 'https://careers.linkedin.com', platform: 'greenhouse', platformIdentifier: 'linkedin' },
  { name: 'IBM', slug: 'ibm', careerUrl: 'https://www.ibm.com/careers', platform: 'workday', platformIdentifier: 'ibm|wd12|IBM' },
  { name: 'Cisco', slug: 'cisco', careerUrl: 'https://jobs.cisco.com', platform: 'workday', platformIdentifier: 'cisco|wd5|Cisco_Careers' },
  { name: 'ServiceNow', slug: 'servicenow', careerUrl: 'https://careers.servicenow.com', platform: 'workday', platformIdentifier: 'servicenow|wd5|External' },
  { name: 'Palo Alto Networks', slug: 'palo-alto-networks', careerUrl: 'https://jobs.paloaltonetworks.com', platform: 'workday', platformIdentifier: 'paloaltonetworks|wd1|External' },
  { name: 'Workday', slug: 'workday-inc', careerUrl: 'https://www.workday.com/en-us/company/careers.html', platform: 'workday', platformIdentifier: 'workday|wd5|Workday' },
  { name: 'Intuit', slug: 'intuit', careerUrl: 'https://jobs.intuit.com', platform: 'workday', platformIdentifier: 'intuit|wd5|careers' },
  { name: 'VMware', slug: 'vmware', careerUrl: 'https://careers.vmware.com', platform: 'workday', platformIdentifier: 'vmware|wd1|VMWare' },
  { name: 'Splunk', slug: 'splunk', careerUrl: 'https://www.splunk.com/en_us/careers.html', platform: 'workday', platformIdentifier: 'splunk|wd5|Splunk' },
  { name: 'Snowflake', slug: 'snowflake', careerUrl: 'https://careers.snowflake.com', platform: 'ashby', platformIdentifier: 'snowflake' },
  { name: 'Elastic', slug: 'elastic-co', careerUrl: 'https://www.elastic.co/careers', platform: 'greenhouse', platformIdentifier: 'elastic' },
  { name: 'Snap', slug: 'snap', careerUrl: 'https://careers.snap.com', platform: 'workday', platformIdentifier: 'snapchat|wd1|snap' },
  { name: 'Brex', slug: 'brex', careerUrl: 'https://www.brex.com/careers', platform: 'greenhouse', platformIdentifier: 'brex' },
  { name: 'Plaid', slug: 'plaid', careerUrl: 'https://plaid.com/careers', platform: 'lever', platformIdentifier: 'plaid' },

  // ── IT Services & Consulting ──────────────────────────
  { name: 'Accenture', slug: 'accenture', careerUrl: 'https://www.accenture.com/us-en/careers', platform: 'workday', platformIdentifier: 'accenture|wd3|AccentureCareers' },
  { name: 'Deloitte', slug: 'deloitte', careerUrl: 'https://www2.deloitte.com/us/en/careers.html', platform: 'workday', platformIdentifier: 'deloitte|wd1|DTICareers' },
  { name: 'Capgemini', slug: 'capgemini', careerUrl: 'https://www.capgemini.com/us-en/careers', platform: 'smartrecruiters', platformIdentifier: 'Capgemini' },
  { name: 'Cognizant', slug: 'cognizant', careerUrl: 'https://careers.cognizant.com', platform: 'workday', platformIdentifier: 'cognizant|wd1|Cognizant_Careers' },
  { name: 'Infosys', slug: 'infosys', careerUrl: 'https://www.infosys.com/careers', platform: 'workday', platformIdentifier: 'infosys|wd3|Infosys_Careers' },

  // ── Finance & Banking ─────────────────────────────────
  { name: 'Morgan Stanley', slug: 'morgan-stanley', careerUrl: 'https://www.morganstanley.com/careers', platform: 'workday', platformIdentifier: 'morganstanley|wd5|External' },
  { name: 'Fidelity', slug: 'fidelity', careerUrl: 'https://jobs.fidelity.com', platform: 'workday', platformIdentifier: 'fidelityinvestments|wd5|careers' },
  { name: 'American Express', slug: 'amex', careerUrl: 'https://jobs.americanexpress.com', platform: 'workday', platformIdentifier: 'aexp|wd5|AmexCareers' },

  // ── Healthcare & Insurance ────────────────────────────
  { name: 'UnitedHealth Group', slug: 'unitedhealth', careerUrl: 'https://careers.unitedhealthgroup.com', platform: 'workday', platformIdentifier: 'uhg|wd5|External' },

  // ── Aerospace & Defense ───────────────────────────────
  { name: 'Raytheon Technologies', slug: 'raytheon', careerUrl: 'https://jobs.rtx.com', platform: 'workday', platformIdentifier: 'rtx|wd1|RTX' },
  { name: 'Lockheed Martin', slug: 'lockheed-martin', careerUrl: 'https://www.lockheedmartinjobs.com', platform: 'workday', platformIdentifier: 'lmco|wd5|LMCareers' },
  { name: 'Northrop Grumman', slug: 'northrop-grumman', careerUrl: 'https://www.northropgrumman.com/careers', platform: 'workday', platformIdentifier: 'ngc|wd1|Northrop_Grumman_External_Site' },
  { name: 'L3Harris', slug: 'l3harris', careerUrl: 'https://careers.l3harris.com', platform: 'workday', platformIdentifier: 'l3harris|wd5|L3Harris' },

  // ── Big Tech & Cloud (additional) ────────────────────
  { name: 'Spotify', slug: 'spotify', careerUrl: 'https://www.lifeatspotify.com/jobs', platform: 'lever', platformIdentifier: 'spotify' },
  { name: 'Zoom', slug: 'zoom', careerUrl: 'https://explore.zoom.us/en/careers', platform: 'workday', platformIdentifier: 'zoom|wd5|Zoom' },

  // ── Cloud & SaaS (additional) ────────────────────────
  { name: 'Monday.com', slug: 'monday-com', careerUrl: 'https://monday.com/careers', platform: 'workday', platformIdentifier: 'mondaydotcom|wd5|mondaydotcom' },
  { name: 'Notion', slug: 'notion', careerUrl: 'https://www.notion.so/careers', platform: 'ashby', platformIdentifier: 'notion' },
  { name: 'DocuSign', slug: 'docusign', careerUrl: 'https://careers.docusign.com', platform: 'workday', platformIdentifier: 'docusign|wd1|DocuSign' },
  { name: 'Miro', slug: 'miro', careerUrl: 'https://miro.com/careers', platform: 'workday', platformIdentifier: 'miro|wd5|Miro' },
  { name: 'Rippling', slug: 'rippling', careerUrl: 'https://www.rippling.com/careers', platform: 'workday', platformIdentifier: 'rippling|wd5|Rippling' },
  { name: 'Shopify', slug: 'shopify', careerUrl: 'https://www.shopify.com/careers', platform: 'workday', platformIdentifier: 'shopify|wd5|Shopify' },
  { name: 'Retool', slug: 'retool', careerUrl: 'https://retool.com/careers', platform: 'workday', platformIdentifier: 'retool|wd5|Retool' },

  // ── Cybersecurity (additional) ────────────────────────
  { name: 'SentinelOne', slug: 'sentinelone', careerUrl: 'https://www.sentinelone.com/jobs', platform: 'workday', platformIdentifier: 'sentinelone|wd5|SentinelOne_Careers' },
  { name: 'CyberArk', slug: 'cyberark', careerUrl: 'https://www.cyberark.com/company/careers', platform: 'workday', platformIdentifier: 'cyberark|wd5|CyberArk' },
  { name: 'Rapid7', slug: 'rapid7', careerUrl: 'https://www.rapid7.com/company/careers', platform: 'workday', platformIdentifier: 'rapid7|wd5|Rapid7' },
  { name: 'Secureworks', slug: 'secureworks', careerUrl: 'https://careers.secureworks.com', platform: 'workday', platformIdentifier: 'secureworks|wd5|Secureworks_Careers' },

  // ── Hardware & Semiconductors (additional) ────────────
  { name: 'Garmin', slug: 'garmin', careerUrl: 'https://careers.garmin.com', platform: 'workday', platformIdentifier: 'garmin|wd5|Garmin' },
  { name: 'Western Digital', slug: 'western-digital', careerUrl: 'https://jobs.westerndigital.com', platform: 'smartrecruiters', platformIdentifier: 'WesternDigital' },
  { name: 'Seagate', slug: 'seagate', careerUrl: 'https://careers.seagate.com', platform: 'workday', platformIdentifier: 'seagatetechnology|wd3|Seagate' },

  // ── Analytics & BI (additional) ──────────────────────
  { name: 'TransUnion', slug: 'transunion', careerUrl: 'https://careers.transunion.com', platform: 'workday', platformIdentifier: 'transunion|wd5|TransUnion' },
  { name: 'MSCI', slug: 'msci', careerUrl: 'https://careers.msci.com', platform: 'workday', platformIdentifier: 'msci|wd3|MSCICareers' },
  { name: "Moody's", slug: 'moodys', careerUrl: 'https://careers.moodys.com', platform: 'workday', platformIdentifier: 'moodyscorporation|wd1|External' },
  { name: 'FactSet', slug: 'factset', careerUrl: 'https://careers.factset.com', platform: 'workday', platformIdentifier: 'factset|wd5|FactSet_Careers' },

  // ── Fintech & Payments (additional) ──────────────────
  { name: 'Klarna', slug: 'klarna', careerUrl: 'https://www.klarna.com/careers', platform: 'workday', platformIdentifier: 'klarna|wd5|Klarna' },
  { name: 'NerdWallet', slug: 'nerdwallet', careerUrl: 'https://www.nerdwallet.com/l/careers', platform: 'workday', platformIdentifier: 'nerdwallet|wd5|NerdWallet' },

  // ── Major Banks (additional) ──────────────────────────
  { name: 'PNC Bank', slug: 'pnc', careerUrl: 'https://careers.pnc.com', platform: 'workday', platformIdentifier: 'pnc|wd1|jobsearch' },
  { name: 'Truist', slug: 'truist', careerUrl: 'https://careers.truist.com', platform: 'workday', platformIdentifier: 'truist|wd5|Truist' },

  // ── Investment & Wealth Tech (additional) ─────────────
  { name: 'Vanguard', slug: 'vanguard', careerUrl: 'https://careers.vanguard.com', platform: 'workday', platformIdentifier: 'vanguard|wd1|VanguardCareers' },
  { name: 'Prudential Financial', slug: 'prudential', careerUrl: 'https://jobs.prudential.com', platform: 'workday', platformIdentifier: 'prudential|wd5|Prudential_Financial' },

  // ── Real Estate Tech & Construction Tech ─────────────
  { name: 'Compass', slug: 'compass-re', careerUrl: 'https://compass.com/careers', platform: 'workday', platformIdentifier: 'compass|wd5|Compass' },
  { name: 'Procore', slug: 'procore', careerUrl: 'https://www.procore.com/careers', platform: 'workday', platformIdentifier: 'procore|wd5|Procore' },
  { name: 'Trimble', slug: 'trimble', careerUrl: 'https://careers.trimble.com', platform: 'workday', platformIdentifier: 'trimble|wd5|Trimble_Careers' },
  { name: 'Autodesk', slug: 'autodesk', careerUrl: 'https://www.autodesk.com/careers', platform: 'workday', platformIdentifier: 'autodesk|wd5|Autodesk' },

  // ── Health Insurance (additional) ─────────────────────
  { name: 'Kaiser Permanente', slug: 'kaiser-permanente', careerUrl: 'https://jobs.kaiserpermanente.org', platform: 'workday', platformIdentifier: 'kaiserpermanente|wd3|KP_EXC_SEARCH' },

  // ── Media & Entertainment Tech (additional) ───────────
  { name: 'Vimeo', slug: 'vimeo', careerUrl: 'https://vimeo.com/about/jobs', platform: 'workday', platformIdentifier: 'vimeo|wd5|Vimeo' },

  // ── Biotech & Life Sciences (additional) ─────────────
  { name: 'Benchling', slug: 'benchling', careerUrl: 'https://www.benchling.com/careers', platform: 'workday', platformIdentifier: 'benchling|wd5|Benchling' },
  { name: 'Recursion Pharmaceuticals', slug: 'recursion', careerUrl: 'https://www.recursion.com/careers', platform: 'greenhouse', platformIdentifier: 'recursionpharmaceuticals' },
  { name: '10x Genomics', slug: '10x-genomics', careerUrl: 'https://careers.10xgenomics.com', platform: 'greenhouse', platformIdentifier: '10xgenomics' },

  // ── Energy Tech & Clean Tech ──────────────────────────
  { name: 'Enphase Energy', slug: 'enphase', careerUrl: 'https://enphase.com/careers', platform: 'workday', platformIdentifier: 'enphase|wd5|Enphase_Careers' },
  { name: 'SolarEdge', slug: 'solaredge', careerUrl: 'https://www.solaredge.com/us/careers', platform: 'workday', platformIdentifier: 'solaredge|wd5|SolarEdge' },
  { name: 'First Solar', slug: 'first-solar', careerUrl: 'https://careers.firstsolar.com', platform: 'workday', platformIdentifier: 'firstsolar|wd5|FirstSolar' },
  { name: 'Sunrun', slug: 'sunrun', careerUrl: 'https://www.sunrun.com/careers', platform: 'workday', platformIdentifier: 'sunrun|wd1|Sunrun' },
  { name: 'Bloom Energy', slug: 'bloom-energy', careerUrl: 'https://www.bloomenergy.com/about/careers', platform: 'workday', platformIdentifier: 'bloomenergy|wd5|BloomEnergy' },

  // ── Industrial & Manufacturing Tech ───────────────────
  { name: 'Honeywell', slug: 'honeywell', careerUrl: 'https://careers.honeywell.com', platform: 'workday', platformIdentifier: 'honeywell|wd5|Honeywell' },
  { name: 'Rockwell Automation', slug: 'rockwell-automation', careerUrl: 'https://www.rockwellautomation.com/en-us/company/careers.html', platform: 'workday', platformIdentifier: 'rockwellautomation|wd5|External' },
  { name: 'Emerson Electric', slug: 'emerson', careerUrl: 'https://www.emerson.com/en-us/careers', platform: 'workday', platformIdentifier: 'emerson|wd1|Emerson' },

  // ── GovTech & Public Sector (additional) ─────────────
  { name: 'Tyler Technologies', slug: 'tyler-technologies', careerUrl: 'https://www.tylertech.com/about-us/careers', platform: 'workday', platformIdentifier: 'tylertech|wd5|External' },
  { name: 'SAIC', slug: 'saic', careerUrl: 'https://jobs.saic.com', platform: 'workday', platformIdentifier: 'saic|wd5|SAIC' },
  { name: 'CACI', slug: 'caci', careerUrl: 'https://careers.caci.com', platform: 'workday', platformIdentifier: 'caci|wd3|CACI_Careers' },
  { name: 'Maximus', slug: 'maximus', careerUrl: 'https://careers.maximus.com', platform: 'workday', platformIdentifier: 'maximusfederal|wd5|Maximus' },
  { name: 'Granicus', slug: 'granicus', careerUrl: 'https://granicus.com/careers', platform: 'workday', platformIdentifier: 'granicus|wd5|Granicus' },

  // ── MarTech (additional) ──────────────────────────────
  { name: 'Attentive', slug: 'attentive', careerUrl: 'https://www.attentive.com/careers', platform: 'greenhouse', platformIdentifier: 'attentive' },
  { name: 'Yotpo', slug: 'yotpo', careerUrl: 'https://www.yotpo.com/company/careers', platform: 'greenhouse', platformIdentifier: 'yotpo' },
  { name: 'Sprinklr', slug: 'sprinklr', careerUrl: 'https://careers.sprinklr.com', platform: 'workday', platformIdentifier: 'sprinklr|wd5|Sprinklr' },
  { name: 'Brevo', slug: 'brevo', careerUrl: 'https://www.brevo.com/en/careers', platform: 'lever', platformIdentifier: 'brevo' },

  // ── Telecom & Networking (additional) ────────────────
  { name: 'AT&T', slug: 'att', careerUrl: 'https://www.att.jobs', platform: 'workday', platformIdentifier: 'att|wd5|ATT' },
  { name: 'Verizon', slug: 'verizon', careerUrl: 'https://mycareer.verizon.com', platform: 'workday', platformIdentifier: 'verizon|wd5|External' },

  // ── Contact Center & CX Tech (additional) ─────────────
  { name: 'Genesys', slug: 'genesys', careerUrl: 'https://www.genesys.com/en/company/careers', platform: 'workday', platformIdentifier: 'genesys|wd5|External' },
  { name: 'Talkdesk', slug: 'talkdesk', careerUrl: 'https://www.talkdesk.com/careers', platform: 'workday', platformIdentifier: 'talkdesk|wd5|Talkdesk' },

  // ── Accounting & Tax Tech (additional) ────────────────
  { name: 'Avalara', slug: 'avalara', careerUrl: 'https://careers.avalara.com', platform: 'workday', platformIdentifier: 'avalara|wd5|Avalara' },

  // ── AgriTech ──────────────────────────────────────────
  { name: 'Indigo Agriculture', slug: 'indigo-agriculture', careerUrl: 'https://www.indigoag.com/careers', platform: 'greenhouse', platformIdentifier: 'indigo' },

  // ── Credit & Risk Analytics (additional) ─────────────
  { name: 'Dun & Bradstreet', slug: 'dun-bradstreet', careerUrl: 'https://careers.dnb.com', platform: 'workday', platformIdentifier: 'dnb|wd5|DnBCareers' },

  // ── AI / ML ────────────────────────────────────────────
  { name: 'OpenAI', slug: 'openai', careerUrl: 'https://openai.com/careers', platform: 'ashby', platformIdentifier: 'openai' },
  { name: 'Cresta', slug: 'cresta', careerUrl: 'https://www.cresta.com/careers', platform: 'greenhouse', platformIdentifier: 'cresta' },

  // ── Semiconductors / Chip Design ────────────────────────
  { name: 'Synopsys', slug: 'synopsys', careerUrl: 'https://www.synopsys.com/careers.html', platform: 'smartrecruiters', platformIdentifier: 'Synopsys' },
  { name: 'Cadence Design Systems', slug: 'cadence', careerUrl: 'https://www.cadence.com/en_US/home/company/careers.html', platform: 'smartrecruiters', platformIdentifier: 'CadenceDesignSystems' },

  // ── Automotive / EV ──────────────────────────────────────
  { name: 'Rivian', slug: 'rivian', careerUrl: 'https://www.rivian.com/careers', platform: 'smartrecruiters', platformIdentifier: 'Rivian' },

  // ── Food Delivery / Logistics ───────────────────────────
  { name: 'DoorDash', slug: 'doordash', careerUrl: 'https://careers.doordash.com', platform: 'greenhouse', platformIdentifier: 'doordashusa' },
  { name: 'Samsara', slug: 'samsara', careerUrl: 'https://www.samsara.com/company/careers', platform: 'greenhouse', platformIdentifier: 'samsara' },

  // ── Gaming ───────────────────────────────────────────────

  // ── Crypto / Web3 ────────────────────────────────────────
  { name: 'Coinbase', slug: 'coinbase', careerUrl: 'https://www.coinbase.com/careers', platform: 'greenhouse', platformIdentifier: 'coinbase' },

  // ── E-commerce ───────────────────────────────────────────
  { name: 'Wayfair', slug: 'wayfair', careerUrl: 'https://www.aboutwayfair.com/careers', platform: 'smartrecruiters', platformIdentifier: 'Wayfair' },

  // ── Physical Security ────────────────────────────────────
  { name: 'Verkada', slug: 'verkada', careerUrl: 'https://www.verkada.com/careers', platform: 'greenhouse', platformIdentifier: 'verkada' },

  // ── Biotech ──────────────────────────────────────────────
  { name: 'Ginkgo Bioworks', slug: 'ginkgo-bioworks', careerUrl: 'https://www.ginkgobioworks.com/careers', platform: 'greenhouse', platformIdentifier: 'ginkgobioworks' },

  // ── Healthtech (additional) ─────────────────────────────
  { name: 'Komodo Health', slug: 'komodo-health', careerUrl: 'https://www.komodohealth.com/careers', platform: 'greenhouse', platformIdentifier: 'komodohealth' },

  // ── Climate Tech ─────────────────────────────────────────
  { name: 'Watershed', slug: 'watershed', careerUrl: 'https://watershed.com/careers', platform: 'ashby', platformIdentifier: 'watershed' },

  // ── User target list additions ────────────────────────
  { name: 'Meta', slug: 'meta', careerUrl: 'https://www.metacareers.com', platform: 'workday', platformIdentifier: 'metacareers|wd1|Careers' },
  { name: 'Wipro', slug: 'wipro', careerUrl: 'https://careers.wipro.com', platform: 'workday', platformIdentifier: 'wipro|wd3|External' },
  { name: 'HCLTech', slug: 'hcltech', careerUrl: 'https://www.hcltech.com/careers', platform: 'workday', platformIdentifier: 'hcltech|wd3|HCLTech_Careers' },
  { name: 'EY', slug: 'ey', careerUrl: 'https://careers.ey.com', platform: 'workday', platformIdentifier: 'ey|wd5|EY' },
  { name: 'KPMG', slug: 'kpmg', careerUrl: 'https://home.kpmg/careers', platform: 'workday', platformIdentifier: 'kpmg|wd1|KPMG' },
  { name: 'PwC', slug: 'pwc', careerUrl: 'https://www.pwc.com/us/en/careers.html', platform: 'workday', platformIdentifier: 'pwc|wd5|PWCUS' },
  { name: 'BCG', slug: 'bcg', careerUrl: 'https://www.bcg.com/careers', platform: 'workday', platformIdentifier: 'bcg|wd3|BCG' },
  { name: 'EPAM Systems', slug: 'epam', careerUrl: 'https://www.epam.com/careers', platform: 'smartrecruiters', platformIdentifier: 'EPAM' },
  { name: 'HashiCorp', slug: 'hashicorp', careerUrl: 'https://www.hashicorp.com/jobs', platform: 'smartrecruiters', platformIdentifier: 'HashiCorp' },
  { name: 'Broadcom', slug: 'broadcom', careerUrl: 'https://careers.broadcom.com', platform: 'workday', platformIdentifier: 'broadcom|wd5|External' },
  { name: 'Hewlett Packard Enterprise', slug: 'hpe', careerUrl: 'https://careers.hpe.com', platform: 'workday', platformIdentifier: 'hpe|wd1|ExternalCareerSite' },
  { name: 'Expedia Group', slug: 'expedia', careerUrl: 'https://careers.expediagroup.com', platform: 'workday', platformIdentifier: 'expediagroup|wd5|External' },
  { name: 'Roku', slug: 'roku', careerUrl: 'https://www.roku.com/jobs', platform: 'greenhouse', platformIdentifier: 'roku' },
  { name: 'TikTok', slug: 'tiktok', careerUrl: 'https://careers.tiktok.com', platform: 'workday', platformIdentifier: 'bytedance|wd1|TikTok' },
  { name: 'Motorola Solutions', slug: 'motorola-solutions', careerUrl: 'https://motorolasolutions.com/en_us/about/careers.html', platform: 'workday', platformIdentifier: 'motorolasolutions|wd5|Careers' },
  { name: 'IXL Learning', slug: 'ixl-learning', careerUrl: 'https://www.ixl.com/company/careers', platform: 'greenhouse', platformIdentifier: 'ixllearning' },
  { name: 'Applied Intuition', slug: 'applied-intuition', careerUrl: 'https://www.appliedintuition.com/careers', platform: 'ashby', platformIdentifier: 'applied' },
  { name: 'Axon', slug: 'axon', careerUrl: 'https://www.axon.com/careers', platform: 'workday', platformIdentifier: 'axon|wd5|axon' },

  // ── Discovered via discover-companies.mjs (June 2026) ────────────────────
  { name: 'Moderna', slug: 'moderna', careerUrl: 'https://www.modernatx.com/careers', platform: 'workday', platformIdentifier: 'modernatx|wd1|M_tx' },
  { name: 'BigCommerce', slug: 'bigcommerce', careerUrl: 'https://www.bigcommerce.com/careers', platform: 'workday', platformIdentifier: 'bigcommerce|wd12|Commerce' },
  { name: 'Orca Security', slug: 'orca-security', careerUrl: 'https://orca.security/company/careers', platform: 'greenhouse', platformIdentifier: 'orcasecurity' },
  { name: 'Quora', slug: 'quora', careerUrl: 'https://www.quora.com/careers', platform: 'ashby', platformIdentifier: 'quora' },
  { name: 'Home Depot', slug: 'home-depot', careerUrl: 'https://careers.homedepot.com', platform: 'workday', platformIdentifier: 'homedepot|wd5|CareerDepot' },
  { name: 'Johnson & Johnson', slug: 'johnson-johnson', careerUrl: 'https://jobs.jnj.com', platform: 'workday', platformIdentifier: 'jj|wd5|JJ' },
  { name: 'Merck', slug: 'merck', careerUrl: 'https://jobs.merck.com', platform: 'workday', platformIdentifier: 'msd|wd5|SearchJobs' },
  { name: 'Stryker', slug: 'stryker', careerUrl: 'https://careers.stryker.com', platform: 'workday', platformIdentifier: 'stryker|wd1|StrykerCareers' },
  { name: 'Amgen', slug: 'amgen', careerUrl: 'https://careers.amgen.com', platform: 'workday', platformIdentifier: 'amgen|wd1|Careers' },
  { name: 'Gilead Sciences', slug: 'gilead-sciences', careerUrl: 'https://www.gilead.com/careers', platform: 'workday', platformIdentifier: 'gilead|wd1|gileadcareers' },
  { name: 'Abbott', slug: 'abbott', careerUrl: 'https://www.jobs.abbott', platform: 'workday', platformIdentifier: 'abbott|wd5|abbottcareers' },

  // ── Discovered via discover-companies.mjs batch6 (June 2026) ──────────────
  { name: "Kohl's", slug: 'kohl-s', careerUrl: "https://careers.kohls.com", platform: 'workday', platformIdentifier: "kohls|wd504|kohlscareers" },
  { name: "Anthem", slug: 'anthem', careerUrl: "https://careers.elevancehealth.com/", platform: 'workday', platformIdentifier: "elevancehealth|wd1|ANT" },
  { name: "Becton Dickinson", slug: 'becton-dickinson', careerUrl: "https://jobs.bd.com/en", platform: 'workday', platformIdentifier: "bdx|wd1|EXTERNAL_CAREER_SITE_USA" },
  { name: "Bristol Myers Squibb", slug: 'bristol-myers-squibb', careerUrl: "https://careers.bms.com", platform: 'workday', platformIdentifier: "bristolmyerssquibb|wd5|BMS" },
  { name: "Johnson Controls", slug: 'johnson-controls', careerUrl: "https://jobs.johnsoncontrols.com/", platform: 'workday', platformIdentifier: "jci|wd5|JCI" },
  { name: "U.S. Bank", slug: 'u-s-bank', careerUrl: "https://careers.usbank.com/global/en", platform: 'workday', platformIdentifier: "usbank|wd1|US_Bank_Careers" },
  { name: "Northern Trust", slug: 'northern-trust', careerUrl: "https://ntrs.wd1.myworkdayjobs.com/northerntrust", platform: 'workday', platformIdentifier: "ntrs|wd1|northerntrust" },
  { name: "Cigna Group", slug: 'cigna-group', careerUrl: "https://jobs.thecignagroup.com/us/en", platform: 'workday', platformIdentifier: "cigna|wd5|cignacareers" },
  { name: "Juniper Networks", slug: 'juniper-networks', careerUrl: "https://careers.hpe.com/juniper", platform: 'workday', platformIdentifier: "hpe|wd5|Jobsathpe" },
  { name: "Redis", slug: 'redis', careerUrl: "https://redis.io/company/careers/", platform: 'ashby', platformIdentifier: "redis" },
  { name: "Dataiku", slug: 'dataiku', careerUrl: "https://www.dataiku.com/company/careers", platform: 'greenhouse', platformIdentifier: "dataiku" },
  { name: "Starburst", slug: 'starburst', careerUrl: "https://www.starburst.io/careers/", platform: 'greenhouse', platformIdentifier: "starburst" },
  { name: "Monte Carlo", slug: 'monte-carlo', careerUrl: "https://montecarlo.ai/careers-at-monte-carlo/", platform: 'ashby', platformIdentifier: "montecarlodata" },
  { name: "Boomi", slug: 'boomi', careerUrl: "https://boomi.com/company/careers/", platform: 'ashby', platformIdentifier: "boomi" },
  { name: "SnapLogic", slug: 'snaplogic', careerUrl: "https://www.snaplogic.com/company/careers", platform: 'lever', platformIdentifier: "snaplogic" },
  { name: "UiPath", slug: 'uipath', careerUrl: "https://www.uipath.com/careers", platform: 'ashby', platformIdentifier: "uipath" },
  { name: "Olo", slug: 'olo', careerUrl: "https://www.olo.com/people-culture#careers", platform: 'lever', platformIdentifier: "olo" },
  { name: "Braze", slug: 'braze', careerUrl: "https://www.braze.com/company/careers", platform: 'greenhouse', platformIdentifier: "braze" },
  { name: "Iterable", slug: 'iterable', careerUrl: "https://iterable.com/careers/", platform: 'greenhouse', platformIdentifier: "iterable" },
  { name: "Sprout Social", slug: 'sprout-social', careerUrl: "https://sproutsocial.com/careers/", platform: 'greenhouse', platformIdentifier: "sproutsocial" },
  { name: "Clari", slug: 'clari', careerUrl: "https://www.clari.com/careers/", platform: 'lever', platformIdentifier: "clari" },
  { name: "Highspot", slug: 'highspot', careerUrl: "https://www.highspot.com/careers/", platform: 'lever', platformIdentifier: "highspot" },
  { name: "6sense", slug: '6sense', careerUrl: "https://6sense.com/careers", platform: 'greenhouse', platformIdentifier: "6sense" },
  { name: "2U", slug: '2u', careerUrl: "https://2u.com/careers/", platform: 'greenhouse', platformIdentifier: "2u" },
  { name: "Guild Education", slug: 'guild-education', careerUrl: "https://guild.com/careers", platform: 'greenhouse', platformIdentifier: "guild" },
  { name: "LivePerson", slug: 'liveperson', careerUrl: "https://www.liveperson.com/company/careers/", platform: 'greenhouse', platformIdentifier: "liveperson" },
  { name: "Qualtrics", slug: 'qualtrics', careerUrl: "https://www.qualtrics.com/careers/us/en", platform: 'greenhouse', platformIdentifier: "qualtrics" },
  { name: "SurveyMonkey", slug: 'surveymonkey', careerUrl: "https://www.surveymonkey.com/careers/", platform: 'greenhouse', platformIdentifier: "surveymonkey" },
  { name: "Mixpanel", slug: 'mixpanel', careerUrl: "https://mixpanel.com/jobs/", platform: 'greenhouse', platformIdentifier: "mixpanel" },
  { name: "Split", slug: 'split', careerUrl: "https://www.harness.io/company/careers", platform: 'greenhouse', platformIdentifier: "harnessinc" },
  { name: "Contentful", slug: 'contentful', careerUrl: "https://www.contentful.com/careers/", platform: 'greenhouse', platformIdentifier: "contentful" },
  { name: "Sanity", slug: 'sanity', careerUrl: "https://www.sanity.io/careers", platform: 'ashby', platformIdentifier: "sanity" },
  { name: "Vultr", slug: 'vultr', careerUrl: "https://www.vultr.com/company/careers/", platform: 'ashby', platformIdentifier: "Vultr" },
  { name: "Sonar", slug: 'sonar', careerUrl: "https://www.sonarsource.com/company/careers/", platform: 'lever', platformIdentifier: "sonarsource" },
  { name: "Dashlane", slug: 'dashlane', careerUrl: "https://www.dashlane.com/about/careers", platform: 'greenhouse', platformIdentifier: "dashlane" },
  { name: "SailPoint", slug: 'sailpoint', careerUrl: "https://www.sailpoint.com/company/careers", platform: 'workday', platformIdentifier: "sailpoint|wd1|SailPoint" },
  { name: "Delinea", slug: 'delinea', careerUrl: "https://delinea.com/careers", platform: 'ashby', platformIdentifier: "delinea" },
  { name: "Yubico", slug: 'yubico', careerUrl: "https://www.yubico.com/careers/", platform: 'greenhouse', platformIdentifier: "yubico" },
  // batch2 additions — verified to return jobs (greenhouse) or valid CSRF-protected Workday tenants (422)
  { name: "Gong", slug: 'gong', careerUrl: "https://www.gong.io/careers", platform: 'greenhouse', platformIdentifier: "gongio" },
  { name: "Glean", slug: 'glean', careerUrl: "https://www.glean.com/careers", platform: 'greenhouse', platformIdentifier: "gleanwork" },
  { name: "GreyNoise", slug: 'greynoise', careerUrl: "https://www.greynoise.io/careers", platform: 'greenhouse', platformIdentifier: "greynoiseintelligence" },
  { name: "AON", slug: 'aon', careerUrl: "https://aon.wd1.myworkdayjobs.com", platform: 'workday', platformIdentifier: "aon|wd1|AON_Careers" },
  { name: "Westfield Insurance", slug: 'westfield-insurance', careerUrl: "https://westfieldinsurance.wd1.myworkdayjobs.com", platform: 'workday', platformIdentifier: "westfieldinsurance|wd1|Westfield_Careers" },
  { name: "WTW", slug: 'wtw', careerUrl: "https://careers.wtwco.com", platform: 'workday', platformIdentifier: "willistowerswatson|wd1|External" },
  { name: "Charles Schwab", slug: 'charles-schwab', careerUrl: "https://www.schwabjobs.com", platform: 'workday', platformIdentifier: "charlesschwab|wd1|External" },
  // batch7 additions (2026-07-16) — every entry probed AND verified to return jobs at runtime (no CSRF-blocked tenants)
  // Enterprise / Fortune 500 IT
  { name: 'Fiserv', slug: 'fiserv', careerUrl: 'https://careers.fiserv.com', platform: 'workday', platformIdentifier: 'fiserv|wd5|EXT' },
  { name: 'CarMax', slug: 'carmax', careerUrl: 'https://careers.carmax.com', platform: 'workday', platformIdentifier: 'carmax|wd1|External' },
  { name: 'Gartner', slug: 'gartner', careerUrl: 'https://jobs.gartner.com', platform: 'workday', platformIdentifier: 'gartner|wd5|EXT' },
  { name: 'Cardinal Health', slug: 'cardinal-health', careerUrl: 'https://jobs.cardinalhealth.com', platform: 'workday', platformIdentifier: 'cardinalhealth|wd1|EXT' },
  { name: 'McKesson', slug: 'mckesson', careerUrl: 'https://careers.mckesson.com', platform: 'workday', platformIdentifier: 'mckesson|wd3|External_Careers' },
  { name: 'Medtronic', slug: 'medtronic', careerUrl: 'https://jobs.medtronic.com', platform: 'workday', platformIdentifier: 'medtronic|wd1|MedtronicCareers' },
  { name: 'General Motors', slug: 'general-motors', careerUrl: 'https://search-careers.gm.com', platform: 'workday', platformIdentifier: 'generalmotors|wd5|Careers_GM' },
  { name: 'Fannie Mae', slug: 'fannie-mae', careerUrl: 'https://www.fanniemae.com/careers', platform: 'workday', platformIdentifier: 'fanniemae|wd1|FannieMaeCareers' },
  { name: 'Sabre', slug: 'sabre', careerUrl: 'https://www.sabre.com/locations/careers', platform: 'workday', platformIdentifier: 'sabre|wd1|SabreJobs' },
  { name: 'Chewy', slug: 'chewy', careerUrl: 'https://careers.chewy.com', platform: 'workday', platformIdentifier: 'chewy|wd5|External' },
  { name: "Lowe's", slug: 'lowes', careerUrl: 'https://talent.lowes.com', platform: 'workday', platformIdentifier: 'lowes|wd5|LWS_External_CS' },
  { name: 'Caterpillar', slug: 'caterpillar', careerUrl: 'https://careers.caterpillar.com', platform: 'workday', platformIdentifier: 'cat|wd5|CaterpillarCareers' },
  { name: '3M', slug: '3m', careerUrl: 'https://www.3m.com/3M/en_US/careers-us', platform: 'workday', platformIdentifier: '3m|wd1|Search' },
  { name: 'CDW', slug: 'cdw', careerUrl: 'https://www.cdwjobs.com', platform: 'workday', platformIdentifier: 'cdw|wd5|careers' },
  // Consulting / IT services
  { name: 'Kyndryl', slug: 'kyndryl', careerUrl: 'https://careers.kyndryl.com', platform: 'workday', platformIdentifier: 'kyndryl|wd5|KyndrylProfessionalCareers' },
  { name: 'ICF', slug: 'icf', careerUrl: 'https://www.icf.com/careers', platform: 'workday', platformIdentifier: 'icf|wd5|ICFExternal_Career_Site' },
  // Mid-size product companies
  { name: 'Guidewire', slug: 'guidewire', careerUrl: 'https://careers.guidewire.com', platform: 'workday', platformIdentifier: 'guidewire|wd5|External' },
  { name: 'DigitalOcean', slug: 'digitalocean', careerUrl: 'https://www.digitalocean.com/careers', platform: 'greenhouse', platformIdentifier: 'digitalocean98' },
  { name: 'Zocdoc', slug: 'zocdoc', careerUrl: 'https://www.zocdoc.com/about/careers', platform: 'greenhouse', platformIdentifier: 'zocdoc' },
  { name: 'Huntress', slug: 'huntress', careerUrl: 'https://www.huntress.com/careers', platform: 'greenhouse', platformIdentifier: 'huntress' },
  { name: 'Motive', slug: 'motive', careerUrl: 'https://gomotive.com/careers', platform: 'greenhouse', platformIdentifier: 'gomotive' },
  { name: 'Yext', slug: 'yext', careerUrl: 'https://www.yext.com/careers', platform: 'greenhouse', platformIdentifier: 'yext' },
  // Well-funded startups
  { name: 'Addepar', slug: 'addepar', careerUrl: 'https://addepar.com/careers', platform: 'greenhouse', platformIdentifier: 'addepar1' },
  { name: 'Temporal', slug: 'temporal', careerUrl: 'https://temporal.io/careers', platform: 'greenhouse', platformIdentifier: 'temporaltechnologies' },
  { name: 'Sierra', slug: 'sierra', careerUrl: 'https://sierra.ai/careers', platform: 'ashby', platformIdentifier: 'sierra' },
  { name: 'Cursor', slug: 'cursor', careerUrl: 'https://cursor.com/careers', platform: 'ashby', platformIdentifier: 'cursor' },
  { name: 'Decagon', slug: 'decagon', careerUrl: 'https://decagon.ai/careers', platform: 'ashby', platformIdentifier: 'decagon' },
  { name: 'Harvey', slug: 'harvey', careerUrl: 'https://www.harvey.ai/careers', platform: 'ashby', platformIdentifier: 'harvey' },
  // batch8 additions (2026-07-17) — every entry probed against the live ATS API AND
  // verified to return jobs through the compiled scrapers at runtime.
  // Enterprise / Fortune 500 IT
  { name: 'HP Inc', slug: 'hp-inc', careerUrl: 'https://jobs.hp.com', platform: 'workday', platformIdentifier: 'hp|wd5|ExternalCareerSite' },
  { name: 'Equinix', slug: 'equinix', careerUrl: 'https://careers.equinix.com', platform: 'workday', platformIdentifier: 'equinix|wd1|External' },
  { name: 'Cloudera', slug: 'cloudera', careerUrl: 'https://www.cloudera.com/careers.html', platform: 'workday', platformIdentifier: 'cloudera|wd5|External_Career' },
  { name: 'Ciena', slug: 'ciena', careerUrl: 'https://www.ciena.com/careers', platform: 'workday', platformIdentifier: 'ciena|wd5|Careers' },
  { name: 'RingCentral', slug: 'ringcentral', careerUrl: 'https://www.ringcentral.com/company/careers.html', platform: 'workday', platformIdentifier: 'ringcentral|wd1|RingCentral_Careers' },
  { name: 'athenahealth', slug: 'athenahealth', careerUrl: 'https://www.athenahealth.com/careers', platform: 'workday', platformIdentifier: 'athenahealth|wd1|External' },
  // Mid-size product companies (Greenhouse)
  { name: 'Navan', slug: 'navan', careerUrl: 'https://navan.com/careers', platform: 'greenhouse', platformIdentifier: 'tripactions' },
  { name: 'Ripple', slug: 'ripple', careerUrl: 'https://ripple.com/careers', platform: 'greenhouse', platformIdentifier: 'ripple' },
  { name: 'ClickHouse', slug: 'clickhouse', careerUrl: 'https://clickhouse.com/company/careers', platform: 'greenhouse', platformIdentifier: 'clickhouse' },
  { name: 'FanDuel', slug: 'fanduel', careerUrl: 'https://www.fanduel.careers', platform: 'greenhouse', platformIdentifier: 'fanduel' },
  { name: 'Checkr', slug: 'checkr', careerUrl: 'https://checkr.com/company/careers', platform: 'greenhouse', platformIdentifier: 'checkr' },
  { name: 'Chainguard', slug: 'chainguard', careerUrl: 'https://www.chainguard.dev/careers', platform: 'greenhouse', platformIdentifier: 'chainguard' },
  { name: 'SeatGeek', slug: 'seatgeek', careerUrl: 'https://seatgeek.com/jobs', platform: 'greenhouse', platformIdentifier: 'seatgeek' },
  { name: 'SingleStore', slug: 'singlestore', careerUrl: 'https://www.singlestore.com/careers', platform: 'greenhouse', platformIdentifier: 'singlestore' },
  { name: 'Couchbase', slug: 'couchbase', careerUrl: 'https://www.couchbase.com/careers', platform: 'greenhouse', platformIdentifier: 'couchbaseinc' },
  { name: 'Collibra', slug: 'collibra', careerUrl: 'https://www.collibra.com/company/careers', platform: 'greenhouse', platformIdentifier: 'collibra' },
  { name: 'Salesloft', slug: 'salesloft', careerUrl: 'https://salesloft.com/company/careers', platform: 'greenhouse', platformIdentifier: 'salesloft' },
  { name: 'Fanatics', slug: 'fanatics', careerUrl: 'https://www.fanaticsinc.com/careers', platform: 'greenhouse', platformIdentifier: 'fanaticsinc' },
  { name: 'Flatiron Health', slug: 'flatiron-health', careerUrl: 'https://flatiron.com/careers', platform: 'greenhouse', platformIdentifier: 'flatironhealth' },
  { name: 'Human Interest', slug: 'human-interest', careerUrl: 'https://humaninterest.com/careers', platform: 'greenhouse', platformIdentifier: 'humaninterest' },
  { name: 'Life360', slug: 'life360', careerUrl: 'https://www.life360.com/careers', platform: 'greenhouse', platformIdentifier: 'life360' },
  { name: 'Alloy', slug: 'alloy', careerUrl: 'https://www.alloy.com/careers', platform: 'greenhouse', platformIdentifier: 'alloy' },
  { name: 'Melio', slug: 'melio', careerUrl: 'https://meliopayments.com/careers', platform: 'greenhouse', platformIdentifier: 'melio' },
  { name: 'Lithic', slug: 'lithic', careerUrl: 'https://lithic.com/careers', platform: 'greenhouse', platformIdentifier: 'lithic' },
  { name: 'Instabase', slug: 'instabase', careerUrl: 'https://instabase.com/careers', platform: 'greenhouse', platformIdentifier: 'instabase' },
  { name: 'Consensys', slug: 'consensys', careerUrl: 'https://consensys.io/careers', platform: 'greenhouse', platformIdentifier: 'consensys' },
  { name: 'Pulumi', slug: 'pulumi', careerUrl: 'https://www.pulumi.com/careers', platform: 'greenhouse', platformIdentifier: 'pulumicorporation' },
  // Mid-size product companies (Lever)
  { name: 'Included Health', slug: 'included-health', careerUrl: 'https://includedhealth.com/careers', platform: 'lever', platformIdentifier: 'includedhealth' },
  { name: 'Match Group', slug: 'match-group', careerUrl: 'https://mtch.com/careers', platform: 'lever', platformIdentifier: 'matchgroup' },
  { name: 'Gopuff', slug: 'gopuff', careerUrl: 'https://www.gopuff.com/careers', platform: 'lever', platformIdentifier: 'gopuff' },
  // AI / dev-tool startups (Ashby)
  { name: 'Cognition', slug: 'cognition', careerUrl: 'https://cognition.ai/careers', platform: 'ashby', platformIdentifier: 'cognition' },
  { name: 'Baseten', slug: 'baseten', careerUrl: 'https://www.baseten.co/careers', platform: 'ashby', platformIdentifier: 'baseten' },
  { name: 'Mercor', slug: 'mercor', careerUrl: 'https://mercor.com/careers', platform: 'ashby', platformIdentifier: 'mercor' },
  { name: 'Suno', slug: 'suno', careerUrl: 'https://suno.com/careers', platform: 'ashby', platformIdentifier: 'suno' },
  { name: 'Abridge', slug: 'abridge', careerUrl: 'https://www.abridge.com/careers', platform: 'ashby', platformIdentifier: 'abridge' },
  { name: 'Headway', slug: 'headway', careerUrl: 'https://headway.co/careers', platform: 'ashby', platformIdentifier: 'headway' },
  { name: 'Warp', slug: 'warp', careerUrl: 'https://www.warp.dev/careers', platform: 'ashby', platformIdentifier: 'warp' },
  { name: 'Astronomer', slug: 'astronomer', careerUrl: 'https://www.astronomer.io/careers', platform: 'ashby', platformIdentifier: 'astronomer' },
  { name: 'Alchemy', slug: 'alchemy', careerUrl: 'https://www.alchemy.com/careers', platform: 'ashby', platformIdentifier: 'alchemy' },
  { name: 'Envoy', slug: 'envoy', careerUrl: 'https://envoy.com/careers', platform: 'ashby', platformIdentifier: 'envoy' },
  { name: 'Mintlify', slug: 'mintlify', careerUrl: 'https://mintlify.com/careers', platform: 'ashby', platformIdentifier: 'mintlify' },
  { name: 'Browserbase', slug: 'browserbase', careerUrl: 'https://www.browserbase.com/careers', platform: 'ashby', platformIdentifier: 'browserbase' },
  { name: 'OpenEvidence', slug: 'openevidence', careerUrl: 'https://www.openevidence.com/careers', platform: 'ashby', platformIdentifier: 'openevidence' },
  { name: 'Chroma', slug: 'chroma', careerUrl: 'https://www.trychroma.com/careers', platform: 'ashby', platformIdentifier: 'trychroma' },
  // batch9 additions (2026-07-18) — US IT/software, health insurance, and trading firms.
  // Every entry probed against the live ATS API and confirmed to return jobs.
  // Trading / market-making / exchanges
  { name: 'Virtu Financial', slug: 'virtu-financial', careerUrl: 'https://www.virtu.com/careers', platform: 'greenhouse', platformIdentifier: 'virtu' },
  { name: 'Jump Trading', slug: 'jump-trading', careerUrl: 'https://www.jumptrading.com/careers', platform: 'greenhouse', platformIdentifier: 'jumptrading' },
  { name: 'Tower Research Capital', slug: 'tower-research-capital', careerUrl: 'https://tower-research.com/open-positions', platform: 'greenhouse', platformIdentifier: 'towerresearchcapital' },
  { name: 'Akuna Capital', slug: 'akuna-capital', careerUrl: 'https://akunacapital.com/careers', platform: 'greenhouse', platformIdentifier: 'akunacapital' },
  { name: 'Five Rings', slug: 'five-rings', careerUrl: 'https://fiverings.com/careers', platform: 'greenhouse', platformIdentifier: 'fiveringsllc' },
  { name: 'Clear Street', slug: 'clear-street', careerUrl: 'https://clearstreet.io/careers', platform: 'greenhouse', platformIdentifier: 'clearstreet' },
  { name: 'Schonfeld', slug: 'schonfeld', careerUrl: 'https://www.schonfeld.com/careers', platform: 'greenhouse', platformIdentifier: 'schonfeld' },
  { name: 'Geneva Trading', slug: 'geneva-trading', careerUrl: 'https://genevatrading.com/careers', platform: 'greenhouse', platformIdentifier: 'genevatrading' },
  { name: 'tastytrade', slug: 'tastytrade', careerUrl: 'https://tastytrade.com/careers', platform: 'greenhouse', platformIdentifier: 'tastytrade' },
  { name: 'DriveWealth', slug: 'drivewealth', careerUrl: 'https://www.drivewealth.com/careers', platform: 'greenhouse', platformIdentifier: 'drivewealth' },
  { name: 'Old Mission Capital', slug: 'old-mission-capital', careerUrl: 'https://www.oldmissioncapital.com/careers', platform: 'greenhouse', platformIdentifier: 'oldmissioncapital' },
  { name: 'iCapital', slug: 'icapital', careerUrl: 'https://icapital.com/careers', platform: 'greenhouse', platformIdentifier: 'icapitalnetwork' },
  { name: 'Belvedere Trading', slug: 'belvedere-trading', careerUrl: 'https://www.belvederetrading.com/careers', platform: 'lever', platformIdentifier: 'belvederetrading' },
  { name: 'Kalshi', slug: 'kalshi', careerUrl: 'https://kalshi.com/careers', platform: 'ashby', platformIdentifier: 'kalshi' },
  { name: 'Imprint', slug: 'imprint', careerUrl: 'https://www.imprint.co/careers', platform: 'ashby', platformIdentifier: 'imprint' },
  { name: 'CME Group', slug: 'cme-group', careerUrl: 'https://www.cmegroup.com/careers.html', platform: 'workday', platformIdentifier: 'cmegroup|wd1|cme_careers' },
  { name: 'OCC (Options Clearing)', slug: 'occ', careerUrl: 'https://www.theocc.com/careers', platform: 'workday', platformIdentifier: 'theocc|wd5|Careers' },
  // Health insurance / health IT
  { name: 'HCSC (BCBS IL/TX/NM/OK/MT)', slug: 'hcsc', careerUrl: 'https://careers.hcsc.com', platform: 'workday', platformIdentifier: 'hcsc|wd1|HCSC_External' },
  { name: 'Premera Blue Cross', slug: 'premera-blue-cross', careerUrl: 'https://careers.premera.com', platform: 'workday', platformIdentifier: 'premera|wd5|premera' },
  { name: 'Point32Health', slug: 'point32health', careerUrl: 'https://www.point32health.org/careers', platform: 'workday', platformIdentifier: 'point32health|wd5|THP' },
  { name: 'Healthfirst', slug: 'healthfirst', careerUrl: 'https://healthfirst.org/careers', platform: 'workday', platformIdentifier: 'healthfirst|wd1|healthfirst' },
  { name: 'Waystar', slug: 'waystar', careerUrl: 'https://www.waystar.com/careers', platform: 'workday', platformIdentifier: 'waystar|wd1|waystar' },
  { name: 'R1 RCM', slug: 'r1-rcm', careerUrl: 'https://www.r1rcm.com/careers', platform: 'workday', platformIdentifier: 'r1rcm|wd1|r1rcm' },
  { name: 'Availity', slug: 'availity', careerUrl: 'https://www.availity.com/about-us/careers', platform: 'workday', platformIdentifier: 'availity|wd1|Availity_Careers_US' },
  { name: 'Zelis', slug: 'zelis', careerUrl: 'https://www.zelis.com/careers', platform: 'workday', platformIdentifier: 'zelis|wd1|zeliscareers' },
  { name: 'Sidecar Health', slug: 'sidecar-health', careerUrl: 'https://sidecarhealth.com/careers', platform: 'greenhouse', platformIdentifier: 'sidecarhealth' },
  { name: 'Cohere Health', slug: 'cohere-health', careerUrl: 'https://coherehealth.com/careers', platform: 'greenhouse', platformIdentifier: 'coherehealth' },
  { name: 'Garner Health', slug: 'garner-health', careerUrl: 'https://www.getgarner.com/careers', platform: 'greenhouse', platformIdentifier: 'garnerhealth' },
  // IT / software
  { name: 'Genpact', slug: 'genpact', careerUrl: 'https://www.genpact.com/careers', platform: 'workday', platformIdentifier: 'genpact|wd108|External_Careers' },
  { name: 'Analog Devices', slug: 'analog-devices', careerUrl: 'https://www.analog.com/en/careers.html', platform: 'workday', platformIdentifier: 'analogdevices|wd1|External' },
  { name: 'Marvell', slug: 'marvell', careerUrl: 'https://careers.marvell.com', platform: 'workday', platformIdentifier: 'marvell|wd1|marvellcareers' },
  // New US companies (2026-07-20) — verified live Greenhouse boards, non-duplicate
  { name: 'Carvana', slug: 'carvana', careerUrl: 'https://www.carvana.com/careers', platform: 'greenhouse', platformIdentifier: 'carvana' },
  { name: 'Xometry', slug: 'xometry', careerUrl: 'https://www.xometry.com/careers', platform: 'greenhouse', platformIdentifier: 'xometry' },
  { name: 'Sweetgreen', slug: 'sweetgreen', careerUrl: 'https://www.sweetgreen.com/careers', platform: 'greenhouse', platformIdentifier: 'sweetgreen' },
  { name: 'DoubleVerify', slug: 'doubleverify', careerUrl: 'https://doubleverify.com/careers', platform: 'greenhouse', platformIdentifier: 'doubleverify' },
  { name: 'Instawork', slug: 'instawork', careerUrl: 'https://www.instawork.com/careers', platform: 'greenhouse', platformIdentifier: 'instawork' },
  { name: 'Maven Clinic', slug: 'maven-clinic', careerUrl: 'https://www.mavenclinic.com/careers', platform: 'greenhouse', platformIdentifier: 'mavenclinic' },
  { name: 'Ondo Finance', slug: 'ondo', careerUrl: 'https://ondo.finance/careers', platform: 'greenhouse', platformIdentifier: 'ondofinance' },
  { name: 'Tia', slug: 'tia', careerUrl: 'https://www.asktia.com/careers', platform: 'greenhouse', platformIdentifier: 'tia' },
  { name: 'Glossier', slug: 'glossier', careerUrl: 'https://www.glossier.com/careers', platform: 'greenhouse', platformIdentifier: 'glossier' },
  { name: 'Rent the Runway', slug: 'rent-the-runway', careerUrl: 'https://www.renttherunway.com/careers', platform: 'greenhouse', platformIdentifier: 'renttherunway' },
  { name: 'SmartAsset', slug: 'smartasset', careerUrl: 'https://www.smartasset.com/careers', platform: 'greenhouse', platformIdentifier: 'smartasset' },
  { name: 'KAYAK', slug: 'kayak', careerUrl: 'https://www.kayak.com/careers', platform: 'greenhouse', platformIdentifier: 'kayak' },
  { name: 'Postscript', slug: 'postscript', careerUrl: 'https://postscript.io/careers', platform: 'greenhouse', platformIdentifier: 'postscript' },
  { name: 'Cameo', slug: 'cameo', careerUrl: 'https://www.cameo.com/careers', platform: 'greenhouse', platformIdentifier: 'cameo' },

  // New US employers (2026-08-08) — discovered via discover-companies.mjs +
  // discover-companies-browser.mjs, each verified to return live postings, then
  // reviewed against sample postings to weed out same-name boards belonging to
  // other companies. See "Adding companies to the registry" in CLAUDE.md.
  // ── Greenhouse ─────────────────────────────
  { name: "GoDaddy", slug: 'godaddy', careerUrl: "https://careers.godaddy.com", platform: 'greenhouse', platformIdentifier: "godaddy" },
  { name: "SolarWinds", slug: 'solarwinds', careerUrl: "https://www.solarwinds.com/company/careers", platform: 'greenhouse', platformIdentifier: "solarwinds" },
  { name: "Zuora", slug: 'zuora', careerUrl: "https://www.zuora.com/careers", platform: 'greenhouse', platformIdentifier: "zuora" },
  { name: "Alarm.com", slug: 'alarm-com', careerUrl: "https://www.alarm.com/careers", platform: 'greenhouse', platformIdentifier: "alarmcom" },
  { name: "Dialpad", slug: 'dialpad', careerUrl: "https://www.dialpad.com/careers", platform: 'greenhouse', platformIdentifier: "dialpad" },
  { name: "Nextiva", slug: 'nextiva', careerUrl: "https://www.nextiva.com/careers", platform: 'greenhouse', platformIdentifier: "nextiva" },
  { name: "Neo4j", slug: 'neo4j', careerUrl: "https://neo4j.com/careers", platform: 'greenhouse', platformIdentifier: "neo4j" },
  { name: "Hightouch", slug: 'hightouch', careerUrl: "https://hightouch.com/careers", platform: 'greenhouse', platformIdentifier: "hightouch" },
  { name: "Astera Labs", slug: 'astera-labs', careerUrl: "https://www.asteralabs.com/careers", platform: 'greenhouse', platformIdentifier: "asteralabs" },
  { name: "Payoneer", slug: 'payoneer', careerUrl: "https://careers.payoneer.com", platform: 'greenhouse', platformIdentifier: "payoneer" },
  { name: "Jane Street", slug: 'jane-street', careerUrl: "https://www.janestreet.com/join-jane-street", platform: 'greenhouse', platformIdentifier: "janestreet" },
  { name: "Tripadvisor", slug: 'tripadvisor', careerUrl: "https://careers.tripadvisor.com", platform: 'greenhouse', platformIdentifier: "tripadvisor" },
  { name: "Upwork", slug: 'upwork', careerUrl: "https://www.upwork.com/careers", platform: 'greenhouse', platformIdentifier: "upwork" },
  { name: "SimpliSafe", slug: 'simplisafe', careerUrl: "https://simplisafe.com/careers", platform: 'greenhouse', platformIdentifier: "simplisafe" },
  { name: "The New York Times", slug: 'the-new-york-times', careerUrl: "https://www.nytco.com/careers", platform: 'greenhouse', platformIdentifier: "thenewyorktimes" },
  { name: "Bridgewater Associates", slug: 'bridgewater-associates', careerUrl: "https://www.bridgewater.com/careers", platform: 'greenhouse', platformIdentifier: "bridgewater89" },
  // ── Lever ──────────────────────────────────
  { name: "Perforce Software", slug: 'perforce-software', careerUrl: "https://www.perforce.com/careers", platform: 'lever', platformIdentifier: "perforce" },
  // ── Ashby ──────────────────────────────────
  { name: "InfluxData", slug: 'influxdata', careerUrl: "https://www.influxdata.com/careers", platform: 'ashby', platformIdentifier: "Influxdata" },
  { name: "Teleport", slug: 'teleport', careerUrl: "https://goteleport.com/careers", platform: 'ashby', platformIdentifier: "goteleport" },
  { name: "Prefect", slug: 'prefect', careerUrl: "https://www.prefect.io/careers", platform: 'ashby', platformIdentifier: "prefect" },
  { name: "NETGEAR", slug: 'netgear', careerUrl: "https://www.netgear.com/about/careers", platform: 'ashby', platformIdentifier: "netgear" },
  { name: "Thumbtack", slug: 'thumbtack', careerUrl: "https://www.thumbtack.com/careers", platform: 'ashby', platformIdentifier: "thumbtack" },
  { name: "Handshake", slug: 'handshake', careerUrl: "https://joinhandshake.com/careers", platform: 'ashby', platformIdentifier: "handshake" },
  // ── SmartRecruiters ────────────────────────
  { name: "Flywire", slug: 'flywire', careerUrl: "https://www.flywire.com/careers", platform: 'smartrecruiters', platformIdentifier: "Flywire1" },
  // ── Workday ────────────────────────────────
  { name: "Aspen Technology", slug: 'aspen-technology', careerUrl: "https://www.aspentech.com/en/careers", platform: 'workday', platformIdentifier: "aspentech|wd5|aspentech" },
  { name: "Workiva", slug: 'workiva', careerUrl: "https://www.workiva.com/careers", platform: 'workday', platformIdentifier: "workiva|wd503|careers" },
  { name: "Duck Creek Technologies", slug: 'duck-creek-technologies', careerUrl: "https://www.duckcreek.com/careers", platform: 'workday', platformIdentifier: "duckcreek|wd1|duckcreekcareers" },
  { name: "SUSE", slug: 'suse', careerUrl: "https://www.suse.com/company/careers", platform: 'workday', platformIdentifier: "suse|wd3|Jobsatsuse" },
  { name: "Lattice Semiconductor", slug: 'lattice-semiconductor', careerUrl: "https://www.latticesemi.com/careers", platform: 'workday', platformIdentifier: "latticesemi|wd5|latticesemiconductorscareers" },
  { name: "SiFive", slug: 'sifive', careerUrl: "https://www.sifive.com/careers", platform: 'workday', platformIdentifier: "sifive|wd1|sifivecareers" },
  { name: "Wolfspeed", slug: 'wolfspeed', careerUrl: "https://www.wolfspeed.com/careers", platform: 'workday', platformIdentifier: "cree|wd108|EXT" },
  { name: "M&T Bank", slug: 'm-t-bank', careerUrl: "https://www.mtb.com/careers", platform: 'workday', platformIdentifier: "mtb|wd5|MTB" },
  { name: "Voya Financial", slug: 'voya-financial', careerUrl: "https://www.voya.com/careers", platform: 'workday', platformIdentifier: "godirect|wd5|voya_jobs" },
  { name: "Q2 Holdings", slug: 'q2-holdings', careerUrl: "https://www.q2.com/careers", platform: 'workday', platformIdentifier: "q2ebanking|wd5|Q2" },
  { name: "Biogen", slug: 'biogen', careerUrl: "https://www.biogen.com/careers", platform: 'workday', platformIdentifier: "biibhr|wd3|external" },
  { name: "Verily", slug: 'verily', careerUrl: "https://verily.com/careers", platform: 'workday', platformIdentifier: "verily|wd1|Verily_Careers" },
  { name: "General Mills", slug: 'general-mills', careerUrl: "https://careers.generalmills.com", platform: 'workday', platformIdentifier: "genmills|wd1|GMI_External_Careers" },
  { name: "Tyson Foods", slug: 'tyson-foods', careerUrl: "https://www.tysonfoods.com/careers", platform: 'workday', platformIdentifier: "tysonfoods|wd5|TSN" },
  { name: "Grubhub", slug: 'grubhub', careerUrl: "https://careers.grubhub.com", platform: 'workday', platformIdentifier: "wonder|wd1|Grubhub_Careers" },
  { name: "CH Robinson", slug: 'ch-robinson', careerUrl: "https://jobs.chrobinson.com", platform: 'workday', platformIdentifier: "chrobinson|wd5|CHRobinson" },
  { name: "Ryder System", slug: 'ryder-system', careerUrl: "https://ryder.com/careers", platform: 'workday', platformIdentifier: "ryder|wd5|RyderCareers" },
  { name: "iHeartMedia", slug: 'iheartmedia', careerUrl: "https://www.iheartmedia.com/careers", platform: 'workday', platformIdentifier: "iheartmedia|wd5|External_iHM" },
  { name: "Live Nation", slug: 'live-nation', careerUrl: "https://www.livenationentertainment.com/careers", platform: 'workday', platformIdentifier: "livenation|wd503|LNExternalSite" },
  { name: "Duke Energy", slug: 'duke-energy', careerUrl: "https://www.duke-energy.com/careers", platform: 'workday', platformIdentifier: "dukeenergy|wd1|search" },
  { name: "Xcel Energy", slug: 'xcel-energy', careerUrl: "https://www.xcelenergy.com/careers", platform: 'workday', platformIdentifier: "xcelenergy|wd1|External" },
  { name: "Synechron", slug: 'synechron', careerUrl: "https://www.synechron.com/careers", platform: 'workday', platformIdentifier: "synechron|wd1|SynechronCareers" },
  { name: "Aerospace Corporation", slug: 'aerospace-corporation', careerUrl: "https://careers.aerospace.org", platform: 'workday', platformIdentifier: "aero|wd5|External" },
  { name: "Dotdash Meredith", slug: 'dotdash-meredith', careerUrl: "https://www.dotdashmeredith.com/careers", platform: 'workday', platformIdentifier: "meredith|wd5|EXT" },
  { name: "Blackbaud", slug: 'blackbaud', careerUrl: "https://careers.blackbaud.com", platform: 'workday', platformIdentifier: "blackbaud|wd1|ExternalCareers" },
  { name: "NXP Semiconductors", slug: 'nxp-semiconductors', careerUrl: "https://www.nxp.com/careers", platform: 'workday', platformIdentifier: "nxp|wd3|careers" },
  { name: "Fifth Third Bank", slug: 'fifth-third-bank', careerUrl: "https://www.53.com/careers", platform: 'workday', platformIdentifier: "fifththird|wd5|53careers" },
  { name: "Regions Bank", slug: 'regions-bank', careerUrl: "https://www.regions.com/about-regions/careers", platform: 'workday', platformIdentifier: "regions|wd5|Regions_Careers" },
  { name: "Huntington Bank", slug: 'huntington-bank', careerUrl: "https://www.huntington.com/careers", platform: 'workday', platformIdentifier: "huntington|wd12|HNBcareers" },
  { name: "GEICO", slug: 'geico', careerUrl: "https://careers.geico.com", platform: 'workday', platformIdentifier: "geico|wd1|External" },
  { name: "nCino", slug: 'ncino', careerUrl: "https://www.ncino.com/careers", platform: 'workday', platformIdentifier: "ncino|wd5|nCinoCareers" },
  { name: "Labcorp", slug: 'labcorp', careerUrl: "https://careers.labcorp.com", platform: 'workday', platformIdentifier: "labcorp|wd1|External" },
  { name: "Tempus AI", slug: 'tempus-ai', careerUrl: "https://www.tempus.com/careers", platform: 'workday', platformIdentifier: "tempus|wd5|Tempus_Careers" },
  { name: "Procter and Gamble", slug: 'procter-and-gamble', careerUrl: "https://www.pgcareers.com", platform: 'workday', platformIdentifier: "pg|wd5|1000" },
  { name: "Southwest Airlines", slug: 'southwest-airlines', careerUrl: "https://careers.southwestair.com", platform: 'workday', platformIdentifier: "swa|wd1|external" },
  { name: "Turo", slug: 'turo', careerUrl: "https://turo.com/careers", platform: 'workday', platformIdentifier: "turo|wd12|Turo_careers" },
  { name: "Trane Technologies", slug: 'trane-technologies', careerUrl: "https://careers.tranetechnologies.com", platform: 'workday', platformIdentifier: "tranetechnologies|wd12|Trane_Technologies_Careers" },
  { name: "KBR", slug: 'kbr', careerUrl: "https://careers.kbr.com", platform: 'workday', platformIdentifier: "kbr|wd5|KBR_Careers" },


  // ── Auto-discovered (verified via ATS API) ─────────────────────────────
  // ── Greenhouse ─────────────────────────────
  { name: "Alnylam Pharmaceuticals", slug: 'alnylam-pharmaceuticals', careerUrl: "https://www.alnylam.com/careers", platform: 'greenhouse', platformIdentifier: "alnylampharmaceuticals" },
  { name: "Hasbro", slug: 'hasbro', careerUrl: "https://careers.hasbro.com", platform: 'greenhouse', platformIdentifier: "hasbro" },
  { name: "Bungie", slug: 'bungie', careerUrl: "https://careers.bungie.com", platform: 'greenhouse', platformIdentifier: "bungie" },
  { name: "Nintendo of America", slug: 'nintendo-of-america', careerUrl: "https://careers.nintendo.com", platform: 'greenhouse', platformIdentifier: "nintendo" },
  // ── Lever ──────────────────────────────────
  // ── Ashby ──────────────────────────────────
  // ── SmartRecruiters ────────────────────────
  // ── Workday ────────────────────────────────
  { name: "Dick's Sporting Goods", slug: 'dick-s-sporting-goods', careerUrl: "https://www.dickssportinggoods.jobs", platform: 'workday', platformIdentifier: "dickssportinggoods|wd1|DSG" },
  { name: "Petco", slug: 'petco', careerUrl: "https://careers.petco.com", platform: 'workday', platformIdentifier: "petco|wd504|External" },
  { name: "Wegmans", slug: 'wegmans', careerUrl: "https://jobs.wegmans.com", platform: 'workday', platformIdentifier: "wegmans|wd1|Wegmans" },
  { name: "Land O'Lakes", slug: 'land-o-lakes', careerUrl: "https://www.landolakesinc.com/careers", platform: 'workday', platformIdentifier: "landolakes|wd1|LandOLakes" },
  { name: "Constellation Brands", slug: 'constellation-brands', careerUrl: "https://www.cbrands.com/careers", platform: 'workday', platformIdentifier: "cbrands|wd5|CBI_External_Careers" },
  { name: "Choice Hotels", slug: 'choice-hotels', careerUrl: "https://careers.choicehotels.com", platform: 'workday', platformIdentifier: "choicehotels|wd5|HotelExternal" },
  { name: "Old Dominion Freight Line", slug: 'old-dominion-freight-line', careerUrl: "https://careers.odfl.com", platform: 'workday', platformIdentifier: "odfl|wd1|ODFL_Careers" },
  { name: "Werner Enterprises", slug: 'werner-enterprises', careerUrl: "https://werner.com/careers", platform: 'workday', platformIdentifier: "werner|wd501|Werner" },
  { name: "ConocoPhillips", slug: 'conocophillips', careerUrl: "https://careers.conocophillips.com", platform: 'workday', platformIdentifier: "conocophillips|wd1|External" },
  { name: "American Electric Power", slug: 'american-electric-power', careerUrl: "https://www.aep.com/careers", platform: 'workday', platformIdentifier: "aep|wd1|AEPCareerSite" },
  { name: "Vistra", slug: 'vistra', careerUrl: "https://www.vistracorp.com/careers", platform: 'workday', platformIdentifier: "vst|wd5|vistra_careers" },
  { name: "GE Vernova", slug: 'ge-vernova', careerUrl: "https://www.gevernova.com/careers", platform: 'workday', platformIdentifier: "gevernova|wd5|Vernova_ExternalSite" },
  { name: "Air Products", slug: 'air-products', careerUrl: "https://www.airproducts.com/company/careers", platform: 'workday', platformIdentifier: "airproducts|wd5|AP0001" },
  { name: "Carrier", slug: 'carrier', careerUrl: "https://jobs.carrier.com", platform: 'workday', platformIdentifier: "carrier|wd5|jobs" },
  { name: "Flex", slug: 'flex', careerUrl: "https://flex.com/careers", platform: 'workday', platformIdentifier: "flextronics|wd1|Careers" },
  { name: "Jabil", slug: 'jabil', careerUrl: "https://careers.jabil.com", platform: 'workday', platformIdentifier: "jabil|wd5|Jabil_Careers" },
  { name: "Toyota North America", slug: 'toyota-north-america', careerUrl: "https://www.toyota.com/careers", platform: 'workday', platformIdentifier: "toyota|wd503|TMNA" },
  { name: "Goodyear", slug: 'goodyear', careerUrl: "https://careers.goodyear.com", platform: 'workday', platformIdentifier: "goodyear|wd1|GoodyearCareers" },
  { name: "Zoetis", slug: 'zoetis', careerUrl: "https://careers.zoetis.com", platform: 'workday', platformIdentifier: "zoetis|wd5|zoetis" },
  { name: "Elanco", slug: 'elanco', careerUrl: "https://www.elanco.com/en-us/careers", platform: 'workday', platformIdentifier: "elanco|wd5|External_Career" },
  { name: "ResMed", slug: 'resmed', careerUrl: "https://careers.resmed.com", platform: 'workday', platformIdentifier: "resmed|wd3|Resmed_External_Careers" },
  { name: "Mass General Brigham", slug: 'mass-general-brigham', careerUrl: "https://www.massgeneralbrigham.org/en/careers", platform: 'workday', platformIdentifier: "massgeneralbrigham|wd1|MGBExternal" },
  { name: "NewYork-Presbyterian", slug: 'newyork-presbyterian', careerUrl: "https://careers.nyp.org", platform: 'workday', platformIdentifier: "nyp|wd1|nypcareers" },
  { name: "Geisinger", slug: 'geisinger', careerUrl: "https://jobs.geisinger.org", platform: 'workday', platformIdentifier: "geisinger|wd5|GeisingerExternal" },
  { name: "Sentara Health", slug: 'sentara-health', careerUrl: "https://www.sentara.com/careers", platform: 'workday', platformIdentifier: "sentara|wd1|SCS" },
  { name: "Memorial Sloan Kettering", slug: 'memorial-sloan-kettering', careerUrl: "https://careers.mskcc.org", platform: 'workday', platformIdentifier: "msk|wd108|MSKCC_Careers_Primary" },
  { name: "Auto-Owners Insurance", slug: 'auto-owners-insurance', careerUrl: "https://www.auto-owners.com/careers", platform: 'workday', platformIdentifier: "aoins|wd5|AutoOwners" },
  { name: "Markel", slug: 'markel', careerUrl: "https://www.markel.com/careers", platform: 'workday', platformIdentifier: "markelcorp|wd5|GlobalCareers" },
  { name: "Arch Capital Group", slug: 'arch-capital-group', careerUrl: "https://www.archgroup.com/careers", platform: 'workday', platformIdentifier: "archgroup|wd1|careers" },
  { name: "Securian Financial", slug: 'securian-financial', careerUrl: "https://www.securian.com/careers", platform: 'workday', platformIdentifier: "hq|wd12|Securian_External" },
  { name: "Thrivent", slug: 'thrivent', careerUrl: "https://careers.thrivent.com", platform: 'workday', platformIdentifier: "thrivent|wd5|external" },
  { name: "CNO Financial Group", slug: 'cno-financial-group', careerUrl: "https://careers.cnoinc.com", platform: 'workday', platformIdentifier: "cnoinc|wd5|Careers" },
  { name: "Webster Bank", slug: 'webster-bank', careerUrl: "https://www.websterbank.com/careers", platform: 'workday', platformIdentifier: "websteronline|wd12|WebsterExternalCareerSite" },
  // Apollo Global Management (athene|wd5|Apollo_Careers) omitted — its Workday tenant
  // returns no `postedOn` on any posting, so every job it yields is dropped as undated.
  { name: "The Carlyle Group", slug: 'the-carlyle-group', careerUrl: "https://www.carlyle.com/careers", platform: 'workday', platformIdentifier: "carlyle|wd1|Carlyle" },
  { name: "TIAA", slug: 'tiaa', careerUrl: "https://careers.tiaa.org", platform: 'workday', platformIdentifier: "tiaa|wd1|Search" },
  { name: "AMC Networks", slug: 'amc-networks', careerUrl: "https://www.amcnetworks.com/careers", platform: 'workday', platformIdentifier: "amcn|wd5|amcnetworks" },
  { name: "Unilever", slug: 'unilever', careerUrl: "https://careers.unilever.com", platform: 'workday', platformIdentifier: "unilever|wd3|Unilever_Experienced_Professionals" },
  { name: "Church & Dwight", slug: 'church-dwight', careerUrl: "https://careers.churchdwight.com", platform: 'workday', platformIdentifier: "churchdwight|wd1|chdcareers" },
  { name: "Levi Strauss & Co", slug: 'levi-strauss-co', careerUrl: "https://www.levistrauss.com/work-with-us", platform: 'workday', platformIdentifier: "levistraussandco|wd5|External" },
  { name: "VF Corporation", slug: 'vf-corporation', careerUrl: "https://www.vfc.com/careers", platform: 'workday', platformIdentifier: "vfc|wd5|vfc_careers" },
  { name: "Tapestry", slug: 'tapestry', careerUrl: "https://careers.tapestry.com", platform: 'workday', platformIdentifier: "tapestry|wd108|Tapestry_Careers" },
  { name: "Columbia Sportswear", slug: 'columbia-sportswear', careerUrl: "https://www.columbia.com/careers", platform: 'workday', platformIdentifier: "columbiasportswearcompany|wd5|CSC_Careers" },
  { name: "Deckers Brands", slug: 'deckers-brands', careerUrl: "https://www.deckers.com/careers", platform: 'workday', platformIdentifier: "deckers|wd5|Deckers" },
  { name: "JLL", slug: 'jll', careerUrl: "https://www.jll.com/en-us/careers", platform: 'workday', platformIdentifier: "jll|wd1|jllcareers" },
  { name: "Cushman & Wakefield", slug: 'cushman-wakefield', careerUrl: "https://careers.cushmanwakefield.com", platform: 'workday', platformIdentifier: "cw|wd1|External" },
  { name: "Prologis", slug: 'prologis', careerUrl: "https://www.prologis.com/careers", platform: 'workday', platformIdentifier: "prologis|wd5|Prologis_External_Careers" },
  { name: "Invitation Homes", slug: 'invitation-homes', careerUrl: "https://careers.invitationhomes.com", platform: 'workday', platformIdentifier: "invitationhomes|wd503|INVH" },
  { name: "FMC Corporation", slug: 'fmc-corporation', careerUrl: "https://www.fmc.com/en/careers", platform: 'workday', platformIdentifier: "fmc|wd12|FMC" },
  { name: "Sierra Nevada Corporation", slug: 'sierra-nevada-corporation', careerUrl: "https://www.sncorp.com/careers", platform: 'workday', platformIdentifier: "snc|wd1|SNC_External_Career_Site" },
  { name: "Draper", slug: 'draper', careerUrl: "https://www.draper.com/careers", platform: 'workday', platformIdentifier: "draper|wd5|Draper_Careers" },
  { name: "Silicon Labs", slug: 'silicon-labs', careerUrl: "https://www.silabs.com/about-us/careers", platform: 'workday', platformIdentifier: "silabs|wd1|SiliconlabsCareers" },
  { name: "Entegris", slug: 'entegris', careerUrl: "https://careers.entegris.com", platform: 'workday', platformIdentifier: "entegris|wd1|EntegrisCareers" },
  { name: "Lumentum", slug: 'lumentum', careerUrl: "https://www.lumentum.com/en/careers", platform: 'workday', platformIdentifier: "lumentum|wd5|LITE" },
  { name: "O'Reilly Auto Parts", slug: 'o-reilly-auto-parts', careerUrl: "https://corporate.oreillyauto.com/careers", platform: 'workday', platformIdentifier: "oreillyauto|wd1|oreilly" },
  { name: "Advance Auto Parts", slug: 'advance-auto-parts', careerUrl: "https://jobs.advanceautoparts.com", platform: 'workday', platformIdentifier: "advanceauto|wd5|AdvanceExternalCareers" },
  { name: "GE HealthCare", slug: 'ge-healthcare', careerUrl: "https://careers.gehealthcare.com", platform: 'workday', platformIdentifier: "gehc|wd5|GEHC_ExternalSite" },
  { name: "Stanley Black & Decker", slug: 'stanley-black-decker', careerUrl: "https://www.stanleyblackanddecker.com/careers", platform: 'workday', platformIdentifier: "sbdinc|wd1|Stanley_Black_Decker_Career_Site" },
  { name: "Oshkosh Corporation", slug: 'oshkosh-corporation', careerUrl: "https://careers.oshkoshcorp.com", platform: 'workday', platformIdentifier: "oshkoshcorporation|wd5|Oshkosh" },
  { name: "GSK", slug: 'gsk', careerUrl: "https://jobs.gsk.com", platform: 'workday', platformIdentifier: "gsk|wd5|GSKCareers" },
  { name: "Neurocrine Biosciences", slug: 'neurocrine-biosciences', careerUrl: "https://www.neurocrine.com/careers", platform: 'workday', platformIdentifier: "neurocrine|wd5|Neurocrinecareers" },
  { name: "Trinity Health", slug: 'trinity-health', careerUrl: "https://jobs.trinity-health.org", platform: 'workday', platformIdentifier: "trinityhealth|wd1|Jobs" },
  // Corewell Health (spectrumhealth|wd5|CorewellHealthCareers) omitted — same reason.
  { name: "BMO", slug: 'bmo', careerUrl: "https://jobs.bmo.com", platform: 'workday', platformIdentifier: "bmo|wd3|External" },
  { name: "Raymond James", slug: 'raymond-james', careerUrl: "https://www.raymondjames.com/careers", platform: 'workday', platformIdentifier: "raymondjames|wd1|RaymondJamesCareers" },
  // Blackstone (blackstone|wd1|Blackstone_Careers) omitted — same reason.
  { name: "Skechers", slug: 'skechers', careerUrl: "https://careers.skechers.com", platform: 'workday', platformIdentifier: "skechers|wd5|One-career-site" },
  { name: "Simon Property Group", slug: 'simon-property-group', careerUrl: "https://careers.simon.com", platform: 'workday', platformIdentifier: "simon|wd1|Simon" },
  { name: "Ecolab", slug: 'ecolab', careerUrl: "https://careers.ecolab.com", platform: 'workday', platformIdentifier: "ecolab|wd1|Ecolab_External" },


  // ── Auto-discovered (verified via ATS API) ─────────────────────────────
  // ── Greenhouse ─────────────────────────────
  { name: "Antora Energy", slug: 'antora-energy', careerUrl: "https://antoraenergy.com/careers", platform: 'greenhouse', platformIdentifier: "antora" },
  { name: "Redwood Materials", slug: 'redwood-materials', careerUrl: "https://www.redwoodmaterials.com/careers", platform: 'greenhouse', platformIdentifier: "redwoodmaterials" },
  { name: "Palmetto", slug: 'palmetto', careerUrl: "https://palmetto.com/careers", platform: 'greenhouse', platformIdentifier: "palmettocleantech" },
  { name: "Pivot Bio", slug: 'pivot-bio', careerUrl: "https://www.pivotbio.com/careers", platform: 'greenhouse', platformIdentifier: "pivotbio" },
  { name: "Misfits Market", slug: 'misfits-market', careerUrl: "https://www.misfitsmarket.com/careers", platform: 'greenhouse', platformIdentifier: "misfitsmarket" },
  { name: "HelloFresh", slug: 'hellofresh', careerUrl: "https://www.hellofresh.com/careers", platform: 'greenhouse', platformIdentifier: "hellofresh" },
  { name: "Built Technologies", slug: 'built-technologies', careerUrl: "https://www.getbuilt.com/careers", platform: 'greenhouse', platformIdentifier: "getbuilt" },
  { name: "BuildOps", slug: 'buildops', careerUrl: "https://buildops.com/careers", platform: 'greenhouse', platformIdentifier: "buildops" },
  { name: "OpenSpace", slug: 'openspace', careerUrl: "https://www.openspace.ai/careers", platform: 'greenhouse', platformIdentifier: "openspace" },
  { name: "Orchard", slug: 'orchard', careerUrl: "https://orchard.com/careers", platform: 'greenhouse', platformIdentifier: "orchard" },
  { name: "Flexe", slug: 'flexe', careerUrl: "https://www.flexe.com/careers", platform: 'greenhouse', platformIdentifier: "flexe" },
  { name: "Locus Robotics", slug: 'locus-robotics', careerUrl: "https://locusrobotics.com/careers", platform: 'greenhouse', platformIdentifier: "locusrobotics" },
  { name: "Optimal Dynamics", slug: 'optimal-dynamics', careerUrl: "https://www.optimaldynamics.com/careers", platform: 'greenhouse', platformIdentifier: "optimaldynamics" },
  { name: "Path Robotics", slug: 'path-robotics', careerUrl: "https://www.path-robotics.com/careers", platform: 'greenhouse', platformIdentifier: "pathrobotics" },
  { name: "Markforged", slug: 'markforged', careerUrl: "https://markforged.com/careers", platform: 'greenhouse', platformIdentifier: "markforged" },
  { name: "Formlabs", slug: 'formlabs', careerUrl: "https://formlabs.com/careers", platform: 'greenhouse', platformIdentifier: "formlabs" },
  { name: "Carbon", slug: 'carbon', careerUrl: "https://www.carbon3d.com/careers", platform: 'greenhouse', platformIdentifier: "carbon" },
  { name: "Tulip Interfaces", slug: 'tulip-interfaces', careerUrl: "https://tulip.co/careers", platform: 'greenhouse', platformIdentifier: "tulip" },
  { name: "Fictiv", slug: 'fictiv', careerUrl: "https://www.fictiv.com/careers", platform: 'greenhouse', platformIdentifier: "fictiv" },
  { name: "Honor", slug: 'honor', careerUrl: "https://www.joinhonor.com/careers", platform: 'greenhouse', platformIdentifier: "honor" },
  { name: "Papa", slug: 'papa', careerUrl: "https://www.papa.com/careers", platform: 'greenhouse', platformIdentifier: "papa" },
  { name: "Charlie Health", slug: 'charlie-health', careerUrl: "https://www.charliehealth.com/careers", platform: 'greenhouse', platformIdentifier: "charliehealth" },
  { name: "Boulder Care", slug: 'boulder-care', careerUrl: "https://www.boulder.care/careers", platform: 'greenhouse', platformIdentifier: "bouldercare" },
  { name: "Counterpart", slug: 'counterpart', careerUrl: "https://www.yourcounterpart.com/careers", platform: 'greenhouse', platformIdentifier: "counterpart" },
  { name: "Grove Collaborative", slug: 'grove-collaborative', careerUrl: "https://www.grove.co/careers", platform: 'greenhouse', platformIdentifier: "grovecollaborative" },
  { name: "Thrive Market", slug: 'thrive-market', careerUrl: "https://thrivemarket.com/careers", platform: 'greenhouse', platformIdentifier: "thrivemarket" },
  { name: "iFIT", slug: 'ifit', careerUrl: "https://www.ifit.com/careers", platform: 'greenhouse', platformIdentifier: "ifit" },
  { name: "Vox Media", slug: 'vox-media', careerUrl: "https://www.voxmedia.com/pages/careers", platform: 'greenhouse', platformIdentifier: "voxmedia" },
  { name: "Axios", slug: 'axios', careerUrl: "https://www.axios.com/careers", platform: 'greenhouse', platformIdentifier: "axios" },
  { name: "Hearst", slug: 'hearst', careerUrl: "https://www.hearst.com/careers", platform: 'greenhouse', platformIdentifier: "hearst" },
  { name: "Fandom", slug: 'fandom', careerUrl: "https://www.fandom.com/careers", platform: 'greenhouse', platformIdentifier: "fandom" },
  { name: "Vestwell", slug: 'vestwell', careerUrl: "https://www.vestwell.com/careers", platform: 'greenhouse', platformIdentifier: "vestwell" },
  { name: "Altruist", slug: 'altruist', careerUrl: "https://altruist.com/careers", platform: 'greenhouse', platformIdentifier: "altruist" },
  { name: "HopSkipDrive", slug: 'hopskipdrive', careerUrl: "https://www.hopskipdrive.com/careers", platform: 'greenhouse', platformIdentifier: "hopskipdrive" },
  { name: "Clever", slug: 'clever', careerUrl: "https://clever.com/careers", platform: 'greenhouse', platformIdentifier: "clever" },
  { name: "GoGuardian", slug: 'goguardian', careerUrl: "https://www.goguardian.com/careers", platform: 'greenhouse', platformIdentifier: "goguardian" },
  { name: "Lawmatics", slug: 'lawmatics', careerUrl: "https://www.lawmatics.com/careers", platform: 'greenhouse', platformIdentifier: "lawmatics" },
  { name: "Evolve", slug: 'evolve', careerUrl: "https://evolve.com/careers", platform: 'greenhouse', platformIdentifier: "evolvevacationrental" },
  { name: "Wildlife Studios", slug: 'wildlife-studios', careerUrl: "https://wildlifestudios.com/careers", platform: 'greenhouse', platformIdentifier: "wildlifestudios" },
  { name: "AppLovin", slug: 'applovin', careerUrl: "https://www.applovin.com/careers", platform: 'greenhouse', platformIdentifier: "applovin" },
  { name: "PrizePicks", slug: 'prizepicks', careerUrl: "https://www.prizepicks.com/careers", platform: 'greenhouse', platformIdentifier: "prizepicks" },
  { name: "Underdog", slug: 'underdog', careerUrl: "https://underdogfantasy.com/careers", platform: 'greenhouse', platformIdentifier: "underdogfantasy" },
  { name: "Grailed", slug: 'grailed', careerUrl: "https://www.grailed.com/careers", platform: 'greenhouse', platformIdentifier: "grailed" },
  { name: "7shifts", slug: '7shifts', careerUrl: "https://www.7shifts.com/careers", platform: 'greenhouse', platformIdentifier: "7shifts" },
  { name: "Legion Technologies", slug: 'legion-technologies', careerUrl: "https://legion.co/careers", platform: 'greenhouse', platformIdentifier: "legion" },
  // ── Lever ──────────────────────────────────
  { name: "Commonwealth Fusion Systems", slug: 'commonwealth-fusion-systems', careerUrl: "https://cfs.energy/careers", platform: 'lever', platformIdentifier: "cfsenergy" },
  { name: "Omnidian", slug: 'omnidian', careerUrl: "https://www.omnidian.com/careers", platform: 'lever', platformIdentifier: "omnidian" },
  { name: "Loadsmart", slug: 'loadsmart', careerUrl: "https://loadsmart.com/careers", platform: 'lever', platformIdentifier: "loadsmart" },
  { name: "Arrive Logistics", slug: 'arrive-logistics', careerUrl: "https://www.arrivelogistics.com/careers", platform: 'lever', platformIdentifier: "arrivelogistics" },
  { name: "Bright Machines", slug: 'bright-machines', careerUrl: "https://www.brightmachines.com/careers", platform: 'lever', platformIdentifier: "brightmachines" },
  { name: "Velo3D", slug: 'velo3d', careerUrl: "https://velo3d.com/careers", platform: 'lever', platformIdentifier: "velo3d" },
  { name: "Protolabs", slug: 'protolabs', careerUrl: "https://www.protolabs.com/careers", platform: 'lever', platformIdentifier: "protolabs" },
  { name: "The Athletic", slug: 'the-athletic', careerUrl: "https://theathletic.com/careers", platform: 'lever', platformIdentifier: "theathletic" },
  { name: "Placemakr", slug: 'placemakr', careerUrl: "https://www.placemakr.com/careers", platform: 'lever', platformIdentifier: "placemakr" },
  { name: "Jam City", slug: 'jam-city', careerUrl: "https://www.jamcity.com/careers", platform: 'lever', platformIdentifier: "jamcity" },
  { name: "Restaurant365", slug: 'restaurant365', careerUrl: "https://www.restaurant365.com/careers", platform: 'lever', platformIdentifier: "restaurant365" },
  { name: "Deputy", slug: 'deputy', careerUrl: "https://www.deputy.com/careers", platform: 'lever', platformIdentifier: "deputy" },
  // ── Ashby ──────────────────────────────────
  { name: "Crusoe Energy", slug: 'crusoe-energy', careerUrl: "https://www.crusoe.ai/careers", platform: 'ashby', platformIdentifier: "Crusoe" },
  { name: "Form Energy", slug: 'form-energy', careerUrl: "https://formenergy.com/careers", platform: 'ashby', platformIdentifier: "formenergy" },
  { name: "Helion Energy", slug: 'helion-energy', careerUrl: "https://www.helionenergy.com/careers", platform: 'ashby', platformIdentifier: "helion" },
  { name: "Aurora Solar", slug: 'aurora-solar', careerUrl: "https://aurorasolar.com/careers", platform: 'ashby', platformIdentifier: "aurorasolar" },
  { name: "Base Power", slug: 'base-power', careerUrl: "https://www.basepowercompany.com/careers", platform: 'ashby', platformIdentifier: "base-power" },
  { name: "Impossible Foods", slug: 'impossible-foods', careerUrl: "https://impossiblefoods.com/careers", platform: 'ashby', platformIdentifier: "impossible-foods" },
  { name: "Higharc", slug: 'higharc', careerUrl: "https://www.higharc.com/careers", platform: 'ashby', platformIdentifier: "higharc" },
  { name: "Homebound", slug: 'homebound', careerUrl: "https://www.homebound.com/careers", platform: 'ashby', platformIdentifier: "Homebound" },
  { name: "MaintainX", slug: 'maintainx', careerUrl: "https://www.getmaintainx.com/careers", platform: 'ashby', platformIdentifier: "maintainx" },
  { name: "Openly", slug: 'openly', careerUrl: "https://openly.com/careers", platform: 'ashby', platformIdentifier: "openly" },
  { name: "Steadily", slug: 'steadily', careerUrl: "https://www.steadily.com/careers", platform: 'ashby', platformIdentifier: "Steadily" },
  { name: "Tonal", slug: 'tonal', careerUrl: "https://www.tonal.com/careers", platform: 'ashby', platformIdentifier: "tonal" },
  { name: "Patreon", slug: 'patreon', careerUrl: "https://www.patreon.com/careers", platform: 'ashby', platformIdentifier: "patreon" },
  { name: "Wealthsimple", slug: 'wealthsimple', careerUrl: "https://www.wealthsimple.com/careers", platform: 'ashby', platformIdentifier: "wealthsimple" },
  { name: "Going", slug: 'going', careerUrl: "https://www.going.com/careers", platform: 'ashby', platformIdentifier: "going" },
  { name: "Second Dinner", slug: 'second-dinner', careerUrl: "https://seconddinner.com/careers", platform: 'ashby', platformIdentifier: "SecondDinner" },
  { name: "Sleeper", slug: 'sleeper', careerUrl: "https://sleeper.com/careers", platform: 'ashby', platformIdentifier: "sleeper" },
  { name: "Genies", slug: 'genies', careerUrl: "https://www.genies.com/careers", platform: 'ashby', platformIdentifier: "genies" },
  { name: "SpotOn", slug: 'spoton', careerUrl: "https://www.spoton.com/careers", platform: 'ashby', platformIdentifier: "spoton" },
  { name: "Homebase", slug: 'homebase', careerUrl: "https://joinhomebase.com/careers", platform: 'ashby', platformIdentifier: "homebase" },
  // ── SmartRecruiters ────────────────────────
  // ── Workday ────────────────────────────────
  { name: "X-energy", slug: 'x-energy', careerUrl: "https://x-energy.com/careers", platform: 'workday', platformIdentifier: "xenergy|wd5|X-energyUS" },
  { name: "Inari", slug: 'inari', careerUrl: "https://inari.com/careers", platform: 'workday', platformIdentifier: "inari|wd108|Inari_Careers" },
  { name: "Stord", slug: 'stord', careerUrl: "https://www.stord.com/careers", platform: 'workday', platformIdentifier: "stord|wd503|Stord_External_Career" },
  { name: "VillageMD", slug: 'villagemd', careerUrl: "https://www.villagemd.com/careers", platform: 'workday', platformIdentifier: "shm|wd5|SummitHealthPhysicians" },
  { name: "Cityblock Health", slug: 'cityblock-health', careerUrl: "https://www.cityblock.com/careers", platform: 'workday', platformIdentifier: "cityblockhealth|wd1|CityblockExternalCareerSite" },
  // agilon health (agilonhealth|wd1|External) omitted — same reason.
  { name: "Purple", slug: 'purple', careerUrl: "https://purple.com/careers", platform: 'workday', platformIdentifier: "purple|wd1|purplecareers" },
  { name: "YETI", slug: 'yeti', careerUrl: "https://www.yeti.com/careers", platform: 'workday', platformIdentifier: "yeticoolers|wd5|YETI" },
  { name: "Conde Nast", slug: 'conde-nast', careerUrl: "https://www.condenast.com/careers", platform: 'workday', platformIdentifier: "condenast|wd115|CondeCareers" },
  { name: "Litera", slug: 'litera', careerUrl: "https://www.litera.com/careers", platform: 'workday', platformIdentifier: "litera|wd12|Litera_Careers" },
  { name: "Shipt", slug: 'shipt', careerUrl: "https://www.shipt.com/careers", platform: 'workday', platformIdentifier: "shipt|wd1|Shipt_External" },

  // Job-board sources (2026-07-17) — cross-company boards; each returns direct apply
  // links with the real hiring company as companyName. Batch scripts show these as
  // "{Employer} (via {Board})". Indeed/ZipRecruiter/Glassdoor/Monster/CareerBuilder
  // are bot-walled (HTTP 403) and cannot be added.
  { name: 'LinkedIn', slug: 'linkedin', careerUrl: 'https://www.linkedin.com/jobs', platform: 'linkedin' },
  { name: 'SimplyHired', slug: 'simplyhired', careerUrl: 'https://www.simplyhired.com', platform: 'simplyhired' },
  { name: 'BuiltIn.com', slug: 'builtin-jobs', careerUrl: 'https://builtin.com/jobs', platform: 'builtin' },
  { name: 'RemoteOK', slug: 'remoteok', careerUrl: 'https://remoteok.com', platform: 'remoteok' },
  { name: 'Remotive', slug: 'remotive', careerUrl: 'https://remotive.com', platform: 'remotive' },
  { name: 'We Work Remotely', slug: 'weworkremotely', careerUrl: 'https://weworkremotely.com', platform: 'weworkremotely' },
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
      case 'oracle-orc':
        return new OracleOrcScraper(config);
      case 'icims':
        return new IcimsScraper(config);
      case 'icims-jra':
        return new IcimsJraScraper(config);
      case 'eightfold':
        return new EightfoldScraper(config);
      case 'rippling':
        return new RipplingScraper(config);
      case 'aurora':
        return new AuroraScraper(config);
      case 'custom':
        return new CustomPuppeteerScraper(config);
      case 'amazon':
        return new AmazonScraper(config);
      case 'apple':
        return new AppleScraper(config);
      case 'tesla':
        return new TeslaScraper(config);
      case 'mckinsey':
        return new McKinseyScraper(config);
      case 'linkedin':
        return new LinkedInScraper(config);
      case 'simplyhired':
        return new SimplyHiredScraper(config);
      case 'builtin':
        return new BuiltInScraper(config);
      case 'remoteok':
        return new RemoteOKScraper(config);
      case 'remotive':
        return new RemotiveScraper(config);
      case 'weworkremotely':
        return new WeWorkRemotelyScraper(config);
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
