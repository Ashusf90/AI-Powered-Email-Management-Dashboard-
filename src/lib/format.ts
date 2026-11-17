import type { EmailProvider, Responsibility } from '../types/email';

export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = new Date('2026-11-16T23:05:00-08:00');
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatFullDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getResponsibilityMeta(responsibility: Responsibility): {
  label: string;
  shortLabel: string;
  textColor: string;
  surfaceBg: string;
  borderColor: string;
} {
  switch (responsibility) {
    case 'ASSISTANT_TO_REPLY':
      return {
        label: 'Assistant to Reply',
        shortLabel: 'Assistant',
        textColor: 'text-blue-700',
        surfaceBg: 'bg-blue-50/70',
        borderColor: 'border-blue-200',
      };
    case 'CLIENT_TO_REPLY':
      return {
        label: 'Client to Reply',
        shortLabel: 'Client',
        textColor: 'text-amber-700',
        surfaceBg: 'bg-amber-50/70',
        borderColor: 'border-amber-200',
      };
    case 'NO_REPLY_NEEDED':
      return {
        label: 'No Reply Needed',
        shortLabel: 'No Reply',
        textColor: 'text-slate-600',
        surfaceBg: 'bg-slate-100/80',
        borderColor: 'border-slate-200',
      };
  }
}

export function getProviderLabel(provider: EmailProvider): string {
  return provider === 'gmail' ? 'Gmail' : 'Outlook';
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
