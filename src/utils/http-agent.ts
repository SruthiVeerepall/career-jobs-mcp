// Shared keep-alive HTTP(S) agents for all axios calls.
// Without keep-alive, every request pays a fresh TCP + TLS handshake — brutal when
// hitting the same host repeatedly (Workday CSRF retries, paginated iCIMS, many
// Greenhouse boards on one host). Setting these on axios.defaults makes every
// `import axios from 'axios'` call across all platform scrapers reuse connections.
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';

const MAX_SOCKETS = Number(process.env.HTTP_MAX_SOCKETS ?? 64);

const agentOpts = {
  keepAlive: true,
  maxSockets: MAX_SOCKETS,
  maxFreeSockets: 16,
  timeout: 60_000,
};

export const httpAgent = new http.Agent(agentOpts);
export const httpsAgent = new https.Agent(agentOpts);

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
