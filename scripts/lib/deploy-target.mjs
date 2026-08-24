import { isIP } from 'node:net';

export class DeployTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeployTargetError';
  }
}

export const ALLOWED_DEPLOY_HOSTS = Object.freeze([
  'divatdetro.vercel.app',
  'divatdetro-lucas-molinari-s-projects.vercel.app',
  'divatdetro-git-main-lucas-molinari-s-projects.vercel.app',
]);

export function isAllowedHostname(hostname, allowedHostnames = ALLOWED_DEPLOY_HOSTS) {
  const normalized = hostname.toLowerCase();
  return allowedHostnames.some(candidate =>
    !candidate.includes('*') && candidate.toLowerCase() === normalized
  );
}

export function normalizeDeployTarget(rawUrl, allowedHostnames = ALLOWED_DEPLOY_HOSTS) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || /[\r\n]/.test(rawUrl)) {
    throw new DeployTargetError('URL de deploy vazia ou contendo CR/LF');
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new DeployTargetError('URL de deploy inválida');
  }
  if (target.protocol !== 'https:') {
    throw new DeployTargetError('Deploy precisa usar HTTPS');
  }
  if (target.username || target.password) {
    throw new DeployTargetError('URL de deploy não pode conter userinfo');
  }
  if (target.port) {
    throw new DeployTargetError('URL de deploy não pode usar porta explícita');
  }
  if (isIP(target.hostname.replace(/^\[|\]$/g, ''))) {
    throw new DeployTargetError('URL de deploy não pode usar IP literal');
  }
  if (!isAllowedHostname(target.hostname, allowedHostnames)) {
    throw new DeployTargetError(`Hostname de deploy não permitido: ${target.hostname}`);
  }

  target.pathname = '/';
  target.search = '';
  target.hash = '';
  return target;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchSameOrigin(initialUrl, {
  fetchImpl = globalThis.fetch,
  headers,
  signal,
  maxRedirects = 5,
} = {}) {
  const trustedOrigin = initialUrl.origin;
  let current = new URL(initialUrl);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(current, { redirect: 'manual', headers, signal });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    if (redirects >= maxRedirects) {
      throw new DeployTargetError(`Limite de ${maxRedirects} redirects excedido`);
    }

    const next = new URL(location, current);
    if (next.origin !== trustedOrigin) {
      throw new DeployTargetError(`Redirect recusado por mudança de origem: ${trustedOrigin} → ${next.origin}`);
    }
    current = next;
  }
}
