/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { tStr } from '../locale';

export default {
  title: tStr('Home configuration'),
  name: 'home',
  fieldset: {
    title: {
      title: tStr('Title'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      required: true,
    },
    description: {
      title: tStr('Description'),
      type: 'string',
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
    },
    options: {
      type: 'object',
      'x-component': 'fieldset',
      properties: {
        // ── General ─────────────────────────────────────────────
        sec_general: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('General') },
        },
        useSystemName: {
          title: tStr('Use system name'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Radio.Group',
          enum: [
            { label: tStr('Yes'), value: 'yes' },
            { label: tStr('No'), value: 'no' },
          ],
          default: 'yes',
          required: true,
        },
        customSystemName: {
          title: tStr('Custom system name'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': [
            {
              dependencies: ['.useSystemName'],
              fulfill: {
                state: {
                  visible: '{{$deps[0] === "no"}}',
                  required: '{{$deps[0] === "no"}}',
                },
              },
            },
          ],
        },
        logoUrl: {
          title: tStr('Logo image URL'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': { placeholder: 'https://…/logo.png' },
          description: tStr('Optional logo shown above the form title. Leave empty to hide.'),
        },

        // ── Background ──────────────────────────────────────────
        sec_background: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('Background') },
        },
        leftContentType: {
          title: tStr('Left side content display'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Radio.Group',
          enum: [
            { label: tStr('Gradient'), value: 'gradient' },
            { label: tStr('Image'), value: 'image' },
            { label: tStr('HTML embed'), value: 'html' },
            { label: tStr('Webpage embed'), value: 'url' },
          ],
          default: 'gradient',
          required: true,
        },
        leftGradient: {
          title: tStr('Gradient preset'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: tStr('Deep space'), value: 'space' },
            { label: tStr('Midnight'), value: 'midnight' },
            { label: tStr('Ocean'), value: 'ocean' },
            { label: tStr('Violet'), value: 'violet' },
            { label: tStr('Sunset'), value: 'sunset' },
            { label: tStr('Aurora'), value: 'aurora' },
            { label: tStr('Emerald'), value: 'emerald' },
          ],
          default: 'space',
          'x-reactions': [
            {
              dependencies: ['.leftContentType'],
              fulfill: { state: { visible: '{{$deps[0] === "gradient"}}' } },
            },
          ],
        },
        leftImage: {
          title: tStr('Left side image URL'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': { placeholder: tStr('Leave empty for a built-in gradient') },
          default: '',
          'x-reactions': [
            {
              dependencies: ['.leftContentType'],
              fulfill: {
                state: {
                  visible: '{{$deps[0] === "image"}}',
                },
              },
            },
          ],
        },
        leftUrl: {
          title: tStr('Webpage embed URL'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-reactions': [
            {
              dependencies: ['.leftContentType'],
              fulfill: {
                state: {
                  visible: '{{$deps[0] === "url"}}',
                  required: '{{$deps[0] === "url"}}',
                },
              },
            },
          ],
        },
        leftHtml: {
          title: tStr('HTML embed code'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
          'x-reactions': [
            {
              dependencies: ['.leftContentType'],
              fulfill: {
                state: {
                  visible: '{{$deps[0] === "html"}}',
                },
              },
            },
          ],
        },

        // ── Form position & style ───────────────────────────────
        sec_form_layout: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('Form position & style') },
        },
        formLayout: {
          title: tStr('Form layout'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Radio.Group',
          'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
          enum: [
            { label: tStr('Side panel (full height)'), value: 'panel' },
            { label: tStr('Floating card'), value: 'float' },
          ],
          default: 'panel',
          description: tStr('Side panel fills the column height; floating card overlays the background.'),
        },
        formPosition: {
          title: tStr('Form position'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Radio.Group',
          'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
          enum: [
            { label: tStr('Left'), value: 'left' },
            { label: tStr('Center'), value: 'center' },
            { label: tStr('Right'), value: 'right' },
          ],
          default: 'right',
          description: tStr('Center only applies to the floating card; side panel uses left or right.'),
        },
        formTheme: {
          title: tStr('Form theme'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Radio.Group',
          'x-component-props': { optionType: 'button', buttonStyle: 'solid' },
          enum: [
            { label: tStr('Custom'), value: 'custom' },
            { label: tStr('System'), value: 'system' },
            { label: tStr('Light'), value: 'light' },
            { label: tStr('Dark'), value: 'dark' },
          ],
          default: 'custom',
          description: tStr('System follows the visitor’s OS light/dark setting. Light / Dark are full presets that override the colors below. Pick Custom to set colors manually.'),
        },
        showFieldIcons: {
          title: tStr('Show input icons'),
          type: 'boolean',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox',
          'x-content': tStr('Show a leading icon inside the username and password fields'),
          default: true,
        },
        iconGrid: {
          type: 'void',
          'x-component': 'Grid2',
          'x-reactions': [
            {
              dependencies: ['.showFieldIcons'],
              fulfill: { state: { visible: '{{!!$deps[0]}}' } },
            },
          ],
          properties: {
            accountIcon: {
              title: tStr('Username icon'),
              type: 'string',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: 'User', value: 'user' },
                { label: 'Mail', value: 'mail' },
                { label: 'At sign', value: 'at' },
                { label: 'ID card', value: 'id' },
              ],
              default: 'user',
            },
            passwordIcon: {
              title: tStr('Password icon'),
              type: 'string',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: 'Lock', value: 'lock' },
                { label: 'Key', value: 'key' },
                { label: 'Shield', value: 'shield' },
              ],
              default: 'lock',
            },
          },
        },

        // ── Colors ──────────────────────────────────────────────
        sec_colors: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('Colors') },
          'x-reactions': [
            {
              dependencies: ['.formTheme'],
              fulfill: { state: { visible: '{{!$deps[0] || $deps[0] === "custom"}}' } },
            },
          ],
        },
        colorGrid: {
          type: 'void',
          'x-component': 'Grid2',
          'x-reactions': [
            {
              dependencies: ['.formTheme'],
              fulfill: { state: { visible: '{{!$deps[0] || $deps[0] === "custom"}}' } },
            },
          ],
          properties: {
            themeColor: {
              title: tStr('Background theme color'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'CustomColorPicker',
          default: '#000',
        },
        fontColor: {
          title: tStr('Font color'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'CustomColorPicker',
          default: '#fff',
        },
        formThemeColor: {
          title: tStr('Login form theme color'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'CustomColorPicker',
          default: 'rgba(255,255,255,0.12)',
        },
        formFontColor: {
          title: tStr('Login form text color'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'CustomColorPicker',
          default: '#fff',
        },
        buttonBgColor: {
          title: tStr('Button background color'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'CustomColorPicker',
          default: 'rgba(255,255,255,0.2)',
        },
            buttonTextColor: {
              title: tStr('Button text color'),
              type: 'string',
              'x-decorator': 'FormItem',
              'x-component': 'CustomColorPicker',
              default: '#fff',
            },
          },
        },
        themeOpacity: {
          title: tStr('Background panel opacity'),
          type: 'number',
          'x-decorator': 'FormItem',
          'x-component': 'PercentageInput',
          default: 1,
          description: tStr('Transparency of the form panel background (only applies when the color is a solid hex).'),
          'x-reactions': [
            {
              dependencies: ['.formTheme'],
              fulfill: { state: { visible: '{{!$deps[0] || $deps[0] === "custom"}}' } },
            },
          ],
        },

        // ── After login ─────────────────────────────────────────
        sec_after_login: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('After login') },
        },
        redirectPath: {
          title: tStr('Default landing page'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': { placeholder: '/admin' },
          description: tStr(
            'Path to open after a successful login when no explicit redirect is present. Leave empty to keep the system default.',
          ),
        },

        // ── Footer ──────────────────────────────────────────────
        sec_footer: {
          type: 'void',
          'x-component': 'SectionHeader',
          'x-component-props': { title: tStr('Footer') },
        },
        copyright: {
          title: tStr('Copyright / footer text (Markdown)'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Markdown',
          default: '<div>Powered by <a href="https://www.nocobase.com/" target="_blank">NocoBase</a></div>',
        },
        icp: {
          title: tStr('ICP filing information (Markdown)'),
          type: 'string',
          'x-decorator': 'FormItem',
          'x-component': 'Markdown',
          default: '',
        },

        // Hidden: enabled login methods (single option today)
        loginMethods: {
          title: tStr('Open login methods'),
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox.Group',
          'x-display': 'hidden',
          enum: [{ label: tStr('Password Login'), value: 'password' }],
          default: ['password'],
        },
      },
    },
    enabled: {
      title: tStr('Enable'),
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
      default: true,
    },
  },
};
