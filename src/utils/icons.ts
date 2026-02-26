import type { ComponentType } from "react";
import type { IconSetId } from "../types/theme";

// ── Icon Names ─────────────────────────────────────────────────

export type IconName =
  // Navigation
  | "library"
  | "activity"
  | "profile"
  | "notes"
  | "settings"
  | "debug"
  | "storage"
  // Actions
  | "search"
  | "close"
  | "refresh"
  | "sort-asc"
  | "sort-desc"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-down"
  // Library
  | "grid-view"
  | "list-view"
  | "star-filled"
  | "star-outline"
  | "eye"
  | "eye-off"
  | "tag"
  | "palette"
  | "dice"
  | "play"
  | "pause"
  | "music"
  | "filter"
  | "installed"
  | "edit"
  | "trash"
  | "pin"
  | "sidebar"
  | "stats"
  | "key"
  | "keyboard"
  | "genre"
  | "plus"
  | "lock"
  | "volume"
  | "volume-off"
  // News
  | "news"
  // AI
  | "sparkle"
  // Shelf display modes
  | "shelf-collapsed"
  | "shelf-extended"
  | "shelf-expanded";

// ── Icon Component Type ────────────────────────────────────────

type IconComponent = ComponentType<{ size?: number | string; className?: string }>;
type IconSet = Record<IconName, IconComponent>;

// ══════════════════════════════════════════════════════════════════
// DEFAULT SET: Remix Icons — clean, modern (ri)
// ══════════════════════════════════════════════════════════════════

import {
  RiGamepadLine,
  RiBarChartBoxLine,
  RiUserLine,
  RiSettings4Line,
  RiCodeSSlashLine,
  RiSearchLine,
  RiCloseLine,
  RiRefreshLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowUpSLine,
  RiArrowDownSLine,
  RiGridLine,
  RiListUnordered,
  RiStarFill,
  RiStarLine,
  RiEyeLine,
  RiEyeOffLine,
  RiPriceTag3Line,
  RiPaletteLine,
  RiDice5Line,
  RiPlayFill,
  RiPauseFill,
  RiMusic2Line,
  RiFilterLine,
  RiSave3Line,
  RiPencilLine,
  RiDeleteBinLine,
  RiPushpinLine,
  RiSideBarLine,
  RiLineChartLine,
  RiKey2Line,
  RiKeyboardLine,
  RiHashtag,
  RiLayoutRowLine,
  RiLayoutGridLine,
  RiLayoutMasonryLine,
  RiAddLine,
  RiLockLine,
  RiStickyNoteLine,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiSparklingLine,
  RiNewspaperLine,
  RiHardDriveLine,
} from "react-icons/ri";

const defaultSet: IconSet = {
  library: RiGamepadLine,
  activity: RiBarChartBoxLine,
  profile: RiUserLine,
  notes: RiStickyNoteLine,
  storage: RiHardDriveLine,
  settings: RiSettings4Line,
  debug: RiCodeSSlashLine,
  search: RiSearchLine,
  close: RiCloseLine,
  refresh: RiRefreshLine,
  "sort-asc": RiArrowUpLine,
  "sort-desc": RiArrowDownLine,
  "chevron-left": RiArrowLeftSLine,
  "chevron-right": RiArrowRightSLine,
  "chevron-up": RiArrowUpSLine,
  "chevron-down": RiArrowDownSLine,
  "grid-view": RiGridLine,
  "list-view": RiListUnordered,
  "star-filled": RiStarFill,
  "star-outline": RiStarLine,
  eye: RiEyeLine,
  "eye-off": RiEyeOffLine,
  tag: RiPriceTag3Line,
  palette: RiPaletteLine,
  dice: RiDice5Line,
  play: RiPlayFill,
  pause: RiPauseFill,
  music: RiMusic2Line,
  filter: RiFilterLine,
  installed: RiSave3Line,
  edit: RiPencilLine,
  trash: RiDeleteBinLine,
  pin: RiPushpinLine,
  sidebar: RiSideBarLine,
  stats: RiLineChartLine,
  key: RiKey2Line,
  keyboard: RiKeyboardLine,
  genre: RiHashtag,
  plus: RiAddLine,
  lock: RiLockLine,
  volume: RiVolumeUpLine,
  "volume-off": RiVolumeMuteLine,
  news: RiNewspaperLine,
  sparkle: RiSparklingLine,
  "shelf-collapsed": RiLayoutRowLine,
  "shelf-extended": RiLayoutGridLine,
  "shelf-expanded": RiLayoutMasonryLine,
};

