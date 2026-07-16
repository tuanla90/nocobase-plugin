/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { connect, mapProps } from '@formily/react';
import { ColorField } from '@ptdl/shared';

// Login theme colors need transparency (rgba) → shared ColorField with allowAlpha.
// allowClear=false keeps the original behavior (no clear button on login theme colors).
export const CustomColorPicker = connect(
  (props) => {
    const { value, onChange, ...others } = props;
    return <ColorField value={value} onChange={onChange} allowAlpha showText allowClear={false} {...others} />;
  },
  mapProps((props) => {
    return {
      ...props,
    };
  }),
);
