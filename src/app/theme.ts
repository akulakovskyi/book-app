import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

export const BookingAppPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{zinc.50}',
      100: '{zinc.100}',
      200: '{zinc.200}',
      300: '{zinc.300}',
      400: '{zinc.500}',
      500: '{zinc.900}',
      600: '{zinc.900}',
      700: '{zinc.950}',
      800: '{zinc.950}',
      900: '{zinc.950}',
      950: '{zinc.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{zinc.950}',
          contrastColor: '#ffffff',
          hoverColor: '{zinc.800}',
          activeColor: '{zinc.700}',
        },
        highlight: {
          background: '{zinc.950}',
          focusBackground: '{zinc.900}',
          color: '#ffffff',
          focusColor: '#ffffff',
        },
        formField: {
          focusBorderColor: '{zinc.950}',
        },
      },
      dark: {
        primary: {
          color: '{zinc.50}',
          contrastColor: '{zinc.950}',
          hoverColor: '{zinc.200}',
          activeColor: '{zinc.300}',
        },
        highlight: {
          background: '{zinc.50}',
          focusBackground: '{zinc.200}',
          color: '{zinc.950}',
          focusColor: '{zinc.950}',
        },
      },
    },
  },
});