// ══════════════════════════════════════════════════════════════════
// MINIMAL SET: Lucide Icons — thin, clean (lu)
// ══════════════════════════════════════════════════════════════════

import {
  LuGamepad2,
  LuChartBar,
  LuUser,
  LuSettings,
  LuCode,
  LuSearch,
  LuX,
  LuRefreshCw,
  LuArrowUp,
  LuArrowDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuChevronDown,
  LuLayoutGrid,
  LuList,
  LuStar,
  LuEye,
  LuEyeOff,
  LuTag,
  LuPalette,
  LuDices,
  LuPlay,
  LuPause,
  LuMusic,
  LuFilter,
  LuSave,
  LuPencil,
  LuTrash2,
  LuPin,
  LuPanelLeft,
  LuTrendingUp,
  LuKey,
  LuKeyboard,
  LuHash,
  LuRows3,
  LuGrid2X2,
  LuLayoutList,
  LuPlus,
  LuLock,
  LuNotepadText,
  LuVolume2,
  LuVolumeX,
  LuSparkles,
  LuNewspaper,
  LuHardDrive,
} from "react-icons/lu";

// Lucide doesn't have a filled star variant — use the same outline for both
const LuStarFilled = LuStar;

const minimalSet: IconSet = {
  library: LuGamepad2,
  activity: LuChartBar,
  profile: LuUser,
  notes: LuNotepadText,
  storage: LuHardDrive,
  settings: LuSettings,
  debug: LuCode,
  search: LuSearch,
  close: LuX,
  refresh: LuRefreshCw,
  "sort-asc": LuArrowUp,
  "sort-desc": LuArrowDown,
  "chevron-left": LuChevronLeft,
  "chevron-right": LuChevronRight,
  "chevron-up": LuChevronUp,
  "chevron-down": LuChevronDown,
  "grid-view": LuLayoutGrid,
  "list-view": LuList,
  "star-filled": LuStarFilled,
  "star-outline": LuStar,
  eye: LuEye,
  "eye-off": LuEyeOff,
  tag: LuTag,
  palette: LuPalette,
  dice: LuDices,
  play: LuPlay,
  pause: LuPause,
  music: LuMusic,
  filter: LuFilter,
  installed: LuSave,
  edit: LuPencil,
  trash: LuTrash2,
  pin: LuPin,
  sidebar: LuPanelLeft,
  stats: LuTrendingUp,
  key: LuKey,
  keyboard: LuKeyboard,
  genre: LuHash,
  plus: LuPlus,
  lock: LuLock,
  volume: LuVolume2,
  "volume-off": LuVolumeX,
  news: LuNewspaper,
  sparkle: LuSparkles,
  "shelf-collapsed": LuRows3,
  "shelf-extended": LuGrid2X2,
  "shelf-expanded": LuLayoutList,
};

// ══════════════════════════════════════════════════════════════════
// HEROIC SET: Heroicons 2 — strong, outlined shapes (hi2)
// ══════════════════════════════════════════════════════════════════

import {
  HiOutlineBuildingLibrary,
  HiOutlineChartBar,
  HiOutlineUser,
  HiOutlineCog6Tooth,
  HiOutlineCommandLine,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineArrowPath,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineSquares2X2,
  HiOutlineBars3,
  HiStar as HiStarSolid,
  HiOutlineStar,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineTag,
  HiOutlineSwatch,
  HiOutlineCubeTransparent,
  HiOutlinePlayCircle,
  HiOutlinePauseCircle,
  HiOutlineMusicalNote,
  HiOutlineFunnel,
  HiOutlineArrowDownTray,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineMapPin,
  HiOutlineBars3BottomLeft,
  HiOutlinePresentationChartLine,
  HiOutlineKey,
  HiOutlineComputerDesktop,
  HiOutlineHashtag,
  HiOutlineRectangleGroup,
  HiOutlineTableCells,
  HiOutlineQueueList,
  HiOutlinePlusCircle,
  HiOutlineLockClosed,
  HiOutlineDocumentText,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
  HiOutlineSparkles,
  HiOutlineNewspaper,
  HiOutlineCircleStack,
} from "react-icons/hi2";

