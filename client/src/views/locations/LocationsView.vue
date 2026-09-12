<template>
	<page-component :model="controller">
		<template v-slot:append>
			<v-btn
				@click="createLocation()"
				class="text-none"
				color="primary"
				variant="elevated"
			>
				{{t(AppLabels.ADD)}}
			</v-btn>
		</template>

		<template v-slot:default>
			<empty-state
				v-if="locations.length === 0"
				icon="mdi-map-marker-plus-outline"
				:chip-icons="['mdi-map-marker-outline', 'mdi-warehouse', 'mdi-bookshelf', 'mdi-office-building-outline', 'mdi-map-marker-radius-outline', 'mdi-book-outline', 'mdi-store-outline', 'mdi-map-outline']"
				:title="t(AppLabels.EMPTY_LOCATIONS_TITLE)"
				:description="t(AppLabels.EMPTY_LOCATIONS_DESC)"
			>
				<v-btn
					@click="createLocation()"
					class="text-none"
					color="primary"
					variant="elevated"
				>
					{{t(AppLabels.ADD)}}
				</v-btn>
			</empty-state>

			<div v-else class="entity-card-list">
				<div
					v-for="location in locations"
					:key="location.id"
					class="pb-card entity-card"
				>
					<!--
						Title-first and full-width, with the count and description
						demoted to a second metadata line. Laid out horizontally,
						a wrapped 3-line location name had to share a 390px row
						with a count chip and three buttons.
					-->
					<div class="entity-card-header" @click="toggleExpand(location.id)">
						<v-icon class="entity-card-icon" color="primary" size="20">mdi-map-marker-outline</v-icon>

						<div class="entity-card-title-group">
							<span class="entity-card-name">{{ location.name }}</span>

							<div class="entity-card-meta">
								<v-chip density="compact" size="small" class="entity-card-count">{{ location.totalBooks }}</v-chip>
								<span v-if="location.description" class="entity-card-desc">{{ location.description }}</span>
							</div>
						</div>

						<div class="entity-card-actions" @click.stop>
							<row-actions-menu
								:actions="actionsFor(location.id)"
								:menu-label="t(AppLabels.ACTIONS)"
								@action="onRowAction(location.id, $event)"
							/>
						</div>

						<!--
							Purely an open/closed indicator - the whole header is
							the toggle. Hidden on phones, where the overflow menu
							carries an explicit expand/collapse entry instead, so
							the row isn't crowded with a control that only looks
							separately tappable.
						-->
						<v-icon
							v-if="!smAndDown"
							class="entity-card-chevron"
							:class="{'entity-card-chevron--open': expanded.includes(location.id)}"
						>
							mdi-chevron-down
						</v-icon>
					</div>

					<v-expand-transition>
						<div v-if="expanded.includes(location.id)" class="entity-card-body">
							<location-books-table
								v-if="controller.getLocation(location.id)"
								:location="controller.getLocation(location.id)!"
							/>
						</div>
					</v-expand-transition>
				</div>
			</div>

			<location-dialog
				v-if="dialog"
				v-model="dialog"
				:location="selectedLocation"
				:controller="controller"
			/>
		</template>
	</page-component>
</template>

<script setup lang="ts">
/**
 * Locations management view: a card per location (expanding a card shows
 * its books via `LocationBooksTable`), with inline edit/delete, an empty
 * state when there are none, and the add/edit dialog. Deletes also sync
 * `ApplicationService`'s cached location list.
 */
import PageComponent from "@/views/PageComponent.vue";
import LocationsController from "@/controller/locations/LocationsController";
import {computed, ref, Ref, ShallowRef, shallowRef} from "vue";
import LocationDialog from "@/views/locations/LocationDialog.vue";
import {confirmationDialogController} from "@/components/confirmationDialog/ConfirmationDialogController";
import {applicationService} from "@/service/ApplicationService";
import LocationExt from "@/model/location/LocationExt";
import LocationBooksTable from "@/views/locations/LocationBooksTable.vue";
import EmptyState from "@/components/emptyState/EmptyState.vue";
import {useI18n} from "vue-i18n";
import {useDisplay} from "vuetify";
import {AppLabels} from "@/plugins/i18n/AppLabels";
import RowActionsMenu from "@/components/entityList/RowActionsMenu.vue";
import {RowAction} from "@/components/entityList/RowAction";

