
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/mysql";
import mongoClientPromise from "@/lib/mongodb";

export async function GET() {
  const results = {
    mysql: "failed",
    mongodb: "failed",
  };

  try {
    await mysqlPool.query("SELECT 1");
    results.mysql = "connected";
  } catch (error) {
    console.error("MySQL connection failed:", error);
  }

  try {
    const client = await mongoClientPromise;
    await client.db("insurance_claims").command({ ping: 1 });
    results.mongodb = "connected";
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }

  const ok =
    results.mysql === "connected" &&
    results.mongodb === "connected";

  return NextResponse.json(results, {
    status: ok ? 200 : 503,
  });
}
