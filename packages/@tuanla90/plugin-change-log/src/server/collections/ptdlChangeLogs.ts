// One row per logged change. `recordId` is stored as a string so it works for int/uuid/string
// primary keys alike (polymorphic — no FK to the source record; the timeline is rendered by us).
// `fromMeta`/`toMeta` snapshot the status label/color/icon/kind at log time so history stays
// readable even after the field config changes later.
export default {
  name: 'ptdlChangeLogs',
  dumpRules: 'skipped' as any,
  title: 'Change logs',
  // createdAt is the transition time; no updatedAt (entries are immutable).
  createdAt: true,
  updatedAt: false,
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'collectionName', type: 'string', allowNull: false, index: true },
    { name: 'recordId', type: 'string', allowNull: false, index: true },
    { name: 'fieldName', type: 'string', allowNull: false },
    { name: 'fromValue', type: 'text' },
    { name: 'toValue', type: 'text' },
    { name: 'fromMeta', type: 'json', defaultValue: {} },
    { name: 'toMeta', type: 'json', defaultValue: {} },
    { name: 'userId', type: 'string' },
    { name: 'userName', type: 'string' },
    { name: 'roleName', type: 'string' },
    // create | form | action | quick | bulk | api | workflow | system
    { name: 'source', type: 'string' },
    // milliseconds spent in the previous value before this change (cycle time)
    { name: 'durationMs', type: 'bigInt' },
    { name: 'note', type: 'text' },
    // { [fieldName]: value } snapshot of the configured companion fields at log time
    { name: 'snapshot', type: 'json', defaultValue: {} },
  ],
};
