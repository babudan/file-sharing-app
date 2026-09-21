import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { requireUser } from "../auth.js";
import {
  acceptInvitation,
  createWorkspace,
  deleteWorkspace,
  getInvitationPreview,
  getWorkspace,
  inviteToWorkspace,
  listWorkspaces,
  removeMember,
} from "../services/workspaceService.js";

export const workspaceRouter = Router();
export const inviteRouter = Router();

workspaceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const workspaces = await listWorkspaces(user.id);
    res.json({ workspaces });
  }),
);

workspaceRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const workspace = await createWorkspace(user.id, req.body);
    res.status(201).json({ workspace });
  }),
);

workspaceRouter.get(
  "/:workspaceId",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const workspace = await getWorkspace(user.id, req.params.workspaceId);
    res.json({ workspace });
  }),
);

workspaceRouter.delete(
  "/:workspaceId",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await deleteWorkspace(user.id, req.params.workspaceId);
    res.status(204).end();
  }),
);

workspaceRouter.post(
  "/:workspaceId/invites",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const invitation = await inviteToWorkspace(user.id, req.params.workspaceId, req.body);
    res.status(201).json({ invitation });
  }),
);

workspaceRouter.delete(
  "/:workspaceId/members/:userId",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await removeMember(user.id, req.params.workspaceId, req.params.userId);
    res.status(204).end();
  }),
);

inviteRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const invitation = await getInvitationPreview(req.params.token);
    res.json({ invitation });
  }),
);

inviteRouter.post(
  "/:token/accept",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const result = await acceptInvitation(user.id, user.email, req.params.token);
    res.json(result);
  }),
);
