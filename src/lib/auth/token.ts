import { createHmac, timingSafeEqual } from "crypto";

function hmacHex(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function sign(value: string, secret: string): string {
  return `${value}.${hmacHex(value, secret)}`;
}

export function verify(token: string, secret: string): string | null {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return null;

  const value = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = hmacHex(value, secret);

  let signatureBuffer: Buffer;
  let expectedBuffer: Buffer;
  try {
    signatureBuffer = Buffer.from(signature, "hex");
    expectedBuffer = Buffer.from(expectedSignature, "hex");
  } catch {
    return null;
  }

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    signature.length !== expectedSignature.length
  ) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  return value;
}
