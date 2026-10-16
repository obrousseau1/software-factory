// Agent names: single source for hooks and static checks. Names are provisional (design §7).
export const PLUGIN = 'spaceport';

export const Role = Object.freeze({
  Explorer: 'explorer',
  Profiler: 'profiler',
  Architect: 'architect',
  Twin: 'twin',
  Solo: 'solo',
  SpecValidator: 'spec-validator',
  SecurityValidator: 'security-validator',
  StandardsValidator: 'standards-validator',
  UxValidator: 'ux-validator',
});

export const VALIDATORS = [Role.SpecValidator, Role.SecurityValidator, Role.StandardsValidator, Role.UxValidator];

// A validator writes only its own findings file of a round (or of the solo benchmark).
const findingsFile = (role) => new RegExp(String.raw`^\.liftoff/wo/[^/]+/shreds/\d+/findings/(r\d+|solo)-${role}\.md$`);

// Restricted roles → the only repo-relative paths they may write ([] = nothing). A trailing `/` allows a folder;
// a RegExp matches the whole path.
export const WRITE_LIMITS = Object.freeze({
  [Role.Explorer]: [],
  [Role.Profiler]: ['.liftoff/profile.md', '.liftoff/proposals/'],
  [Role.Architect]: [],
  ...Object.fromEntries(VALIDATORS.map((role) => [role, [findingsFile(role)]])),
});

// Hooks receive `spaceport:profiler`; the bare form is matched too.
export function bare(agentType) {
  const prefix = `${PLUGIN}:`;
  return agentType?.startsWith(prefix) ? agentType.slice(prefix.length) : agentType;
}
