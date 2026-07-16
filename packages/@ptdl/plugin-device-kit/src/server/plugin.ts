import { Plugin } from '@nocobase/server';

/**
 * Device Kit — server lane is a no-op.
 *
 * Everything ships on the client: the Camera field widget (a subclass of the file-manager
 * UploadFieldModel, uploading through the existing `attachments:create` action) and the GPS
 * Location field type (`ptdlLocation`, stored via the native `json` dbType so the server needs
 * no custom column). No collection / schema / API is added here — this entry exists only so
 * NocoBase can load the client bundles.
 */
export class PluginDeviceKitServer extends Plugin {}

export default PluginDeviceKitServer;
