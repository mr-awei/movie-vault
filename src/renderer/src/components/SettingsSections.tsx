/**
 * 设置 8 个分类 section 的聚合出口（B-2 拆分后保持兼容，SettingsModal 继续从这里 import）
 */
export { PROXY_MODES, SORT_OPTIONS, normalizeProxy, SectionHeader, Card, Field, FieldRow, Toggle, SegmentedControl, Select, ThemePreview, ThemeCard, getSourceMeta, normalizeSourceOrder, formatSourceOrder, formatBytes, urgencyMeta } from './settings/settings-ui'
export type { SettingsSectionProps } from './settings/settings-ui'
export { GeneralSection } from './settings/GeneralSection'
export { PreviewSection } from './settings/PreviewSection'
export { NetworkSection } from './settings/NetworkSection'
export { AppearanceSection } from './settings/AppearanceSection'
export { PrivacySection } from './settings/PrivacySection'
export { StorageSection } from './settings/StorageSection'
export { UpdateSection } from './settings/UpdateSection'
export { DangerSection } from './settings/DangerSection'
