
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import { getAuthUser } from "@/lib/auth";
import type { RowDataPacket } from "mysql2";


interface DbClaim extends RowDataPacket {
  claim_id: string | number;
  full_name: string;
  claim_type: string;
  filed_date: string | Date;
  claim_amount: number | string;
  status: string;
}

function formatStatus(status: string) {
  const normalized = status.toLowerCase().replace(/[_-]/g, " ").trim();

  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "flagged") return "Flagged";

  return "Under review";
}

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "developer") {
    return NextResponse.json({ error: "Developer login required." }, { status: 401 });
  }
  try {
    const [rows] = await mysqlPool.query<DbClaim[]>(
      `SELECT
         c.claim_id,
         ph.full_name,
         c.claim_type,
         c.filed_date,
         c.claim_amount,
         c.status
       FROM \`claim\` AS c
       INNER JOIN \`policy\` AS p
         ON p.policy_id = c.policy_id
       INNER JOIN policyholder AS ph
         ON ph.holder_id = p.holder_id
       ORDER BY c.filed_date DESC`
    );

    const claims = rows.map((row) => ({
      id: String(row.claim_id),
      claimant: row.full_name,
      type: row.claim_type,
      date: new Date(row.filed_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      amount: Number(row.claim_amount),
      status: formatStatus(row.status),
      risk: formatStatus(row.status) === "Flagged" ? "High" : "Low",
    }));

    return NextResponse.json({ claims });
  } catch (error) {
    console.error("Failed to fetch claims:", error);

    return NextResponse.json(
      { error: "Could not load claims from MySQL." },
      { status: 500 }
    );
  }
}


export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "user") {
    return NextResponse.json({ error: "User login required." }, { status: 401 });
  }
  try {
    const body = await request.json();

    const policyId = Number(body.policyId);
    const amount = Number(body.amount);
    const incidentDate = String(body.incidentDate ?? "");
    const claimType = String(body.type ?? "").toLowerCase();

    if (
      !Number.isInteger(policyId) ||
      policyId <= 0 ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !["medical", "auto", "property"].includes(claimType) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)
    ) {
      return Response.json(
        { error: "Provide a valid policy, claim type, amount, and incident date." },
        { status: 400 }
      );
    }

    const connection = await mysqlPool.getConnection();

    try {
      await connection.beginTransaction();

      const [policyRows] = await connection.query(
        `SELECT policy_id, policy_type, coverage_amount, status,
                start_date, end_date
         FROM policy
         WHERE policy_id = ?
         FOR UPDATE`,
        [policyId]
      );

      const policies = policyRows as Array<{
        policy_id: number;
        policy_type: string;
        coverage_amount: number | string;
        status: string;
        start_date: string | Date;
        end_date: string | Date;
      }>;

      const policy = policies[0];

      if (!policy) {
        await connection.rollback();
        return Response.json(
          { error: "The selected policy does not exist." },
          { status: 404 }
        );
      }

      const incident = new Date(`${incidentDate}T00:00:00Z`);
      const start = new Date(policy.start_date);
      const end = new Date(policy.end_date);

      if (
        policy.status !== "active" ||
        claimType !== policy.policy_type ||
        incident < start ||
        incident > end ||
        amount > Number(policy.coverage_amount)
      ) {
        await connection.rollback();
        return Response.json(
          {
            error:
              "The claim must match the policy type, fall within its coverage dates, and not exceed its coverage amount.",
          },
          { status: 400 }
        );
      }

      const [result] = await connection.execute(
        `INSERT INTO \`claim\`
          (policy_id, adjuster_id, incident_date, claim_type,
           claim_amount, status, filed_date)
         VALUES (?, NULL, ?, ?, ?, 'submitted', CURDATE())`,
        [policyId, incidentDate, claimType, amount]
      );

      await connection.commit();

      const insertResult = result as { insertId: number };

      return Response.json(
        {
          message: "Claim saved successfully.",
          claimId: insertResult.insertId,
        },
        { status: 201 }
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Failed to create claim:", error);

    return Response.json(
      { error: "Could not save the claim to MySQL." },
      { status: 500 }
    );
  }
}

