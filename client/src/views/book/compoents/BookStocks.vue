<template>
	<card-component
		:title="t(AppLabels.STOCKS)"
		icon="mdi-book-multiple"
		:counter="stocks.length"
	>
		<template v-slot:actions>
			<v-btn
				@click="showAddStockDialog"
				density="comfortable"
				color="primary"
				class="text-none"
			>
				{{t(AppLabels.ADD)}}
			</v-btn>
		</template>

		<template v-slot:default>
			<v-data-table
				:key="book.getStocks().length"
				:headers="headers"
				density="compact"
				:items="stocks"
			>

				<template v-slot:item.status="{item}">
					<v-chip
						density="compact"
						variant="outlined"
						:color="item.status_color"
					>
						{{ item.status_text }}
					</v-chip>
				</template>

				<template v-slot:item.actions="{ item }">
					<row-actions-menu
						class="d-inline-flex"
						:actions="actionsFor(item.id)"
						:menu-label="t(AppLabels.ACTIONS)"
						@action="onRowAction(item, $event)"
					/>
				</template>
			</v-data-table>

			<book-stock-dialog
				v-if="stockDialog"
				v-model="stockDialog"
				:book="book"
				:stock="selectedStock"
			/>
		</template>
	</card-component>
</template>

<script setup lang="ts">
/**
 * Physical stocks table on the book detail view: lists every copy with its
 * code/location/status/customer, and lets the user add/edit/delete a stock
 * or queue its barcode for printing.
 */
import {computed, Ref, ref, ShallowRef, shallowRef} from 'vue'
import Book from "@/model/book/Book";
import BookStock from "@/model/book/BookStock";
import BookStockDialog from "@/views/book/compoents/BookStockDialog.vue";
import CardComponent from "@/components/card/CardComponent.vue";
import {confirmationDialogController} from "@/components/confirmationDialog/ConfirmationDialogController";
import {useI18n} from "vue-i18n";
import {AppLabels} from "@/plugins/i18n/AppLabels";
import {printDialogController} from "@/components/printDialog/PrintDialogController";
import {appSnackbarController} from "@/components/appSnackbar/AppSnackbarController";
import {applicationService} from "@/service/ApplicationService";
import RowActionsMenu from "@/components/entityList/RowActionsMenu.vue";
import {RowAction} from "@/components/entityList/RowAction";

interface Props {
	book: Book
}

const props = defineProps<Props>()

const {t} = useI18n();

const headers = computed(() => {
	const cols: {title: string, value: string, align?: 'start' | 'end' | 'center', sortable?: boolean}[] = [
		{
			title: t(AppLabels.CODE),
			align: 'start',
			sortable: false,
			value: 'code',
		},
		{title: t(AppLabels.LOCATION), value: 'location_name'},
		{title: t(AppLabels.BOOK_STOCK_STATUS), value: 'status'},
	];

	if (applicationService.getUser().isLeasingEnabled()) {
		cols.push({title: t(AppLabels.BOOKED_BY), value: 'booked_user'});
	}

	cols.push({title: t(AppLabels.ACTIONS), value: 'actions', align: 'end'});

	return cols;
});

const stockDialog: Ref<boolean> = ref(false);
const selectedStock: ShallowRef<BookStock | undefined> = shallowRef(undefined);

function showEditStockDialog(stockId: number) {
	const stock = props.book.getStocks().find((stock) => stock.getId() === stockId);

	if (stock) {
		selectedStock.value = stock;
		stockDialog.value = true;
	}
}

function showAddStockDialog() {
	selectedStock.value = undefined;
	stockDialog.value = true;
}

const deleteLoading: Ref<number[]> = ref([]);

const stocks = computed(() => {
	return props.book.getStocks().map((stock) => {
		const status = BookStock.BookStockStatus.find((item) => item.value === stock.getStatus());

		return {
			id: stock.getId(),
			code: stock.getCode(),
			location_id: stock.getLocationId(),
			location_name: stock.getLocationName() || t(AppLabels.NO_LOCATION),
			status: stock.getStatus(),
			status_color: status!.color,
			status_text: status!.text,
			booked_user: stock.getCustomerName()
		}
	})
})

/**
 * Print / edit / delete for one stock row. `RowActionsMenu` renders these as
 * one overflow button on phones and as inline icon buttons above `sm` - the
 * bare clickable `v-icon`s they replace were 21x21 with no focus ring,
 * keyboard activation or accessible name.
 */
function actionsFor(stockId: number): RowAction[] {
	return [
		{key: "print", label: t(AppLabels.PRINT), icon: "mdi-printer-pos-plus-outline"},
		{key: "edit", label: t(AppLabels.EDIT), icon: "mdi-pencil"},
		{
			key: "delete",
			label: t(AppLabels.DELETE),
			icon: "mdi-delete",
			destructive: true,
			loading: deleteLoading.value.includes(stockId),
			disabled: deleteLoading.value.includes(stockId),
		},
	];
}

function onRowAction(stock: Record<string, any>, key: string) {
	if (key === "print") {
		addToPrintQueue(stock.id);
	} else if (key === "edit") {
		showEditStockDialog(stock.id);
	} else if (key === "delete") {
		removeBookStock(stock);
	}
}

function addToPrintQueue(id: number) {
	const stock = props.book.getStocks().find((stock) => stock.getId() === id);
	if (stock) {
		printDialogController.addLabel(props.book.getName(), stock.getCode(), stock.generateBarcodeImage(), props.book.getImageUrl());
	}
}

/**
 *
 * @param stockId
 */
async function removeBookStock(stock: Record<string, any>) {
	confirmationDialogController.showDialog(
		`${t(AppLabels.DELETE_STOCK)} ${stock.code}`,
		t(AppLabels.DELETE_STOCK_DESC),
		t(AppLabels.DELETE)
	).then(async () => {
		try {
			deleteLoading.value.push(stock.id);
			await props.book.removeBookStock(stock.id);
		} finally {
			deleteLoading.value.splice(deleteLoading.value.indexOf(stock.id), 1);
		}
	})
}
</script>