const controller = new LocationsController();

const {t} = useI18n();

const {smAndDown} = useDisplay();

/**
 *
 */
const dialog: Ref<boolean> = ref(false);

/**
 *
 */
const selectedLocation: ShallowRef<LocationExt | undefined> = shallowRef(undefined);

/**
 *
 */
const deleteLoading: Ref<number[]> = ref([]);

/**
 * Ids of the location cards currently expanded to show their books.
 */
const expanded: Ref<number[]> = ref([]);

/**
 *
 */
const locations = computed(() => {
	return controller.getLocations().map(location => {
		return {
			id: location.getId(),
			name: location.getName(),
			description: location.getDescription(),
			totalBooks: location.getTotalBooks()
		}
	})
})

/**
 *
 * @param locationId
 */
function editLocation(locationId: number) {
	const location = controller.getLocations().find(location => location.getId() === locationId);
	if (location) {
		selectedLocation.value = location;
		dialog.value = true;
	}
}

/**
 *
 */
function createLocation() {
	selectedLocation.value = undefined;
	dialog.value = true;
}

/**
 *
 * @param locationId
 */
async function deleteItem(locationId: number) {
	const location = controller.getLocation(locationId);
	confirmationDialogController.showDialog(
		`${t(AppLabels.DELETE_LOCATION)} ${location ? location.getName() : ''}`,
		t(AppLabels.DELETE_LOCATION_DESC),
		t(AppLabels.DELETE)
	).then(async () => {
		try {
			deleteLoading.value.push(locationId);
			await controller.deleteLocation(locationId);
			applicationService.setLocations(controller.getLocations())
		} finally {
			deleteLoading.value.splice(deleteLoading.value.indexOf(locationId), 1);
		}
	});
}

/**
 * The row's action set. On phones `RowActionsMenu` collapses these into one
 * overflow button; above `sm` it renders them as inline icon buttons.
 */
function actionsFor(locationId: number): RowAction[] {
	const actions: RowAction[] = [
		{key: "edit", label: t(AppLabels.EDIT), icon: "mdi-pencil"},
		{
			key: "delete",
			label: t(AppLabels.DELETE),
			icon: "mdi-delete",
			destructive: true,
			loading: deleteLoading.value.includes(locationId),
			disabled: deleteLoading.value.includes(locationId),
		},
	];

	// The chevron is hidden on phones (see the template), so the menu is the
	// only labelled way to say "show this location's books".
	if (smAndDown.value) {
		actions.unshift({
			key: "expand",
			label: t(AppLabels.VIEW_ALL),
			icon: expanded.value.includes(locationId) ? "mdi-chevron-up" : "mdi-chevron-down",
		});
	}

	return actions;
}

function onRowAction(locationId: number, key: string) {
	if (key === "edit") {
		editLocation(locationId);
	} else if (key === "delete") {
		deleteItem(locationId);
	} else if (key === "expand") {
		toggleExpand(locationId);
	}
}

/**
 *
 * @param locationId
 */
function toggleExpand(locationId: number) {
	const index = expanded.value.indexOf(locationId);
	if (index === -1) {
		expanded.value.push(locationId);
	} else {
		expanded.value.splice(index, 1);
	}
}
</script>

<style scoped>
.entity-card-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.entity-card {
	overflow: hidden;
}

.entity-card-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	min-height: 60px;
	cursor: pointer;
}

.entity-card-icon {
	flex-shrink: 0;
}

.entity-card-title-group {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.entity-card-name {
	font-size: 15px;
	font-weight: 600;
	line-height: 1.3;
	color: var(--pb-text);
	overflow-wrap: anywhere;
}

/* Second line: everything that used to compete with the name horizontally. */
.entity-card-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.entity-card-desc {
	font-size: 12.5px;
	color: var(--pb-text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.entity-card-count {
	flex-shrink: 0;
}

.entity-card-actions {
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

.entity-card-chevron {
	flex-shrink: 0;
	transition: transform 0.15s ease;
	opacity: 0.7;
}

.entity-card-chevron--open {
	transform: rotate(180deg);
}

.entity-card-body {
	border-top: 1px solid var(--pb-border);
}
</style>