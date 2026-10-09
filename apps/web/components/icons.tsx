import {
  LayoutGrid,
  Flag,
  CalendarDays,
  Phone,
  Users,
  ChartNoAxesColumn,
  Settings2,
  Sun,
  Moon,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  Search,
  LogOut,
  ArrowRight,
  Clock,
  Sparkles,
  ShieldCheck,
  TriangleAlert,
  CircleCheck,
  Stethoscope,
  MessageSquare,
  Trash2,
  Pencil,
  CalendarOff,
  UserPlus,
  Languages,
  IndianRupee,
  Activity,
  BellRing,
  Inbox,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon vocabulary for the whole app.
 *
 * Going through a named map rather than importing lucide at each call site
 * means the set stays consistent and the library is swappable in one file.
 */
export const ICONS = {
  overview: LayoutGrid,
  actions: Flag,
  appointments: CalendarDays,
  calls: Phone,
  patients: Users,
  analytics: ChartNoAxesColumn,
  settings: Settings2,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  close: X,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  check: Check,
  plus: Plus,
  search: Search,
  signOut: LogOut,
  arrowRight: ArrowRight,
  clock: Clock,
  sparkles: Sparkles,
  shield: ShieldCheck,
  warning: TriangleAlert,
  success: CircleCheck,
  doctor: Stethoscope,
  message: MessageSquare,
  trash: Trash2,
  edit: Pencil,
  timeOff: CalendarOff,
  invite: UserPlus,
  language: Languages,
  rupee: IndianRupee,
  activity: Activity,
  bell: BellRing,
  inbox: Inbox,
  eye: Eye,
  eyeOff: EyeOff,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className = "h-4 w-4",
  strokeWidth = 1.75,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[name];
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden />;
}
