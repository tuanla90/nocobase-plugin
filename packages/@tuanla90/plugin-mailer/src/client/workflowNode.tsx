// Phase 2 CLIENT: the "Send email (@tuanla90)" node in the classic Workflow editor.
//
// Uses NAMESPACE imports (`import * as`) for the optional workflow/formily peers + `?.` access so that if
// @nocobase/plugin-workflow (or its client) is absent/disabled, this module degrades to a no-op instead of
// white-screening the whole app. [[reference_nocobase_optional_peer_import_guard]] The registration is
// called from the classic client Plugin's load() inside a try/catch.
import React from 'react';
import * as workflowClient from '@nocobase/plugin-workflow/client';
import * as formilyAntd from '@formily/antd-v5';
import * as nbClient from '@nocobase/client';
import { MailOutlined } from '@ant-design/icons';
import { MailerTemplateSelect } from './MailerTemplateSelect';
import { NS } from '../shared/mailerClient';

/** i18n token compiled by the SchemaComponent's `t` — bilingual via the plugin NS resources. */
const tt = (s: string) => `{{t(${JSON.stringify(s)}, { ns: ${JSON.stringify(NS)} })}}`;

/** Register the Mailer workflow node. Returns true if registered, false if skipped (peer missing). */
export function registerMailerWorkflowNode(app: any): boolean {
  const Instruction: any = (workflowClient as any)?.Instruction;
  const WorkflowVariableTextArea: any = (workflowClient as any)?.WorkflowVariableTextArea;
  const WorkflowVariableRawTextArea: any = (workflowClient as any)?.WorkflowVariableRawTextArea;
  const WorkflowVariableInput: any = (workflowClient as any)?.WorkflowVariableInput;
  const workflowPlugin: any = app?.pm?.get?.('workflow');

  if (!Instruction || !workflowPlugin || typeof workflowPlugin.registerInstruction !== 'function') {
    return false;
  }

  class MailerNodeInstruction extends Instruction {
    title = tt('Send email (@tuanla90)');
    type = 'ptdl-mailer';
    group = 'extended';
    description = tt('Send an email via the Mailer plugin backend (Google Apps Script or SMTP), using a saved template or inline content. Recipients and variables can come from upstream nodes.');
    icon = (React as any).createElement(MailOutlined, {});

    fieldset: any = {
      to: {
        type: 'string',
        required: true,
        title: tt('To'),
        description: tt('One or more recipients, comma-separated. Supports variables.'),
        'x-decorator': 'FormItem',
        'x-component': 'WorkflowVariableTextArea',
      },
      cc: {
        type: 'string',
        title: tt('CC'),
        'x-decorator': 'FormItem',
        'x-component': 'WorkflowVariableTextArea',
      },
      bcc: {
        type: 'string',
        title: tt('BCC'),
        'x-decorator': 'FormItem',
        'x-component': 'WorkflowVariableTextArea',
      },
      templateId: {
        type: 'number',
        title: tt('Template'),
        description: tt('Pick a managed template by name (Settings → Mailer → Templates). Choose "Inline (no template)" to write the Subject/Content below.'),
        'x-decorator': 'FormItem',
        'x-component': 'MailerTemplateSelect',
      },
      data: {
        type: 'object',
        title: tt('Record variable (for field interpolation)'),
        description: tt('A variable that resolves to the record object the template variables read from (e.g. the trigger record).'),
        'x-decorator': 'FormItem',
        'x-component': WorkflowVariableInput ? 'WorkflowVariableInput' : 'Input',
        'x-component-props': WorkflowVariableInput ? { changeOnSelect: true } : {},
      },
      subject: {
        type: 'string',
        title: tt('Subject'),
        description: tt('Used only when no Template id is set. Supports field tokens + variables.'),
        'x-decorator': 'FormItem',
        'x-component': 'WorkflowVariableTextArea',
      },
      html: {
        type: 'string',
        title: tt('Content (HTML)'),
        description: tt('Used only when no Template id is set.'),
        'x-decorator': 'FormItem',
        'x-component': 'WorkflowVariableRawTextArea',
        'x-component-props': { autoSize: { minRows: 8 } },
      },
      backend: {
        type: 'string',
        title: tt('Backend (this node)'),
        description: tt('Per-node override of the global backend. Credentials (Apps Script URL / SMTP host & password) are set once in Settings → Mailer → Backend — NOT here. "Use configured backend" sends via whatever is set globally; picking Google Apps Script or SMTP forces that backend for this node (still using its globally-configured credentials). If the forced backend has no credentials, the send fails with a clear error.'),
        'x-decorator': 'FormItem',
        'x-component': 'Radio.Group',
        enum: [
          { label: tt('Use configured backend'), value: 'default' },
          { label: 'Google Apps Script', value: 'apps-script' },
          { label: 'SMTP', value: 'smtp' },
        ],
        default: 'default',
      },
      ignoreFail: {
        type: 'boolean',
        'x-content': tt('Ignore a failed send and continue the workflow'),
        'x-decorator': 'FormItem',
        'x-component': 'Checkbox',
      },
    };

    components: any = {
      ArrayItems: (formilyAntd as any)?.ArrayItems,
      SchemaComponentContext: (nbClient as any)?.SchemaComponentContext,
      MailerTemplateSelect,
      ...(WorkflowVariableInput ? { WorkflowVariableInput } : {}),
      ...(WorkflowVariableTextArea ? { WorkflowVariableTextArea } : {}),
      ...(WorkflowVariableRawTextArea ? { WorkflowVariableRawTextArea } : {}),
    };
  }

  workflowPlugin.registerInstruction('ptdl-mailer', MailerNodeInstruction);
  return true;
}
