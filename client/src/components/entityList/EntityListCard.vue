<template>
	<div class="pb-card entity-list">
		<div
			v-for="(item, index) in items"
			:key="item.id"
			class="entity-list-row"
			:class="{'entity-list-row--border': index !== items.length - 1}"
		>
			<v-icon class="entity-list-row-icon" color="primary" size="20">{{ icon }}</v-icon>

			<span class="entity-list-row-name">{{ item.name }}</span>

			<row-actions-menu
				class="entity-list-row-actions"
				:actions="actionsFor(item.id)"
				:menu-label="t(AppLabels.ACTIONS)"
				@action="onAction(item.id, $event)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
/**
 * Row-list replacement for a plain "name + actions" data table: a single
 * `pb-card` shell holding one divided row per item (leading icon, name,
 * inline edit/delete). Used by views whose only real column is a name
 * (authors, categories) where a full data-table header row is overkill.
 */
import {useI18n} from "vue-i18n";
import {AppLabels} from "@/plugins/i18n/AppLabels";
import RowActionsMenu from "@/components/entityList/RowActionsMenu.vue";
import {RowAction} from "@/components/entityList/RowAction";

interface Item {
	id: number;
	name: string;
}

interface Props {
	items: Item[];
	icon?: string;
	deleteLoading?: number[];
}

const props = withDefaults(defineProps<Props>(), {
	icon: 'mdi-bookmark-outline',
	deleteLoading: () => [],
});

const emit = defineEmits<{
	edit: [id: number];
	delete: [id: number];
}>();

const {t} = useI18n();

function actionsFor(id: number): RowAction[] {
	return [
		{key: "edit", label: t(AppLabels.EDIT), icon: "mdi-pencil"},
		{
			key: "delete",
			label: t(AppLabels.DELETE),
			icon: "mdi-delete",
			destructive: true,
			loading: props.deleteLoading.includes(id),
			disabled: props.deleteLoading.includes(id),
		},
	];
}

function onAction(id: number, key: string) {
	if (key === "edit") {
		emit("edit", id);
	} else if (key === "delete") {
		emit("delete", id);
	}
}
</script>

<style scoped>
.entity-list {
	overflow: hidden;
}

.entity-list-row {
	display: flex;
	align-items: center;
	gap: 12px;
	/* Room for a 44px action control without the row looking cramped. */
	min-height: 56px;
	padding: 8px 18px;
	transition: background-color 0.15s ease;
}

.entity-list-row:hover {
	background: var(--pb-surface-alt);
}

.entity-list-row--border {
	border-bottom: 1px solid var(--pb-border);
}

.entity-list-row-icon {
	flex-shrink: 0;
	opacity: 0.8;
}

.entity-list-row-name {
	flex: 1;
	min-width: 0;
	font-size: 14px;
	font-weight: 500;
	color: var(--pb-text);
	overflow-wrap: anywhere;
}

.entity-list-row-actions {
	flex-shrink: 0;
}
</style>
