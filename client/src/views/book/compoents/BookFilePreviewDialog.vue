<template>
	<v-dialog v-model="dialog" :fullscreen="fullscreen" max-width="900">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon size="22" class="mr-2" color="primary">{{ fileIcon }}</v-icon>
				<span class="text-truncate flex-grow-1">{{ file.file_name }}</span>
				<!--
					Pointer-only affordance otherwise: the tooltip is the button's
					only label, and a tooltip never opens on touch. The visible
					icon does carry the state, but the accessible name has to be
					on the button itself.
				-->
				<v-btn
					v-if="!smAndDown"
					icon
					variant="text"
					density="comfortable"
					:aria-label="t(fullscreen ? AppLabels.EXIT_FULLSCREEN : AppLabels.FULLSCREEN)"
					@click="fullscreen = !fullscreen"
				>
					<v-icon>{{ fullscreen ? "mdi-fullscreen-exit" : "mdi-fullscreen" }}</v-icon>
					<v-tooltip activator="parent" location="bottom">
						{{ t(fullscreen ? AppLabels.EXIT_FULLSCREEN : AppLabels.FULLSCREEN) }}
					</v-tooltip>
				</v-btn>
				<v-btn
					icon
					variant="text"
					density="comfortable"
					:aria-label="t(AppLabels.CLOSE)"
					@click="dialog = false"
				>
					<v-icon>mdi-close</v-icon>
				</v-btn>
			</v-card-title>

			<v-card-text :class="{'pb-file-preview-dialog-content': fullscreen}">
				<book-file-preview :key="file.id" :book="book" :file="file"/>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
/**
 * Modal preview for a single book file (see `BookFile.vue`'s file list),
 * wrapping `BookFilePreview` with a title bar and a fullscreen toggle -
 * the underlying preview fills whatever height its container gives it, so
 * fullscreen mode just stretches that container via CSS.
 */
import {computed, ref, Ref, watch} from "vue";
import {useDisplay} from "vuetify";
import Book from "@/model/book/Book";
import {IBookFile} from "@/types/book/IBookFile";
import BookFilePreview from "@/views/book/compoents/BookFilePreview.vue";
import {useI18n} from "vue-i18n";
import {AppLabels} from "@/plugins/i18n/AppLabels";

const {t} = useI18n();

interface Props {
	book: Book;
	file: IBookFile;
	modelValue: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void
}>()

const dialog = computed({
	get: () => props.modelValue,
	set: (val: boolean) => emit('update:modelValue', val),
})

const {smAndDown} = useDisplay();

/**
 * Defaults to on below `sm`. A windowed preview on a phone leaves a document
 * pane a couple of hundred pixels tall inside an already-small screen; there
 * is no windowed layout worth having there, so the toggle is hidden and
 * fullscreen is simply the mode.
 */
const fullscreen: Ref<boolean> = ref(smAndDown.value);

watch(smAndDown, (isSmall) => {
	fullscreen.value = isSmall;
});

const fileIcon = props.file.file_type === "epub" ? "mdi-book-open-page-variant-outline"
	: props.file.file_type === "pdf" ? "mdi-file-pdf-box"
		: "mdi-tablet";
</script>

<style scoped>
.pb-file-preview-dialog-content {
	height: calc(100% - 64px);
}

.pb-file-preview-dialog-content :deep(.pb-file-preview) {
	height: 100%;
}
</style>
