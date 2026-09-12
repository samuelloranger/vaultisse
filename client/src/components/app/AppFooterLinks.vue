<template>
	<component :is="stacked ? 'div' : 'span'" :class="stacked ? 'app-footer-links--stacked' : undefined">
		<router-link :to="legalRoute.getPath('privacy-policy')">{{ uiLabels.footerPrivacyPolicy }}</router-link>
		<router-link :to="legalRoute.getPath('terms-of-service')">{{ uiLabels.footerTermsOfService }}</router-link>
		<router-link :to="legalRoute.getPath('cookie-policy')">{{ uiLabels.footerCookiePolicy }}</router-link>
	</component>
</template>

<script setup lang="ts">
/**
 * The three legal document links, shared by the desktop `AppFooter` and the
 * nav drawer's bottom block on phones - the one place they live on a small
 * screen, since the `app`-positioned footer is hidden there.
 *
 * `stacked` renders them as full-width rows with a real touch height, for the
 * drawer; the default inline shape is what the footer wants.
 */
import {computed} from "vue";
import {useI18n} from "vue-i18n";
import {legalUiLabels, normalizeLegalLocale} from "@/views/legal/legalData";
import {legalRoute} from "@/router/routes/LegalRoute";

interface Props {
	stacked?: boolean;
}

withDefaults(defineProps<Props>(), {
	stacked: false,
});

const {locale} = useI18n();

const uiLabels = computed(() => legalUiLabels[normalizeLegalLocale(locale.value)]);
</script>

<style scoped>
.app-footer-links--stacked {
	display: flex;
	flex-direction: column;
}

.app-footer-links--stacked a {
	display: flex;
	align-items: center;
	min-height: 44px;
	padding: 0 8px;
	border-radius: 8px;
	font-size: 12.5px;
	color: var(--pb-nav-text-muted);
	text-decoration: none;
}

.app-footer-links--stacked a:hover,
.app-footer-links--stacked a:focus-visible {
	background: var(--pb-nav-active-bg);
	color: var(--pb-nav-accent);
}
</style>
