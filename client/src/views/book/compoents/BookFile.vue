<template>
	<card-component
		:title="t(AppLabels.EBOOK_FILE)"
		icon="mdi-file-download-outline"
		:counter="files.length"
	>
		<template v-slot:actions>
			<v-btn
				@click="triggerFileSelect"
				density="comfortable"
				color="primary"
				class="text-none"
				:loading="loading"
				:disabled="loading"
			>
				{{ t(AppLabels.ADD) }}
			</v-btn>
		</template>

		<template v-slot:default>
			<div v-if="files.length > 0">
				<div
					v-for="file in files"
					:key="file.id"
					class="d-flex align-center my-3"
				>
					<v-icon size="28" class="mr-3" color="primary">{{ fileIcon(file) }}</v-icon>
					<!--
						The file name is the preview trigger. That removes a third
						unlabelled icon button from the row and gives the action a
						target the size of the whole row rather than 21x21.
					-->
					<button
						type="button"
						class="pb-file-row-open flex-grow-1"
						@click="previewFile = file"
					>
						<span class="text-truncate d-block">{{ file.file_name }}</span>
						<span class="text-caption d-block" style="color: var(--pb-text-muted)">
							{{ formattedSize(file) }} &middot; {{ formattedDate(file) }}
						</span>
					</button>
					<!--
						Three unlabelled icon buttons in one row - the same
						pattern collapsed everywhere else. On phones this is a
						single overflow menu; above `sm` the icons stay inline,
						now as named, focusable buttons.
					-->
					<row-actions-menu
						class="mr-2"
						:actions="fileActionsFor(file)"
						:menu-label="t(AppLabels.ACTIONS)"
						@action="onFileAction(file, $event)"
					/>
				</div>
			</div>

			<template v-else>
				<v-hover v-slot="{ isHovering, props: hoverProps }">
					<div
						v-bind="hoverProps"
						class="pb-file-dropzone"
						:class="{'pb-file-dropzone-hover': isHovering}"
						@click="triggerFileSelect"
						@drop.prevent="handleDrop"
						@dragover.prevent
					>
						<v-progress-circular v-if="loading" indeterminate color="primary" size="28"/>
						<template v-else>
							<v-icon size="28" color="primary">mdi-tray-arrow-up</v-icon>
							<span class="text-caption text-center mt-1">{{ t(AppLabels.EBOOK_FILE_DRAG_AND_DROP) }}</span>
						</template>
					</div>
				</v-hover>
				<div class="text-caption mt-1" style="text-align: center; width: 100%; color: var(--pb-text-muted)">
					{{ t(AppLabels.EBOOK_FILE_HOVER_INFO) }}
				</div>
			</template>

			<input
				ref="fileInput"
				type="file"
				accept=".epub,.pdf,.mobi,.azw3"
				style="display: none"
				@change="handleFileSelect"
			/>

			<book-file-preview-dialog
				v-if="previewFile"
				:model-value="true"
				@update:model-value="(value) => { if (!value) previewFile = null }"
				:book="book"
				:file="previewFile"
			/>
		</template>
	</card-component>
</template>

<script setup lang="ts">
/**
 * Backed-up ebook files for a book, shown on the book detail view: a list
 * with one row per uploaded file (up to one per type - epub/pdf/mobi),
 * each with a preview (opens `BookFilePreviewDialog`), download and delete
 * action, plus an "add file" action - or, when empty, a click/drag-and-drop
 * dropzone. The uploaded file's type is inferred server-side, so "add file"
 * always just uploads: it replaces any existing file of the same type.
 */
import Book from "@/model/book/Book";
import CardComponent from "@/components/card/CardComponent.vue";
import BookFilePreviewDialog from "@/views/book/compoents/BookFilePreviewDialog.vue";
import {computed, ref, Ref} from "vue";
import {useI18n} from "vue-i18n";
import {AppLabels} from "@/plugins/i18n/AppLabels";
import {PATH_PREFIX} from "@/Constants";
import {IBookFile} from "@/types/book/IBookFile";
import {confirmationDialogController} from "@/components/confirmationDialog/ConfirmationDialogController";
import {appSnackbarController, SnackbarType} from "@/components/appSnackbar/AppSnackbarController";
import RowActionsMenu from "@/components/entityList/RowActionsMenu.vue";
import {RowAction} from "@/components/entityList/RowAction";

