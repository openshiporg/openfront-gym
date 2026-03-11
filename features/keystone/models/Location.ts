import { list } from '@keystone-6/core';
import { allOperations } from '@keystone-6/core/access';
import {
  text,
  checkbox,
} from '@keystone-6/core/fields';

import { isSignedIn } from '../access';
import { trackingFields } from './trackingFields';

export const Location = list({
  access: {
    operation: {
      query: () => true, create: isSignedIn, update: isSignedIn, delete: isSignedIn,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'address', 'isActive'],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      ui: {
        description: 'Location name (e.g., Downtown Gym, West Side Branch)',
      },
    }),

    address: text({
      ui: {
        displayMode: 'textarea',
        description: 'Physical address of the location',
      },
    }),

    phone: text({
      ui: {
        description: 'Location phone number',
      },
    }),

    isActive: checkbox({
      defaultValue: true,
      ui: {
        description: 'Is this location currently active?',
      },
    }),

    ...trackingFields,
  },
});
