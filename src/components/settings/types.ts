import { Divide as LucideIcon } from 'lucide-react';

export interface SESEmail {
  address: string;
  dailyLimit?: number;
  sentEmails?: number;
  isLocked?: boolean;
  testing?: boolean;
}

export interface GeneralSettings {
  notifications: boolean;
  twoFactorAuth: boolean;
  newsletter: boolean;
  publicProfile: boolean;
  debugging: boolean;
  cleanUpLoi: boolean;
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export interface SettingRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  setting: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}