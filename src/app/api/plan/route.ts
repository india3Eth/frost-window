import { z } from "zod";
import { PlanError, buildPlan } from "@/lib/plan";

const bodySchema = z.object({
  place: z.string().trim().min(1).max(100),
  garden: z.string().trim().min(3).max(1000),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send a place and what you'd like to grow." }, { status: 400 });
  }

  try {
    return Response.json(await buildPlan(parsed.data.place, parsed.data.garden));
  } catch (e) {
    if (e instanceof PlanError) return Response.json({ error: e.message }, { status: e.status });
    console.error("plan failed", e);
    return Response.json({ error: "Weather service unavailable. Try again in a minute." }, { status: 502 });
  }
}
