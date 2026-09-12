<template>
	<!--
		Phone: one overflow button. Three competing controls inside a 390px row
		is the real problem - shrinking them to fit is what produced the 21x21
		targets in the first place - so they collapse into a single 44px button
		that opens a labelled menu.
	-->
	<v-menu v-if="smAndDown" location="bottom end">
		<template v-slot:activator="{ props: activatorProps }">
			<v-btn
				v-bind="activatorProps"
				icon="mdi-dots-vertical"
				variant="text"
				:aria-label="menuLabel"
				class="row-actions-overflow"
				:loading="actions.some(action => action.loading)"
			/>
		</template>

		<v-list density="compact" min-width="180">
			<v-list-item
				v-for="action in actions"
				:key="action.key"
				:prepend-icon="action.icon"
				:title="action.label"
				:disabled="action.disabled || action.loading"
				:base-color="action.destructive ? 'error' : undefined"
				@click="$emit('action', action.key)"
			/>
		</v-list>
	</v-menu>

	<!--
		Pointer widths keep the inline row - but as real `v-btn`s, not bare
		clickable `v-icon`s. A `v-icon` with an `@click` has no focus ring, no
		keyboard activation, no ripple, no accessible name and no hit area
		beyond the glyph itself.
	-->
	<div v-else class="row-actions-inline">
		<v-btn
			v-for="action in actions"
			:key="action.key"
			icon
			variant="text"
			density="comfortable"
			size="small"
			:aria-label="action.label"
			:loading="action.loading"
			:disabled="action.disabled"
			@click="$emit('action', action.key)"
		>
			<v-icon size="small">{{ action.icon }}</v-icon>
			<v-tooltip activator="parent" location="bottom">{{ action.label }}</v-tooltip>
		</v-btn>
	</div>
</template>

<script setup lang="ts">
/**
 * Per-row action control for list/table rows, in two shapes driven by the
 * viewport: an inline strip of icon buttons on pointer-sized screens, and a
 * single overflow menu on phones.
 *
 * Callers pass a flat list of `RowAction`s and handle one `action` event
 * carrying the chosen `key`, so a row's action set is declared once and
 * renders correctly in both shapes.
 *
 * `destructive: true` tints the entry red *in the open menu only*. A delete
 * control that sits permanently red in a resting row, right next to edit, is
 * an invitation to misfire on touch - the warning belongs at the moment of
 * choosing, and again in the confirmation dialog that follows.
 */
import {useDisplay} from "vuetify";
import {RowAction} from "@/components/entityList/RowAction";

interface Props {
	actions: RowAction[];
	/** Accessible name for the overflow button itself. */
	menuLabel?: string;
}

withDefaults(defineProps<Props>(), {
	menuLabel: "Actions",
});

defineEmits<{
	action: [key: string];
}>();

const {smAndDown} = useDisplay();
</script>

<style scoped>
.row-actions-inline {
	display: flex;
	align-items: center;
	gap: 2px;
}

/* Vuetify's default icon button is 40px; 44px is the touch minimum. */
.row-actions-overflow {
	min-width: 44px;
	min-height: 44px;
}
</style>
