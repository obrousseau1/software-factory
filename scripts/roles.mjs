// Agent names: single source for hooks and static checks. Names are provisional (design §7).
export const PLUGIN = 'spaceport';

export const Role = Object.freeze({
  Explorer: 'explorer',
  Profiler: 'profiler',
  Architect: 'architect',
  Builder: 'builder',
  Reviewer: 'reviewer',
  SecurityReviewer: 'security-reviewer',
});

export const REVIEWERS = [Role.Reviewer, Role.SecurityReviewer];

// A reviewer writes only its own findings file of a round.
const findingsFile = (role) => new RegExp(String.raw`^\.liftoff/wo/[^/]+/shreds/\d+/findings/r\d+-${role}\.md$`);

// Restricted roles → the only repo-relative paths they may write ([] = nothing). A trailing `/` allows a folder;
// a RegExp matches the whole path.
export const WRITE_LIMITS = Object.freeze({
  [Role.Explorer]: [],
  [Role.Profiler]: ['.liftoff/profile.md', '.liftoff/proposals/'],
  [Role.Architect]: [],
  ...Object.fromEntries(REVIEWERS.map((role) => [role, [findingsFile(role)]])),
});

// Hooks receive `spaceport:profiler`; the bare form is matched too.
export function bare(agentType) {
  const prefix = `${PLUGIN}:`;
  return agentType?.startsWith(prefix) ? agentType.slice(prefix.length) : agentType;
}
