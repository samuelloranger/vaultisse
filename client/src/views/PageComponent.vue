<template>
	<div class="app-content">
		<!-- ================================================== -->
		<!-- PAGE BAR											-->
		<!-- ================================================== -->
		<v-toolbar
			density="compact"
			elevation="0"
			style="position: sticky; top: 0; left: 0; z-index: 2"
			class="page-toolbar"
		>
			<!-- Page name -->
			<h4 class="page-toolbar-title pb-display">{{ model.getPageName() }}</h4>

			<slot name="prepend"></slot>

			<v-spacer></v-spacer>

			<slot name="append"></slot>
		</v-toolbar>

		<v-container
			style="display: flex; flex-direction: column; flex: 1; min-height: 0"
		>
			<v-overlay
				v-if="model.isLoading()"
				:opacity="0"
				absolute
			>
				<v-progress-circular
					color="primary"
					indeterminate
				/>
			</v-overlay>

			<v-alert
				v-else-if="model.hasError()"
				type="error"
			>
				{{ model.getError().message }}
			</v-alert>

			<template v-else-if="model.hasData()">
				<slot></slot>
			</template>
		</v-container>
	</div>
</template>

<script setup lang="ts">
/**
 * Standard page shell used by every top-level view: a sticky toolbar
 * (page title + `prepend`/`append` action slots) and a content area that
 * shows a loading spinner, an error alert, or the default slot, driven by
 * the given `BaseController` subclass's state.
 */
import {BaseController} from "@/controller/BaseController";

interface Props {
	model: BaseController<any>
}

const props = defineProps<Props>()

</script>

<style scoped lang="scss">
.app-content {
	position: relative;
	display: flex !important;
	flex-direction: column !important;
	min-height: 100%;
}

/*
 * The toolbar sizes to its content, with 52px as a *floor* rather than a cap.
 * A page's prepend/append slots (filters, sort selects, action buttons) can
 * easily add up to more than a phone screen's width, so the row wraps to a
 * second line - which only works if the box is allowed to grow with it. The
 * old `height: 52px !important` (repeated on `.v-toolbar__content`) clipped
 * exactly that, so a wrapped second row, or any single control taller than
 * 52px, spilled out past the header's bottom border.
 */
.page-toolbar {
	height: auto !important;
	min-height: 52px;
	background: var(--pb-surface) !important;
	border-bottom: 1px solid var(--pb-border);

	/*
	 * Gutter parity with the `v-container` below. That container is a plain
	 * Vuetify one: 16px of padding, centred, and capped at a per-breakpoint
	 * max-width (`$container-max-widths` = breakpoint * 0.9375). The toolbar
	 * spans the full width of `v-main`, so its *content* has to repeat the
	 * same box for the page title to start at the same x as the content
	 * beneath it. Previously it used a flat 24px (12px on phones) against
	 * the container's 16px and ignored the max-width entirely, so the title
	 * and the first card were misaligned at every width.
	 */
	:deep(.v-toolbar__content) {
		height: auto !important;
		min-height: 52px;
		width: 100%;
		margin-inline: auto;
		flex-wrap: wrap;
		row-gap: 8px;
		padding: 8px 16px;
	}

	@media (min-width: 960px) {
		:deep(.v-toolbar__content) { max-width: 900px; }
	}

	@media (min-width: 1280px) {
		:deep(.v-toolbar__content) { max-width: 1200px; }
	}

	@media (min-width: 1920px) {
		:deep(.v-toolbar__content) { max-width: 1800px; }
	}

	@media (min-width: 2560px) {
		:deep(.v-toolbar__content) { max-width: 2400px; }
	}

	.page-toolbar-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		color: var(--pb-text);
	}

	/*
	 * The compact 32px toolbar button is a *pointer* affordance: it reads as
	 * dense and precise with a mouse, and is well under the ~44px minimum a
	 * fingertip needs. Applied at every width it was the single biggest
	 * source of undersized touch targets in the app, because every page's
	 * primary action ("Add", "Scan", the sort/group toggles) lives in this
	 * toolbar. Above the `sm` breakpoint - i.e. where a pointer is the likely
	 * input - keep it; on phones let Vuetify's own default height stand.
	 */
	@media (min-width: 601px) {
		:deep(.v-btn) {
			height: 32px !important;
			min-height: 32px !important;
			font-size: 13px;

			&.v-btn--icon {
				width: 32px !important;
			}
		}

		:deep(.v-btn__content) {
			font-size: 13px;
		}
	}

	@media (max-width: 600px) {
		:deep(.v-btn) {
			min-height: 44px;
		}

		:deep(.v-btn--icon) {
			min-width: 44px;
		}
	}

	:deep(.v-btn .v-icon) {
		font-size: 18px;
	}

	:deep(.v-chip) {
		height: 22px !important;
		font-size: 11px;
	}

	:deep(.v-divider--vertical) {
		margin-top: 4px;
		margin-bottom: 4px;
	}
}
</style>