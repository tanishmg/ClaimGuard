
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2";
import { redis } from "@/lib/redis";
import { getAuthUser } from "@/lib/auth";

interface ClaimRow extends RowDataPacket {
  claim_id: number;
  claim_amount: number | string;
}

function extractBillAmount(text: string): number | null {
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (
      !/\b(total amount|total bill|grand total|amount payable|net payable)\b/i.test(
        line
      )
    ) {
      continue;
    }

    const match = line.match(
      /(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );

    if (match) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount)) return amount;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user || user.role !== "developer") {
    return NextResponse.json({ error: "Developer login required." }, { status: 401 });
  }
  try {
    const body = await request.json();
    const claimId = String(body.claimId ?? "");
    const documentId = String(body.documentId ?? "");

    if (!/^\d+$/.test(claimId) || !documentId) {
      return NextResponse.json(
        { error: "A valid claim ID and document ID are required." },
        { status: 400 }
      );
    }

    const rawDocument = await redis.get<string>(
      `claimguard:document:${documentId}`
    );

    if (!rawDocument) {
      return NextResponse.json(
        { error: "Document not found in Redis." },
        { status: 404 }
      );
    }

    const document =
      typeof rawDocument === "string"
        ? JSON.parse(rawDocument)
        : rawDocument;

    if (String(document.claimId) !== claimId) {
      return NextResponse.json(
        { error: "This document does not belong to the selected claim." },
        { status: 403 }
      );
    }

    if (document.contentType !== "application/pdf") {
      return NextResponse.json(
        {
          error:
            "Only text-based PDF verification is supported currently.",
        },
        { status: 400 }
      );
    }

    const extractedText = String(document.extractedText ?? "");

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "No text was extracted from this PDF." },
        { status: 422 }
      );
    }

    const [rows] = await mysqlPool.query<ClaimRow[]>(
      `SELECT claim_id, claim_amount
       FROM \`claim\`
       WHERE claim_id = ?`,
      [claimId]
    );

    const claim = rows[0];

    if (!claim) {
      return NextResponse.json(
        { error: "Claim not found in MySQL." },
        { status: 404 }
      );
    }

    const claimAmount = Number(claim.claim_amount);
    const billAmount = extractBillAmount(extractedText);

    let result: "MATCH" | "FLAGGED" | "NEEDS_REVIEW";
    let reason: string;

    if (billAmount === null) {
      result = "NEEDS_REVIEW";
      reason =
        "Could not identify a total bill amount in the extracted text.";
    } else if (Math.abs(claimAmount - billAmount) < 0.01) {
      result = "MATCH";
      reason = "The extracted bill amount matches the claim amount.";
    } else {
      result = "FLAGGED";
      reason =
        "The extracted bill amount differs from the claim amount. Human review is recommended.";
    }

    // Save the verification result permanently in MySQL.
    await mysqlPool.query(
      `INSERT INTO verification_result
        (claim_id, document_id, result, extracted_amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [claimId, documentId, result, billAmount, reason]
    );

    return NextResponse.json({
      result,
      reason,
      claimAmount,
      billAmount,
      difference:
        billAmount === null
          ? null
          : Math.abs(claimAmount - billAmount),
      saved: true,
    });
  } catch (error) {
    console.error("Claim verification failed:", error);

    return NextResponse.json(
      { error: "Could not verify this document." },
      { status: 500 }
    );
  }
}
