// Singleton configuration for the IP guard. Exactly one row, keyed `global`, whose `options` JSON
// holds the whole config (mode + lists + toggles). Mirrors the login-lite `options`-blob pattern so
// the UI can evolve the shape without a migration. System collection → the plugin grants explicit
// ACL for its writes (see plugin.ts).
export default {
  name: 'ptdlIpAccessConfigs',
  dumpRules: 'required' as any,
  migrationRules: ['overwrite', 'schema-only'],
  title: 'IP guard config',
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'key', type: 'string', allowNull: false, unique: true, defaultValue: 'global' },
    { name: 'options', type: 'json', defaultValue: {} },
  ],
};
