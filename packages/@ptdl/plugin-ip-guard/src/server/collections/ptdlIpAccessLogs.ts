// Access-attempt audit trail. Written best-effort by the guard (blocked attempts always; allowed
// attempts only when `logAllowed` is on). The plugin caps the table so it can never grow unbounded.
export default {
  name: 'ptdlIpAccessLogs',
  dumpRules: 'skipped' as any,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'ip', type: 'string' },
    { name: 'decision', type: 'string' }, // allow | deny
    { name: 'reason', type: 'string' }, // blacklist | not-whitelisted | safelist | ...
    { name: 'mode', type: 'string' }, // guard mode at the time
    { name: 'method', type: 'string' },
    { name: 'path', type: 'text' },
    { name: 'userAgent', type: 'text' },
    { name: 'createdAt', type: 'date' },
  ],
};
