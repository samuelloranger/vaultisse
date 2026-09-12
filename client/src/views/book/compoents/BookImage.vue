<template>
	<div class="book-image-container">
		<v-hover v-slot="{ isHovering, props }">
			<v-card
				v-bind="props"
				style="width: 100%; padding: 0"
				variant="text"
				@drop.prevent="handleDrop"
				@dragover.prevent
				@click="triggerFileSelect"
			>
				<v-img
					cover
					:aspect-ratio="2 / 3"
					:src="showFallbackImage ? notFound : (book.getImageUrl() ?? notFound)"
					@error="showFallbackImage = true"
				>
					<!--
						The whole overlay used to be `v-if="isHovering || loading"`.
						There is no hover on touch, so on a phone nothing ever
						indicated the cover was tappable at all - the click
						handler worked, but only by accident of discovery.
						Below `md` it renders persistently, as a compact badge
						pinned to the corner rather than a full-bleed panel, so
						it advertises the action without hiding the cover.
					-->
					<v-expand-transition>
						<div
							v-if="isHovering || loading"
							class="book-image-hover"
						>
							<v-progress-circular
								v-if="loading"
								color="white"
								size="60"
								indeterminate
							/>

							<template v-else>
								<v-icon size="60">mdi-plus</v-icon>
								<span style="font-size: 20px; font-weight: bold; padding: 0 20px; text-align: center">{{t(AppLabels.IMAGE_DRAG_AND_DROP)}}</span>
							</template>
						</div>
					</v-expand-transition>

					<div
						v-if="!mdAndUp && !loading"
						class="book-image-touch-badge"
					>
						<v-icon size="18" class="mr-1">mdi-camera-plus-outline</v-icon>
						<span>{{ t(AppLabels.EDIT) }}</span>
					</div>
				</v-img>
				<!-- Hidden file input for click selection -->
				<input
					ref="fileInput"
					type="file"
					accept="image/*"
					style="display: none"
					@change="handleFileSelect"
				/>
			</v-card>
		</v-hover>
		<!-- "Hover to change..." is untrue on touch; the badge above says it instead. -->
		<div
			v-if="mdAndUp"
			style="text-align: center; width: 100%; color: var(--pb-text-muted); font-size: 14px"
		>{{t(AppLabels.BOOK_HOVER_INFO)}}</div>
	</div>
</template>

<script setup lang="ts">
/**
 * Book cover on the book detail view: click or drag-and-drop an image
 * to replace it (via `Book.changeImage`); falls back to a placeholder
 * image if there's no cover or it fails to load.
 */
import Book from "@/model/book/Book";
import notFound from "@/assets/images/notFound.jpg";
import { ref, Ref } from "vue";
import {useI18n} from "vue-i18n";
import {useDisplay} from "vuetify";
import {AppLabels} from "@/plugins/i18n/AppLabels";

const {t} = useI18n();

const {mdAndUp} = useDisplay();

interface Props {
	book: Book;
}

const props = defineProps<Props>();

const loading: Ref<boolean> = ref(false);

const showFallbackImage: Ref<boolean> = ref(false);

const fileInput = ref<HTMLInputElement | null>(null);

// Trigger hidden file input
const triggerFileSelect = () => {
	fileInput.value?.click();
};

// Handle file selected via click
const handleFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement;
	if (target.files && target.files[0]) {
		loadImage(target.files[0]);
	}
};

// Handle drag & drop
const handleDrop = (event: DragEvent) => {
	const files = event.dataTransfer?.files;
	if (files && files[0]) {
		loadImage(files[0]);
	}
};

// Read and display the selected image
async function loadImage(file: File) {
	try {
		loading.value = true;
		await props.book.changeImage(file);
	} finally {
		loading.value = false;
	}
};
</script>

<style scoped>
.book-image-container {
	max-width: 240px;
	margin: 0 auto;
}

/* Above the `md` breakpoint the image sits in its own narrow sidebar
   column, so let it fill that column instead of staying capped. */
@media (min-width: 960px) {
	.book-image-container {
		max-width: none;
		margin: 0;
	}
}

/*
 * The persistent touch affordance. Sits over the cover's bottom-left corner
 * rather than replacing the whole image, so it's visible at a glance without
 * costing the user sight of the cover they're about to change.
 */
.book-image-touch-badge {
	position: absolute;
	left: 8px;
	bottom: 8px;
	display: inline-flex;
	align-items: center;
	min-height: 36px;
	padding: 0 12px;
	border-radius: 999px;
	font-size: 13px;
	font-weight: 600;
	color: #fff;
	background: rgba(var(--v-theme-primary), 0.92);
	pointer-events: none;
}

.book-image-hover {
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	color: white;
	cursor: pointer;
	background-color: rgba(var(--v-theme-primary), 0.92);
}
</style>
