/**
 * Registry of all authenticated REST routers, keyed by the path segment
 * they're mounted under. `AppService.__loadRoutes()` iterates this map and
 * mounts each router at `/api/rest` + key, e.g. `routes["/book"]` becomes
 * `/api/rest/book`. (The unauthenticated `AuthRoute` is mounted separately,
 * directly at `/`.)
 */
import { Router } from "express";
import AppRoute from "./AppRoute";
import BooksRoute from "./BooksRoute";
import LocationRoute from "./LocationRoute";
import AuthorRoute from "./AuthorRoute";
import CategoriesRoute from "./CategoriesRoute";
import UserRoute from "./UserRoute";
import DashboardRoute from "./DashboardRoute";
import CustomerRoute from "./CustomerRoute";
import LoansRoute from "./LoansRoute";
import ImportRoute from "./import-export/ImportRoute";
import AdminUsersRoute from "./admin/AdminUsersRoute";
import AdminSettingsRoute from "./admin/AdminSettingsRoute";

export const routes: Record<string, Router> = {
    "/app": AppRoute,
    "/dashboard": DashboardRoute,
    "/book": BooksRoute,
    "/location": LocationRoute,
    "/customer": CustomerRoute,
    "/author": AuthorRoute,
    "/category": CategoriesRoute,
    "/user": UserRoute,
    "/loans": LoansRoute,
    "/import": ImportRoute,
    // Admin-only; every route inside is gated by requireAdmin, not requireAuth.
    "/admin/users": AdminUsersRoute,
    // Instance-wide settings (app_settings). Also admin-only - these change
    // the app for every account, which is why they do not live under /user.
    "/admin/settings": AdminSettingsRoute,
};
