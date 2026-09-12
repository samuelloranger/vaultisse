/**
 * One entry in a list/table row's action set, rendered by `RowActionsMenu` as
 * either an inline icon button (pointer widths) or a labelled overflow-menu
 * item (phones).
 */
export interface RowAction {
	/** Identifier echoed back through `RowActionsMenu`'s `action` event. */
	key: string;

	/** Human-readable, translated label - used as the menu entry, the tooltip, and the `aria-label`. */
	label: string;

	/** mdi icon name. */
	icon: string;

	/** Shows a spinner on the inline button / disables the menu entry. */
	loading?: boolean;

	disabled?: boolean;

	/**
	 * Red-tints this entry *in the open menu only*. A delete control sitting
	 * permanently red in a resting row, right next to edit, invites misfires
	 * on touch - the warning belongs at the moment of choosing, and again in
	 * the confirmation dialog that follows.
	 */
	destructive?: boolean;
}
