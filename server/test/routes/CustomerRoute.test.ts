import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser, ITestUser} from "../helpers/auth";

const app = setupTestApp();

let user: ITestUser;

beforeAll(async () => {
    user = await createAuthenticatedUser(app);
});

describe("customer groups", () => {
    it("creates, lists, renames and deletes a group", async () => {
        const createRes = await user.agent.post("/api/rest/customer/group").send({name: "Class 4B"});
        expect(createRes.status).toBe(201);
        const id = createRes.body.id;

        const listRes = await user.agent.get("/api/rest/customer/group");
        expect(listRes.body.some((g: any) => g.id === id && g.total_customers === 0)).toBe(true);

        const renameRes = await user.agent.put(`/api/rest/customer/group/${id}`).send({name: "Class 5B"});
        expect(renameRes.status).toBe(200);

        const deleteRes = await user.agent.delete(`/api/rest/customer/group/${id}`);
        expect(deleteRes.status).toBe(200);
    });

    it("rejects an empty group name", async () => {
        const res = await user.agent.post("/api/rest/customer/group").send({name: "   "});
        expect(res.status).toBe(400);
    });

    it("409s creating a group with a name already in use", async () => {
        await user.agent.post("/api/rest/customer/group").send({name: "Duplicate Group"});
        const res = await user.agent.post("/api/rest/customer/group").send({name: "Duplicate Group"});
        expect(res.status).toBe(409);
    });

    // unique_customer_group_name is instance-wide now, so "already in use"
    // means anywhere in the shared library, not just among the caller's rows.
    it("409s creating a group with a name another account already used", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const name = `Cross Account Group ${Date.now()}`;

        const first = await user.agent.post("/api/rest/customer/group").send({name});
        expect(first.status).toBe(201);

        const res = await otherUser.agent.post("/api/rest/customer/group").send({name});
        expect(res.status).toBe(409);

        await user.agent.delete(`/api/rest/customer/group/${first.body.id}`);
    });
});

describe("customer CRUD and group assignment", () => {
    it("creates, renames, assigns/unassigns a group, and deletes a customer", async () => {
        const groupId = (await user.agent.post("/api/rest/customer/group").send({name: "Assignable Group"})).body.id;
        const createRes = await user.agent.post("/api/rest/customer").send({name: "Jane Doe"});
        expect(createRes.status).toBe(200);
        const customerId = createRes.body.id;

        const assignRes = await user.agent.put(`/api/rest/customer/${customerId}/group/${groupId}`);
        expect(assignRes.status).toBe(200);
        expect(assignRes.body.group_id).toBe(groupId);

        const unassignRes = await user.agent.delete(`/api/rest/customer/${customerId}/group`);
        expect(unassignRes.status).toBe(200);
        expect(unassignRes.body.group_id).toBeNull();

        const renameRes = await user.agent.put(`/api/rest/customer/${customerId}`).send({name: "Jane Smith"});
        expect(renameRes.status).toBe(200);
        expect(renameRes.body.name).toBe("Jane Smith");

        const listRes = await user.agent.get("/api/rest/customer");
        expect(listRes.body.customers.some((c: any) => c.id === customerId)).toBe(true);

        const deleteRes = await user.agent.delete(`/api/rest/customer/${customerId}`);
        expect(deleteRes.status).toBe(200);
    });

    // Inverted from upstream's "404s assigning to a group that doesn't belong
    // to the user". Groups and customers are shared: anyone can put anyone in
    // any group, and everyone sees the result.
    it("assigns a customer to a group another account created", async () => {
        const otherUser = await createAuthenticatedUser(app);
        const otherGroupId = (await otherUser.agent.post("/api/rest/customer/group").send({name: `Theirs ${Date.now()}`})).body.id;
        const customerId = (await user.agent.post("/api/rest/customer").send({name: "Test"})).body.id;

        const res = await user.agent.put(`/api/rest/customer/${customerId}/group/${otherGroupId}`);
        expect(res.status).toBe(200);
        expect(res.body.group_id).toBe(otherGroupId);

        const otherListRes = await otherUser.agent.get("/api/rest/customer");
        expect(otherListRes.body.customers.some((c: any) => c.id === customerId && c.group_id === otherGroupId)).toBe(true);

        await user.agent.delete(`/api/rest/customer/${customerId}`);
    });

    // Still 404 - not ownership, just a group id that names nothing.
    it("404s assigning to a group that doesn't exist", async () => {
        const customerId = (await user.agent.post("/api/rest/customer").send({name: "Test"})).body.id;
        const res = await user.agent.put(`/api/rest/customer/${customerId}/group/999999999`);
        expect(res.status).toBe(404);
        await user.agent.delete(`/api/rest/customer/${customerId}`);
    });
});

describe("lending and returning books via a customer", () => {
    it("lends a book to a customer and returns it", async () => {
        const customerId = (await user.agent.post("/api/rest/customer").send({name: "Borrower"})).body.id;
        const locationId = (await user.agent.post("/api/rest/location").send({name: "Shelf", description: ""})).body.id;
        const bookId = (await user.agent.post("/api/rest/book").field("name", "Lendable Book")).body;
        const stockRes = await user.agent.post(`/api/rest/book/${bookId}/stock`).send({status: 0, location_id: locationId});
        const stockCode = stockRes.body.code;

        const lendRes = await user.agent.post(`/api/rest/customer/${customerId}/add/books`).send({books: [stockCode]});
        expect(lendRes.status).toBe(200);
        expect(lendRes.body.some((b: any) => b.code === stockCode)).toBe(true);

        const returnRes = await user.agent.delete(`/api/rest/customer/${customerId}/book/${stockCode}`);
        expect(returnRes.status).toBe(200);

        // By id, not stocks[0]: POST /book auto-places a copy when the shared
        // library happens to have exactly one location, so this book may carry
        // a stock this test never created.
        const bookRes = await user.agent.get(`/api/rest/book/${bookId}`);
        const stock = bookRes.body.stocks.find((s: any) => s.code === stockCode);
        expect(stock).toMatchObject({status: 0, customer_id: null});
    });

    // Anyone can lend out and take back any copy, and the loan is visible to
    // every account - one household, one set of borrowed books.
    it("lets another account return a book this one lent out, and both see it", async () => {
        const otherUser = await createAuthenticatedUser(app);

        const customerId = (await user.agent.post("/api/rest/customer").send({name: `Shared Borrower ${Date.now()}`})).body.id;
        const locationId = (await user.agent.post("/api/rest/location").send({name: `Shared Shelf ${Date.now()}`, description: ""})).body.id;
        const bookId = (await user.agent.post("/api/rest/book").field("name", "Co-managed Book")).body;
        const stockCode = (await user.agent.post(`/api/rest/book/${bookId}/stock`).send({status: 0, location_id: locationId})).body.code;

        const lendRes = await user.agent.post(`/api/rest/customer/${customerId}/add/books`).send({books: [stockCode]});
        expect(lendRes.status).toBe(200);

        // The other account sees the outstanding loan without being told about it.
        const theirView = await otherUser.agent.get(`/api/rest/customer/${customerId}/books`);
        expect(theirView.body.some((b: any) => b.code === stockCode)).toBe(true);

        // ...and can take it back.
        const returnRes = await otherUser.agent.delete(`/api/rest/customer/${customerId}/book/${stockCode}`);
        expect(returnRes.status).toBe(200);

        const afterView = await user.agent.get(`/api/rest/customer/${customerId}/books`);
        expect(afterView.body.some((b: any) => b.code === stockCode)).toBe(false);
    });
});
