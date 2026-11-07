import type { ApiSchemas } from '@/shared/api';

export type SettingsData = ApiSchemas['Settings'];
export type SettingDefinition = ApiSchemas['SettingDefinition'];
export type SettingValue = string | number | boolean | null;