const heroicSet: IconSet = {
  library: HiOutlineBuildingLibrary,
  activity: HiOutlineChartBar,
  profile: HiOutlineUser,
  notes: HiOutlineDocumentText,
  storage: HiOutlineCircleStack,
  settings: HiOutlineCog6Tooth,
  debug: HiOutlineCommandLine,
  search: HiOutlineMagnifyingGlass,
  close: HiOutlineXMark,
  refresh: HiOutlineArrowPath,
  "sort-asc": HiOutlineArrowUp,
  "sort-desc": HiOutlineArrowDown,
  "chevron-left": HiOutlineChevronLeft,
  "chevron-right": HiOutlineChevronRight,
  "chevron-up": HiOutlineChevronUp,
  "chevron-down": HiOutlineChevronDown,
  "grid-view": HiOutlineSquares2X2,
  "list-view": HiOutlineBars3,
  "star-filled": HiStarSolid,
  "star-outline": HiOutlineStar,
  eye: HiOutlineEye,
  "eye-off": HiOutlineEyeSlash,
  tag: HiOutlineTag,
  palette: HiOutlineSwatch,
  dice: HiOutlineCubeTransparent,
  play: HiOutlinePlayCircle,
  pause: HiOutlinePauseCircle,
  music: HiOutlineMusicalNote,
  filter: HiOutlineFunnel,
  installed: HiOutlineArrowDownTray,
  edit: HiOutlinePencil,
  trash: HiOutlineTrash,
  pin: HiOutlineMapPin,
  sidebar: HiOutlineBars3BottomLeft,
  stats: HiOutlinePresentationChartLine,
  key: HiOutlineKey,
  keyboard: HiOutlineComputerDesktop,
  genre: HiOutlineHashtag,
  plus: HiOutlinePlusCircle,
  lock: HiOutlineLockClosed,
  volume: HiOutlineSpeakerWave,
  "volume-off": HiOutlineSpeakerXMark,
  news: HiOutlineNewspaper,
  sparkle: HiOutlineSparkles,
  "shelf-collapsed": HiOutlineRectangleGroup,
  "shelf-extended": HiOutlineTableCells,
  "shelf-expanded": HiOutlineQueueList,
};

// ══════════════════════════════════════════════════════════════════
// PLAYFUL SET: Ionicons 5 — rounded, friendly forms (io5)
// ══════════════════════════════════════════════════════════════════

import {
  IoGameControllerOutline,
  IoBarChartOutline,
  IoPersonOutline,
  IoSettingsOutline,
  IoCodeSlashOutline,
  IoSearchOutline,
  IoCloseOutline,
  IoRefreshOutline,
  IoArrowUpOutline,
  IoArrowDownOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoChevronUpOutline,
  IoChevronDownOutline,
  IoGridOutline,
  IoListOutline,
  IoStar,
  IoStarOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoPricetagOutline,
  IoColorPaletteOutline,
  IoDiceOutline,
  IoPlayOutline,
  IoPauseOutline,
  IoMusicalNotesOutline,
  IoFunnelOutline,
  IoDownloadOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoLocationOutline,
  IoMenuOutline,
  IoStatsChartOutline,
  IoKeyOutline,
  IoKeypadOutline,
  IoPricetagsOutline,
  IoReorderThreeOutline,
  IoAppsOutline,
  IoReorderFourOutline,
  IoAddOutline,
  IoLockClosedOutline,
  IoDocumentTextOutline,
  IoVolumeHighOutline,
  IoVolumeMuteOutline,
  IoSparklesOutline,
  IoNewspaperOutline,
  IoServerOutline,
} from "react-icons/io5";

