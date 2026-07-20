// Singleton config for Plugin Hub — one row keyed `global`, `options` JSON holds
// { manifestUrl, weeklyCheck, lastChecked, updatesAvailable }. System collection → the plugin
// grants explicit ACL for its writes (see plugin.ts). Mirrors ip-guard's config-blob pattern.
export default {
  name: 'ptdlPluginHubConfig',
  dumpRules: 'required' as any,
  migrationRules: ['overwrite', 'schema-only'],
  title: 'Plugin Hub config',
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'key', type: 'string', allowNull: false, unique: true, defaultValue: 'global' },
    { name: 'options', type: 'json', defaultValue: {} },
  ],
};
