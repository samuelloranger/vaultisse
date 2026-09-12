<template>
	<v-app>
		<div
			v-if="applicationService.isLoading()"
			class="app-boot"
		>
			<v-icon size="34" color="primary" class="mb-3">mdi-book-open-page-variant</v-icon>
			<v-progress-circular
				color="primary"
				indeterminate
				size="26"
				width="2"
			/>
		</div>

		<div
			v-else-if="applicationService.hasError()"
			class="app-boot app-boot--error"
		>
			<v-icon size="34" color="error" class="mb-3">mdi-book-alert-outline</v-icon>
			<p>{{ applicationService.getError()!.message }}</p>
		</div>

		<template v-else>
			<!-- ================================================== -->
			<!-- APP MENU											-->
			<!-- ================================================== -->
			<app-menu/>

			<!-- ================================================== -->
			<!-- APP BAR											-->
			<!-- ================================================== -->
			<app-bar/>

			<v-main class="app-main" id="scroller">
				<!-- Content -->
				<router-view/>

				<!-- ================================================== -->
				<!-- APP DIALOGS										-->
				<!-- ================================================== -->
				<confirmation-dialog/>
				<app-snackbar/>
				<error-dialog/>
				<cookie-consent-dialog/>
				<terms-of-service-dialog/>
				<security-notice-dialog/>
			</v-main>

			<!-- ================================================== -->
			<!-- APP FOOTER											-->
			<!-- ================================================== -->
			<app-footer/>
		</template>
	</v-app>
</template>

<script setup lang="ts">
/**
 * Application root component. Renders a loading spinner while
 * `ApplicationService.fetchPolicy()` (kicked off on mount) is in flight, an
 * error state if it failed, or the app shell (menu, top bar, footer,
 * router-view content, and the app-wide dialog/snackbar singletons) once ready.
 */
import {onMounted, watch} from 'vue';
import AppBar from "@/components/app/AppBar.vue";
import AppMenu from "@/components/app/AppMenu.vue";
import {applicationService} from "@/service/ApplicationService";
import ConfirmationDialog from "@/components/confirmationDialog/ConfirmationDialog.vue";
import AppSnackbar from "@/components/appSnackbar/AppSnackbar.vue";
import ErrorDialog from "@/components/errorDialog/ErrorDialog.vue";
import AppFooter from "@/components/app/AppFooter.vue";
import CookieConsentDialog from "@/components/cookieConsent/CookieConsentDialog.vue";
import TermsOfServiceDialog from "@/components/termsOfService/TermsOfServiceDialog.vue";
import SecurityNoticeDialog from "@/components/securityNotice/SecurityNoticeDialog.vue";
import {applyTheme} from "@/plugins/theme";

onMounted(async () => {
	await applicationService.fetchPolicy();

	if (!applicationService.hasError()) {
		applyTheme(applicationService.getUser().getTheme());

		// Keep the shell in sync if the user switches theme in Settings.
		watch(() => applicationService.getUser().getTheme(), (theme) => applyTheme(theme));
	}
})
</script>

<style>
/*
 * `100dvh` (the *dynamic* viewport) is what's actually visible right now on a
 * mobile browser; `100vh` is the *large* viewport - the height the page would
 * have if the URL bar were fully retracted, i.e. 60-100px taller than the
 * window for most of a session. Since the shell is also `overflow: hidden`,
 * sizing it to `100vh` pushes that extra strip below the fold with no way to
 * ever scroll it into view. The `100vh` line stays first purely as the
 * fallback for engines that don't understand `dvh` (they ignore the second
 * declaration); every current browser takes the `100dvh` one.
 */
html, body {
	height: 100vh;
	height: 100dvh;
	overflow: hidden !important;
}

/*
 * Same two-line fallback rather than `height: 100%`: `#app` is a child of
 * `body`, so `100%` would resolve against body's height and inherit the fix -
 * but only as long as nothing in between grows. Pinning it to the dynamic
 * viewport directly keeps the app shell exactly one screen tall regardless.
 */
#app {
	height: 100vh;
	height: 100dvh;
	overflow: hidden;
}

/*
 * Deliberately NOT display:flex here: Vuetify reserves space for the fixed
 * app-bar/drawer/footer via padding-* (--v-layout-*) on this same element,
 * and flex containers with overflow:auto ignore their own padding-bottom
 * once scrolled (a long-standing Chromium/Firefox bug) - the last ~footer's
 * worth of content would get clipped under the fixed footer. Plain block
 * layout respects the padding correctly.
 */
.app-main {
	height: 100%;
	overflow: auto;
}

.app-boot {
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: var(--pb-bg);
	color: var(--pb-text-muted);
}

.app-boot--error {
	color: var(--pb-text);
}

.app-boot--error p {
	font-family: var(--pb-font-body);
	max-width: 420px;
	text-align: center;
	margin: 0 16px;
}
</style>
