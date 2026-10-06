import { Phone, Mail, MessageSquare, MessageCircle, Instagram, Send, Globe, AtSign, Twitter, type LucideIcon } from "lucide-react";
import { CHANNEL_COLOR } from "@/lib/channel-ui";

export const CHANNEL_ICON: Record<string, LucideIcon> = {
  VOICE: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: MessageSquare,
  INSTAGRAM: Instagram,
  MESSENGER: Send,
  X: Twitter,
  CHAT: MessageSquare,
  PORTAL: Globe,
  SOCIAL: AtSign,
};

/** Round coloured badge with the channel's icon. */
export function ChannelBadge({ channel, size = 32 }: { channel: string; size?: number }) {
  const Icon = CHANNEL_ICON[channel] ?? MessageSquare;
  const color = CHANNEL_COLOR[channel] ?? "#64748B";
  return (
    <span className="grid place-items-center rounded-lg shrink-0" style={{ width: size, height: size, background: `${color}1A`, color }}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
