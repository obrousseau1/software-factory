// Agent names: single source for hooks and static checks. Names are provisional (design §7).
export const PLUGIN = 'spaceport';

export const Role = Object.freeze({ Explorer: 'explorer', Profiler: 'profiler' });

// Restricted roles → the only repo-relative paths they may write ([] = nothing). A trailing `/` allows a folder.
export const WRITE_LIMITS = Object.freeze({
  [Role.Explorer]: [],
  [Role.Profiler]: ['.liftoff/profile.md', '.liftoff/proposals/'],
});

// Hooks receive `spaceport:profiler`; the bare form is matched too.
export function bare(agentType) {
  const prefix = `${PLUGIN}:`;
  return agentType?.startsWith(prefix) ? agentType.slice(prefix.length) : agentType;
}
