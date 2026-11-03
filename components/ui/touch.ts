/** Touch screens only: an invisible ::after grows a small control's hit area
 *  without changing its look or layout (the Switch/Checkbox trick). Pair it
 *  with the inset that size needs, e.g.
 *  "[@media(pointer:coarse)]:after:-inset-2" on a 24px icon button. */
export const TOUCH_TARGET = "relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:content-['']"
