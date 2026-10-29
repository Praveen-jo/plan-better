/** Icon set: lucide-react under the names the app already uses. */
export {
  Mic,
  Send,
  Square as Stop,
  Settings as Gear,
  Undo2 as Undo,
  Redo2 as Redo,
  Download,
  Bookmark,
  Plus,
  Check,
  AlertTriangle as Alert,
  Route,
  Umbrella,
  Volume2 as Volume,
  VolumeX as VolumeOff,
  Share2 as Share,
  ShieldCheck as Shield,
  X as Close,
  Pencil,
  MessageCircle as Chat,
  Map,
  MoreVertical as More,
  ChevronLeft as Back,
  ChevronRight as Chevron,
  Search,
  Home,
  MapPin as Pin,
  Calendar,
  Link2 as Link,
  Braces as Code,
  FileText as FileDoc,
  Keyboard,
  Plane,
  User,
  GripVertical as Grip,
} from 'lucide-react';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--accent)" />
      <path d="M16 6.5c-3.9 0-6.8 3-6.8 6.7 0 4.9 6.8 12.3 6.8 12.3s6.8-7.4 6.8-12.3c0-3.7-2.9-6.7-6.8-6.7Z" fill="var(--primary)" />
      <circle cx="16" cy="13.2" r="2.6" fill="var(--accent)" />
    </svg>
  );
}
