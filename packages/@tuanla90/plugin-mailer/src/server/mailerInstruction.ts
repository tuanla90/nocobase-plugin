// Workflow node ("Send email (@tuanla90)"). Built as a FACTORY that receives the workflow module's
// exports at runtime (Instruction base + JOB_STATUS) so this file has NO static dependency on
// @nocobase/plugin-workflow — if the workflow plugin is absent/disabled, the server plugin simply skips
// registration (see plugin.ts) and nothing breaks.
import { sendMail } from './sendCore';

/** Build the MailerInstruction class bound to a given workflow module + app. */
export function makeMailerInstruction(app: any, wf: any) {
  const Instruction = wf?.Instruction;
  const JOB_STATUS = wf?.JOB_STATUS || { RESOLVED: 'resolved', FAILED: 'failed' };
  if (!Instruction) return null;

  class MailerInstruction extends Instruction {
    // Called by the workflow processor when the node runs. `getParsedValue` substitutes workflow
    // variables ({{$context...}}, {{$jobsMapByNodeKey...}}) inside the node config first.
    async run(node: any, prevJob: any, processor: any) {
      let config: any = {};
      try {
        config = processor.getParsedValue(node.config, node.id) || {};
      } catch {
        config = node?.config || {};
      }
      const result = await sendMail(app, {
        templateId: config.templateId ? Number(config.templateId) : null,
        inlineSubject: config.subject,
        inlineHtml: config.html,
        collectionName: config.collectionName || null,
        recordId: config.recordId,
        // `data` may be a variable resolving to the trigger record object — used for {{field}} interpolation.
        data: config.data,
        to: config.to,
        cc: config.cc,
        bcc: config.bcc,
        attachments: config.attachments,
        backend: config.backend,
      });
      if (result.ok) return { status: JOB_STATUS.RESOLVED, result };
      // ignoreFail → resolve anyway so the workflow continues (mirrors core mailer node semantics).
      if (config.ignoreFail) return { status: JOB_STATUS.RESOLVED, result };
      return { status: JOB_STATUS.FAILED, result };
    }
  }

  return MailerInstruction;
}
