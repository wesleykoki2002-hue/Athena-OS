"use server";

import { redirect } from "next/navigation";
import { createAthenaCoreClient } from "@/lib/supabase/server";

export async function regenerateDailyBriefing() {
  const supabase = createAthenaCoreClient();

  const { error } = await supabase.rpc("generate_athena_daily_command_center");

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}