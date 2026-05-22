import { toChainFormat, toHumanReadable } from "@injectivelabs/utils";
import { INJ_DECIMALS } from "./network";

export function injToBase(amountInj: string | number): string {
  return toChainFormat(amountInj || 0, INJ_DECIMALS).toFixed(0);
}

export function baseToInj(amountBase: string | number): string {
  return toHumanReadable(amountBase || 0, INJ_DECIMALS).toFixed();
}
