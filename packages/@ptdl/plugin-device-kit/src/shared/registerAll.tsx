import { registerCameraFieldModel } from './cameraFieldModel';
import { registerLocationField } from './locationField';
import { setTExpr, setRuntimeT, NS } from './i18n';
import { setSharedT, SHARED_NS, sharedEnUS } from '@ptdl/shared';
import enUS from '../locale/en-US.json';

/**
 * Single lane-agnostic registration path shared by BOTH clients (classic `/` and modern `/v/`).
 * The two lanes differ ONLY in the base classes / interface base they inject; everything else is here
 * so a widget is wired ONCE (the two index files can't drift).
 */
export interface RegisterAllDeps {
  flowEngine: any;
  flowSettings?: any;
  FieldModel: any;
  DisplayTextFieldModel: any;
  CollectionFieldInterface?: any;
  tExpr?: (s: string, o?: any) => any;
  app?: any;
  i18n?: any;
  lane: string;
}

export function registerDeviceKit(deps: RegisterAllDeps) {
  const { flowEngine, flowSettings, FieldModel, DisplayTextFieldModel, CollectionFieldInterface, tExpr, app, i18n, lane } = deps;

  // i18n wiring (VN-source: en-US map for English users; VN keys fall through as Vietnamese).
  try { if (tExpr) setTExpr(tExpr); } catch (_) { /* optional */ }
  try {
    if (i18n?.t) {
      i18n.addResources?.('en-US', NS, enUS);
      setRuntimeT((s: string, o?: any) => i18n.t(s, o));
    }
  } catch (_) { /* i18n optional */ }
  // @ptdl/shared's OWN strings (settings-kit / field picker) → bilingual per lane.
  try {
    if (i18n?.t) {
      i18n.addResources?.('en-US', SHARED_NS, sharedEnUS);
      setSharedT((s: string, o?: any) => i18n.t(s, { ns: SHARED_NS, ...(o || {}) }));
    }
  } catch (_) { /* optional */ }

  // Camera widget (subclass of file-manager UploadFieldModel resolved from the engine).
  try {
    registerCameraFieldModel({ flowEngine, flowSettings, lane });
  } catch (e) { console.warn(`[device-kit] (${lane}) camera register failed`, e); }

  // GPS Location field type.
  try {
    registerLocationField({ flowEngine, flowSettings, FieldModel, DisplayTextFieldModel, CollectionFieldInterface, app, lane });
  } catch (e) { console.warn(`[device-kit] (${lane}) location register failed`, e); }

  console.log(`[device-kit] ${lane} loaded`);
}