const playfulSet: IconSet = {
  library: IoGameControllerOutline,
  activity: IoBarChartOutline,
  profile: IoPersonOutline,
  notes: IoDocumentTextOutline,
  storage: IoServerOutline,
  settings: IoSettingsOutline,
  debug: IoCodeSlashOutline,
  search: IoSearchOutline,
  close: IoCloseOutline,
  refresh: IoRefreshOutline,
  "sort-asc": IoArrowUpOutline,
  "sort-desc": IoArrowDownOutline,
  "chevron-left": IoChevronBackOutline,
  "chevron-right": IoChevronForwardOutline,
  "chevron-up": IoChevronUpOutline,
  "chevron-down": IoChevronDownOutline,
  "grid-view": IoGridOutline,
  "list-view": IoListOutline,
  "star-filled": IoStar,
  "star-outline": IoStarOutline,
  eye: IoEyeOutline,
  "eye-off": IoEyeOffOutline,
  tag: IoPricetagOutline,
  palette: IoColorPaletteOutline,
  dice: IoDiceOutline,
  play: IoPlayOutline,
  pause: IoPauseOutline,
  music: IoMusicalNotesOutline,
  filter: IoFunnelOutline,
  installed: IoDownloadOutline,
  edit: IoCreateOutline,
  trash: IoTrashOutline,
  pin: IoLocationOutline,
  sidebar: IoMenuOutline,
  stats: IoStatsChartOutline,
  key: IoKeyOutline,
  keyboard: IoKeypadOutline,
  genre: IoPricetagsOutline,
  plus: IoAddOutline,
  lock: IoLockClosedOutline,
  volume: IoVolumeHighOutline,
  "volume-off": IoVolumeMuteOutline,
  news: IoNewspaperOutline,
  sparkle: IoSparklesOutline,
  "shelf-collapsed": IoReorderThreeOutline,
  "shelf-extended": IoAppsOutline,
  "shelf-expanded": IoReorderFourOutline,
};

// ══════════════════════════════════════════════════════════════════
// CLASSIC SET: Font Awesome 6 — timeless, familiar icons (fa6)
// ══════════════════════════════════════════════════════════════════

import {
  FaGamepad,
  FaChartBar,
  FaUser,
  FaGear,
  FaCode,
  FaMagnifyingGlass,
  FaXmark,
  FaArrowsRotate,
  FaArrowUp,
  FaArrowDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaChevronDown,
  FaTableCells,
  FaList,
  FaStar,
  FaRegStar,
  FaEye,
  FaEyeSlash,
  FaTag,
  FaPalette,
  FaDice,
  FaPlay,
  FaPause,
  FaMusic,
  FaFilter,
  FaDownload,
  FaPen,
  FaTrashCan,
  FaThumbtack,
  FaBars,
  FaChartLine,
  FaKey,
  FaKeyboard,
  FaHashtag,
  FaGripLines,
  FaTableCellsLarge,
  FaTableList,
  FaPlus,
  FaLock,
  FaNoteSticky,
  FaVolumeHigh,
  FaVolumeXmark,
  FaWandMagicSparkles,
  FaRegNewspaper,
  FaHardDrive,
} from "react-icons/fa6";

const classicSet: IconSet = {
  library: FaGamepad,
  activity: FaChartBar,
  profile: FaUser,
  notes: FaNoteSticky,
  storage: FaHardDrive,
  settings: FaGear,
  debug: FaCode,
  search: FaMagnifyingGlass,
  close: FaXmark,
  refresh: FaArrowsRotate,
  "sort-asc": FaArrowUp,
  "sort-desc": FaArrowDown,
  "chevron-left": FaChevronLeft,
  "chevron-right": FaChevronRight,
  "chevron-up": FaChevronUp,
  "chevron-down": FaChevronDown,
  "grid-view": FaTableCells,
  "list-view": FaList,
  "star-filled": FaStar,
  "star-outline": FaRegStar,
  eye: FaEye,
  "eye-off": FaEyeSlash,
  tag: FaTag,
  palette: FaPalette,
  dice: FaDice,
  play: FaPlay,
  pause: FaPause,
  music: FaMusic,
  filter: FaFilter,
  installed: FaDownload,
  edit: FaPen,
  trash: FaTrashCan,
  pin: FaThumbtack,
  sidebar: FaBars,
  stats: FaChartLine,
  key: FaKey,
  keyboard: FaKeyboard,
  genre: FaHashtag,
  plus: FaPlus,
  lock: FaLock,
  volume: FaVolumeHigh,
  "volume-off": FaVolumeXmark,
  news: FaRegNewspaper,
  sparkle: FaWandMagicSparkles,
  "shelf-collapsed": FaGripLines,
  "shelf-extended": FaTableCellsLarge,
  "shelf-expanded": FaTableList,
};

