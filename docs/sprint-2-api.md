# Sprint 2 API contract (stories #4–#7)

The endpoints behind the sprint goal: *a manager can see all open requests and assign one to a technician, and that technician can see it, update its status through to "Resolved," and add notes.*

Everything is under `http://localhost:4000/api` and needs `Authorization: Bearer <token>` (the frontend's `apiClient` adds it). Errors always come back as `{ "error": "message" }`:

- **401**: not logged in or bad token
- **403**: logged in, but your role or relationship to the request doesn't allow it
- **400**: bad input
- **404**: request not found

The tests in `backend/tests/sprint2.test.ts` check every rule below. All of them are built, so every test is a real pass/fail (no TODOs left).

## Statuses

Defined once in `backend/src/lib/status.ts` (`STATUS`, `isOpen`, `NEXT_STATUS`, `canMoveTo`). Import from there instead of retyping the strings.

```
Submitted --(manager assigns, #5)--> Assigned --(technician, #7)--> In Progress --(technician, #7)--> Resolved
```

A request is **open** until it's `Resolved`.

## Shapes

`person` = `{ id, name, email }` (never the password).

A **request** looks like:

```jsonc
{
  "id": "uuid", "title": "...", "description": "...", "location": "...",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "status": "Submitted | Assigned | In Progress | Resolved",
  "createdAt": "ISO date",
  "userId": "uuid", "user": person,                 // who submitted it
  "categoryId": 1, "category": { "id": 1, "name": "Plumbing" },
  "assignedTechnicianId": "uuid | null",
  "assignedTechnician": person | null
}
```

A **note** looks like `{ id, body, createdAt, requestId, authorId, author: { id, name, role } }`.

---

## Built (Jonathan)

### `GET /requests/open`: story #4
**Who:** MANAGER, ADMIN

Every request that isn't `Resolved`, from every user. Sorted most urgent first (URGENT → LOW), then oldest first within the same priority. Each request includes `category`, `user` and `assignedTechnician` (null if unassigned).

### `GET /requests/assigned`: story #6
**Who:** TECHNICIAN

Requests assigned to the logged-in technician (taken from the token, never the URL). Unfinished ones come first (most urgent, then oldest), and resolved ones go at the bottom as history. Includes `category` and `user`.

### `GET /requests/:id`: request detail (needed for #7's detail page)
**Who:** the submitter, the assigned technician, MANAGER, ADMIN. Anyone else gets 403. 404 if it doesn't exist.

Returns the request plus `notes` (oldest first, each with `author`).

### `GET /users/technicians`: for the #5 "assign to" dropdown
**Who:** MANAGER, ADMIN

`[{ id, name, email }]` for every TECHNICIAN, sorted by name.

---

## Built (Almas)

### `PATCH /requests/:id/assign`: story #5
**Who:** MANAGER, ADMIN · **Body:** `{ "technicianId": "uuid" }`

| Case | Response |
|---|---|
| Works | **200** with the updated request: `assignedTechnicianId` set, `status` = `"Assigned"`, `assignedTechnician` included |
| Reassigning to a different technician | **200**; it moves to the new technician's `/requests/assigned` list |
| `technicianId` missing | **400** |
| `technicianId` isn't a user with role TECHNICIAN (e.g. a customer) | **400**, and nothing changes |
| Request doesn't exist | **404** |
| CUSTOMER or TECHNICIAN calls it | **403** |

### `PATCH /requests/:id/status`: story #7
**Who:** the TECHNICIAN assigned to that request · **Body:** `{ "status": "In Progress" | "Resolved" }`

| Case | Response |
|---|---|
| One step forward (`Assigned → In Progress`, `In Progress → Resolved`). Use `canMoveTo(from, to)` | **200** with the updated request |
| Skipping (`Assigned → Resolved`), going backwards, or an unknown status | **400** |
| A different technician, or a customer | **403** |
| Request doesn't exist | **404** |

Once `Resolved`, the request drops out of `GET /requests/open`.

### `POST /requests/:id/notes`: story #7
**Who:** the TECHNICIAN assigned to that request, MANAGER, ADMIN · **Body:** `{ "body": "text" }` (trimmed, 1–1000 chars)

| Case | Response |
|---|---|
| Works | **201** with the note (including `author`) |
| Empty or only spaces | **400** |
| A different technician, or a customer | **403** |
| Request doesn't exist | **404** |

The submitter sees notes through `GET /requests/:id`, so "everyone sees progress."
