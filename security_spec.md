# Security Specification - Room Check-In & Housekeeping

## Data Invariants
1. Room IDs must be consistent (e.g., room-1 to room-10).
2. A room status can only transition:
   - `available` -> `occupied` (Check-in)
   - `occupied` -> `dirty` (Check-out)
   - `dirty` -> `available` (Housekeeping Cleaned)
3. Guests cannot change a room from `dirty` to `available`.
4. Housekeeping cannot "check-in" a guest.

## Identity & Access Control
- **Public/Guest Access**: Can read room status and update status for check-in/out (restricted state transitions).
- **Housekeeping/Admin**: Can read all rooms and update status to `available` after cleaning.
- For this demo, we will assume anyone with the link can perform Guest actions. Housekeeping will be a specific "mode" or protected by a simple password/flag for the sake of the tutorial, or standard Firebase Auth if required. The user mentioned "For housekeeper to know", so a dashboard is needed.

## The "Dirty Dozen" Payloads (Denial Expected)
1. Set room status to `occupied` when it's already `occupied`.
2. Set room status to `available` when it's `occupied` (Guest skipping cleaning).
3. Update room status with a long string (Resource poisoning).
4. Update a room that doesn't exist.
5. Guest attempting to set status to `available` (Only housekeeping allowed).
6. Update logs without a valid roomId.
7. Change log timestamp to the future.
8. Update room field `name` (should be immutable for guests).
9. Delete a room document.
10. Update rooms via `list` without any filters (Bulk update).
11. Set status to an invalid value (e.g., `very-clean`).
12. Anonymous guest trying to read logs collection (Private info).

## Rules Logic
- `rooms/{roomId}`:
  - `read`: Shared access.
  - `update`: 
    - Transition `available` -> `occupied` allowed for everyone (Guest).
    - Transition `occupied` -> `dirty` allowed for everyone (Guest).
    - Transition `dirty` -> `available` allowed for everyone (for this POC, or we can add a flag).
- `logs/{logId}`:
  - `create`: Allowed.
  - `read/update/delete`: Denied for public.