// ══════════════════════════════════════════════════════════════════
// FANTASY SET: Game Icons — fantasy game-inspired (gi)
// ══════════════════════════════════════════════════════════════════

import {
  GiGamepad,
  GiSandsOfTime,
  GiCrown,
  GiGears,
  GiSpellBook,
  GiMagnifyingGlass,
  GiCrossedBones,
  GiClockwiseRotation,
  GiUpgrade,
  GiAnvil,
  GiReturnArrow,
  GiArrowDunk,
  GiUpCard,
  GiCardPickup,
  GiTreasureMap,
  GiScrollUnfurled,
  GiStarShuriken,
  GiNorthStarShuriken,
  GiEyeball,
  GiBlindfold,
  GiBookmark,
  GiPalette,
  GiRollingDices,
  GiCrossedSwords,
  GiPauseButton,
  GiMusicalNotes,
  GiCrystalBall,
  GiChest,
  GiQuillInk,
  GiTrashCan,
  GiPositionMarker,
  GiDoorway,
  GiAbacus,
  GiSkeletonKey,
  GiScrollQuill,
  GiDramaMasks,
  GiBookshelf,
  GiCardRandom,
  GiStack,
  GiMagicSwirl,
  GiPadlock,
  GiNotebook,
  GiSpeaker,
  GiSpeakerOff,
  GiSparkles,
  GiNewspaper,
  GiLockedChest,
} from "react-icons/gi";

const fantasySet: IconSet = {
  library: GiGamepad,
  activity: GiSandsOfTime,
  profile: GiCrown,
  notes: GiNotebook,
  storage: GiLockedChest,
  settings: GiGears,
  debug: GiSpellBook,
  search: GiMagnifyingGlass,
  close: GiCrossedBones,
  refresh: GiClockwiseRotation,
  "sort-asc": GiUpgrade,
  "sort-desc": GiAnvil,
  "chevron-left": GiReturnArrow,
  "chevron-right": GiArrowDunk,
  "chevron-up": GiUpCard,
  "chevron-down": GiCardPickup,
  "grid-view": GiTreasureMap,
  "list-view": GiScrollUnfurled,
  "star-filled": GiStarShuriken,
  "star-outline": GiNorthStarShuriken,
  eye: GiEyeball,
  "eye-off": GiBlindfold,
  tag: GiBookmark,
  palette: GiPalette,
  dice: GiRollingDices,
  play: GiCrossedSwords,
  pause: GiPauseButton,
  music: GiMusicalNotes,
  filter: GiCrystalBall,
  installed: GiChest,
  edit: GiQuillInk,
  trash: GiTrashCan,
  pin: GiPositionMarker,
  sidebar: GiDoorway,
  stats: GiAbacus,
  key: GiSkeletonKey,
  keyboard: GiScrollQuill,
  genre: GiDramaMasks,
  plus: GiMagicSwirl,
  lock: GiPadlock,
  volume: GiSpeaker,
  "volume-off": GiSpeakerOff,
  news: GiNewspaper,
  sparkle: GiSparkles,
  "shelf-collapsed": GiBookshelf,
  "shelf-extended": GiCardRandom,
  "shelf-expanded": GiStack,
};

// ── Icon Set Registry ─────────────────────────────────────────
// Uses Record<string, IconSet> to gracefully handle legacy icon set IDs
// ("soft", "sharp", "bold") that may still exist in user settings — they
// fall through to the ?? ICON_SETS.classic fallback in getIcon().

const ICON_SETS: Record<string, IconSet> = {
  default: defaultSet,
  minimal: minimalSet,
  heroic: heroicSet,
  playful: playfulSet,
  classic: classicSet,
  fantasy: fantasySet,
};

// ── Public API ─────────────────────────────────────────────────

export function getIcon(name: IconName, iconSetId: IconSetId): IconComponent {
  const set = ICON_SETS[iconSetId] ?? ICON_SETS.classic;
  return set[name] ?? classicSet[name];
}