const {t} = useI18n();

interface Props {
	book: Book;
}

const props = defineProps<Props>();

const loading: Ref<boolean> = ref(false);
const deleteLoadingId: Ref<number | null> = ref(null);
const fileInput = ref<HTMLInputElement | null>(null);
const previewFile: Ref<IBookFile | null> = ref(null);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB, matches the server-side limit

const files = computed(() => props.book.getFiles());

function fileIcon(file: IBookFile): string {
	if (file.file_type === "epub") return "mdi-book-open-page-variant-outline";
	if (file.file_type === "pdf") return "mdi-file-pdf-box";
	return "mdi-tablet";
}

/** Download / delete for one backed-up ebook file - preview is the file name itself. */
function fileActionsFor(file: IBookFile): RowAction[] {
	return [
		{key: "download", label: t(AppLabels.DOWNLOAD), icon: "mdi-download"},
		{
			key: "delete",
			label: t(AppLabels.DELETE),
			icon: "mdi-delete",
			destructive: true,
			loading: deleteLoadingId.value === file.id,
			disabled: deleteLoadingId.value !== null,
		},
	];
}

function onFileAction(file: IBookFile, key: string) {
	if (key === "download") {
		// A plain navigation: the endpoint replies with Content-Disposition,
		// so the browser downloads rather than navigating away.
		window.location.href = downloadUrl(file);
	} else if (key === "delete") {
		removeFile(file);
	}
}

function downloadUrl(file: IBookFile): string {
	return `${PATH_PREFIX}/book/${props.book.getId()}/file/${file.id}/download`;
}

function formattedSize(file: IBookFile): string {
	const kb = file.file_size / 1024;
	return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function formattedDate(file: IBookFile): string {
	return new Date(file.date_created).toLocaleDateString();
}

const triggerFileSelect = () => {
	fileInput.value?.click();
};

const handleFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement;
	if (target.files && target.files[0]) {
		loadFile(target.files[0]);
	}
	target.value = "";
};

const handleDrop = (event: DragEvent) => {
	const files = event.dataTransfer?.files;
	if (files && files[0]) {
		loadFile(files[0]);
	}
};

async function loadFile(selectedFile: File) {
	const name = selectedFile.name.toLowerCase();
	if (!name.endsWith(".epub") && !name.endsWith(".pdf") && !name.endsWith(".mobi") && !name.endsWith(".azw3")) {
		appSnackbarController.show({message: t(AppLabels.ONLY_EBOOK_FILES_ALLOWED), type: SnackbarType.ERROR});
		return;
	}

	if (selectedFile.size > MAX_FILE_SIZE) {
		appSnackbarController.show({message: t(AppLabels.FILE_TOO_LARGE), type: SnackbarType.ERROR});
		return;
	}

	try {
		loading.value = true;
		await props.book.uploadFile(selectedFile);
	} finally {
		loading.value = false;
	}
}

async function removeFile(file: IBookFile) {
	confirmationDialogController.showDialog(
		t(AppLabels.DELETE_FILE),
		t(AppLabels.DELETE_FILE_DESC),
		t(AppLabels.DELETE)
	).then(async () => {
		try {
			deleteLoadingId.value = file.id;
			await props.book.removeFile(file.id);
		} finally {
			deleteLoadingId.value = null;
		}
	})
}
</script>

<style scoped>
/* A real button, styled back down to look like the row text it replaced. */
.pb-file-row-open {
	min-width: 0;
	min-height: 44px;
	padding: 4px 0;
	border-radius: var(--pb-radius-sm);
	background: none;
	border: none;
	text-align: left;
	font: inherit;
	color: inherit;
	cursor: pointer;
}

.pb-file-row-open:hover span:first-child,
.pb-file-row-open:focus-visible span:first-child {
	text-decoration: underline;
}

.pb-file-dropzone {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 16px;
	border: 1px dashed var(--pb-border);
	border-radius: var(--pb-radius);
	cursor: pointer;
}

.pb-file-dropzone-hover {
	background-color: rgba(var(--v-theme-primary), 0.08);
}
</style>
