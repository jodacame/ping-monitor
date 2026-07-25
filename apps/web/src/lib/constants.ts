/** App-wide constants shared across pages and components. */

/** `owner/repo` of the public project on GitHub. */
export const GITHUB_REPO = 'jodacame/ping-monitor';

/** Public repository page, linked from the login page and the app header. */
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

/** Anonymous, read-only endpoint used to read the star count. */
export const GITHUB_REPO_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;
