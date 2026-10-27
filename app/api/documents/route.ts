
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { createHash, randomUUID } from "crypto";
import { PDFParse } from "pdf-parse";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const claimId = String(formData.get("claimId") ?? "");

    if (!(file instanceof File) || !claimId) {
      return NextResponse.json(
        { error: "A file and claim ID are required." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF, JPEG, and PNG files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Maximum file size is 5 MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const documentId = randomUUID();

    const fileHash = createHash("sha256")
      .update(buffer)
      .digest("hex");

    const existingDocumentId = await redis.get<string>(
      `claimguard:document-hash:${fileHash}`
    );

    if (existingDocumentId) {
      return NextResponse.json(
        {
          error: "This exact file has already been uploaded.",
          duplicate: true,
        },
        { status: 409 }
      );
    }

    let extractedText = "";

    if (file.type === "application/pdf") {
      const parser = new PDFParse({ data: buffer });

      try {
        const result = await parser.getText();
        extractedText = result.text.trim();
      } finally {
        await parser.destroy();
      }
    }

    const document = {
      documentId,
      claimId,
      originalName: file.name,
      contentType: file.type,
      size: file.size,
      fileHash,
      uploadedAt: new Date().toISOString(),
      fileData: buffer.toString("base64"),
      extractedText,
    };

    await redis.set(
      `claimguard:document:${documentId}`,
      JSON.stringify(document)
    );

    await redis.set(
      `claimguard:document-hash:${fileHash}`,
      documentId
    );

    return NextResponse.json(
      {
        message: "Document uploaded successfully.",
        documentId,
        textExtracted: extractedText.length > 0,
        extractedTextLength: extractedText.length,
      },
      { status: 201 }
    );
  } catch (error) {
  console.error("Document upload failed:", error);

  return NextResponse.json(
    {
      error: "Could not upload the document.",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    },
    { status: 500 }
  );
}
}
