import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, conflict, unauthorized } from "../errors.js";
import { normalizeEmail } from "../utils.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(80).optional(),
});

export async function registerUser(input: unknown) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest("Name, a valid email, and a password of at least 8 characters are required.");
  }
  if (!parsed.data.name?.trim()) {
    throw badRequest("Name is required.");
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with that email already exists.");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        email,
        name: parsed.data.name!.trim(),
        passwordHash,
      },
    });
    const workspace = await tx.workspace.create({
      data: {
        name: "Personal",
        ownerId: created.id,
        isPersonal: true,
      },
    });
    await tx.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: created.id,
        role: "OWNER",
      },
    });
    return created;
  });

  return { id: user.id, email: user.email, name: user.name };
}

export async function loginUser(input: unknown) {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
    })
    .safeParse(input);
  if (!parsed.success) throw badRequest("Email and password are required.");

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw unauthorized("Invalid email or password.");

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid email or password.");

  return { id: user.id, email: user.email, name: user.name };
}
