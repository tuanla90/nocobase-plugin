/**
 * brandingConfigs — one JSON row per config `type`. For now a single `type: 'skin'` row holds the
 * admin-skin config (sidebar/header/card gradients). Same shape as login-lite's `login_configs`.
 */
export default {
  name: 'brandingConfigs',
  dumpRules: 'required' as any,
  title: 'Branding Configurations',
  fields: [
    { name: 'id', type: 'bigInt', autoIncrement: true, primaryKey: true, allowNull: false },
    { name: 'type', type: 'string', title: 'Type', required: true }, // 'skin' | (later) 'login'
    { name: 'options', type: 'json', title: 'Options', defaultValue: {} },
  ],
};
