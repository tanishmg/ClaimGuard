
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import { getAuthUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2";

interface DbPolicyholder extends RowDataPacket {
  holder_id: number;
  user_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  dob: string | Date | null;
}

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "developer") {
    return NextResponse.json({ error: "Developer login required." }, { status: 401 });
  }
  try {
    const [rows] = await mysqlPool.query<DbPolicyholder[]>(
      `SELECT
         holder_id,
         user_id,
         full_name,
         phone,
         address,
         dob
       FROM policyholder
       ORDER BY holder_id DESC`
    );

    const policyholders = rows.map((row) => ({
  holder_id: row.holder_id,
  user_id: row.user_id,
  full_name: row.full_name,
  phone: row.phone,
  address: row.address,
  dob: row.dob,
}));

    return NextResponse.json({ policyholders });
  } catch (error) {
    console.error("Failed to fetch policyholders:", error);

    return NextResponse.json(
      { error: "Could not load policyholders from MySQL." },
      { status: 500 }
    );
  }
}
