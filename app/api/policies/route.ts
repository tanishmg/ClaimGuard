
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2";

interface DbPolicy extends RowDataPacket {
  policy_id: number;
  holder_id: number;
  full_name: string;
  policy_type: "medical" | "auto" | "property";
  coverage_amount: number | string;
  start_date: string | Date;
  end_date: string | Date;
  status: "active" | "expired" | "cancelled";
}

export async function GET() {
  try {
    const [rows] = await mysqlPool.query<DbPolicy[]>(
      `SELECT
         p.policy_id,
         p.holder_id,
         ph.full_name,
         p.policy_type,
         p.coverage_amount,
         p.start_date,
         p.end_date,
         p.status
       FROM policy AS p
       INNER JOIN policyholder AS ph
         ON ph.holder_id = p.holder_id
       ORDER BY p.policy_id DESC`
    );

    const policies = rows.map((row) => ({
      id: row.policy_id,
      holderId: row.holder_id,
      holderName: row.full_name,
      type: row.policy_type,
      coverageAmount: Number(row.coverage_amount),
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    }));

    return NextResponse.json({ policies });
  } catch (error) {
    console.error("Failed to fetch policies:", error);

    return NextResponse.json(
      { error: "Could not load policies from MySQL." },
      { status: 500 }
    );
  }
}
