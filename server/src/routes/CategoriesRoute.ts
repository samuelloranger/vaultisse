/**
 * =============================================================================
 * CategoriesRoute
 * =============================================================================
 * Mounted at `/api/rest/category`. CRUD for the shared library's book
 * `categories` (genres/shelving sections). All routes require auth; none are
 * scoped to the caller, since there is one shared library that every account
 * co-manages. `created_by` is stamped on insert as attribution only and never
 * filtered on.
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/AuthMiddleware";
import { appService } from "../AppService";

const router = Router();

/**
 * GET /category
 * --------------
 * List every category in the shared library.
 *
 * Auth: required.
 *
 * Example response (200): [{ "id": 3, "name": "Fantasy" }]
 */
// @ts-ignore
router.get("", requireAuth, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const client = await pool.connect();

    try {
        const result = await client.query(`
            SELECT id,
                   name
              FROM categories
        `);
        res.status(200).json(result.rows);
    } catch (err: any) {
        console.error("Error executing query", err.stack);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

/**
 * POST /category
 * ----------------
 * Create a new category.
 *
 * Auth: required. Body: { "name": "Fantasy" }
 *
 * Example response (200): { "id": 3, "name": "Fantasy" }
 */
// @ts-ignore
router.post("", requireAuth, async (req: Request, res: Response) => {
    const name = req.body.name;

    const pool = appService.getDatabasePool();
    const client = await pool.connect();
    const userId = appService.getSessionUser(req);

    try {
        appService.getLogger().debug(`Adding category with name ${name}`);
        const insertCategory = await client.query(
            "INSERT INTO categories (name, created_by) VALUES ($1, $2) RETURNING id",
            [name, userId]
        );

        // fetch new data
        const result = await pool.query(
            `
            SELECT categories.id,
                   categories.name
            FROM categories
            WHERE categories.id = $1
        `,
            [insertCategory.rows[0].id]
        );

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Transaction error:", error);
        res.status(500).send("Error adding category");
    } finally {
        client.release();
    }
});

/**
 * PUT /category/:id
 * -------------------
 * Rename a category.
 *
 * Auth: required. Path param `id` {number}. Body: { "name": "..." }
 *
 * Example response (200): { "id": 3, "name": "..." }
 */
// @ts-ignore
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
    const categoryId = req.params.id;
    if (!categoryId) {
        return res.status(400).send("No category ID provided");
    }

    // Body params
    const { name } = req.body;

    const pool = appService.getDatabasePool();

    try {
        appService.getLogger().debug(`Updating category ${categoryId}`);

        const queryResult = await pool.query("UPDATE categories SET name = $1 WHERE id = $2", [name, categoryId]);

        if (queryResult.rowCount !== 1) {
            return res.status(500).send();
        }

        const categoryQueryResult = await pool.query(
            `SELECT categories.id,
                    categories.name
              FROM categories
             WHERE categories.id = $1
             `,
            [categoryId]
        );

        res.status(200).json(categoryQueryResult.rows[0]);
    } catch (error) {
        // Rollback on error
        console.error("Transaction error:", error);
        res.status(500).send("Error updating the category");
    }
});

/**
 * DELETE /category/:id
 * ----------------------
 * Delete a category.
 *
 * Auth: required. Path param `id` {number}.
 *
 * Responses: 200 {"message": "Category deleted successfully"} | 404 {"error": "Category not found"}.
 */
// @ts-ignore
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    appService.getLogger().debug(`Delete category, id: ${id}`);

    // Database connection
    const pool = appService.getDatabasePool();
    const client = await pool.connect();

    try {
        // Validate the existence of the book
        const categoryCheck = await client.query("SELECT id FROM categories WHERE id = $1", [id]);
        if (categoryCheck.rowCount === 0) {
            return res.status(404).send({ error: "Category not found" });
        }

        await client.query("DELETE FROM categories WHERE id = $1", [id]);

        res.send({ message: "Category deleted successfully" });
    } catch (e) {
        console.error("Error while deleting category", e);
        res.status(500).send("Internal Server Error");
    } finally {
        client.release();
    }
});

export default router;
