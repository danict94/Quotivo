import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { useTheme } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const {theme}=useTheme(); return <MaterialCommunityIcons name={name} size={size} color={color??theme.muted} />;
}
