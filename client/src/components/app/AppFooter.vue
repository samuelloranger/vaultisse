<template>
	<!--
		Phones get `AppFooterLinks` inside the nav drawer instead (see
		AppMenu.vue). This footer is `app`-positioned, so Vuetify permanently
		reserves its height out of the layout - ~90px of an already-short
		viewport, on every screen including the barcode scanner, for three
		links nobody navigates to mid-task.
	-->
	<v-footer
		v-if="!smAndDown"
		app
		border="t"
		class="app-footer px-5"
	>
		<span class="text-medium-emphasis">© {{ year }} {{ uiLabels.footerCopyright }}</span>

		<v-spacer></v-spacer>

		<app-footer-links class="app-footer-links"/>
	</v-footer>
</template>

<script setup lang="ts">
/**
 * App-wide footer: copyright line and links to the legal documents (see
 * LegalRoute/legalData.ts). Rendered above the `sm` breakpoint only - the
 * same links live in the nav drawer's bottom block on phones.
 */
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {useDisplay} from "vuetify";
import {legalUiLabels, normalizeLegalLocale} from "@/views/legal/legalData";
import AppFooterLinks from "@/components/app/AppFooterLinks.vue";

const {locale} = useI18n();

const {smAndDown} = useDisplay();

const year = new Date().getFullYear();

const uiLabels = computed(() => legalUiLabels[normalizeLegalLocale(locale.value)]);
</script>

<style scoped lang="scss">
.app-footer {
	font-size: 13px;
	min-height: 40px !important;
	height: 40px;
	background: var(--pb-surface) !important;
	color: var(--pb-text-muted);

	:deep(a) {
		margin-left: 20px;
		color: inherit;
		text-decoration: none;

		&:hover {
			color: var(--pb-primary);
			text-decoration: underline;
		}
	}
}

.app-footer-links {
	display: flex;
	align-items: center;
}
</style>
