// Per-collection change-log configuration. One row per source collection that has logging on.
//   triggerFields  -> field names whose change creates a log entry (status fields first)
//   snapshotFields -> extra fields captured (JSON) alongside the default columns on every entry
//   captureNote    -> whether a note/reason may be attached to a transition (optional per config)
export default {
  name: 'ptdlChangeLogConfigs',
  dumpRules: 'required' as any,
  migrationRules: ['overwrite', 'schema-only'],
  title: 'Change log configs',
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'collectionName', type: 'string', allowNull: false, unique: true },
    { name: 'enabled', type: 'boolean', defaultValue: true },
    { name: 'triggerFields', type: 'json', defaultValue: [] },
    { name: 'snapshotFields', type: 'json', defaultValue: [] },
    { name: 'captureNote', type: 'boolean', defaultValue: false },
    { name: 'options', type: 'json', defaultValue: {} },
  ],
};
