/**
 * Vue Router instance for the SPA, mounted under the `/app` base path
 * (matches the server-side catch-all in server/src/routes/AuthRoute.ts that
 * serves index.html for any `/app/*` request, enabling deep-linking/refresh).
 * Each entry delegates to a `router/routes/*Route.ts` singleton's `getRoute()`.
 */
import { watch } from 'vue'
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import {searchRoute} from "@/router/routes/SearchRoute";
import {DashboardRoute, dashboardRoute} from "@/router/routes/DashboardRoute";
import {bookRoute} from "@/router/routes/BookRoute";
import {notFoundRoute} from "@/router/routes/NotFoundRoute";
import {locationsRoute} from "@/router/routes/LocationsRoute";
import {categoriesRoute} from "@/router/routes/CategoriesRoute";
import {settingsRoute} from "@/router/routes/SettingsRoute";
import {customersRoute} from "@/router/routes/CustomersRoute";
import {authorsRoute} from "@/router/routes/AuthorsRoute";
import {loansRoute} from "@/router/routes/LoansRoute";
import {legalRoute} from "@/router/routes/LegalRoute";
import {applicationService} from "@/service/ApplicationService";

// Define your routes
const routes: Array<RouteRecordRaw> = [
    {
        path: '/',
        redirect: DashboardRoute.PATH,
    },
    dashboardRoute.getRoute(),
    searchRoute.getRoute(),
    bookRoute.getRoute(),
    locationsRoute.getRoute(),
    categoriesRoute.getRoute(),
    customersRoute.getRoute(),
    authorsRoute.getRoute(),
    loansRoute.getRoute(),
    settingsRoute.getRoute(),
    legalRoute.getRoute(),

    // Not found
    notFoundRoute.getRoute(),
]

// Create the router instance
const router = createRouter({
    history: createWebHistory('/app'),
    routes,
})

/**
 * Resolves once `ApplicationService.fetchPolicy()` has settled, either way.
 *
 * The guard below reads `applicationService.getUser()`, which is only
 * populated by that fetch - and the fetch is kicked off from `App.vue`'s
 * `onMounted`, which runs *after* the router has already begun resolving the
 * first navigation. On an in-app navigation that's invisible (the policy
 * loaded long ago), but on a hard load or a bookmarked link straight to
 * /app/loans or /app/customers the guard ran against an undefined user and
 * threw `Cannot read properties of undefined (reading 'isLeasingEnabled')`.
 * A throw inside `beforeEach` aborts the navigation, so the router never
 * rendered anything and the page came up completely blank - no toolbar, no
 * content, not even the not-found view.
 *
 * `isLoading()` is backed by a Vue ref, so watching the getter is enough to
 * be woken when the fetch settles.
 */
function policySettled(): Promise<void> {
    if (!applicationService.isLoading()) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const stop = watch(
            () => applicationService.isLoading(),
            (loading) => {
                if (!loading) {
                    stop();
                    resolve();
                }
            },
        );
    });
}

/**
 * Defense-in-depth only: the server already gates every /app/* request on a
 * valid session cookie (httpOnly, so it can't be inspected here directly),
 * so this can't be the sole auth check. It closes the gap where a session
 * expires *after* the SPA has loaded - without this, a client-side
 * navigation between routes would briefly render a protected view's shell
 * before its own data fetch failed with 401. If the last policy fetch
 * failed (see ApplicationService.fetchPolicy), send the user to the
 * server-rendered /login page instead of letting the SPA render further.
 */
/*
 * Written in the return-value form rather than with a `next` callback: an
 * async guard has to be, because vue-router decides which convention a guard
 * uses from its arity, and a three-argument guard that also returns a promise
 * is rejected outright ("Invalid navigation guard").
 */
router.beforeEach(async (to) => {
    // Every check below depends on the policy payload, so wait for it rather
    // than reading through a half-initialised service.
    await policySettled();

    if (applicationService.hasError()) {
        window.location.href = "/login";
        return false;
    }

    // The Loans and Customers pages are opt-in (see Settings > Features).
    // Their nav items are already hidden when disabled (see AppMenu.vue) -
    // this stops a direct/bookmarked link from reaching them regardless.
    const leasingPaths: string[] = [customersRoute.getPath(), loansRoute.getPath()];
    if (leasingPaths.includes(to.path) && !applicationService.getUser().isLeasingEnabled()) {
        return DashboardRoute.PATH;
    }

    return true;
});

export default router