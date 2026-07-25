import { Github, Star } from 'lucide-react';
import { GITHUB_REPO_URL } from '../lib/constants';
import { formatCompactNumber } from '../lib/format';
import { useGithubStars } from '../lib/useGithubStars';
import { ButtonLink } from './ui';

/**
 * Link to the public repository, with the star count when it is known.
 * The count is optional by design: if GitHub cannot be reached the button
 * still renders, just without the number.
 */
export function GithubStarButton() {
  const stars = useGithubStars();

  return (
    <ButtonLink
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      variant="secondary"
      size="sm"
      title="Star this project on GitHub"
      leadingIcon={<Github size={14} />}
      trailingIcon={
        stars === null ? null : (
          <span className="-mr-1 flex items-center gap-1 self-stretch border-l border-border pl-2 pr-1 text-muted">
            <Star size={12} className="text-warn" />
            {formatCompactNumber(stars)}
          </span>
        )
      }
    >
      <span className="hidden sm:inline">GitHub</span>
    </ButtonLink>
  );
}
