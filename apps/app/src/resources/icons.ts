import type { IconType } from "react-icons";
import {
  HiArrowPath,
  HiOutlineArrowRight,
  HiOutlineBolt,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineRocketLaunch,
  HiOutlineScale,
  HiOutlineShieldCheck,
  HiOutlineSquares2X2,
  HiOutlineWallet,
} from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  rocket: HiOutlineRocketLaunch,
  refresh: HiArrowPath,
  arrowRight: HiOutlineArrowRight,
  check: HiOutlineCheckCircle,
  warning: HiOutlineExclamationTriangle,
  wallet: HiOutlineWallet,
  rebalancing: HiOutlineScale,
  grid: HiOutlineSquares2X2,
  yield: HiOutlineChartBar,
  health: HiOutlineShieldCheck,
  bolt: HiOutlineBolt,
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;
